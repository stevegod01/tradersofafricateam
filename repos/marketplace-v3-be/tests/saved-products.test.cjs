require('./after-sales-env.cjs');
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {SavedProductInput,SavedProductBulkInput,SavedProductQuery}=require('../dist/modules/saved-product/saved-product.schemas');
const {savedProductIds}=require('../dist/modules/saved-product/saved-product.reader');
test('saved-product inputs enforce product-level identity and bounded bulk requests',()=>{
 assert.equal(SavedProductInput.safeParse({productId:randomUUID(),userId:randomUUID()}).success,false);
 assert.equal(SavedProductInput.safeParse({productId:randomUUID(),variantId:randomUUID()}).success,false);
 assert.equal(SavedProductInput.safeParse({productId:'missing'}).success,false);
 assert.equal(SavedProductBulkInput.safeParse({productIds:[]}).success,false);
 assert.equal(SavedProductBulkInput.safeParse({productIds:Array.from({length:101},()=>randomUUID())}).success,false);
 const id=randomUUID();assert.deepEqual(SavedProductBulkInput.parse({productIds:[id,id]}).productIds,[id]);
});
test('saved-product filters reuse bounded catalog validation and comparable currencies',()=>{
 assert.equal(SavedProductQuery.parse({}).limit,20);
 for(const q of [{limit:101},{page:0},{minPrice:10},{minPrice:20,maxPrice:10,currency:'USD'},{sortBy:'price_low_to_high'},{availability:'draft'},{sortBy:'DROP TABLE'},{userId:randomUUID()}])assert.equal(SavedProductQuery.safeParse(q).success,false,JSON.stringify(q));
 assert.equal(SavedProductQuery.parse({currency:'usd',minPrice:10,maxPrice:20}).currency,'USD');
});
test('anonymous and empty pages do not query private saved relationships',async()=>{
 assert.equal((await savedProductIds(null,[randomUUID()])).size,0);
 assert.equal((await savedProductIds(randomUUID(),[])).size,0);
});
test('all saved-product endpoints are documented, authenticated and private',async()=>{
 const {config}=require('../dist/config');config.isDev=true;
 const app=await require('../dist/app').buildApp();
 try {
  await app.ready();const paths=app.swagger().paths;
  for(const path of ['/api/saved-products','/api/saved-products/count','/api/saved-products/{productId}/status','/api/saved-products/{productId}','/api/saved-products/bulk'])assert.ok(paths[path],path);
  for(const req of [{url:'/api/saved-products'},{url:'/api/saved-products/count'},{url:`/api/saved-products/${randomUUID()}/status`},{method:'POST',url:'/api/saved-products',payload:{productId:randomUUID()}},{method:'DELETE',url:'/api/saved-products'},{method:'DELETE',url:'/api/saved-products/bulk',payload:{productIds:[randomUUID()]}}]){
   const res=await app.inject(req);assert.equal(res.statusCode,401);assert.equal(res.headers['cache-control'],'private, no-store');
  }
  assert.ok(paths['/api/products/'].get.description.includes('isSaved'));
 }finally{await app.close();}
});
