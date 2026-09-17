# TOFA Marketplace Infrastructure

Azure Bicep infrastructure for the Traders of Africa marketplace development environment. This component provisions networking, private MySQL, access hosts, and an application VM. Application installation and deployment are separate from this template.

## Architecture

- A virtual network with separate Bastion, database, and application subnets.
- Azure Database for MySQL Flexible Server with public network access disabled, private DNS, and TLS required.
- Azure Key Vault containing the database administrator password, application database password, and application username supplied to the deployment.
- An Ubuntu 22.04 application VM with a private network interface behind a public Standard Load Balancer.
- An Ubuntu 22.04 jumpbox with a public IP and SSH access, plus Azure Bastion with tunneling enabled.
- Network security groups controlling subnet traffic, including MySQL access from the application subnet.

The template creates the Key Vault and writes the supplied secrets. It does not automatically retrieve the passwords from an existing vault.

## Files and configuration variants

| File | Purpose |
| --- | --- |
| `main.bicep` | Primary resource-group deployment template. |
| `main.bicepparam` | Development parameter values, including placeholder passwords and an example SSH public key. |
| `main.json` | Older compiled ARM template; it does not contain the current application load balancer resources. Regenerate from Bicep before using it for deployment. |
| `tradersofafricateam/` | Retained alternative configuration with its own Bicep template, parameters, and documentation. |

These configurations have different effective ports and health probes:

| Configuration | Frontend port | Backend port | HTTP probe path |
| --- | --- | --- | --- |
| Root `main.bicep` defaults | 80 | 80 | `/docs` |
| Root `main.bicepparam` overrides | 3000 | 3000 | `/docs` |
| Nested `tradersofafricateam/main.bicepparam` and template | 80 | 80 | `/` |

Choose one template and its matching parameter file. Ensure the service installed on the application VM listens on the selected backend port and responds successfully to the probe path. Provisioning the VM alone does not make the load balancer healthy.

## Prerequisites

- Azure CLI with Bicep support and an Azure subscription with permission to deploy the declared resources.
- A resource group and globally available names for resources such as Key Vault and MySQL.
- An SSH key pair. Supply only the public key to the deployment; the template does not generate a key pair.
- Database administrator and application passwords supplied securely through the local environment or a secret store.

The default region is `westus2`. The application VM defaults to `Standard_B2s_v2`; MySQL uses the Burstable `Standard_B2s` SKU, 32 GB storage, seven-day backup retention, and no high availability or geo-redundant backups. Review these development defaults for the target environment.

## Prepare deployment parameters

From this directory, copy `main.bicepparam` to an untracked local parameter file named `main.local.bicepparam`. Keep its `using './main.bicep'` declaration. Update resource names, SSH public key, source CIDR, ports, and tags for the target environment.

Replace the two password assignments in the local copy with environment references:

```bicep
param administratorLoginPassword = readEnvironmentVariable('TOFA_MYSQL_ADMIN_PASSWORD')
param appUserPassword = readEnvironmentVariable('TOFA_MYSQL_APP_PASSWORD')
```

Populate those environment variables through your local secret workflow or CI secret settings before deployment. Do not commit real passwords, private keys, or compiled parameter files containing resolved secrets. Bicep supports environment reads and Key Vault secret references in parameter files; see the [Microsoft parameter-file function reference](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-functions-parameters-file).

Set `jumpboxSshSourceAddressPrefix` to the administrator's trusted CIDR. The sample value `0.0.0.0/0` permits SSH connection attempts from any source. If `appVmSshPublicKey` is empty, the application VM uses `jumpboxSshPublicKey`.

## Validate and deploy

The following Bash commands assume the local parameter file has been prepared and its environment variables are set:

```bash
az login
az account set --subscription "<subscription-id>"
az group create --name "<resource-group>" --location westus2
az bicep build --file main.bicep --outfile main.generated.json
az deployment group validate --resource-group "<resource-group>" --parameters main.local.bicepparam
az deployment group what-if --resource-group "<resource-group>" --parameters main.local.bicepparam
az deployment group create --name tofa-marketplace --resource-group "<resource-group>" --parameters main.local.bicepparam
```

A `.bicepparam` file with a `using` declaration identifies its template. Pass it directly to `--parameters`, without the JSON parameter-file `@` prefix. See [Deploy Bicep with Azure CLI](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deploy-cli).

Review validation and preview output before creating resources. Azure deployment is not part of publishing this source repository.

## Database user bootstrap

`enableDbUserBootstrap` is `false` by default. When enabled, a Custom Script extension on the jumpbox installs the MySQL client, creates or updates the application user, and grants `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the configured database. The bootstrap uses protected extension settings for the script.

Those grants do not include schema migration privileges. Run application schema migrations using an appropriately authorized deployment account. When bootstrap is disabled, provision the application user separately.

## Access and outputs

- Use `appLoadBalancerPublicIp` with the configured frontend port to reach the application after installing and starting it on the VM.
- Use Azure Bastion or the jumpbox to reach the application's private VM address.
- Connect to the jumpbox using its configured SSH username and the private key corresponding to the supplied public key.
- Connect to MySQL from the application subnet using `mysqlServerFqdn` and TLS. Public MySQL access is disabled.

Example database connection from an authorized host inside the virtual network:

```bash
mysql --host "<mysql-fqdn>" --user "<database-user>" --password --ssl-mode=REQUIRED --protocol=TCP
```

Other outputs include the MySQL resource ID, database name, Key Vault ID and secret URIs, Bastion name, and private VM IP addresses. Secret URI outputs are references, not password values.
