# TOFA DevOps Project

## Overview

This repository contains an Azure infrastructure deployment for a secure development environment using Azure Bicep. The solution provisions a private Azure Database for MySQL Flexible Server, an application subnet with an app VM behind a public load balancer, and a public-facing jumpbox/Bastion host for secure management access.

## Architecture

- Azure Virtual Network with separate subnets for:
  - Bastion (`AzureBastionSubnet`)
  - Database (`tofa-db-subnet`)
  - Application and jumpbox (`tofa-app-subnet`)
- Azure Key Vault for storing sensitive credentials
- Azure MySQL Flexible Server with private VNet integration
- Private DNS zone for MySQL private endpoint resolution
- Public bastion host for secure browser-based access to VMs
- Public jumpbox VM for SSH-based access and database management
- App VM in the app subnet attached to a Standard Load Balancer
- Network Security Groups (NSGs) for subnet-level controls

## Files

- `main.bicep` - Primary Azure Bicep template defining the entire infrastructure
- `main.bicepparam` - Parameter file with default values and deployment guidance
- `main.json` - Additional project metadata or deployment output file
- `scripts/` - Repository folder for supplementary automation scripts (currently empty)

## Key Resources

- `Microsoft.KeyVault/vaults` - Key Vault for secrets
- `Microsoft.Network/virtualNetworks` - VNet and subnet definitions
- `Microsoft.Network/networkSecurityGroups` - NSG rules for bastion, database, and app tiers
- `Microsoft.Network/privateDnsZones` - Private DNS zone for MySQL private endpoint resolution
- `Microsoft.DBforMySQL/flexibleServers` - Azure Database for MySQL Flexible Server
- `Microsoft.Compute/virtualMachines` - Jumpbox and app VM resources
- `Microsoft.Network/loadBalancers` - Standard public load balancer for app traffic
- `Microsoft.Network/bastionHosts` - Azure Bastion host for secure access

## Deployment Prerequisites

1. Install Azure CLI and sign in:
   ```bash
   az login
   ```
2. Create or choose a resource group:
   ```bash
   az group create --name <resource-group> --location westus2
   ```
3. Decide on SSH public keys for the jumpbox and app VM.
4. Provide secure password values for:
   - `administratorLoginPassword`
   - `appUserPassword`

## Deployment

Use the Bicep template and parameter file to deploy the environment.

Example deployment command:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file main.bicep \
  --parameters @main.bicepparam \
  --parameters \
    administratorLoginPassword='<MySqlAdminPassword>' \
    appUserPassword='<AppDbUserPassword>' \
    keyVaultName='tofa-dev-kv' \
    jumpboxSshPublicKey='ssh-rsa AAAAB3...' \
    appVmSshPublicKey='ssh-rsa AAAAB3...' \
    enableDbUserBootstrap=true
```

> Note: The template creates the Key Vault and secrets. Providing secure parameter values at deployment time is recommended.

### Optional: Use Azure Key Vault secrets

If you prefer to store passwords in Key Vault first, create secrets and reference them during deployment:

```bash
az keyvault create --name tofa-dev-kv --resource-group <resource-group> --location westus2
az keyvault secret set --vault-name tofa-dev-kv --name mysql-admin-password --value '<MySqlAdminPassword>'
az keyvault secret set --vault-name tofa-dev-kv --name app-user-password --value '<AppDbUserPassword>'
```

Then deploy using parameter values from Key Vault:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file main.bicep \
  --parameters @main.bicepparam \
  --parameters \
    administratorLoginPassword="$(az keyvault secret show --vault-name tofa-dev-kv --name mysql-admin-password --query value -o tsv)" \
    appUserPassword="$(az keyvault secret show --vault-name tofa-dev-kv --name app-user-password --query value -o tsv)"
```

## Post-Deployment Access

### SSH Access

- Jumpbox VM public IP is exposed for direct SSH access.
- `jumpboxSshSourceAddressPrefix` controls which source CIDR can access SSH.
- Use the configured SSH public key to connect:

```bash
ssh azureuser@<jumpbox-public-ip>
```

### App VM Access

- App VM is deployed in the app subnet and registered with the load balancer backend pool.
- The app VM has no public IP by default.
- SSH to the app VM via the jumpbox or Bastion host.

### Application Access

- The app load balancer forwards HTTP traffic to the app VM on port 80.
- The load balancer public IP is available in output `appLoadBalancerPublicIp`.

### MySQL Access

- MySQL Flexible Server is private and does not allow public network access.
- The app subnet and jumpbox can reach MySQL privately through the VNet.
- Use the private server FQDN from output `mysqlServerFqdn`.

Example MySQL connection from the jumpbox:

```bash
mysql --host <mysql-fqdn> --user tofa_admin --password --ssl-mode=REQUIRED --protocol=TCP
```

## Bootstrap User Creation

The template includes an optional custom script extension on the jumpbox that creates the application database user when `enableDbUserBootstrap` is set to `true`.

This script:
- installs `mysql-client-core-8.0`
- connects to the MySQL server
- creates or updates the app user
- grants SELECT, INSERT, UPDATE, DELETE permissions on the deployed database

## Notes

- The default app VM size is `Standard_B2s_v2`.
- MySQL is configured with `require_secure_transport` enabled and TLS 1.2/1.3 only.
- The app VM SSH key defaults to the jumpbox key when `appVmSshPublicKey` is not provided.
- The project is targeted for a development environment and includes sample values in `main.bicepparam`.

## Next Steps

- Add application deployment scripts to `scripts/`
- Harden SSH firewall rules to restrict access by source IP
- Implement monitoring and alerting for MySQL and VM resources
- Separate production and development configurations if needed
