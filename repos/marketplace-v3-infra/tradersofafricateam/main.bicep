targetScope = 'resourceGroup'

@description('Location for all new resources')
param location string = 'westus2'

@description('Azure Key Vault name containing the MySQL admin password')
param keyVaultName string = ''

@description('Key Vault secret name for MySQL admin password')
param keyVaultSecretName string = 'mysql-admin-password'

@description('Existing VNet name')
param vnetName string = 'tofa-vnet'

@description('Existing or target DB subnet name')
param dbSubnetName string = 'tofa-db-subnet'

@description('Existing or target App subnet name')
param appSubnetName string = 'tofa-app-subnet'

@description('Azure Bastion requires this exact subnet name')
param bastionSubnetName string = 'AzureBastionSubnet'

@description('Address prefix for DB subnet')
param dbSubnetPrefix string = '10.10.2.0/24'

@description('Address prefix for App subnet')
param appSubnetPrefix string = '10.10.3.0/24'

@description('Address prefix for Bastion subnet. Bastion requires /26 or larger subnet.')
param bastionSubnetPrefix string = '10.10.1.0/26'

@description('MySQL Flexible Server name')
param mysqlServerName string = 'tofa-marketplace-db-dev'

@description('MySQL admin username')
param administratorLogin string = 'tofa_admin'

@secure()
@description('MySQL admin password (retrieved from Key Vault at deployment time)')
param administratorLoginPassword string

@description('Private DNS zone name as requested')
param privateDnsZoneName string = 'tofa-marketplace-db-dev.private.mysql.database.azure.com'

@description('Database name to create')
param databaseName string = 'tofa_marketplace_II'

@description('App user username for application database access')
param appUsername string = 'tofa_app_dev'

@secure()
@description('App user password for database access')
param appUserPassword string

@description('Jump box VM name')
param jumpboxVmName string = 'tofa-jumpbox'

@description('Jump box admin username')
param jumpboxAdminUsername string = 'azureuser'

@description('SSH public key for jump box VM (leave empty to generate)')
param jumpboxSshPublicKey string = ''

@description('Source CIDR allowed to SSH to jump box public IP. Use 0.0.0.0/0 for any device.')
param jumpboxSshSourceAddressPrefix string = '0.0.0.0/0'

@description('App VM name')
param appVmName string = 'tofa-app-vm'

@description('App VM admin username')
param appVmAdminUsername string = 'azureuser'

@description('SSH public key for app VM (use same key as jumpbox or different)')
param appVmSshPublicKey string = ''

@description('App VM size')
param appVmSize string = 'Standard_B2s_v2'

@description('App load balancer name')
param appLoadBalancerName string = 'tofa-app-lb'

@description('App load balancer public IP name')
param appLoadBalancerPublicIpName string = 'tofa-app-lb-pip'

@description('App load balancer frontend port')
param appLoadBalancerFrontendPort int = 80

@description('App load balancer backend port')
param appLoadBalancerBackendPort int = 80

@description('Enable bootstrap script on jumpbox to create DB app user during deployment.')
param enableDbUserBootstrap bool = false

@description('Tags to apply to all resources')
param tags object = {}


var mysqlVersion = '8.0.21'
var mysqlSkuName = 'Standard_B2s'
var mysqlTier = 'Burstable'
var mysqlStorageSizeGb = 32
var mysqlBackupRetentionDays = 7
var mysqlGeoRedundantBackup = 'Disabled'
var mysqlHighAvailabilityMode = 'Disabled'
var appVmSshKey = appVmSshPublicKey == '' ? jumpboxSshPublicKey : appVmSshPublicKey

// Key Vault for storing secrets (passwords, certificates, etc.)
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enabledForDeployment: true
    enabledForTemplateDeployment: true
  }
}

resource keyVaultSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: keyVaultSecretName
  properties: {
    value: administratorLoginPassword
  }
}

resource keyVaultAppUserSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'app-user-password'
  properties: {
    value: appUserPassword
  }
}

resource keyVaultAppUsernameSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'app-username'
  properties: {
    value: appUsername
  }
}

// Create or use existing VNet (this template creates it if it does not exist)
resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.10.0.0/16'
      ]
    }
  }
}

resource bastionSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: bastionSubnetName
  properties: {
    addressPrefix: bastionSubnetPrefix
    networkSecurityGroup: {
      id: bastionNsg.id
    }
  }
}

resource dbSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: dbSubnetName
  properties: {
    addressPrefix: dbSubnetPrefix
    delegations: [
      {
        name: 'mysql-flexible-servers-delegation'
        properties: {
          serviceName: 'Microsoft.DBforMySQL/flexibleServers'
        }
      }
    ]
    networkSecurityGroup: {
      id: dbNsg.id
    }
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
  dependsOn: [
    bastionSubnet
  ]
}

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: appSubnetName
  properties: {
    addressPrefix: appSubnetPrefix
    networkSecurityGroup: {
      id: appNsg.id
    }
  }
  dependsOn: [
    dbSubnet
  ]
}

