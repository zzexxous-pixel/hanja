const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker({cached,offline=false,cacheFailure=false}={}) {
 const handlers={},matches=[];
 const ctx=vm.createContext({self:{registration:{scope:'https://test/preview/'},addEventListener:(name,fn)=>handlers[name]=fn},
  caches:{open:async()=>{if(cacheFailure)throw Error('storage blocked');return {match:async(...args)=>{matches.push(args);return cached;},put:async()=>{throw Error('quota');}};}},
  fetch:async()=>{if(offline)throw Error('offline');return new Response('network');},Response});
 vm.runInContext(fs.readFileSync('sw.js','utf8'),ctx);
 return {async get(cache='default',accept='application/json',mode='cors'){
  let response;
  handlers.fetch({request:{url:'https://test/preview/batch.json',method:'GET',mode,cache,headers:{get:()=>accept}},waitUntil:p=>p.catch(()=>{}),respondWith:p=>response=p});
  return response;
 },matches};
}
test('service worker returns an explicit 503 for offline data instead of undefined',async()=>{
 const w=worker({offline:true});assert.equal((await w.get()).status,503);
});
test('retry bypasses stale cache and quota failure does not break network success',async()=>{
 const w=worker({cached:new Response('stale')});
 assert.equal(await (await w.get('reload')).text(),'network');assert.equal(w.matches.length,0);
 assert.equal(await (await w.get()).text(),'stale');
 assert.equal(w.matches[0].length,1,'query versions are not ignored');
});

test('blocked cache storage still permits successful network data',async()=>{
 const w=worker({cacheFailure:true});assert.equal(await (await w.get()).text(),'network');
});

test('page reload prefers new HTML over cached HTML, with offline fallback',async()=>{
 const online=worker({cached:new Response('old HTML')});
 assert.equal(await (await online.get('default','text/html','navigate')).text(),'network');
 const offline=worker({cached:new Response('offline HTML'),offline:true});
 assert.equal(await (await offline.get('default','text/html','navigate')).text(),'offline HTML');
});
