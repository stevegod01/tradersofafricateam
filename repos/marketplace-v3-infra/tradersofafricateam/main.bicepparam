using './main.bicep'

param location = 'westus2'
param vnetName = 'tofa-vnet'
param dbSubnetName = 'tofa-db-subnet'
param appSubnetName = 'tofa-app-subnet'
param bastionSubnetName = 'AzureBastionSubnet'

param dbSubnetPrefix = '10.10.2.0/24'
param appSubnetPrefix = '10.10.3.0/24'
param bastionSubnetPrefix = '10.10.1.0/26'

param mysqlServerName = 'tofa-marketplace-db-dev'
param administratorLogin = 'tofa_admin'

param keyVaultName = 'tofa-dev-kv'
param keyVaultSecretName = 'mysql-admin-password'

param administratorLoginPassword = 'placeholder'  

param appUsername = 'tofa_app_dev'
param appUserPassword = 'placeholder'  

param privateDnsZoneName = 'tofa-marketplace-db-dev.private.mysql.database.azure.com'
param databaseName = 'tofa_marketplace_II'

param jumpboxVmName = 'tofa-jumpbox'
param jumpboxAdminUsername = 'azureuser'
param jumpboxSshPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAS+xn3VpBv5420JkDgXx6N/3GAb9OYPmR1I5bZB0moU tofa-dev-breakglass-2026-08-31'
param jumpboxSshSourceAddressPrefix = '0.0.0.0/0'
param appVmName = 'tofa-app-vm'
param appVmAdminUsername = 'azureuser'
param appVmSshPublicKey = ''
param appVmSize = 'Standard_B2s_v2'
param appLoadBalancerName = 'tofa-app-lb'
param appLoadBalancerPublicIpName = 'tofa-app-lb-pip'
param appLoadBalancerFrontendPort = 80
param appLoadBalancerBackendPort = 80
param enableDbUserBootstrap = false

param tags = {
  project: 'tofa-marketplace'
  environment: 'dev'
  'managed-by': 'devops'
}

// Usage notes:
// 1) Ensure the Key Vault exists (this template creates it if missing) and the secrets exist before deployment.
// 2) Create/update the secrets in Key Vault:
//    az keyvault secret set --vault-name ${keyVaultName} --name mysql-admin-password --value '<adminPassword>'
//    az keyvault secret set --vault-name ${keyVaultName} --name app-user-password --value '<appUserPassword>'
// 3) Deploy using the secret values retrieved from Key Vault (recommended):
//    az deployment group create \
//      --resource-group <RG> \
//      --template-file main.bicep \
//      --parameters main.bicepparam \
//      --parameters \
//        administratorLoginPassword=$(az keyvault secret show --vault-name ${keyVaultName} --name mysql-admin-password --query value -o tsv) \
//        appUserPassword=$(az keyvault secret show --vault-name ${keyVaultName} --name app-user-password --query value -o tsv)
//
// The custom script extension will automatically create the app user (tofa_app_dev) after deployment completes.
