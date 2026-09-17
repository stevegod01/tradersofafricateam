import { MarketplaceCountry } from '../../database/entities/marketplace-country.entity';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import { MarketplaceCurrency } from '../../database/entities/marketplace-currency.entity';
import { settingDefinitions } from './settings.registry';
import { createError } from '../../common/utils/http-error.util';

// Direct reads deliberately avoid stale per-process caches, especially for financial switches.
export async function getSetting<T>(key:string,manager:EntityManager=AppDataSource.manager):Promise<T> {
 const definition=settingDefinitions[key];
 if(!definition)throw createError.badRequest('Unknown setting');
 const row=await manager.findOneBy(SystemSetting,{key});
 if(!row)throw createError.conflict('System configuration is missing; run migrations');
 return definition.schema.parse(row.value) as T;
}
export async function requireActiveCurrency(code:string,manager=AppDataSource.manager):Promise<void> {
 if(!await manager.existsBy(MarketplaceCurrency,{code:code.toUpperCase(),status:'active'}))throw createError.badRequest('Currency is unavailable for new transactions');
}
export async function requireDeliveryType(type:string,manager=AppDataSource.manager):Promise<void> {
 const key=({integrated_logistics:'integratedLogisticsEnabled',seller_arranged:'sellerArrangedLogisticsEnabled',buyer_arranged:'buyerArrangedLogisticsEnabled'} as Record<string,string>)[type];
 if(!key || !await getSetting<boolean>(key,manager))throw createError.badRequest('Delivery method is currently unavailable');
}

export async function requireActiveCountry(value:string,manager=AppDataSource.manager):Promise<string> {
 const country=await manager.findOne(MarketplaceCountry,{where:[{code:value.toUpperCase(),status:'active'},{name:value,status:'active'}]});
 if(!country)throw createError.badRequest('Country is unavailable for new selections');
 return country.code;
}
