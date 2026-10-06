/* app-delete-tools.js — أدوات حذف فردي/جماعي للعملاء والأجهزة وأوامر الشغل. */
function cleanupRequestRecordings(requests){if(!window.ImageStore?.delete)return;(requests||[]).forEach(r=>(r.callRecordings||[]).forEach(cr=>{if(cr?.ref)window.ImageStore.delete(cr.ref)}))}
function cleanupDevicePhotos(devices){if(!window.ImageStore?.delete)return;(devices||[]).forEach(d=>{if(d.photo)window.ImageStore.delete(d.photo)})}
function requestPartsToRestore(requests){return(requests||[]).filter(r=>r.status!=="ملغي")}
function walletEntriesAfterRemovingRequests(requestIds){
  const ids=new Set((requestIds||[]).map(String));
  return arr(K.wtx).map(x=>{
    const ref=String(x.refKey||"");
    // دفعة جزئية منفصلة (من خط السير) بتتحذف مع أمرها، وبنعلّمها عشان تتسترجع لو الأمر رجع من السلة.
    if(x.source==="order-part"&&!x.deleted&&ids.has(String(x.orderId)))return{...x,deleted:true,deletedWithOrder:true};
    return (ref.startsWith("order-deposit-")||ref.startsWith("order-final-"))&&ids.has(ref.replace(/^order-(?:deposit|final)-/,""))?{...x,deleted:true}:x;
  });
}
function restorePartsIntoStock(stock,requests){
  requestPartsToRestore(requests).forEach(r=>(r.parts||[]).forEach(x=>{
    const p=stock.find(z=>z.id===x.partId);if(p)p.qty=(+p.qty||0)+(+x.qty||0);
  }));
}
async function deleteCustomerRecord(cid){
  const c=arr(K.c).find(x=>x.id===cid);if(!c)return;
  if(arr(K.d).some(d=>d.customerId===cid)||arr(K.r).some(r=>r.customerId===cid)){alert("لا يمكن حذف العميل الآن لأن له أجهزة أو أوامر شغل مرتبطة به. احذف البيانات المرتبطة أولاً أو استخدم الحذف العام.");return}
  const linkedTasks=arr(K.tasks).filter(t=>t.customerId===cid);
  // عميل عنده حساب بوابة: الحذف هيقفل عليه الدخول. نوضّح ده قبل التأكيد.
  const portalNote=(c.portal===true||c.portalUid)?"\n\n🌐 العميل ده عنده حساب في بوابة العملاء، وبعد الحذف مش هيقدر يدخل ببياناته.":"";
  if(!confirm(`حذف العميل «${c.name||""}» نهائيًا؟${linkedTasks.length?`\n(هيتفك ربط ${linkedTasks.length} مهمة بيه وتفضل موجودة.)`:""}${portalNote}`))return;
  // المهام المرتبطة بالعميل بتتفك منه (بدل ما تفضل بتشاور على عميل مش موجود).
  const values={[K.c]:arr(K.c).filter(x=>x.id!==cid)};
  if(linkedTasks.length)values[K.tasks]=arr(K.tasks).map(t=>t.customerId===cid?{...t,customerId:"",requestId:""}:t);
  if(!await commitStorageAsync(values))return;
  window.auditLog?.("حذف", "عميل", cid, c.name||"");
  renderCustomers();
}
async function deleteDeviceRecord(did){
  const d=arr(K.d).find(x=>x.id===did);if(!d)return;
  if(arr(K.r).some(r=>r.deviceId===did)){alert("لا يمكن حذف الجهاز لأنه مرتبط بأمر شغل. احذف أمر الشغل المرتبط أولًا أو استخدم الحذف العام.");return}
  if(!confirm("حذف الجهاز نهائيًا؟"))return;
  if(!await commitStorageAsync({[K.d]:arr(K.d).filter(x=>x.id!==did)}))return;
  if(window.ImageStore?.delete&&d.photo)window.ImageStore.delete(d.photo);window.auditLog?.("حذف", "جهاز", did, `${d.type||""} ${d.brand||""}`);renderDevices();
}
async function deleteRequestRecord(rid){
  const r=arr(K.r).find(x=>x.id===rid);if(!r)return;
  if(r.closed||r.paid){
    if(!confirm(`⚠️ أمر الشغل ${r.no||""} مغلق أو مدفوع بالكامل. حذفه هيشيله نهائيًا هو وأي حركة حسابات أو مخزون مرتبطة بيه من التقارير. متأكد إنك عايز تحذفه؟`))return;
  }
  if(!confirm(`حذف أمر الشغل ${r.no||""} نهائيًا؟`))return;
  const stock=arr(K.p),requests=arr(K.r);
  const partsDelta=(r.parts||[]).filter(x=>!x.external&&x.partId).map(x=>({partId:x.partId,qty:+x.qty||0}));
  restorePartsIntoStock(stock,[r]);
  const removedMoves=arr(K.m).filter(x=>x.requestId===rid);
  const ok=await commitStorageAsync({[K.p]:stock,[K.m]:arr(K.m).filter(x=>x.requestId!==rid),[K.r]:requests.filter(x=>x.id!==rid),[K.wtx]:walletEntriesAfterRemovingRequests([rid])});
  if(!ok)return;
  window.auditLog?.("حذف", "أمر شغل", rid, r.no||"");
  pushToTrash("request",`أمر شغل ${r.no||""}`,{request:r,moves:removedMoves,partsDelta,walletRefKeys:walletRefKeysForOrders([rid])});
  renderRequests();
  if(document.getElementById("requestProfile"))location.href="requests.html";
}
async function deleteAllCustomers(){
  const c=arr(K.c);if(!c.length)return alert("لا توجد بيانات عملاء للحذف.");
  if(!confirm(`حذف جميع العملاء (${c.length}) وما يرتبط بهم من أجهزة وأوامر شغل؟`))return;
  if(!confirm("تأكيد نهائي: لا يمكن التراجع عن الحذف."))return;
  const devices=arr(K.d),requests=arr(K.r),stock=arr(K.p);restorePartsIntoStock(stock,requests);
  const ok=await commitStorageAsync({[K.p]:stock,[K.c]:[],[K.d]:[],[K.r]:[],[K.m]:[],[K.wtx]:walletEntriesAfterRemovingRequests(requests.map(r=>r.id))});
  if(!ok)return;
  cleanupDevicePhotos(devices);cleanupRequestRecordings(requests);renderCustomers?.();renderDevices?.();renderRequests?.();alert("تم حذف جميع العملاء والبيانات المرتبطة بهم.");
}
async function deleteAllDevices(){
  const d=arr(K.d);if(!d.length)return alert("لا توجد بيانات أجهزة للحذف.");
  if(!confirm(`حذف جميع الأجهزة (${d.length}) وأوامر الشغل المرتبطة بها؟`))return;
  if(!confirm("تأكيد نهائي: لا يمكن التراجع عن الحذف."))return;
  const requests=arr(K.r),stock=arr(K.p);restorePartsIntoStock(stock,requests);
  const ok=await commitStorageAsync({[K.p]:stock,[K.d]:[],[K.r]:[],[K.m]:[],[K.wtx]:walletEntriesAfterRemovingRequests(requests.map(r=>r.id))});
  if(!ok)return;
  cleanupDevicePhotos(d);cleanupRequestRecordings(requests);renderDevices?.();renderRequests?.();alert("تم حذف جميع الأجهزة وأوامر الشغل المرتبطة بها.");
}
async function deleteAllRequests(){
  const r=arr(K.r);if(!r.length)return alert("لا توجد أوامر شغل للحذف.");
  if(!confirm(`حذف جميع أوامر الشغل (${r.length}) وإرجاع قطع الغيار المصروفة للمخزن؟`))return;
  if(!confirm("تأكيد نهائي: لا يمكن التراجع عن الحذف."))return;
  const stock=arr(K.p);restorePartsIntoStock(stock,r);
  const ok=await commitStorageAsync({[K.p]:stock,[K.r]:[],[K.m]:[],[K.wtx]:walletEntriesAfterRemovingRequests(r.map(x=>x.id))});
  if(!ok)return;
  cleanupRequestRecordings(r);renderRequests?.();renderDash?.();monthReport?.();alert("تم حذف جميع أوامر الشغل وإرجاع القطع للمخزن.");
}
function resolveRequestAddress(r){const c=byIdCached(K.c).get(r.customerId);if(!c)return{};const list=addresses(c);return list.find(a=>a.key===r.addressKey)||list[0]||{}}

// خط سير اليوم: تجميع أوامر الشغل التي لها موعد زيارة حسب المركز والقرية.
