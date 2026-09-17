#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 6 ]]; then
  echo 'Usage: run-development-release.sh <subscription-id> <storage-account> <container> <blob> <sha256> <release-id>' >&2
  exit 64
fi

AZURE_SUBSCRIPTION_ID=$1
STORAGE_ACCOUNT=$2
CONTAINER_NAME=$3
BLOB_NAME=$4
EXPECTED_SHA256=$5
RELEASE_ID=$6

[[ $AZURE_SUBSCRIPTION_ID =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'Invalid subscription ID' >&2; exit 78; }
[[ $STORAGE_ACCOUNT =~ ^[a-z0-9]{3,24}$ ]] || { echo 'Invalid storage account name' >&2; exit 78; }
[[ $CONTAINER_NAME =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo 'Invalid container name' >&2; exit 78; }
[[ $EXPECTED_SHA256 =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid archive checksum' >&2; exit 78; }
[[ $RELEASE_ID =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{40}$ ]] || { echo 'Invalid release ID' >&2; exit 78; }
EXPECTED_BLOB_NAME=backend/$RELEASE_ID/tofa-backend-$RELEASE_ID.tar.gz
[[ $BLOB_NAME == "$EXPECTED_BLOB_NAME" ]] || { echo 'Release blob path does not match the release ID' >&2; exit 78; }

for command_name in az sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing required command: $command_name" >&2; exit 69; }
done

WORK=$(mktemp -d)
cleanup() {
  if [[ -n ${WORK:-} && -d $WORK && $WORK == /tmp/* ]]; then
    rm -rf -- "$WORK"
  fi
}
trap cleanup EXIT

ARCHIVE=$WORK/release.tar.gz
az login --identity --output none
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az storage blob download \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name "$CONTAINER_NAME" \
  --name "$BLOB_NAME" \
  --file "$ARCHIVE" \
  --auth-mode login \
  --only-show-errors \
  --output none

printf '%s  %s\n' "$EXPECTED_SHA256" "$ARCHIVE" | sha256sum --check --strict

if tar --list --gzip --file "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo 'Release archive contains an unsafe path' >&2
  exit 65
fi

tar \
  --extract \
  --gzip \
  --file "$ARCHIVE" \
  --directory "$WORK" \
  --no-same-owner \
  --no-same-permissions \
  scripts/release-app-service.sh

chmod 0700 "$WORK/scripts/release-app-service.sh"
"$WORK/scripts/release-app-service.sh" "$ARCHIVE" "$RELEASE_ID"
printf 'TOFA_RELEASE_SUCCEEDED:%s\n' "$RELEASE_ID"
