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
param jumpboxSshPublicKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCgv07/1QFGRba4I7ci6y0IjTk+vtj2RfkveVMEMsHb/2dXYyz8UQeptvb+a3fPb5BUWBXHuVW81+fVX8Dg1C4I4dpvTPl7CpudWJa1iXjZyysQM+X+rd1/MI/rTnldk3OfPobYnjHyZi338HijjUKgt/zUcnm7MWKI+QL+RAvZf+1/SbIahsTXoMygQodbIK1f1NVNVMtMCvEcu41VXHEgFvFimeEfBmsMA5BS6wzDDCthWdAPnaATb7SZ9flbSz4lopzk9z/DBvZgDcvH4Xkg+KbHMG4ku9tipWry6n5oGmdZzrhgCUiYqLz/ZrnX6LuKJjmthxBTtLdSZU5QDBXH azureuser@tofa-jumpbox'
param jumpboxSshSourceAddressPrefix = '0.0.0.0/0'
param appVmName = 'tofa-app-vm'
param appVmAdminUsername = 'azureuser'
param appVmSshPublicKey = ''
param appVmSize = 'Standard_B2s_v2'
param appLoadBalancerName = 'tofa-app-lb'
param appLoadBalancerPublicIpName = 'tofa-app-lb-pip'
param appLoadBalancerFrontendPort = 3000
param appLoadBalancerBackendPort = 3000
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
