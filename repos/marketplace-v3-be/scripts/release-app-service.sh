#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  echo 'Usage: release-app-service.sh <reviewed-release.tar.gz> <release-id>' >&2
  exit 64
fi

ARCHIVE=$(realpath "$1")
RELEASE_ID=$2
CONFIG=/etc/tofa/app-service-deployment.conf

[[ -f $ARCHIVE ]] || { echo 'Release archive not found' >&2; exit 66; }
[[ $RELEASE_ID =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{40}$ ]] || { echo 'Invalid release ID' >&2; exit 64; }
[[ -r $CONFIG ]] || { echo "Missing release-runner configuration: $CONFIG" >&2; exit 78; }
[[ $(stat -c '%u' "$CONFIG") -eq 0 ]] || { echo 'Release-runner configuration must be owned by root' >&2; exit 78; }
if find "$CONFIG" -perm /022 -print -quit | grep -q .; then
  echo 'Release-runner configuration must not be writable by group or other users' >&2
  exit 78
fi
if grep -Eq '^(DB_USERNAME|DB_PASSWORD|DB_ADMIN_PASSWORD|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|POSTMARK_API_TOKEN|ADMIN_PASSWORD|SWAGGER_PASSWORD|PAYMENT_WEBHOOK_SHARED_SECRET|LOGISTICS_WEBHOOK_SHARED_SECRET|AZURE_STORAGE_CONNECTION_STRING|AZURE_STORAGE_ACCOUNT_KEY|AZURE_CLIENT_SECRET|AZURE_STORAGE_SAS_TOKEN)=' "$CONFIG"; then
  echo 'Release-runner configuration contains a secret key; store its value in Key Vault' >&2
  exit 78
fi

set -a
# shellcheck disable=SC1091 -- fixed, root-owned release configuration
source "$CONFIG"
set +a

[[ ${NODE_ENV:-} == production ]] || { echo 'NODE_ENV must be production' >&2; exit 78; }
[[ ${AZURE_SUBSCRIPTION_ID:-} =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'Invalid AZURE_SUBSCRIPTION_ID' >&2; exit 78; }
[[ ${AZURE_RESOURCE_GROUP:-} =~ ^[-._()A-Za-z0-9]+$ ]] || { echo 'Invalid AZURE_RESOURCE_GROUP' >&2; exit 78; }
[[ ${AZURE_APP_SERVICE_NAME:-} =~ ^[a-z0-9-]{2,60}$ ]] || { echo 'Invalid AZURE_APP_SERVICE_NAME' >&2; exit 78; }
[[ ${HEALTH_URL:-} =~ ^https://[A-Za-z0-9.-]+/api/health$ ]] || { echo 'HEALTH_URL must be an HTTPS /api/health endpoint' >&2; exit 78; }

for command_name in az curl npm node tar zip; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing required command: $command_name" >&2; exit 69; }
done

read -r NODE_MAJOR NODE_MINOR < <(node -p "process.versions.node.split('.').slice(0,2).join(' ')")
[[ $NODE_MAJOR -eq 20 && $NODE_MINOR -ge 19 ]] || {
  echo 'Node.js 20.19 or newer in the Node 20 release line is required' >&2
  exit 78
}

if tar --list --gzip --file "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo 'Release archive contains an unsafe path' >&2
  exit 65
fi

WORK=$(mktemp -d)
cleanup() {
  if [[ -n ${WORK:-} && -d $WORK && $WORK == /tmp/* ]]; then
    rm -rf -- "$WORK"
  fi
}
trap cleanup EXIT

SOURCE=$WORK/source
mkdir "$SOURCE"
tar \
  --extract \
  --gzip \
  --file "$ARCHIVE" \
  --directory "$SOURCE" \
  --no-same-owner \
  --no-same-permissions

[[ -f $SOURCE/package.json && -f $SOURCE/package-lock.json ]] || {
  echo 'Archive does not contain a locked Node.js backend package' >&2
  exit 65
}
if [[ -f $SOURCE/DEPLOYMENT_HOLD ]]; then
  echo 'Deployment is blocked by DEPLOYMENT_HOLD' >&2
  exit 78
fi
if find "$SOURCE" -maxdepth 1 -type f -name '.env.production*' -print -quit | grep -q .; then
  echo 'Release archives must not contain plaintext production environment files' >&2
  exit 78
fi

cd "$SOURCE"
package_manager=$(node -p "require('./package.json').packageManager")
if [[ ! $package_manager =~ ^npm@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'packageManager must pin an exact npm version' >&2
  exit 78
fi
npm install --global "$package_manager" --ignore-scripts --no-audit --no-fund
echo "Using npm $(npm --version)"
npm ci --include=dev --ignore-scripts --engine-strict --loglevel=warn
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

# The migration command must resolve its short-lived migration and MySQL admin
# credentials through the jumpbox managed identity. The App Service runtime
# identity must never receive schema privileges.
npm run migration:run

npm prune --omit=dev --ignore-scripts --loglevel=warn
npm audit --omit=dev --audit-level=high

PACKAGE=$WORK/tofa-backend-$RELEASE_ID.zip
zip -q -r "$PACKAGE" dist node_modules package.json package-lock.json

RELEASE_STATE=/var/lib/tofa/app-service-releases
mkdir -p "$RELEASE_STATE"
chmod 0700 "$RELEASE_STATE"
PREVIOUS_PACKAGE=''
if [[ -L $RELEASE_STATE/current.zip ]]; then
  candidate=$(realpath -e "$RELEASE_STATE/current.zip" 2>/dev/null || true)
  if [[ $candidate == "$RELEASE_STATE"/* && -f $candidate ]]; then
    PREVIOUS_PACKAGE=$candidate
  fi
fi

az login --identity --output none
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

wait_for_health() {
  local label=$1
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    echo "Waiting for $label health ($attempt/30)..."
    sleep 10
  done
  return 1
}

deploy_package() {
  local package_path=$1
  az webapp deploy \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$AZURE_APP_SERVICE_NAME" \
    --src-path "$package_path" \
    --type zip \
    --restart true \
    --only-show-errors \
    --output none
}

restore_previous() {
  local failure_label=$1
  [[ -n $PREVIOUS_PACKAGE ]] || return 1
  echo "$failure_label; restoring the last known-good package" >&2
  deploy_package "$PREVIOUS_PACKAGE" && wait_for_health 'rollback'
}

if ! deploy_package "$PACKAGE"; then
  if restore_previous 'Release deployment command failed'; then
    echo "Release $RELEASE_ID failed during deployment and was rolled back" >&2
  else
    echo 'Release deployment failed and no healthy automatic rollback was available' >&2
  fi
  exit 1
fi

if wait_for_health "release $RELEASE_ID"; then
  retained_package=$RELEASE_STATE/tofa-backend-$RELEASE_ID.zip
  install -m 0600 "$PACKAGE" "$retained_package"
  next_link=$RELEASE_STATE/.current-$RELEASE_ID
  ln -s "$retained_package" "$next_link"
  mv -Tf "$next_link" "$RELEASE_STATE/current.zip"
  echo "Release $RELEASE_ID deployed and passed database-backed health verification"
  exit 0
fi

if [[ -n $PREVIOUS_PACKAGE ]]; then
  if restore_previous 'Release health failed'; then
    echo "Release $RELEASE_ID failed health verification and was rolled back" >&2
    exit 1
  fi
  echo 'Release and automatic rollback both failed health verification' >&2
  exit 1
fi

echo 'Initial App Service release failed health verification; no last known-good package exists' >&2
exit 1
