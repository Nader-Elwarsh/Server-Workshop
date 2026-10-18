/* app-parts.js — قسم المخزن/قطع الغيار: كشف التكرار، الحذف/الأرشفة، النموذج، الحفظ، العرض، البروفايل. */
const _partMutationLocks=new Set();
async function withPartMutationLock(lockId,work){const key=String(lockId||"");if(!key||_partMutationLocks.has(key))return false;_partMutationLocks.add(key);try{return await work()}finally{_partMutationLocks.delete(key)}}
function normalizePartText(v){
  return String(v||"").toLowerCase().normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/[ـ]/g,"")
    .replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660))
    .replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0))
    .replace(/[\s\-_./\\]+/g,"").trim();
}
/* بحث مرن: بيتجاهل الهمزات/التاء المربوطة/المسافات/الأرقام الهندي، وكل كلمة لازم تكون موجودة في الاسم أو الكود أو المكان أو التصنيف */
function partMatchesQuery(p,q){if(typeof wfMatch==="function")return wfMatch([p&&p.name,p&&p.code,p&&p.location,p&&p.category],q);const words=String(q||"").trim().split(/\s+/).map(normalizePartText).filter(Boolean);if(!words.length)return true;const hay=normalizePartText([p&&p.name,p&&p.code,p&&p.location,p&&p.category].filter(Boolean).join(" "));return words.every(w=>hay.includes(w))}
function findDuplicatePartName(name,excludeId){const n=normalizePartText(name);if(!n)return null;return arr(K.p).find(p=>String(p.id)!==String(excludeId||"")&&!p.archived&&normalizePartText(p.name)===n)||null;}
function findSimilarPartNames(name,excludeId,limit){
  const n=normalizePartText(name);if(!n)return [];
  return arr(K.p)
    .filter(p=>String(p.id)!==String(excludeId||"")&&!p.archived&&p.name)
    .filter(p=>{const pn=normalizePartText(p.name);return pn!==n&&pn.startsWith(n);})
    .map(p=>p.name)
    .slice(0,limit||8);
}
function findDuplicatePartCode(code,excludeId){const n=String(code||"").trim().toLowerCase();if(!n)return null;return arr(K.p).find(p=>String(p.id)!==String(excludeId||"")&&!p.archived&&String(p.code||"").trim().toLowerCase()===n)||null;}
async function deletePartRecord(pid){return withPartMutationLock(pid,async()=>{const all=arr(K.p),p=all.find(x=>x.id===pid);if(!p)return;const usedInOrders=arr(K.r).filter(r=>(r.parts||[]).some(x=>x.partId===pid));const movements=arr(K.m).filter(m=>m.partId===pid);const sales=movements.filter(m=>m&&m.saleId&&/بيع مباشر/.test(m.type||"")&&!m.voided);if(usedInOrders.length||sales.length){if(!p.archived&&confirm(`⚠️ الصنف «${p.name||""}» ${usedInOrders.length?`مستخدم في ${usedInOrders.length} أمر شغل سابق`:""}${usedInOrders.length&&sales.length?" و":""}${sales.length?`ليه ${sales.length} بيعة مباشرة`:""}.\n\nحذفه هيبوّظ تاريخ الأوامر والتقارير، لذلك الأفضل أرشفته بدل حذفه.\n\nموافق = أرشفة الصنف وإخفاؤه من المخزن.`)){p.archived=true;p.archivedAt=new Date().toISOString();if(!await putAsync(K.p,all))return;renderParts?.();alert("تمت أرشفة الصنف وسيظل محفوظًا داخل تاريخ أوامر الشغل.");}else if(p.archived){alert("الصنف مؤرشف بالفعل وما زال مرتبطًا بتاريخ أوامر شغل.");}return;}if(!confirm(`حذف الصنف «${p.name||""}» نهائيًا؟\n\nالكمية الحالية: ${+p.qty||0}\nحركات المخزن المرتبطة: ${movements.length}`))return;const values={[K.p]:all.filter(x=>x.id!==pid)};if(movements.length)values[K.m]=arr(K.m).filter(m=>m.partId!==pid);if(!await commitStorageAsync(values))return;if(window.ImageStore?.delete&&p.photo)window.ImageStore.delete(p.photo);refreshAllScreens?.();renderParts?.();if(document.getElementById("partProfile"))location.href="inventory.html";})}
async function restorePartRecord(pid){return withPartMutationLock(pid,async()=>{const all=arr(K.p),p=all.find(x=>x.id===pid);if(!p)return;const dn=findDuplicatePartName(p.name,p.id),dc=findDuplicatePartCode(p.code,p.id);if(dn||dc){alert(`⚠️ مينفعش ترجّع «${p.name}» من الأرشيف دلوقتي: ${dn?`فيه صنف شغّال بنفس الاسم «${dn.name}»`:`الكود «${p.code}» مستخدم مع «${dc.name}»`}.\n\nغيّر اسم أو كود الصنف التاني الأول.`);return}p.archived=false;p.archivedAt="";if(!await putAsync(K.p,all))return;renderParts?.();location.href="inventory.html"})}