// NSGs
resource bastionNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: 'tofa-bastion-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowHttpsInbound'
        properties: {
          priority: 100
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowGatewayManagerInbound'
        properties: {
          priority: 110
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'GatewayManager'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowLoadBalancerInbound'
        properties: {
          priority: 120
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowBastionHostCommunication'
        properties: {
          priority: 130
          access: 'Allow'
          direction: 'Inbound'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRanges: [
            '8080'
            '5701'
          ]
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          access: 'Deny'
          direction: 'Inbound'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowSshRdpOutbound'
        properties: {
          priority: 100
          access: 'Allow'
          direction: 'Outbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRanges: [
            '22'
            '3389'
          ]
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'VirtualNetwork'
        }
      }
      {
        name: 'AllowAzureCloudOutbound'
        properties: {
          priority: 110
          access: 'Allow'
          direction: 'Outbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'AzureCloud'
        }
      }
      {
        name: 'AllowBastionCommunication'
        properties: {
          priority: 120
          access: 'Allow'
          direction: 'Outbound'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRanges: [
            '8080'
            '5701'
          ]
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
        }
      }
      {
        name: 'AllowGetSessionInformation'
        properties: {
          priority: 130
          access: 'Allow'
          direction: 'Outbound'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'Internet'
        }
      }
    ]
  }
}

resource dbNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: 'tofa-db-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowMySqlFromAppSubnet'
        properties: {
          priority: 100
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '3306'
          sourceAddressPrefix: appSubnetPrefix
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          access: 'Deny'
          direction: 'Inbound'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

resource appNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: 'tofa-app-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowSshInboundToJumpbox'
        properties: {
          priority: 100
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '22'
          sourceAddressPrefix: jumpboxSshSourceAddressPrefix
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowAppHttpFromLoadBalancer'
        properties: {
          priority: 110
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '${appLoadBalancerBackendPort}'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowAppHttpFromInternet'
        properties: {
          priority: 120
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '${appLoadBalancerFrontendPort}'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

// Associate NSGs to subnets (now done in subnet resources above)

// Private DNS zone for MySQL Flexible Server private access
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: tags
}

resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZone
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource appLoadBalancerPublicIp 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: appLoadBalancerPublicIpName
  location: location
  sku: {
    name: 'Standard'
  }
  tags: tags
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource appLoadBalancer 'Microsoft.Network/loadBalancers@2023-11-01' = {
  name: appLoadBalancerName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    frontendIPConfigurations: [
      {
        name: 'appFrontend'
        properties: {
          publicIPAddress: {
            id: appLoadBalancerPublicIp.id
          }
        }
      }
    ]
    backendAddressPools: [
      {
        name: 'appBackendPool'
      }
    ]
    probes: [
      {
        name: 'appHealthProbe'
        properties: {
          protocol: 'Http'
          port: appLoadBalancerBackendPort
          requestPath: '/'
          intervalInSeconds: 15
          numberOfProbes: 2
        }
      }
    ]
    loadBalancingRules: [
      {
        name: 'appHttpRule'
        properties: {
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', appLoadBalancerName, 'appFrontend')
          }
          backendAddressPool: {
            id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', appLoadBalancerName, 'appBackendPool')
          }
          probe: {
            id: resourceId('Microsoft.Network/loadBalancers/probes', appLoadBalancerName, 'appHealthProbe')
          }
          protocol: 'Tcp'
          frontendPort: appLoadBalancerFrontendPort
          backendPort: appLoadBalancerBackendPort
          enableFloatingIP: false
          idleTimeoutInMinutes: 4
          enableTcpReset: true
        }
      }
    ]
  }
}

resource appVmNic 'Microsoft.Network/networkInterfaces@2023-11-01' = {
  name: '${appVmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: appSubnet.id
          }
          privateIPAllocationMethod: 'Dynamic'
          loadBalancerBackendAddressPools: [
            {
              id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', appLoadBalancerName, 'appBackendPool')
            }
          ]
        }
      }
    ]
  }
}

resource appVm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: appVmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: appVmSize
    }
    osProfile: {
      computerName: appVmName
      adminUsername: appVmAdminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${appVmAdminUsername}/.ssh/authorized_keys'
              keyData: appVmSshKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: appVmNic.id
        }
      ]
    }
  }
}

// Azure Bastion requires a Public IP for the Bastion resource itself.
// This does NOT expose your DB or app tier publicly.
resource bastionPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: 'tofa-bastion-pip'
  location: location
  sku: {
    name: 'Standard'
  }
  tags: tags
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource bastion 'Microsoft.Network/bastionHosts@2025-05-01' = {
  name: 'tofa-bastion'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    enableTunneling: true
    ipConfigurations: [
      {
        name: 'bastion-ipconfig'
        properties: {
          subnet: {
            id: bastionSubnet.id
          }
          publicIPAddress: {
            id: bastionPip.id
          }
        }
      }
    ]
  }
}

