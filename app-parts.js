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
async function deletePartRecord(pid){return withPartMutationLock(pid,async()=>{const all=arr(K.p),p=all.find(x=>x.id===pid);if(!p)return;const usedInOrders=arr(K.r).filter(r=>(r.parts||[]).some(x=>x.partId===pid));const movements=arr(K.m).filter(m=>m.partId===pid);if(usedInOrders.length){if(!p.archived&&confirm(`⚠️ الصنف «${p.name||""}» مستخدم في ${usedInOrders.length} أمر شغل سابق.\n\nحذفه سيكسر تاريخ أوامر الشغل، لذلك الأفضل أرشفته بدل حذفه.\n\nموافق = أرشفة الصنف وإخفاؤه من المخزن.`)){p.archived=true;p.archivedAt=new Date().toISOString();if(!await putAsync(K.p,all))return;renderParts?.();alert("تمت أرشفة الصنف وسيظل محفوظًا داخل تاريخ أوامر الشغل.");}else if(p.archived){alert("الصنف مؤرشف بالفعل وما زال مرتبطًا بتاريخ أوامر شغل.");}return;}if(!confirm(`حذف الصنف «${p.name||""}» نهائيًا؟\n\nالكمية الحالية: ${+p.qty||0}\nحركات المخزن المرتبطة: ${movements.length}`))return;const values={[K.p]:all.filter(x=>x.id!==pid)};if(movements.length)values[K.m]=arr(K.m).filter(m=>m.partId!==pid);if(!await commitStorageAsync(values))return;if(window.ImageStore?.delete&&p.photo)window.ImageStore.delete(p.photo);refreshAllScreens?.();renderParts?.();if(document.getElementById("partProfile"))location.href="inventory.html";})}
async function restorePartRecord(pid){return withPartMutationLock(pid,async()=>{const all=arr(K.p),p=all.find(x=>x.id===pid);if(!p)return;p.archived=false;p.archivedAt="";if(!await putAsync(K.p,all))return;renderParts?.();location.href="inventory.html"})}

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
    location.href=`part.html?id=${result.part.id}`;
  }catch(err){
    if(!recordSaved&&formData?.photo&&formData.photo!==previousPhoto)await discardUncommittedImage(formData.photo);
    alert("تعذر حفظ صورة القطعة. جرّب صورة أخرى أصغر.");
  }
}
// النسخة الأساسية — بيتم استبدالها في customers/devices/inventory/requests.html
// بنسخة أغنى (تصنيفات ولوحة ملخص) في workshop-mini-simple-ui.js، وهي الشغالة
// فعليًا هناك. صفحات تانية (زي part.html) بتستخدم النسخة دي كما هي.
function renderParts(){let el=document.getElementById("partList");if(!el)return;let q=(partSearch?.value||"").toLowerCase();let a=arr(K.p).filter(p=>!p.archived&&(p.name+" "+p.code+" "+p.location).toLowerCase().includes(q));el.innerHTML=a.length?a.map(p=>{let pct=(+p.use||0)>0?(((+p.use||0)-(+p.buy||0))/(+p.use||0)*100):0;return `<div class="item ps-context-target" data-ps-title="قطعة ${esc(p.name)}"><div class="item-head"><a href="part.html?id=${p.id}"><b>📦 ${esc(p.name)}</b></a>${psActions("قطعة "+p.name)}<button type="button" class="danger-btn small-btn" data-wf-event="click" data-wf-code="deletePartRecord(&apos;${p.id}&apos;)">🗑️ حذف</button><span class="badge">${p.qty} قطعة</span></div><div><span class="badge cat-badge ${categoryColorClass(p.category)}">${esc(p.category)}</span> • 📍 ${esc(p.location)||"—"}</div><div>شراء ${p.buy} ج • استخدام ${p.use} ج • 📈 ربح ${pct.toFixed(1)}%</div></div>`}).join(""):'<div class="item">لا توجد قطع.</div>'}
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
async function partProfile(){let el=document.getElementById("partProfile");if(!el)return;let p=arr(K.p).find(x=>x.id===new URLSearchParams(location.search).get("id"));if(!p){el.innerHTML="<div class='item'>القطعة غير موجودة.</div>";return}let allMoves=arr(K.m).filter(x=>x.partId===p.id);let moves=allMoves.slice(-5).reverse();let profitVal=(+p.use||0)-(+p.buy||0),profitPct=(+p.use||0)>0?(profitVal/(+p.use||0)*100):0;let forecast=partConsumptionForecast(p,allMoves);let forecastHtml=forecast?`<div class="report-card ${forecast.daysLeft<=7?"report-card-warn":""}" style="margin-top:10px"><span>⏳ متوقع نفاذ الكمية خلال</span><b>${forecast.daysLeft<1?"أقل من يوم":Math.round(forecast.daysLeft)+" يوم"}</b><span>بمعدل ${forecast.dailyRate.toFixed(2)} قطعة/يوم آخر فترة</span></div>`:"";el.innerHTML=`<div class="profile ps-context-target" data-ps-title="قطعة ${esc(p.name)}"><div class="page-head"><h1 class="profile-title">${typeof categoryIcon==="function"?categoryIcon(p.category):"📦"} ${esc(p.name)}</h1><div class="compact-actions"><button class="secondary" data-wf-event="click" data-wf-code="editPart('${p.id}')">✏️ تعديل</button>${p.archived?`<button class="primary" data-wf-event="click" data-wf-code="restorePartRecord('${p.id}')">↩️ إلغاء الأرشفة</button>`:`<button class="danger-btn" data-wf-event="click" data-wf-code="deletePartRecord('${p.id}')">🗑️ حذف</button>`}${psActions("قطعة "+p.name)}</div></div><div class="profile-grid"><div class="kv"><b>الكود</b>${esc(p.code)||"—"}</div><div class="kv"><b>التصنيف</b><span class="badge cat-badge ${categoryColorClass(p.category)}">${esc(p.category)}</span></div><div class="kv"><b>المكان</b>📍 ${esc(p.location)||"—"}</div><div class="kv"><b>الكمية</b>${p.qty}</div><div class="kv"><b>الحد الأدنى</b>${p.min}</div><div class="kv"><b>سعر الشراء</b>${p.buy} ج</div><div class="kv"><b>سعر الاستخدام</b>${p.use} ج</div><div class="kv"><b>📈 مكسب القطعة</b>${profitVal.toFixed(2)} ج (${profitPct.toFixed(1)}%)</div></div>${forecastHtml}<div id="partProfilePhoto"></div>${typeof partLinkedInvoicesHtml==="function"?partLinkedInvoicesHtml(p.id):""}<h2>🔄 آخر حركات المخزن <a class="secondary small-btn" style="margin-inline-start:8px" href="part-moves.html?id=${p.id}">📋 عرض كل الحركات (${allMoves.length})</a></h2>${moves.length?moves.map(x=>{let req=x.requestId?(byIdCached(K.r).get(x.requestId)||null):null;return `<div class="item">${esc(x.type)} • ${x.qty} • ${new Date(x.at).toLocaleString("ar-EG")}${req?` • <a href="request.html?id=${req.id}">🛠️ ${esc(req.no||req.id)}</a>`:(x.note?` • ${esc(x.note)}`:"")}</div>`;}).join(""):"<div class='item'>لا توجد حركات.</div>"}</div>`;if(p.photo){let src=window.ImageStore?await window.ImageStore.resolveSrc(p.photo):p.photo;let ph=document.getElementById("partProfilePhoto");if(ph&&src)ph.innerHTML=`<img class="photo" src="${esc(src)}" loading="lazy" decoding="async">`}if(typeof resolveInvoiceThumbs==="function")resolveInvoiceThumbs(el);}