function initParts(){let f=document.getElementById("partForm");if(!f)return;let q=new URLSearchParams(location.search),editId=q.get("edit"),existing=editId?arr(K.p).find(x=>x.id===editId):null;fillListSearch("pCategory","partCat",existing?.category||"");pPhoto.onchange=e=>previewPart(e);if(existing){pName.value=existing.name||"";pCode.value=existing.code||"";pLocation.value=existing.location||"";pQty.value=existing.qty||0;pMin.value=existing.min||0;pBuy.value=existing.buy||0;pUse.value=existing.use||0;if(existing.photo){(async()=>{let src=window.ImageStore?await window.ImageStore.resolveSrc(existing.photo):existing.photo;if(src)renderLivePhotoPreview("partPhotoPreview",src)})()}f.classList.remove("hidden");f.querySelector(".primary").textContent="💾 حفظ التعديلات وفتح الملف"}f.onsubmit=async e=>{e.preventDefault();const dup=findDuplicatePartName(pName.value,existing?.id);if(dup){alert(`⚠️ الصنف «${dup.name}» موجود بالفعل بنفس الاسم.\n\nاستخدم الصنف الموجود أو غيّر الاسم.`);pName.focus();return;}const dupCode=findDuplicatePartCode(pCode.value,existing?.id);if(dupCode){alert(`⚠️ كود الصنف «${dupCode.code}» مستخدم بالفعل مع «${dupCode.name}».\n\nاستخدم كودًا مختلفًا.`);pCode.focus();return;}await savePart(e,existing);};const partDuplicateHint=document.getElementById("partDuplicateHint");const checkPartDuplicate=()=>{if(!partDuplicateHint)return;const dn=findDuplicatePartName(pName.value,existing?.id),dc=findDuplicatePartCode(pCode.value,existing?.id);if(dn){partDuplicateHint.innerHTML=`⚠️ يوجد صنف بنفس الاسم بالضبط: <b>${esc(dn.name)}</b> — لن يسمح النظام بإضافة نسخة ثانية منه.`;partDuplicateHint.className="hint negative";return;}if(dc){partDuplicateHint.innerHTML=`⚠️ الكود مستخدم بالفعل مع: <b>${esc(dc.name)}</b> — اختر كودًا مختلفًا.`;partDuplicateHint.className="hint negative";return;}const similar=findSimilarPartNames(pName.value,existing?.id);if(similar.length){partDuplicateHint.innerHTML=`ℹ️ توجد أصناف بأسماء قريبة من هذا الاسم: ${similar.map(x=>`<b>${esc(x)}</b>`).join("، ")}. تأكد أن الصنف الذي تكتبه ليس نفسه قبل الحفظ.`;partDuplicateHint.className="hint";return;}partDuplicateHint.textContent="";partDuplicateHint.className="hint";};pName.addEventListener("input",checkPartDuplicate);pCode.addEventListener("input",checkPartDuplicate);partSearch.oninput=renderParts;renderParts()}
function previewPart(e){let f=e.target.files[0];if(!f)return;imageToDataURL(f).then(x=>{renderLivePhotoPreview("partPhotoPreview",x);partPhotoPreview.dataset.image=x})}
async function collectPartFormData(existing){let photo=existing?.photo||"";if(pPhoto.files[0]){let dataURL=await imageToDataURL(pPhoto.files[0]);photo=window.ImageStore?await window.ImageStore.save(dataURL):dataURL}return{name:(pName.value||"").trim(),code:(pCode.value||"").trim(),category:pCategory.value,location:(pLocation.value||"").trim(),qty:Math.max(0,+pQty.value||0),min:Math.max(0,+pMin.value||0),buy:Math.max(0,+pBuy.value||0),use:Math.max(0,+pUse.value||0),photo}}
async function discardUncommittedImage(ref){if(ref&&window.ImageStore?.delete){try{await window.ImageStore.delete(ref)}catch(_){}}}
async function persistPartRecord(formData,existing){
  const qty=Number(formData?.qty),min=Number(formData?.min??0),buy=Number(formData?.buy??0),use=Number(formData?.use??0);
  if(!Number.isSafeInteger(qty)||qty<0)return{ok:false,error:"كمية المخزون يجب أن تكون عددًا صحيحًا (صفر أو أكبر)."};
  if(!Number.isSafeInteger(min)||min<0)return{ok:false,error:"الحد الأدنى للمخزون يجب أن يكون عددًا صحيحًا (صفر أو أكبر)."};
  if(!Number.isFinite(buy)||buy<0||!Number.isFinite(use)||use<0)return{ok:false,error:"أسعار الشراء والاستخدام يجب أن تكون أرقامًا صحيحة غير سالبة."};
  formData={...formData,qty,min,buy,use};
  return withPartMutationLock(existing?.id||`new:${normalizePartText(formData.name)}`,async()=>{
    let a=arr(K.p),cur=existing?a.find(x=>x.id===existing.id):null;
    // الكمية بتتقارن بآخر نسخة محفوظة (مش بنسخة الفورم اللي ممكن تكون قديمة لو الأمر استهلك قطع في الوقت ده).
    const oldQty=cur?(+cur.qty||0):0;
    let p=cur?{...cur,...formData}:{id:id(),createdAt:new Date().toISOString(),...formData};
    const delta=existing?(+p.qty||0)-oldQty:0;
    const values={[K.p]:existing?a.map(x=>x.id===p.id?p:x):a.concat(p)};
    // تعديل الكمية يدويًا: يسجل حركة جرد في نفس معاملة الصنف.
    if(delta!==0){const mv=arr(K.m);mv.push({id:id(),partId:p.id,type:delta>0?"تعديل جرد بالزيادة":"تعديل جرد بالنقص",note:`من ${oldQty} إلى ${+p.qty||0}`,qty:Math.abs(delta),at:new Date().toISOString()});values[K.m]=mv}
    if(!await commitStorageAsync(values))return{ok:false};
    return{ok:true,part:p};
  });
}
async function savePart(e,existing=null){
  e.preventDefault();if(!pCategory.value)return alert("اختر تصنيف القطعة.");
  const qty=Number(pQty.value),min=Number(pMin.value||0),buy=Number(pBuy.value||0),use=Number(pUse.value||0);
  if(String(pQty.value||"").trim()===""||!Number.isSafeInteger(qty)||qty<0)return alert("كمية المخزون يجب أن تكون عددًا صحيحًا (صفر أو أكبر).");
  if(!Number.isSafeInteger(min)||min<0)return alert("الحد الأدنى للمخزون يجب أن يكون عددًا صحيحًا (صفر أو أكبر).");
  if(!Number.isFinite(buy)||buy<0||!Number.isFinite(use)||use<0)return alert("أسعار الشراء والاستخدام يجب أن تكون أرقامًا غير سالبة.");
  const previousPhoto=existing?.photo||"";let formData=null,recordSaved=false;
  try{
    formData=await collectPartFormData(existing);
    const result=await persistPartRecord(formData,existing);
    if(!result.ok){if(result.error)alert(result.error);if(formData.photo&&formData.photo!==previousPhoto)await discardUncommittedImage(formData.photo);return}
    recordSaved=true;
    if(previousPhoto&&previousPhoto!==formData.photo)await discardUncommittedImage(previousPhoto);
    if(existing&&typeof wfLeaveTo==="function")await wfLeaveTo(`part.html?id=${result.part.id}`,true);else location.href=`part.html?id=${result.part.id}`;
  }catch(err){
    if(!recordSaved&&formData?.photo&&formData.photo!==previousPhoto)await discardUncommittedImage(formData.photo);
    alert("تعذر حفظ صورة القطعة. جرّب صورة أخرى أصغر.");
  }
}
// النسخة الأساسية — بيتم استبدالها في customers/devices/inventory/requests.html
// بنسخة أغنى (تصنيفات ولوحة ملخص) في workshop-mini-simple-ui.js، وهي الشغالة
// فعليًا هناك. صفحات تانية (زي part.html) بتستخدم النسخة دي كما هي.
function renderParts(){let el=document.getElementById("partList");if(!el)return;let q=(partSearch?.value||"");let a=arr(K.p).filter(p=>!p.archived&&partMatchesQuery(p,q));el.innerHTML=a.length?a.map(p=>{let pct=(+p.use||0)>0?(((+p.use||0)-(+p.buy||0))/(+p.use||0)*100):0;return `<div class="item ps-context-target" data-ps-title="قطعة ${esc(p.name)}"><div class="item-head"><a href="part.html?id=${p.id}"><b>📦 ${esc(p.name)}</b></a>${psActions("قطعة "+p.name)}<button type="button" class="danger-btn small-btn" data-wf-event="click" data-wf-code="deletePartRecord(&apos;${p.id}&apos;)">🗑️ حذف</button><span class="badge">${p.qty} قطعة</span></div><div><span class="badge cat-badge ${categoryColorClass(p.category)}">${esc(p.category)}</span> • 📍 ${esc(p.location)||"—"}</div><div>شراء ${p.buy} ج • استخدام ${p.use} ج • 📈 ربح ${pct.toFixed(1)}%</div></div>`}).join(""):'<div class="item">لا توجد قطع.</div>'}
function partConsumptionForecast(p,allMoves){
  // تنبؤ بسيط: بناخد حركات "الخروج" في آخر 30 يوم (أو كل الحركات المتاحة لو
  // الصنف أحدث من كده)، نحسب المعدل اليومي، ونقسم الكمية الحالية عليه.
  const outMoves=allMoves.filter(m=>/خروج/.test(m.type||""));
  if(!outMoves.length||(+p.qty||0)<=0)return null;
  const now=Date.now(),windowDays=30,windowStart=now-windowDays*86400000;
  const inWindow=outMoves.filter(m=>{let t=new Date(m.at).getTime();return !Number.isNaN(t)&&t>=windowStart;});
  const firstMoveTime=Math.min(...outMoves.map(m=>new Date(m.at).getTime()).filter(t=>!Number.isNaN(t)));
  const effectiveDays=Math.max(1,Math.min(windowDays,(now-firstMoveTime)/86400000));
  // الإرجاع (إلغاء أمر / تعديله) بيتخصم من الاستهلاك، وإلا التوقع كان بيبالغ في سرعة النفاذ.
  const returnedInWindow=allMoves.filter(m=>/إرجاع/.test(m.type||"")).filter(m=>{let t=new Date(m.at).getTime();return !Number.isNaN(t)&&t>=windowStart;}).reduce((a,m)=>a+(+m.qty||0),0);
  const totalOutInWindow=inWindow.reduce((a,m)=>a+(+m.qty||0),0)-returnedInWindow;
  if(totalOutInWindow<=0)return null;
  const dailyRate=totalOutInWindow/effectiveDays;
  if(dailyRate<=0)return null;
  const daysLeft=(+p.qty||0)/dailyRate;
  return {dailyRate,daysLeft};
}
async function partProfile(){let el=document.getElementById("partProfile");if(!el)return;let p=arr(K.p).find(x=>x.id===new URLSearchParams(location.search).get("id"));if(!p){el.innerHTML="<div class='item'>القطعة غير موجودة.</div>";return}let allMoves=arr(K.m).filter(x=>x.partId===p.id);let moves=allMoves.slice(-5).reverse();let profitVal=(+p.use||0)-(+p.buy||0),profitPct=(+p.use||0)>0?(profitVal/(+p.use||0)*100):0;let forecast=partConsumptionForecast(p,allMoves);let forecastHtml=forecast?`<div class="report-card ${forecast.daysLeft<=7?"report-card-warn":""}" style="margin-top:10px"><span>⏳ متوقع نفاذ الكمية خلال</span><b>${forecast.daysLeft<1?"أقل من يوم":Math.round(forecast.daysLeft)+" يوم"}</b><span>بمعدل ${forecast.dailyRate.toFixed(2)} قطعة/يوم آخر فترة</span></div>`:"";el.innerHTML=`<div class="profile ps-context-target" data-ps-title="قطعة ${esc(p.name)}"><div class="page-head"><h1 class="profile-title">${typeof categoryIcon==="function"?categoryIcon(p.category):"📦"} ${esc(p.name)}</h1><div class="compact-actions">${p.archived?"":`<button class="primary" data-wf-event="click" data-wf-code="openPartSale('${p.id}')">🛒 بيع</button>`}<button class="secondary" data-wf-event="click" data-wf-code="editPart('${p.id}')">✏️ تعديل</button>${p.archived?"":`<button class="secondary" data-wf-event="click" data-wf-code="addPartToSupplierOrder('${p.id}')">📝 للطلبية</button>`}${p.archived?`<button class="primary" data-wf-event="click" data-wf-code="restorePartRecord('${p.id}')">↩️ إلغاء الأرشفة</button>`:`<button class="danger-btn" data-wf-event="click" data-wf-code="deletePartRecord('${p.id}')">🗑️ حذف</button>`}${psActions("قطعة "+p.name)}</div></div>${!p.archived&&typeof partOrderBoxHtml==="function"?partOrderBoxHtml(p):""}<div class="profile-grid"><div class="kv"><b>الكود</b>${esc(p.code)||"—"}</div><div class="kv"><b>التصنيف</b><span class="badge cat-badge ${categoryColorClass(p.category)}">${esc(p.category)}</span></div><div class="kv"><b>المكان</b>📍 ${esc(p.location)||"—"}</div><div class="kv"><b>الكمية</b>${p.qty}</div><div class="kv"><b>الحد الأدنى</b>${p.min}</div><div class="kv"><b>سعر الشراء</b>${p.buy} ج</div><div class="kv"><b>سعر الاستخدام</b>${p.use} ج</div><div class="kv"><b>📈 مكسب القطعة</b>${profitVal.toFixed(2)} ج (${profitPct.toFixed(1)}%)</div></div>${forecastHtml}<div id="partProfilePhoto"></div>${typeof partLinkedInvoicesHtml==="function"?partLinkedInvoicesHtml(p.id):""}<h2>🔄 آخر حركات المخزن <a class="secondary small-btn" style="margin-inline-start:8px" href="part-moves.html?id=${p.id}">📋 عرض كل الحركات (${allMoves.length})</a></h2>${moves.length?moves.map(x=>{let req=x.requestId?(byIdCached(K.r).get(x.requestId)||null):null;const sg=/خروج|نقص/.test(x.type||"")?"−":/توريد|دخول|إرجاع|ارجاع|زيادة/.test(x.type||"")?"+":"";return `<div class="item">${esc(x.type)} • <b>${sg}${Math.abs(+x.qty||0)}</b> • ${new Date(x.at).toLocaleString("ar-EG")}${req?` • <a href="request.html?id=${req.id}">🛠️ ${esc(req.no||req.id)}</a>`:(x.note?` • ${esc(x.note)}`:"")}</div>`;}).join(""):"<div class='item'>لا توجد حركات.</div>"}${typeof partSalesHtml==="function"?partSalesHtml(p.id):""}</div>`;if(p.photo){let src=window.ImageStore?await window.ImageStore.resolveSrc(p.photo):p.photo;let ph=document.getElementById("partProfilePhoto");if(ph&&src)ph.innerHTML=`<img class="photo" src="${esc(src)}" loading="lazy" decoding="async">`}if(typeof resolveInvoiceThumbs==="function")resolveInvoiceThumbs(el);}