// MySQL Flexible Server with private VNet integration
resource mysqlServer 'Microsoft.DBforMySQL/flexibleServers@2024-12-30' = {
  name: mysqlServerName
  location: location
  tags: tags
  sku: {
    name: mysqlSkuName
    tier: mysqlTier
  }
  properties: {
    version: mysqlVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: mysqlStorageSizeGb
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: mysqlBackupRetentionDays
      geoRedundantBackup: mysqlGeoRedundantBackup
    }
    highAvailability: {
      mode: mysqlHighAvailabilityMode
    }
    network: {
      delegatedSubnetResourceId: dbSubnet.id
      privateDnsZoneResourceId: privateDnsZone.id
      publicNetworkAccess: 'Disabled'
    }
    maintenancePolicy: {
      patchStrategy: 'Regular'
    }
    createMode: 'Default'
  }
  dependsOn: [
    privateDnsZoneVnetLink
  ]
}

// Configure server parameters for SSL/TLS posture
resource requireSecureTransport 'Microsoft.DBforMySQL/flexibleServers/configurations@2024-12-30' = {
  parent: mysqlServer
  name: 'require_secure_transport'
  properties: {
    value: 'ON'
    source: 'user-override'
  }
}

resource tlsVersion 'Microsoft.DBforMySQL/flexibleServers/configurations@2024-12-30' = {
  parent: mysqlServer
  name: 'tls_version'
  properties: {
    value: 'TLSv1.2,TLSv1.3'
    source: 'user-override'
  }
}

// Database
resource mysqlDatabase 'Microsoft.DBforMySQL/flexibleServers/databases@2024-12-30' = {
  parent: mysqlServer
  name: databaseName
  properties: {
    charset: 'utf8mb4'
    collation: 'utf8mb4_unicode_ci'
  }
}

// Jump box VM for database management
resource jumpboxPublicIp 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: '${jumpboxVmName}-pip'
  location: location
  sku: {
    name: 'Standard'
  }
  tags: tags
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource jumpboxNic 'Microsoft.Network/networkInterfaces@2023-11-01' = {
  name: '${jumpboxVmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: appSubnet.id
          }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: jumpboxPublicIp.id
          }
        }
      }
    ]
  }
}

resource jumpboxVm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: jumpboxVmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B2s_v2'
    }
    osProfile: {
      computerName: jumpboxVmName
      adminUsername: jumpboxAdminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${jumpboxAdminUsername}/.ssh/authorized_keys'
              keyData: jumpboxSshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: jumpboxNic.id
        }
      ]
    }
  }
}

// Custom script extension to create app user in MySQL
resource customScriptExtension 'Microsoft.Compute/virtualMachines/extensions@2023-09-01' = if (enableDbUserBootstrap) {
  parent: jumpboxVm
  name: 'create-db-app-user'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.Extensions'
    type: 'CustomScript'
    typeHandlerVersion: '2.1'
    autoUpgradeMinorVersion: true
    protectedSettings: {
      script: base64('''
#!/bin/bash
set -e

# Install mysql-client
apt-get update
apt-get install -y mysql-client-core-8.0

# Create SQL commands to set up app user
MYSQL_HOST='${mysqlServer.properties.fullyQualifiedDomainName}'
ADMIN_USER='${administratorLogin}'
ADMIN_PASSWORD='${administratorLoginPassword}'
DB_NAME='${databaseName}'
APP_USER='${appUsername}'
APP_PASSWORD='${appUserPassword}'

# Run SQL commands to create user and grant permissions
mysql -h "$MYSQL_HOST" -u "$ADMIN_USER" -p"$ADMIN_PASSWORD" --ssl-mode=REQUIRED << EOF
CREATE USER IF NOT EXISTS '$APP_USER'@'%' IDENTIFIED BY '$APP_PASSWORD';
ALTER USER '$APP_USER'@'%' IDENTIFIED BY '$APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON $DB_NAME.* TO '$APP_USER'@'%';
FLUSH PRIVILEGES;
SELECT User, Host FROM mysql.user WHERE User='$APP_USER';
EOF

echo "App user '$APP_USER' created successfully!"
''')
    }
    settings: {
      fileUris: []
    }
  }
  dependsOn: [
    mysqlServer
    mysqlDatabase
  ]
}

output mysqlServerResourceId string = mysqlServer.id
output mysqlServerFqdn string = mysqlServer.properties.fullyQualifiedDomainName
output databaseNameOut string = mysqlDatabase.name
output bastionName string = bastion.name
output privateDnsZoneId string = privateDnsZone.id
output keyVaultId string = keyVault.id
output keyVaultSecretUri string = keyVaultSecret.properties.secretUriWithVersion
output keyVaultAppUserSecretUri string = keyVaultAppUserSecret.properties.secretUriWithVersion
output keyVaultAppUsernameSecretUri string = keyVaultAppUsernameSecret.properties.secretUriWithVersion
output jumpboxVmName string = jumpboxVm.name
output jumpboxVmPrivateIp string = jumpboxNic.properties.ipConfigurations[0].properties.privateIPAddress
output jumpboxPublicIp string = jumpboxPublicIp.properties.ipAddress
output appVmName string = appVm.name
output appVmPrivateIp string = appVmNic.properties.ipConfigurations[0].properties.privateIPAddress
output appLoadBalancerPublicIp string = appLoadBalancerPublicIp.properties.ipAddress
output appLoadBalancerName string = appLoadBalancerName
