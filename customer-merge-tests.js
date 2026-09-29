const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/firebase-sync.js','utf8');
const a=src.indexOf('function nph(x)'), b=src.indexOf('window.wfInviteCustomer = inviteCustomer;');
const block=src.slice(a,b);
function mk(opts={}){
  const store={};const ls={getItem:k=>store[k]??null};
  const origSet={call:(_,k,v)=>{store[k]=String(v)}};
  const ops=[];const idx={}; const links={}; // phoneIndex, portalLinks
  Object.assign(idx,opts.phoneIndex||{});Object.assign(links,opts.links||{});
  const snap=(arr)=>({docs:arr.map(x=>({ref:{update:u=>{ops.push(['upd',x.col,x.id,u]);if(x.col==='portalLinks')links[x.id]={...links[x.id],...u};return Promise.resolve()}},id:x.id}))});
  const db={collection:(c)=>({
    doc:(id)=>({
      get:()=>Promise.resolve({exists:c==='phoneIndex'?!!idx[id]:c==='portalLinks'?!!links[id]:false,data:()=>c==='phoneIndex'?idx[id]:links[id]}),
      set:(v,o)=>{ops.push(['set',c,id,v]);if(c==='portalLinks')links[id]={...links[id],...v};if(c==='phoneIndex')idx[id]=v;return Promise.resolve()}}),
    where:(f,o,v)=>({get:()=>Promise.resolve(snap(c==='portalLinks'?Object.keys(links).filter(k=>links[k].customerId===v).map(k=>({col:c,id:k})):[]))})})};
  const K={c:'wf_c',d:'wf_d',r:'wf_r',tasks:'wf_tasks',inv:'wf_inv',pc:'wf_pc',wtx:'wf_wtx',tr:'wf_tr',followupLog:'wf_fl'};
  const W={K,arr:k=>JSON.parse(store[k]||'[]'),saveJSONSafe:(k,a)=>{store[k]=JSON.stringify(a);return true},auditLog:()=>{}};
  const created=[];
  const fbApp={auth:()=>({createUserWithEmailAndPassword:(em,pw)=>{created.push(em);return Promise.resolve({user:{uid:'NEWUID'}})},signOut:()=>Promise.resolve()}),firestore:()=>db};
  const firebase={apps:[fbApp&&{name:'sec',...fbApp}],app:()=>({options:{}}),initializeApp:()=>fbApp,firestore:{FieldValue:{serverTimestamp:()=>'ts'}}};
  firebase.apps[0].auth=fbApp.auth;firebase.apps[0].firestore=fbApp.firestore;
  const online=opts.offline?()=>false:()=>true;
  const fn=new Function('window','online','ready','withTimeout','db','firebase','ls','origSet','byCreated','banner','projectOrders','hydrateFull',
    block+'\nreturn {mergePortalDuplicates,mergeCustomers,resolveInvite,nph};');
  const api=fn(W,online,true,p=>p,db,firebase,ls,origSet,(x,y)=>Date.parse(x.createdAt||0)-Date.parse(y.createdAt||0),()=>{},()=>{},()=>Promise.resolve());
  return {store,ops,links,idx,created,api};
}
(async()=>{
 // 1 self-registered dup
 let t=mk();t.store.wf_c=JSON.stringify([{id:'c1',phone:'01005781925',name:'a',createdAt:'2026-01-01'},{id:'U1',phone:'01005781925',name:'a',portal:true,createdAt:'2026-09-01'}]);
 t.store.wf_d=JSON.stringify([{id:'d',customerId:'U1'}]);
 assert.strictEqual(await t.api.mergePortalDuplicates(),1);
 assert.deepStrictEqual(JSON.parse(t.store.wf_c).map(x=>x.id),['c1']);assert.strictEqual(JSON.parse(t.store.wf_c)[0].portalUid,'U1');
 assert.strictEqual(JSON.parse(t.store.wf_d)[0].customerId,'c1');assert.strictEqual(t.links.U1.customerId,'c1');
 // 2 original already flagged portal (syncFlags) + self-reg dup
 t=mk();t.store.wf_c=JSON.stringify([{id:'c1',phone:'01005781925',portal:true,portalUid:'OLD',createdAt:'2026-01-01'},{id:'U1',phone:'+201005781925',portal:true,createdAt:'2026-09-01'}]);
 assert.strictEqual(await t.api.mergePortalDuplicates(),1);assert.strictEqual(JSON.parse(t.store.wf_c).length,1);assert.strictEqual(JSON.parse(t.store.wf_c)[0].portalUid,'OLD');
 // 3 manual merge, offline OK for plain records
 t=mk({offline:true});t.store.wf_c=JSON.stringify([{id:'a',phone:'0100',name:'x'},{id:'b',phone:'0100',name:'y'}]);
 t.store.wf_r=JSON.stringify([{id:'r',customerId:'b'}]);
 assert.strictEqual(await t.api.mergeCustomers('a','b'),true);assert.strictEqual(JSON.parse(t.store.wf_r)[0].customerId,'a');assert.strictEqual(JSON.parse(t.store.wf_c).length,1);
 // 4 dup with portal account offline -> rejected, nothing changed
 t=mk({offline:true});t.store.wf_c=JSON.stringify([{id:'a'},{id:'b',portalUid:'X',portal:true}]);
 await assert.rejects(()=>t.api.mergeCustomers('a','b'),e=>e.code==='offline');assert.strictEqual(JSON.parse(t.store.wf_c).length,2);
 // 5 manual merge online repoints existing links of linked dup
 t=mk({links:{X:{customerId:'b'}}});t.store.wf_c=JSON.stringify([{id:'a'},{id:'b',portalUid:'X',portal:true}]);
 await t.api.mergeCustomers('a','b');assert.strictEqual(t.links.X.customerId,'a');assert.strictEqual(JSON.parse(t.store.wf_c)[0].portalUid,'X');
 // invite: new account
 t=mk();let r=await t.api.resolveInvite({id:'c1'},'01005781925');
 assert.ok(r.created&&r.mustChange&&r.uid==='NEWUID');assert.strictEqual(t.created[0],'01005781925@phone.elwarsha.app');assert.strictEqual(t.links.NEWUID.customerId,'c1');assert.ok(t.idx['01005781925']);
 // invite: already linked to this customer
 t=mk({phoneIndex:{'01005781925':{uid:'U2'}},links:{U2:{customerId:'c1',mustChange:false}}});r=await t.api.resolveInvite({id:'c1'},'01005781925');
 assert.ok(!r.created&&r.mustChange===false&&t.created.length===0);
 // invite: account exists, no link -> link it
 t=mk({phoneIndex:{'01005781925':{uid:'U3'}}});r=await t.api.resolveInvite({id:'c1'},'01005781925');assert.strictEqual(t.links.U3.customerId,'c1');
 // invite: linked to other customer -> error
 t=mk({phoneIndex:{'01005781925':{uid:'U4'}},links:{U4:{customerId:'zzz'}}});
 await assert.rejects(()=>t.api.resolveInvite({id:'c1'},'01005781925'),e=>e.code==='linked-other');
 console.log('merge+invite PASS (9 scenarios)');
})().catch(e=>{console.error(e);process.exit(1)});