/* ---------------------------------------------------------------------
   🛒 بيع قطعة غيار مباشر (من غير أمر شغل) — زبون جه اشترى قطعة على الواقف.
   العملية الواحدة (بتتحفظ مع بعض أو مابتتحفظش خالص):
   - الكمية بتنقص من المخزن.
   - حركة مخزن «خروج بيع مباشر» فيها السعر والتكلفة (التقارير بتحسب منها الإيراد والمكسب).
   - وارد في المحفظة اللي استلمت فيها الفلوس، تصنيف «تحصيل عميل» (فبيدخل في المحصّل فعليًا).
   الإلغاء بيرجّع الكمية بحركة «إرجاع بيع مباشر» ويلغي الوارد، والبيعة الأصلية بتفضل في السجل متعلّمة «اتلغت».
   --------------------------------------------------------------------- */
const PART_SALE_TYPE="خروج بيع مباشر",PART_SALE_UNDO_TYPE="إرجاع بيع مباشر (إلغاء البيعة)";
function partSaleRound(n){return Math.round((+n||0)*100)/100}
function partSaleWallets(){return (settings().wallets||[]).map(x=>String(x||"").trim()).filter(Boolean)}
function partSaleDefaultWallet(){return typeof resolveDefaultWallet==="function"?resolveDefaultWallet(null):(partSaleWallets()[0]||"")}
/* بيبني القيم الجديدة من غير ما يحفظ: {ok, values, sale} أو {ok:false, error} */
function buildPartSale(input){
  input=input||{};
  const all=arr(K.p),p=all.find(x=>String(x.id)===String(input.partId));
  if(!p)return{ok:false,error:"القطعة مش موجودة (ممكن اتحذفت)."};
  if(p.archived)return{ok:false,error:"القطعة دي متأرشفة. رجّعها من الأرشيف الأول."};
  const qty=+input.qty;
  if(!Number.isSafeInteger(qty)||qty<1)return{ok:false,error:"اكتب الكمية كعدد صحيح أكبر من صفر."};
  const have=Number(p.qty??0);
  if(!Number.isFinite(have)||have<qty)return{ok:false,error:`الكمية اللي في المخزن (${Number.isFinite(have)?have:0}) أقل من اللي عايز تبيعه (${qty}). لو المخزن غلط صحّحه من «تعديل» الأول.`};
  const price=partSaleRound(input.price);
  if(!Number.isFinite(+input.price)||price<0)return{ok:false,error:"اكتب سعر بيع صحيح."};
  const total=partSaleRound(price*qty),wallet=String(input.wallet||"").trim();
  if(total>0&&!wallet&&partSaleWallets().length)return{ok:false,error:"اختار المحفظة اللي استلمت فيها الفلوس."};
  const saleId="sale-"+id(),now=new Date(),at=now.toISOString(),buyer=String(input.buyer||"").trim(),note=String(input.note||"").trim();
  const cost=+p.buy||0;
  const move={id:id(),partId:p.id,type:PART_SALE_TYPE,qty,price,cost,total,saleId,wallet,buyer,note,at};
  const newStock=all.map(x=>x.id===p.id?{...x,qty:have-qty}:x);
  const moves=arr(K.m).concat(move);
  const values={[K.p]:newStock,[K.m]:moves};
  if(total>0&&wallet){
    values[K.wtx]=arr(K.wtx).concat({id:id(),refKey:null,saleId,partId:p.id,manualOverride:true,deleted:false,type:"in",amount:total,wallet,
      category:"تحصيل عميل",reason:`🛒 بيع ${qty} × ${p.name}${buyer?" — "+buyer:""}`,note,
      date:localDateKey(now),time:now.toTimeString().slice(0,5),source:"part-sale",createdAt:at});
  }
  return{ok:true,values,sale:{...move,name:p.name,left:have-qty}};
}
let _partSaleBusy=false;
async function savePartSale(input){
  if(_partSaleBusy)return{ok:false,error:"busy"};
  _partSaleBusy=true;
  try{
    const b=buildPartSale(input);if(!b.ok)return b;
    if(!await commitStorageAsync(b.values))return{ok:false,error:"تعذّر الحفظ. ماتغيّرش حاجة."};
    if(typeof wfBumpDataRev==="function")try{wfBumpDataRev()}catch(_){}
    return{ok:true,sale:b.sale};
  }finally{_partSaleBusy=false}
}
function buildPartSaleUndo(saleId){
  const moves=arr(K.m),m=moves.find(x=>x&&x.saleId===saleId&&x.type===PART_SALE_TYPE);
  if(!m)return{ok:false,error:"البيعة مش موجودة."};
  if(m.voided)return{ok:false,error:"البيعة دي اتلغت قبل كده."};
  const at=new Date().toISOString(),all=arr(K.p),p=all.find(x=>x.id===m.partId);
  const newMoves=moves.map(x=>x===m?{...x,voided:true,voidedAt:at}:x);
  const values={[K.m]:newMoves};
  if(p){values[K.p]=all.map(x=>x.id===p.id?{...x,qty:(Number(x.qty)||0)+(+m.qty||0)}:x);newMoves.push({id:id(),partId:m.partId,type:PART_SALE_UNDO_TYPE,qty:+m.qty||0,saleId,at})}
  const tx=arr(K.wtx);
  if(tx.some(x=>x&&x.saleId===saleId&&!x.deleted))values[K.wtx]=tx.map(x=>x&&x.saleId===saleId&&!x.deleted?{...x,deleted:true,deletedAt:at,saleVoided:true}:x);
  return{ok:true,values,move:m,partFound:!!p};
}
async function undoPartSale(saleId,opts){
  const b=buildPartSaleUndo(saleId);
  if(!b.ok){if(!opts||!opts.silent)alert(b.error);return false}
  const p=arr(K.p).find(x=>x.id===b.move.partId);
  if(!(opts&&opts.yes)&&!confirm(`إلغاء بيعة ${b.move.qty} × «${p?p.name:"قطعة"}» بـ ${partSaleRound(b.move.total).toFixed(2)} ج؟\n\n• الكمية هترجع للمخزن\n• الوارد هيتشال من محفظة «${b.move.wallet||"—"}»`))return false;
  if(!await commitStorageAsync(b.values)){alert("تعذّر الحفظ. ماتغيّرش حاجة.");return false}
  if(typeof wfBumpDataRev==="function")try{wfBumpDataRev()}catch(_){}
  try{refreshAllScreens?.()}catch(_){}
  try{if(document.getElementById("partProfile"))partProfile()}catch(_){}
  try{renderParts?.()}catch(_){}
  return true;
}
/* بيعات اليوم/الفترة: للتقارير وللعرض */
function directPartSales(){return arr(K.m).filter(x=>x&&x.saleId&&x.type===PART_SALE_TYPE)}

