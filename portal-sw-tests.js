/* اختبارات service worker البوابة: النت الضعيف مايعلّقش الصفحة (بعد المهلة بتفتح النسخة المحفوظة)، وانقطاع النت بيفتح المحفوظ، والنت السليم بيحدّث الكاش. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeSW(fetchImpl){
  const store={},handlers={};
  const cacheApi={
    open:async()=>({put:async(k,v)=>{store[typeof k==='string'?k:k.url]=v},match:async k=>store[typeof k==='string'?k:k.url],add:async()=>{}}),
    match:async k=>store[typeof k==='string'?k:k.url],keys:async()=>[],delete:async()=>true
  };
  const self={addEventListener:(t,f)=>{handlers[t]=f},skipWaiting(){},clients:{claim(){}}};
  const ctx={self,caches:cacheApi,fetch:fetchImpl,URL,location:{origin:'https://x.test'},Response:{error:()=>({error:true})},setTimeout,clearTimeout,console,Promise};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/portal-sw.js`,'utf8'),ctx,{filename:'portal-sw.js'});
  const req=()=>({method:'GET',url:'https://x.test/portal.html?p=01012345678'});
  const fire=()=>new Promise(res=>handlers.fetch({request:req(),respondWith:p=>res(p)}));
  return {store,fire};
}
const okRes=body=>({ok:true,body,clone(){return {ok:true,body}}});
const guard=setTimeout(()=>{console.error('portal-sw-tests: FAIL (timeout - page hangs on slow network)');process.exit(1)},12000);
(async()=>{
  // 1) نت بطيء جدًا + نسخة محفوظة: بترجع المحفوظة بعد المهلة (مش بتستنى)
  {
    const sw=makeSW(()=>new Promise(()=>{}));
    sw.store['./portal.html']={cached:true};
    const t0=Date.now(),r=await sw.fire();
    assert.strictEqual(r.cached,true,'slow network must fall back to cached page');
    assert.ok(Date.now()-t0<6000,'must not wait for the network');
  }
  // 2) النت فاصل: المحفوظة
  {
    const sw=makeSW(()=>Promise.reject(new Error('offline')));
    sw.store['./portal.html']={cached:true};
    assert.strictEqual((await sw.fire()).cached,true);
  }
  // 3) نت سليم: بيرجع الجديد ويحدّث الكاش
  {
    const sw=makeSW(async()=>okRes('fresh'));
    sw.store['./portal.html']={cached:true};
    const r=await sw.fire();assert.strictEqual(r.body,'fresh');
    await new Promise(r=>setTimeout(r,20));
    assert.strictEqual(sw.store['./portal.html'].body,'fresh','cache refreshed with the new page');
  }
  // 4) فاصل ومفيش محفوظ: خطأ شبكة عادي مش تعليق
  {
    const sw=makeSW(()=>Promise.reject(new Error('offline')));
    assert.ok((await sw.fire()).error);
  }
  clearTimeout(guard);console.log('portal-sw-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
