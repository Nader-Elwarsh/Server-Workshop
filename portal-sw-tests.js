/* اختبارات service worker البوابة: النت الضعيف مايعلّقش الصفحة (بعد المهلة بتفتح النسخة المحفوظة)، وانقطاع النت بيفتح المحفوظ، والنت السليم بيحدّث الكاش. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeSW(fetchImpl,options={}){
  const store={},handlers={},deleted=[],calls={skipWaiting:0};
  const cacheApi={
    open:async()=>({put:async(k,v)=>{store[typeof k==='string'?k:k.url]=v},match:async k=>store[typeof k==='string'?k:k.url],add:async()=>{},addAll:async files=>{if(options.failInstall)throw new Error('simulated shell failure');files.forEach(f=>{store[f]={cachedShell:true}})}}),
    match:async k=>store[typeof k==='string'?k:k.url],keys:async()=>options.keys||[],delete:async k=>{deleted.push(k);return true}
  };
  const self={addEventListener:(t,f)=>{handlers[t]=f},skipWaiting(){calls.skipWaiting++},clients:{claim(){}}};
  const ctx={self,caches:cacheApi,fetch:fetchImpl,URL,location:{origin:'https://x.test'},Response:{error:()=>({error:true})},setTimeout,clearTimeout,console,Promise};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/portal-sw.js`,'utf8'),ctx,{filename:'portal-sw.js'});
  const req=()=>({method:'GET',url:'https://x.test/portal.html?p=01012345678'});
  const fire=()=>new Promise(res=>handlers.fetch({request:req(),respondWith:p=>res(p)}));
  return {store,fire,handlers,deleted,calls};
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
  // 5) كاش البوابة لا يمسح كاش الورشة أو الكاشات غير التابعة له.
  {
    const sw=makeSW(()=>Promise.reject(new Error('offline')),{keys:['portal-v12-local-firebase','workshop-v18-sync-repairs','unrelated-cache']});
    let activation;sw.handlers.activate({waitUntil:p=>{activation=p}});await activation;
    assert.deepStrictEqual(sw.deleted,['portal-v12-local-firebase'],'only an old portal cache is removed');
  }
  // 6) تثبيت البوابة يجهز ملفات التخزين المطلوبة، ويستبدل الكاش الذري فقط.
  {
    const sw=makeSW(()=>Promise.reject(new Error('offline')));
    let installation;sw.handlers.install({waitUntil:p=>{installation=p}});await installation;
    assert.ok(sw.store['./workshop-idb.js']&&sw.store['./image-store.js'],'offline storage dependencies are precached');
    assert.strictEqual(sw.calls.skipWaiting,1,'worker activates only after all required shell files are cached');
  }
  // 7) فشل أي مورد أساسي يمسح الكاش الجزئي ولا يفعّل العامل الجديد.
  {
    const sw=makeSW(()=>Promise.reject(new Error('offline')),{failInstall:true});
    let installation;sw.handlers.install({waitUntil:p=>{installation=p}});
    await assert.rejects(installation,/simulated shell failure/);
    assert.ok(sw.deleted.includes('portal-v14-fb-posts-bottomnav'),'partial new cache removed');
    assert.strictEqual(sw.calls.skipWaiting,0,'failed install is not activated');
  }
  // 8) عامل الورشة لا يحذف كاش البوابة أو كاشات أخرى عند التفعيل.
  {
    const handlers={},deleted=[],keys=['workshop-v17-home-sync-strip','portal-v14-fb-posts-bottomnav','unrelated-cache'];
    const self={addEventListener:(t,f)=>{handlers[t]=f},location:{origin:'https://x.test'},skipWaiting(){},clients:{claim:()=>Promise.resolve()}};
    const caches={keys:async()=>keys,delete:async k=>{deleted.push(k);return true}};
    const ctx={self,caches,importScripts(){},URL,Request,Promise,Map,console,fetch:async()=>({ok:true}),Response:{error:()=>({error:true})}};
    vm.runInNewContext(fs.readFileSync(`${__dirname}/service-worker.js`,'utf8'),ctx,{filename:'service-worker.js'});
    let activation;handlers.activate({waitUntil:p=>{activation=p}});await activation;
    assert.deepStrictEqual(deleted,['workshop-v17-home-sync-strip'],'workshop worker only removes its own old caches');
  }
  clearTimeout(guard);console.log('portal-sw-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
