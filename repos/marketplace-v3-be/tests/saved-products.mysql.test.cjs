require('./after-sales-env.cjs');
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {AppDataSource:ds}=require('../dist/database/data-source');
const {User}=require('../dist/database/entities/user.entity');
const {Product}=require('../dist/database/entities/product.entity');
const {Category}=require('../dist/database/entities/category.entity');
const {ProductCategory}=require('../dist/database/entities/product-category.entity');
const {ProductImage}=require('../dist/database/entities/product-image.entity');
const {SavedProduct}=require('../dist/database/entities/saved-product.entity');
const {AnalyticsEvent}=require('../dist/database/entities/analytics-event.entity');
const {SavedProductService}=require('../dist/modules/saved-product/saved-product.service');
const {SavedProductQuery}=require('../dist/modules/saved-product/saved-product.schemas');
const {ProductService}=require('../dist/modules/product/product.service');
const {cleanupDeletedSavedProducts}=require('../dist/modules/saved-product/saved-product.cleanup');
const socket=process.env.SAVED_PRODUCTS_TEST_SOCKET;
test('isolated MySQL saved-product lifecycle, visibility and privacy',{skip:!socket},async t=>{
 assert.match(socket,/^\/(?:private\/)?tmp\/tofa-(?:saved-products|rewards)-mysql-[A-Za-z0-9]+\/mysql.sock$/);
 const root=await require('mysql2/promise').createConnection({socketPath:socket,user:'root'});
 const database=`saved_products_test_${process.pid}_${Date.now()}`;
 await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 const options={password:'',socketPath:socket,database,extra:{socketPath:socket,connectionLimit:10},logging:false};ds.setOptions(options);Object.assign(ds.driver.options,options);ds.driver.database=database;
 const service=new SavedProductService();const list=(id,q={})=>service.list(id,SavedProductQuery.parse(q),'en');
 const user=async(type='buyer')=>ds.manager.save(User,ds.manager.create(User,{email:`${randomUUID()}@example.com`,firstName:'Test',lastName:'User',status:'active',userType:type,isCompanyVerified:type==='seller',storeName:type==='seller'?'Test store':null,referralCode:randomUUID().slice(0,12),isEmailVerified:true,termsOfUse:true}));
 let seller,category;
 const product=async(patch={})=>{
  const p=await ds.manager.save(Product,ds.manager.create(Product,{sellerId:seller.id,productName:{en:'Premium cocoa',fr:'Cacao premium'},productDescription:{en:'Quality cocoa'},countryOfOrigin:'Nigeria',currency:'USD',productType:'simple',price:2500,quantity:100,totalStock:100,inventoryStatus:'in_stock',status:'active',supplyCapacity:100,unitForSupplyCapacity:'kg',minOrdersAllowed:1,unitForMinOrder:'kg',minDuration:1,maxDuration:10,durationUnit:'days',...patch}));
  await ds.manager.save(ProductCategory,ds.manager.create(ProductCategory,{productId:p.id,categoryId:category.id}));return p;
 };
 try {
  await ds.initialize();await ds.runMigrations({transaction:'each'});assert.equal((await ds.runMigrations({transaction:'each'})).length,0);
  seller=await user('seller');const buyer=await user(),otherBuyer=await user(),buyingSeller=await user('seller');
  category=await ds.manager.save(Category,ds.manager.create(Category,{name:{en:'Cocoa'},slug:`cocoa-${randomUUID()}`,createdBy:seller.id}));
  const p=await product();
  await t.test('concurrent saves create one relationship and one lightweight event, no commercial side effects',async()=>{
   const auditBefore=Number((await ds.manager.query('SELECT COUNT(*) n FROM audit_logs'))[0].n);
   await Promise.all([1,2,3].map(()=>service.save(buyer.id,p.id)));
   assert.equal(await ds.manager.countBy(SavedProduct,{userId:buyer.id,productId:p.id}),1);
   assert.equal(await ds.manager.countBy(AnalyticsEvent,{eventName:'PRODUCT_SAVED',entityId:p.id}),1);
   const event=await ds.manager.findOneByOrFail(AnalyticsEvent,{eventName:'PRODUCT_SAVED',entityId:p.id});assert.equal(event.actorId,null);assert.deepEqual(event.payload,{productId:p.id});
   assert.equal(Number((await ds.manager.query('SELECT COUNT(*) n FROM audit_logs'))[0].n),auditBefore);
   assert.equal(Number((await ds.manager.query('SELECT COUNT(*) n FROM notifications'))[0].n),0);
   assert.equal(Number((await ds.manager.findOneByOrFail(Product,{id:p.id})).totalStock),100);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:buyer.id})).totalPoints,0);
  });
  await t.test('buyers and sellers can save; lists and mutations remain owner-scoped',async()=>{
   await service.save(buyingSeller.id,p.id);await service.save(otherBuyer.id,p.id);
   await service.remove(otherBuyer.id,[p.id]);await service.remove(otherBuyer.id,[p.id]);
   assert.equal((await service.status(otherBuyer.id,p.id)).data.isSaved,false);
   assert.equal((await service.count(buyingSeller.id)).data.count,1);
   assert.equal((await service.status(buyer.id,p.id)).data.isSaved,true);
  });
  await t.test('joined data reflects current price, image, seller and stock without reservation',async()=>{
   await ds.manager.update(Product,p.id,{price:2700,inventoryStatus:'out_of_stock',totalStock:0});
   await ds.manager.save(ProductImage,ds.manager.create(ProductImage,{productId:p.id,url:'https://example.com/cocoa.jpg',isPrimary:true}));
   const result=await list(buyer.id);assert.equal(result.data.length,1);assert.equal(result.data[0].product.price,2700);assert.equal(result.data[0].product.availabilityLabel,'Out of Stock');assert.equal(result.data[0].product.primaryImage.url,'https://example.com/cocoa.jpg');
   const third=await user();await service.save(third.id,p.id);assert.equal((await service.count(third.id)).data.count,1);
  });
  await t.test('inactive and archived products remain unavailable; draft/deleted and restricted sellers/categories stay hidden',async()=>{
   for(const status of ['inactive','archived']){await ds.manager.update(Product,p.id,{status});const result=await list(buyer.id);assert.equal(result.data[0].product.availabilityLabel,'Currently unavailable');await assert.rejects(service.save(otherBuyer.id,p.id),/Product not found/);}
   for(const status of ['draft','deleted']){await ds.manager.update(Product,p.id,{status});assert.equal((await list(buyer.id)).data.length,0);assert.equal((await service.count(buyer.id)).data.count,0);}
   await ds.manager.update(Product,p.id,{status:'active'});
   await ds.manager.update(User,seller.id,{isCompanyVerified:false});assert.equal((await list(buyer.id)).data.length,0);await assert.rejects(service.save(otherBuyer.id,p.id));
   await ds.manager.update(User,seller.id,{isCompanyVerified:true,status:'disabled'});assert.equal((await service.count(buyer.id)).data.count,0);
   await ds.manager.update(User,seller.id,{status:'active'});
   await ds.manager.update(Category,category.id,{status:'inactive'});assert.equal((await list(buyer.id)).data.length,0);
   await ds.manager.update(Category,category.id,{status:'active'});
   assert.equal((await list(buyer.id)).data.length,1);
  });
  await t.test('pagination filters and variable products use current catalog data',async()=>{
   const variable=await product({productType:'variable',price:null});await service.save(buyer.id,variable.id);
   const page=await list(buyer.id,{limit:1});assert.equal(page.data.length,1);assert.equal(page.pagination.total,2);
   const filtered=await list(buyer.id,{currency:'USD',minPrice:2600,maxPrice:2800,search:'cocoa',categoryId:category.id,sellerId:seller.id,countryOfOrigin:'nigeria'});assert.equal(filtered.data.length,1);assert.equal(filtered.data[0].product.id,p.id);
   assert.equal((await list(buyer.id,{availability:'out_of_stock'})).data.length,1);
   assert.equal((await list(buyer.id)).data.find(x=>x.product.id===variable.id).product.price,null);
  });
  await t.test('public catalog details and lists batch saved-state lookup without changing anonymous responses',async()=>{
   const products=new ProductService();
   assert.equal((await products.getPublicProductById(p.id,'en',buyer.id)).data.isSaved,true);
   assert.equal('isSaved' in (await products.getPublicProductById(p.id,'en')).data,false);
   const result=await products.getPublicProducts({page:1,limit:20,sellerId:seller.id,inventoryStatus:'out_of_stock'},'en',buyer.id);
   assert.ok(result.data.some(x=>x.id===p.id&&x.isSaved));
   const {config}=require('../dist/config');config.isDev=true;
   const app=await require('../dist/app').buildApp();await app.ready();
   try {
    const headers={authorization:`Bearer ${app.jwt.sign({sub:buyer.id})}`};
    const response=await app.inject({url:'/api/saved-products',headers});assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'private, no-store');assert.equal(response.json().data.length,2);
    const detail=await app.inject({url:`/api/products/${p.id}`,headers});assert.equal(detail.statusCode,200);assert.equal(detail.json().data.isSaved,true);assert.equal(detail.headers['cache-control'],'private, no-store');
    const adminToken=app.jwt.sign({sub:buyer.id,tokenType:'admin'});
    const anonymous=await app.inject({url:`/api/products/${p.id}`,headers:{authorization:`Bearer ${adminToken}`}});assert.equal('isSaved' in anonymous.json().data,false);
    assert.equal((await app.inject({url:'/api/saved-products',headers:{authorization:`Bearer ${adminToken}`}})).statusCode,401);
   }finally{await app.close();}
  });
  await t.test('seller analytics exposes current aggregate counts without saver identities',async()=>{
   const {AnalyticsService}=require('../dist/modules/analytics/analytics.service');const analytics=new AnalyticsService();analytics.assertSellerAnalyticsAccess=async()=>{};
   const result=await analytics.getSellerProducts(seller.id,{page:1,limit:20,sortBy:'views'},'en');
   const row=result.data.find(x=>x.productId===p.id);assert.equal(row.savedCount,3);
   assert.equal('userId' in row,false);assert.equal('savedUsers' in row,false);
  });
  await t.test('event failures roll back saving and clearing; no partial mutation',async()=>{
   const u=await user();const original=service.event;service.event=async()=>{throw new Error('Analytics unavailable');};
   try{await assert.rejects(service.save(u.id,p.id));assert.equal(await ds.manager.countBy(SavedProduct,{userId:u.id}),0);await assert.rejects(service.remove(buyer.id));assert.equal(await ds.manager.countBy(SavedProduct,{userId:buyer.id}),2);}finally{service.event=original;}
  });
  await t.test('bulk remove and clear are idempotent and cannot affect another owner',async()=>{
   await service.remove(buyer.id,[p.id]);assert.equal((await service.count(buyer.id)).data.count,1);
   await service.remove(buyer.id);await service.remove(buyer.id);assert.equal((await service.count(buyer.id)).data.count,0);assert.equal((await service.count(buyingSeller.id)).data.count,1);
   const count=await ds.manager.countBy(AnalyticsEvent,{eventName:'PRODUCT_UNSAVED',entityId:p.id});assert.equal(count,2);
  });
  await t.test('two sellers saving one another’s products can safely retry deadlocks',async()=>{
   const a=await user('seller'),b=await user('seller');const ap=await product({sellerId:a.id}),bp=await product({sellerId:b.id});
   await Promise.all([service.save(a.id,bp.id),service.save(b.id,ap.id)]);
   assert.equal((await service.count(a.id)).data.count,1);assert.equal((await service.count(b.id)).data.count,1);
  });
  await t.test('deleted-account cleanup and hard-delete cascades do not block deletion',async()=>{
   const disposable=await user();await service.save(disposable.id,p.id);await ds.manager.update(User,disposable.id,{status:'deleted'});assert.ok(await cleanupDeletedSavedProducts()>0);assert.equal(await ds.manager.countBy(SavedProduct,{userId:disposable.id}),0);
   const hard=await user();await service.save(hard.id,p.id);await ds.manager.delete(User,hard.id);assert.equal(await ds.manager.countBy(SavedProduct,{userId:hard.id}),0);
   const gone=await product();await service.save(buyingSeller.id,gone.id);await ds.manager.delete(Product,gone.id);assert.equal(await ds.manager.countBy(SavedProduct,{productId:gone.id}),0);
  });
 }finally{if(ds.isInitialized)await ds.destroy();await root.query(`DROP DATABASE \`${database}\``);await root.end();}
});