function _partSaleCss(){
  if(document.getElementById("wfPartSaleCss"))return;
  const s=document.createElement("style");s.id="wfPartSaleCss";
  s.textContent=".wf-sale{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}"+
    "@media(min-width:640px){.wf-sale{align-items:center;padding:12px}}"+
    ".wf-sale-card{background:var(--bg-elevated,#fff);color:var(--text,#111);border-radius:18px 18px 0 0;padding:16px;width:100%;max-width:460px;max-height:92vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.4)}"+
    "@media(min-width:640px){.wf-sale-card{border-radius:18px}}"+
    ".wf-sale-card h3{margin:0 0 4px}.wf-sale-card label{display:block;font-size:13px;font-weight:700;margin:10px 0 4px}"+
    ".wf-sale-card input,.wf-sale-card select{width:100%;box-sizing:border-box}"+
    ".wf-sale-row{display:flex;gap:8px}.wf-sale-row>div{flex:1;min-width:0}"+
    ".wf-sale-res{max-height:220px;overflow:auto;border:1px solid var(--border,#ddd);border-radius:10px;margin-top:4px}"+
    ".wf-sale-res button{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:start;background:none;border:0;border-bottom:1px solid var(--border,#eee);padding:10px;color:inherit;cursor:pointer;font:inherit}"+
    ".wf-sale-res button small{color:var(--text-muted,#666)}.wf-sale-res button:disabled{opacity:.45}"+
    ".wf-sale-pick{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px;border-radius:10px;background:var(--surface-2,rgba(127,127,127,.12))}"+
    ".wf-sale-total{font-size:20px;font-weight:800;text-align:center;margin:12px 0 4px}"+
    ".wf-sale-hint{font-size:12px;color:var(--text-muted,#666);text-align:center}.wf-sale-hint.warn{color:#c0392b}"+
    ".wf-sale-acts{display:flex;gap:8px;margin-top:12px}.wf-sale-acts button{flex:1;min-height:46px}";
  document.head.appendChild(s);
}
/* شاشة البيع. partId اختياري: من ملف القطعة بتفتح عليها، ومن المخزن بتدوّر. */
function openPartSale(partId){
  _partSaleCss();
  document.querySelector(".wf-sale")?.remove();
  const wallets=partSaleWallets(),defW=partSaleDefaultWallet();
  const ov=document.createElement("div");ov.className="wf-sale";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
  ov.innerHTML=`<div class="wf-sale-card">
    <h3>🛒 بيع قطعة غيار</h3><div class="hint">بيع مباشر لزبون من غير أمر شغل — الكمية بتنقص من المخزن والفلوس بتدخل المحفظة.</div>
    <div data-s="pickWrap"><label>القطعة</label><input data-s="q" type="search" placeholder="🔍 اكتب اسم القطعة أو الكود" autocomplete="off"><div class="wf-sale-res" data-s="res"></div></div>
    <div data-s="picked" class="hidden"><label>القطعة</label><div class="wf-sale-pick"><span data-s="pname"></span><button type="button" class="secondary small-btn" data-s="change">تغيير</button></div></div>
    <div class="wf-sale-row"><div><label>الكمية</label><input data-s="qty" type="number" inputmode="numeric" min="1" step="1" value="1"></div><div><label>سعر القطعة (ج)</label><input data-s="price" type="number" inputmode="decimal" min="0" step="0.01"></div></div>
    <label>استلمت الفلوس في</label>${wallets.length?`<select data-s="wallet">${wallets.map(w=>`<option${w===defW?" selected":""}>${esc(w)}</option>`).join("")}</select>`:`<div class="hint">مفيش محافظ متسجلة — البيعة هتتسجل في المخزن والتقارير بس. (ضيف محفظة من ⚙️ الإعدادات)</div>`}
    <label>اسم الزبون أو رقمه (اختياري)</label><input data-s="buyer" type="text" maxlength="80">
    <label>ملاحظة (اختياري)</label><input data-s="note" type="text" maxlength="200">
    <div class="wf-sale-total" data-s="total">—</div><div class="wf-sale-hint" data-s="hint"></div>
    <div class="wf-sale-acts"><button type="button" class="primary" data-s="save">✅ تسجيل البيع</button><button type="button" class="secondary" data-s="cancel">إلغاء</button></div>
  </div>`;
  document.body.appendChild(ov);
  const $=k=>ov.querySelector(`[data-s="${k}"]`);
  let chosen=null;
  const close=()=>{ov.remove();document.removeEventListener("keydown",onKey)};
  const onKey=e=>{if(e.key==="Escape")close()};document.addEventListener("keydown",onKey);
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  const calc=()=>{
    const qty=+$("qty").value,price=+$("price").value,h=$("hint");h.className="wf-sale-hint";
    if(!chosen){$("total").textContent="—";h.textContent="اختار القطعة الأول.";return}
    const tot=partSaleRound((qty||0)*(price||0));$("total").textContent=`الإجمالي: ${tot.toFixed(2)} ج`;
    const have=+chosen.qty||0,cost=+chosen.buy||0;
    if(qty>have){h.className="wf-sale-hint warn";h.textContent=`⚠️ المتاح في المخزن ${have} بس.`;return}
    const prof=partSaleRound(tot-cost*(qty||0));
    h.textContent=`فاضل في المخزن بعد البيع: ${have-(qty||0)}${cost?` • مكسبك ${prof.toFixed(2)} ج`:""}`;
    if(cost&&price<cost){h.className="wf-sale-hint warn";h.textContent+=" — ⚠️ السعر أقل من سعر الشراء"}
  };
  const pick=p=>{chosen=p;$("pickWrap").classList.add("hidden");$("picked").classList.remove("hidden");$("pname").textContent=`📦 ${p.name} — متاح ${+p.qty||0}`;$("price").value=+p.use||"";$("qty").value=1;$("qty").max=String(+p.qty||0);calc();$("qty").focus()};
  const search=()=>{
    const q=String($("q").value||"").trim();
    const list=arr(K.p).filter(p=>!p.archived&&partMatchesQuery(p,q))
      .sort((a,b)=>((+b.qty>0)-(+a.qty>0))||String(a.name).localeCompare(String(b.name),"ar")).slice(0,40);
    $("res").innerHTML=list.length?list.map(p=>`<button type="button" data-pid="${esc(p.id)}"${(+p.qty||0)<1?" disabled":""}><span>📦 ${esc(p.name)}${p.code?` <small>${esc(p.code)}</small>`:""}</span><small>${(+p.qty||0)<1?"خلصانة":`متاح ${+p.qty} • ${+p.use||0} ج`}</small></button>`).join(""):'<div class="hint" style="padding:10px">مفيش قطعة بالاسم ده.</div>';
  };
  $("res").addEventListener("click",e=>{const b=e.target.closest("[data-pid]");if(!b||b.disabled)return;const p=arr(K.p).find(x=>String(x.id)===b.dataset.pid);if(p)pick(p)});
  $("q").addEventListener("input",search);
  $("change").addEventListener("click",()=>{chosen=null;$("picked").classList.add("hidden");$("pickWrap").classList.remove("hidden");search();calc();$("q").focus()});
  $("qty").addEventListener("input",calc);$("price").addEventListener("input",calc);
  $("cancel").addEventListener("click",close);
  $("save").addEventListener("click",async()=>{
    if(!chosen)return alert("اختار القطعة الأول.");
    const btn=$("save");btn.disabled=true;
    try{
      const r=await savePartSale({partId:chosen.id,qty:+$("qty").value,price:$("price").value===""?NaN:+$("price").value,wallet:$("wallet")?$("wallet").value:"",buyer:$("buyer").value,note:$("note").value});
      if(!r||!r.ok){if(r&&r.error&&r.error!=="busy")alert(r.error);return}
      close();
      try{refreshAllScreens?.()}catch(_){}
      try{if(document.getElementById("partProfile"))partProfile()}catch(_){}
      try{renderParts?.()}catch(_){}
      const s=r.sale;
      if(confirm(`✅ اتسجّل بيع ${s.qty} × «${s.name}» بـ ${partSaleRound(s.total).toFixed(2)} ج${s.wallet?` في «${s.wallet}»`:""}.\nفاضل في المخزن: ${s.left}.\n\nتبيع قطعة تانية؟`))openPartSale();
    }finally{btn.disabled=false}
  });
  const pre=partId?arr(K.p).find(x=>String(x.id)===String(partId)):null;
  if(pre&&(+pre.qty||0)>0&&!pre.archived)pick(pre);else{search();if(pre)alert(`«${pre.name}» خلصانة من المخزن — اختار قطعة تانية أو سجّل توريد الأول.`);setTimeout(()=>$("q")?.focus(),50)}
}
/* آخر البيعات المباشرة لقطعة — بتتعرض في ملف القطعة مع زرار إلغاء */
function partSalesHtml(partId){
  const list=directPartSales().filter(x=>!partId||x.partId===partId).slice(-5).reverse();
  if(!list.length)return"";
  return `<h2>🛒 آخر البيعات المباشرة</h2>`+list.map(x=>`<div class="item${x.voided?" muted":""}">${x.voided?"<s>":""}🛒 ${x.qty} × ${partSaleRound(x.price).toFixed(2)} = <b>${partSaleRound(x.total).toFixed(2)} ج</b>${x.wallet?` • 💳 ${esc(x.wallet)}`:""}${x.buyer?` • 👤 ${esc(x.buyer)}`:""} • ${new Date(x.at).toLocaleString("ar-EG")}${x.voided?"</s> • ↩️ اتلغت":` <button type="button" class="secondary small-btn" data-wf-event="click" data-wf-code="undoPartSale('${esc(x.saleId)}')">↩️ إلغاء البيعة</button>`}</div>`).join("");
}
