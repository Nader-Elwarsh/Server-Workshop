/* =========================================================
   الورشة الفنية — أكواد أعطال الأجهزة (app-fault-codes.js)
   =========================================================
   قسم مرجعي مستقل تمامًا عن الأقسام الأساسية (مش مربوط بعميل أو جهاز
   أو أمر شغل معين): كود العطل (زي E1) + نوع الجهاز + الماركة (اختياري،
   فاضي = "كل الماركات") + وصف قصير + السبب المحتمل + خطوات الفحص/الحل.

   المشاركة مع فنيين تانيين: كل فني بيثبّت نفس التطبيق على جهازه وعنده
   نسخته الخاصة من WFStorage، فمفيش مزامنة تلقائية بين الأجهزة. الحل
   العملي: تصدير الأكواد بس (exportFaultCodesOnly) كملف JSON صغير منفصل
   عن النسخة الاحتياطية الكاملة (اللي فيها بيانات عملاء حساسة)، والفني
   التاني يستورده (importFaultCodesFile) وبيتضاف/يتدمج مع نسخته هو من
   غير ما يمسح اللي عنده، ومن غير تكرار لنفس الكود بالظبط.
   ========================================================= */

/* ---------------------------------------------------------------------
   تطبيع النص وكشف التكرار (نفس مبدأ normalizePartText بالظبط)
--------------------------------------------------------------------- */
function normalizeFaultText(v){
  return String(v||"").toLowerCase().normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/[ـ]/g,"")
    .replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660))
    .replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0))
    .replace(/[\s\-_./\\]+/g,"").trim();
}
/* الماركة بالاسم الموحّد (Tornado = تورنيدو) قبل المقارنة */
function faultBrandKey(b){try{if(typeof wfBrandKey==="function"&&typeof wfCanonicalBrand==="function")return wfBrandKey(wfCanonicalBrand(b))}catch(_){}return normalizeFaultText(b)}
/* الموديلات متوافقة: واحد فيهم فاضي، أو فيه موديل مشترك (ES-TN / TWE-TLN ↔ TWE-TLN) */
function faultModelTokens(m){return String(m||"").split(/[,،/|+\n]|\s-\s|\s+و\s+/).map(normalizeFaultText).filter(x=>x.length>=2)}
function faultModelsMatch(a,b){const x=faultModelTokens(a),y=faultModelTokens(b);if(!x.length||!y.length)return true;return x.some(t=>y.indexOf(t)>-1)}
/* التصنيف (أمامي/فوق): نفس الكود في غسالة أمامي وفوق أوتوماتيك عطلين مختلفين (E01 أمامي ≠ E1 علوي) */
function faultCategoryMatch(a,b){const x=normalizeFaultText(a),y=normalizeFaultText(b);return !x||!y||x===y}
/* model / category (اختياريين): نفس الكود لنفس الماركة بس لسلسلة/موديلات أو تصنيف مختلف = مش مكرر.
   الكود نفسه بيتقارن زي ما هو مكتوب (E1 ≠ E01): في الكتالوجات الاتنين بيبقوا لأجهزة مختلفة. */
function findDuplicateFaultCode(deviceType,brand,code,excludeId,model,category){
  let nc=normalizeFaultText(code);if(!nc)return null;
  let nt=normalizeFaultText(deviceType),nb=faultBrandKey(brand);
  return arr(K.fc).find(f=>String(f.id)!==String(excludeId||"")
    &&f.kind!=="test"
    &&faultModelsMatch(model,f.model)
    &&faultCategoryMatch(category,f.category)
    &&normalizeFaultText(f.code)===nc
    &&normalizeFaultText(f.deviceType)===nt
    &&faultBrandKey(f.brand)===nb)||null;
}
/* 🧪 بصمة طريقة الدخول: أسماء الزراير بالإنجليزي (Rinse + ON ← Start). نفس الزراير لنفس الماركة والموديلات = نفس التيست مود
   حتى لو العنوان مكتوب بشكل تاني (الذكاء الاصطناعي بيسمّي نفس التيست بعناوين مختلفة كل استيراد). */
function testModeSig(enter){
  const words=(String(enter||"").match(/[A-Za-z][A-Za-z0-9]*/g)||[]).map(w=>w.toLowerCase()).filter(w=>w.length>1||w==="i");
  if(words.length>=2)return "w:"+Array.from(new Set(words)).sort().join(",");
  const t=normalizeFaultText(String(enter||"").replace(/(^|\s)\d{1,2}\s*[).\-]/g," ").replace(/[()+،,:؛;]/g,""));
  return t?"t:"+t:"";
}
function sameTestMode(a,b){
  if(!a||!b||normalizeFaultText(a.deviceType)!==normalizeFaultText(b.deviceType)||faultBrandKey(a.brand)!==faultBrandKey(b.brand))return false;
  if(normalizeFaultText(a.title)&&normalizeFaultText(a.title)===normalizeFaultText(b.title))return true;
  const sa=testModeSig(a.enter);return !!sa&&sa===testModeSig(b.enter)&&faultModelsMatch(a.model,b.model)&&faultCategoryMatch(a.category,b.category);
}
function findDuplicateTestMode(rec,excludeId){return arr(K.fc).find(f=>f&&f.kind==="test"&&String(f.id)!==String(excludeId||"")&&sameTestMode(rec,f))||null}
window.faultBrandKey=faultBrandKey;window.faultModelsMatch=faultModelsMatch;window.testModeSig=testModeSig;window.sameTestMode=sameTestMode;window.findDuplicateTestMode=findDuplicateTestMode;

/* ---------------------------------------------------------------------
   القوائم المستخدمة (نفس أنواع/ماركات الأجهزة في باقي النظام، من ⚙️
   الإعدادات ← أنواع الأجهزة والتصنيفات / الماركات — مفيش قايمة منفصلة).
--------------------------------------------------------------------- */
function fillFaultDeviceTypes(el,selected=""){
  if(!el)return;
  el.innerHTML='<option value="">كل الأنواع (عام)</option>'+Object.keys(settings().types||{}).map(t=>`<option ${t===selected?"selected":""}>${esc(t)}</option>`).join("");
}
function fillFaultBrands(el,selected=""){
  if(!el)return;
  el.innerHTML='<option value="">كل الماركات (عام)</option>'+(settings().brands||[]).map(b=>`<option ${b===selected?"selected":""}>${esc(b)}</option>`).join("");
}

/* ---------------------------------------------------------------------
   الحفظ والحذف
--------------------------------------------------------------------- */
function collectFaultFormData(){
  return {
    deviceType:(fcDeviceType?.value||"").trim(),
    brand:(fcBrand?.value||"").trim(),
    code:(fcCode?.value||"").trim(),
    title:(fcTitle?.value||"").trim(),
    cause:(fcCause?.value||"").trim(),
    fix:(fcFix?.value||"").trim(),
    note:(fcNote?.value||"").trim(),
    addedBy:(fcAddedBy?.value||"").trim()
  };
}
function saveFaultCodesRecords(records){
  if(!saveJSONSafe(K.fc,records))return false;
  // لا ننتظر IndexedDB حتى لا نؤخر الواجهة أو نكسر fallback المحلي.
  try{window.FaultCodesIDB?.replace(records)}catch(_){/* WFStorage هو fallback */}
  return true;
}
function persistFaultRecord(formData,existing){
  let f=existing||{id:id(),source:"manual",createdAt:new Date().toISOString()};
  if(formData&&formData.brand&&typeof wfCanonicalBrand==="function")formData.brand=wfCanonicalBrand(formData.brand);
  Object.assign(f,formData);f.updatedAt=new Date().toISOString();
  let a=arr(K.fc);
  if(!saveFaultCodesRecords(existing?a.map(x=>x.id===f.id?f:x):a.concat(f)))return{ok:false};
  return{ok:true,fault:f};
}
function saveFaultCode(e,existing=null){
  e.preventDefault();
  let formData=collectFaultFormData();
  if(!formData.code)return alert("اكتب كود العطل.");
  if(!formData.title)return alert("اكتب وصف قصير للعطل.");
  let dup=findDuplicateFaultCode(formData.deviceType,formData.brand,formData.code,existing?.id,existing?.model,existing?.category);
  if(dup)return alert(`⚠️ الكود «${dup.code}» مسجّل بالفعل لنفس النوع/الماركة (${dup.title||""}).\n\nعدّل الكود الموجود بدل ما تضيف نسخة تانية.`);
  let result=persistFaultRecord(formData,existing);
  if(!result.ok)return;
  if(existing&&typeof wfLeaveTo==="function")wfLeaveTo(`faultcode.html?id=${result.fault.id}`,true);else location.href=`faultcode.html?id=${result.fault.id}`;
}
/* زي saveFaultCode بالظبط بس من غير الانتقال لصفحة الكود — بتسيب النوع
   والماركة واسم الفني زي ما هم وتفضح بس حقول الكود/الوصف/السبب/الحل،
   عشان تدخل دفعة أكواد لنفس الماركة ورا بعض بسرعة من غير ما ترجع تفتح
   الفورم من الأول في كل مرة. متاحة بس وقت الإضافة الجديدة (مش أثناء تعديل
   كود موجود بالفعل).*/
function saveFaultCodeAndAddAnother(){
  let formData=collectFaultFormData();
  if(!formData.code)return alert("اكتب كود العطل.");
  if(!formData.title)return alert("اكتب وصف قصير للعطل.");
  let dup=findDuplicateFaultCode(formData.deviceType,formData.brand,formData.code,null);
  if(dup)return alert(`⚠️ الكود «${dup.code}» مسجّل بالفعل لنفس النوع/الماركة (${dup.title||""}).\n\nعدّل الكود الموجود بدل ما تضيف نسخة تانية.`);
  let result=persistFaultRecord(formData,null);
  if(!result.ok)return;
  fcCode.value="";fcTitle.value="";fcCause.value="";fcFix.value="";fcNote.value="";
  let hint=document.getElementById("faultDuplicateHint");
  if(hint){hint.textContent=`✅ اتحفظ الكود «${result.fault.code}» — اكتب اللي بعده.`;hint.className="hint success";}
  fcCode.focus();
  renderFaultCodes?.();
}
function deleteFaultCodeRecord(fid){
  let a=arr(K.fc),f=a.find(x=>x.id===fid);if(!f)return;
  if(!confirm(`حذف كود العطل «${f.code}» نهائيًا؟`))return;
  if(!saveFaultCodesRecords(a.filter(x=>x.id!==fid)))return;
  renderFaultCodes?.();
  if(document.getElementById("faultCodeProfile")){if(typeof wfLeaveTo==="function")wfLeaveTo("faultcodes.html",false);else location.href="faultcodes.html"}
}
function deleteAllFaultCodes(){
  let all=arr(K.fc),a=all.filter(f=>f.kind!=="test"),tests=all.filter(f=>f.kind==="test");
  if(!a.length)return alert("لا توجد أكواد أعطال مسجّلة أصلًا.");
  if(!confirm(`حذف جميع أكواد الأعطال (${a.length}) نهائيًا؟ (كل الأنواع والماركات — التيست مود مش هيتمسح)`))return;
  if(!confirm("تأكيد نهائي: لا يمكن التراجع عن الحذف."))return;
  if(!saveFaultCodesRecords(tests))return;
  renderFaultCodes?.();
  alert("تم حذف جميع أكواد الأعطال.");
}
/* حذف كل الأكواد المطابقة لفلتر النوع/الماركة الحالي فوق القائمة — مفيد
   لو عايز تمسح دفعة معينة استوردتها (زي كل أكواد ماركة أو نوع بعينه) من
   غير ما تلمس باقي الأكواد. لازم تختار نوع أو ماركة على الأقل (منعًا من
   حذف الكل بالغلط من الزرار ده؛ لحذف الكل فعلًا فيه الزرار المخصص لده). */
function deleteFilteredFaultCodes(){
  let typeFilter=document.getElementById("fcFilterType")?.value||"";
  let brandFilter=document.getElementById("fcFilterBrand")?.value||"";
  if(!typeFilter&&!brandFilter)return alert("اختار نوع الجهاز أو الماركة فوق (فلتر القائمة) الأول، عشان تحدد الدفعة اللي عايز تمسحها. لحذف كل الأكواد من غير فلتر، استخدم زرار «حذف كل الأكواد».");
  let a=arr(K.fc);
  let matches=a.filter(f=>f.kind!=="test"&&(!typeFilter||f.deviceType===typeFilter)&&(!brandFilter||f.brand===brandFilter));
  if(!matches.length)return alert("لا توجد أكواد مطابقة لهذا الفلتر.");
  let label=[typeFilter,brandFilter].filter(Boolean).join(" • ")||"الفلتر الحالي";
  if(!confirm(`حذف ${matches.length} كود مطابق لـ (${label}) نهائيًا؟`))return;
  if(!confirm("تأكيد نهائي: لا يمكن التراجع عن الحذف."))return;
  let ids=new Set(matches.map(x=>x.id));
  if(!saveFaultCodesRecords(a.filter(x=>!ids.has(x.id))))return;
  renderFaultCodes?.();
  alert(`تم حذف ${matches.length} كود.`);
}

/* ---------------------------------------------------------------------
   إضافة دفعة أكواد مرة واحدة (لصق نص): سطر لكل كود بالشكل
   "الكود | وصف قصير | السبب | الحل | ملاحظة" لنفس النوع/الماركة
   المختارين فوق. بيوري معاينة (وبيوضح أي سطر ناقص أو مكرر) قبل ما
   يتحفظ أي حاجة فعليًا في WFStorage — التأكيد خطوة منفصلة.
--------------------------------------------------------------------- */
function parseBulkFaultLines(text){
  return String(text||"").split("\n").map(l=>l.trim()).filter(Boolean).map(line=>{
    let parts=line.split("|").map(p=>p.trim());
    return {code:parts[0]||"",title:parts[1]||"",cause:parts[2]||"",fix:parts[3]||"",note:parts[4]||""};
  });
}
function previewBulkFaultCodes(){
  let box=document.getElementById("bulkFaultPreview");if(!box)return;
  let deviceType=document.getElementById("bfDeviceType")?.value||"";
  let brand=document.getElementById("bfBrand")?.value||"";
  let rows=parseBulkFaultLines(document.getElementById("bfLines")?.value);
  if(!rows.length){box.innerHTML='<div class="item">اكتب سطر واحد على الأقل الأول.</div>';return}
  let validCount=0;
  let seenInBatch=new Set();
  let rowsHtml=rows.map((r,i)=>{
    if(!r.code||!r.title){
      return `<div class="item"><span class="danger">سطر ${i+1} هيتجاهل (لازم كود ووصف قصير مفصولين بـ | على الأقل)</span> — الجزء اللي اتفهم: «${esc(r.code||r.title||"—")}»</div>`;
    }
    let nc=normalizeFaultText(r.code);
    if(findDuplicateFaultCode(deviceType,brand,r.code,null)){
      return `<div class="item"><b>${esc(r.code)}</b> — ${esc(r.title)} <span class="badge">⚠️ مكرر لنفس النوع/الماركة، هيتجاهل</span></div>`;
    }
    if(seenInBatch.has(nc)){
      return `<div class="item"><b>${esc(r.code)}</b> — ${esc(r.title)} <span class="badge">⚠️ مكرر مع سطر فوق في نفس اللصقة، هيتجاهل</span></div>`;
    }
    seenInBatch.add(nc);
    validCount++;
    return `<div class="item"><b>${esc(r.code)}</b> — ${esc(r.title)}${r.cause?`<div>السبب: ${esc(r.cause)}</div>`:""}${r.fix?`<div>الحل: ${esc(r.fix)}</div>`:""}</div>`;
  }).join("");
  let summary=`<p class="hint">${validCount} كود هيتحفظ من ${rows.length} سطر، لـ <b>${esc(deviceType)||"كل الأنواع"}</b> • <b>${esc(brand)||"كل الماركات"}</b>. راجع القايمة تحت كويس قبل التأكيد.</p>`;
  let confirmBtn=validCount?`<div class="actions"><button type="button" class="primary" data-wf-event="click" data-wf-code="confirmBulkFaultCodes()">✅ تأكيد حفظ ${validCount} كود</button></div>`:"";
  box.innerHTML=summary+rowsHtml+confirmBtn;
}
function confirmBulkFaultCodes(){
  let deviceType=document.getElementById("bfDeviceType")?.value||"";
  let brand=document.getElementById("bfBrand")?.value||"";
  let rows=parseBulkFaultLines(document.getElementById("bfLines")?.value).filter(r=>r.code&&r.title);
  if(!rows.length)return alert("مفيش أكواد صالحة للحفظ.");
  let existing=arr(K.fc),added=0,skipped=0;
  let seenInBatch=new Set();
  rows.forEach(r=>{
    let nc=normalizeFaultText(r.code);
    if(findDuplicateFaultCode(deviceType,brand,r.code,null)||seenInBatch.has(nc)){skipped++;return}
    seenInBatch.add(nc);
    existing.push({
      id:id(),deviceType,brand,code:r.code,title:r.title,cause:r.cause,fix:r.fix,note:r.note,
      addedBy:"",source:"bulk",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    });
    added++;
  });
  if(!saveFaultCodesRecords(existing))return;
  alert(`تم حفظ ${added} كود جديد.${skipped?` (اتجاهل ${skipped} كود مكرر).`:""}`);
  document.getElementById("bfLines").value="";
  document.getElementById("bulkFaultPreview").innerHTML="";
  renderFaultCodes?.();
}

/* ---------------------------------------------------------------------
   العرض: صفحة القائمة الرئيسية (فلاتر نوع/ماركة/بحث + فورم إضافة)
--------------------------------------------------------------------- */
function initFaultCodes(){
  let f=document.getElementById("faultForm");if(!f)return;
  let q=new URLSearchParams(location.search),editId=q.get("edit"),existing=editId?arr(K.fc).find(x=>x.id===editId):null;
  // نوع الجهاز والماركة بقوا قوائم بحث + "إضافة جديد" زي باقي النظام (فاضي = عام).
  fillListSearch("fcDeviceType","type",existing?.deviceType||"");
  fillListSearch("fcBrand","brand",existing?.brand||"");
  fillListSearch("bfDeviceType","type","");
  fillListSearch("bfBrand","brand","");
  if(existing){
    fcCode.value=existing.code||"";fcTitle.value=existing.title||"";fcCause.value=existing.cause||"";
    fcFix.value=existing.fix||"";fcNote.value=existing.note||"";fcAddedBy.value=existing.addedBy||"";
    f.classList.remove("hidden");f.querySelector(".primary").textContent="💾 حفظ التعديلات وفتح الكود";
    document.getElementById("fcSaveAddAnotherBtn")?.classList.add("hidden");
  }
  f.onsubmit=e=>saveFaultCode(e,existing);
  let hint=document.getElementById("faultDuplicateHint");
  let checkDup=()=>{
    if(!hint)return;
    let dup=findDuplicateFaultCode(fcDeviceType.value,fcBrand.value,fcCode.value,existing?.id);
    if(dup){hint.innerHTML=`⚠️ نفس الكود مسجّل بالفعل لنفس النوع/الماركة: <b>${esc(dup.title||dup.code)}</b>.`;hint.className="hint negative";return}
    hint.textContent="";hint.className="hint";
  };
  fcCode.addEventListener("input",checkDup);fcDeviceType.addEventListener("change",checkDup);fcBrand.addEventListener("change",checkDup);
  let typeFilter=document.getElementById("fcFilterType"),brandFilter=document.getElementById("fcFilterBrand"),search=document.getElementById("faultSearch");
  let fillFilters=()=>{
    if(typeFilter){let v=typeFilter.value;typeFilter.innerHTML='<option value="">🔧 كل الأنواع</option>'+Object.keys(settings().types||{}).map(t=>`<option>${esc(t)}</option>`).join("");typeFilter.value=v}
    if(brandFilter){let v=brandFilter.value;brandFilter.innerHTML='<option value="">🏷️ كل الماركات</option>'+(typeof wfBrandList==="function"?wfBrandList(settings().brands):(settings().brands||[])).map(b=>`<option>${esc(b)}</option>`).join("");brandFilter.value=v}
  };
  fillFilters();
  window.WFNavState?.keep({t:"fcFilterType",b:"fcFilterBrand",q:"faultSearch"});
  if(typeFilter)typeFilter.onchange=renderFaultCodes;
  if(brandFilter)brandFilter.onchange=renderFaultCodes;
  // لو أضفت نوع/ماركة جديدة من الفورم تظهر فورًا في فلاتر القائمة.
  ["fcDeviceType","fcBrand","bfDeviceType","bfBrand"].forEach(i=>document.getElementById(i)?.addEventListener("change",fillFilters));
  if(search)search.oninput=renderFaultCodes;
  renderFaultCodes();
}
function renderFaultCodes(){
  let el=document.getElementById("faultList");if(!el)return;
  let q=(document.getElementById("faultSearch")?.value||"").toLowerCase();
  let typeFilter=document.getElementById("fcFilterType")?.value||"";
  let brandFilter=document.getElementById("fcFilterBrand")?.value||"";
  let a=arr(K.fc)
    .filter(f=>f.kind!=="test")
    .filter(f=>!typeFilter||f.deviceType===typeFilter)
    .filter(f=>!brandFilter||f.brand===brandFilter)
    .filter(f=>!q||(typeof wfMatch==="function"?wfMatch([f.code,f.title,f.cause,f.fix,f.deviceType,f.brand,f.model,f.category],q):normalizeFaultText([f.code,f.title,f.cause,f.fix,f.deviceType,f.brand].join(" ")).includes(normalizeFaultText(q))))
    .sort((x,y)=>(x.deviceType||"").localeCompare(y.deviceType||"","ar")||(x.brand||"").localeCompare(y.brand||"","ar")||(x.code||"").localeCompare(y.code||"","ar"));
  el.innerHTML=a.length?WFPager.render("faultcodes",a,f=>`<div class="item ps-context-target" data-ps-title="كود عطل ${esc(f.code)}">
    <div class="item-head"><a href="faultcode.html?id=${f.id}"><b>🧯 ${esc(f.code)} — ${esc(f.title)}</b></a>${psActions("كود عطل "+f.code)}<button type="button" class="danger-btn small-btn" data-wf-event="click" data-wf-code="deleteFaultCodeRecord('${f.id}')">🗑️ حذف</button></div>
    <div>${esc(f.deviceType)||"كل الأنواع"}${f.category?` (${esc(f.category)})`:""} • 🏷️ ${esc(f.brand)||"كل الماركات"}${f.model?` • ${esc(f.model)}`:""}</div>
    ${f.cause?`<div>السبب: ${esc(f.cause)}</div>`:""}
  </div>`,[q,typeFilter,brandFilter].join("|")).html:'<div class="item">لا توجد أكواد مسجّلة بهذا الفلتر بعد.</div>';
}

/* ---------------------------------------------------------------------
   العرض: صفحة ملف الكود الواحد
--------------------------------------------------------------------- */
function faultCodeProfile(){
  let el=document.getElementById("faultCodeProfile");if(!el)return;
  let f=arr(K.fc).find(x=>x.id===new URLSearchParams(location.search).get("id"));
  if(!f){el.innerHTML="<div class='item'>الكود غير موجود.</div>";return}
  // التيست مود متخزن في نفس المكان (kind:"test") وليه صفحة عرض خاصة (app-test-modes.js)
  if(f.kind==="test"&&typeof window.wfTestModeProfile==="function")return window.wfTestModeProfile(f,el);el.setAttribute("data-ps-title",`كود عطل ${f.code}`);
  el.innerHTML=`<div class="profile">
    <div class="page-head"><h1 class="profile-title">🧯 ${esc(f.code)} — ${esc(f.title)}</h1>
      <div class="compact-actions"><a class="secondary" href="faultcodes.html?edit=${f.id}">✏️ تعديل</a><button class="danger-btn" data-wf-event="click" data-wf-code="deleteFaultCodeRecord('${f.id}')">🗑️ حذف</button>${psActions("كود عطل "+f.code)}</div>
    </div>
    <div class="profile-grid">
      <div class="kv"><b>نوع الجهاز</b>${esc(f.deviceType)||"كل الأنواع (عام)"}</div>
      <div class="kv"><b>الماركة</b>${esc(f.brand)||"كل الماركات (عام)"}</div>
      ${f.category?`<div class="kv"><b>التصنيف</b>${esc(f.category)}</div>`:""}
      ${f.model?`<div class="kv"><b>الموديلات / السلسلة</b>${esc(f.model)}</div>`:""}
      ${f.addedBy?`<div class="kv"><b>أضافه</b>${esc(f.addedBy)}</div>`:""}
    </div>
    ${f.cause?`<h3 class="expense-subtitle">🔍 السبب المحتمل</h3><div class="item">${esc(f.cause).replace(/\n/g,"<br>")}</div>`:""}
    ${f.fix?`<h3 class="expense-subtitle">🛠️ خطوات الفحص/الحل</h3><div class="item">${esc(f.fix).replace(/\n/g,"<br>")}</div>`:""}
    ${f.note?`<h3 class="expense-subtitle">📝 ملاحظات إضافية</h3><div class="item">${esc(f.note).replace(/\n/g,"<br>")}</div>`:""}
    <div id="fcMediaBox"></div>
  </div>`;
  if(typeof window.wfFaultMedia==="function")window.wfFaultMedia(f,document.getElementById("fcMediaBox"));
}

/* ---------------------------------------------------------------------
   مشاركة الأكواد مع فنيين تانيين: تصدير/استيراد ملف منفصل تمامًا عن
   النسخة الاحتياطية الكاملة (اللي فيها بيانات عملاء حساسة). الاستيراد
   بيدمج (merge) مع الأكواد الموجودة أصلًا بدل ما يمسحها، ومش بيكرر
   كود موجود بالفعل لنفس النوع/الماركة.
--------------------------------------------------------------------- */
function exportFaultCodesOnly(){
  let data={faultCodes:arr(K.fc),_meta:{exportedAt:new Date().toISOString(),app:"الورشة الفنية — أكواد الأعطال",kind:"fault-codes-only"}};
  let blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  let url=URL.createObjectURL(blob);
  let stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  let a=document.createElement("a");
  a.href=url;a.download=`اكواد-اعطال-الورشة-الفنية-${stamp}.json`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function importFaultCodesFile(input){
  let file=input?.files?.[0];if(!file)return;
  let reader=new FileReader();
  reader.onload=()=>{
    try{
      let data=JSON.parse(reader.result);
      let incoming=Array.isArray(data)?data:(Array.isArray(data?.faultCodes)?data.faultCodes:null);
      if(!incoming)throw new Error("bad");
      let existing=arr(K.fc),added=0,skipped=0;
      const seenImport=new Set();incoming.forEach(raw=>{
        // التيست مود: مكرر لو نفس النوع/الماركة/العنوان
        if(raw&&raw.kind==="test"){
          if(!raw.title||!raw.enter)return;
          if(existing.some(f=>f.kind==="test"&&sameTestMode(raw,f))){skipped++;return} /* الملف نفسه: اللي اتضاف منه بقى جوه existing */
          existing.push({id:id(),kind:"test",deviceType:raw.deviceType||"",brand:typeof wfCanonicalBrand==="function"?wfCanonicalBrand(raw.brand||""):(raw.brand||""),category:raw.category||"",model:raw.model||"",title:raw.title,enter:raw.enter||"",tests:raw.tests||"",exit:raw.exit||"",note:raw.note||"",media:Array.isArray(raw.media)?raw.media.slice(0,10):[],source:"imported",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
          added++;return;
        }
        if(!raw||!raw.code)return;
        // مكرر عندك أو مكرر جوه نفس الملف (قبل كده التكرار جوه الملف كان بيدخل مرتين)
        let key=[raw.deviceType,faultBrandKey(raw.brand),raw.category,raw.model,raw.code].map(normalizeFaultText).join("|");
        let dup=findDuplicateFaultCode(raw.deviceType,raw.brand,raw.code,null,raw.model,raw.category)||seenImport.has(key);
        seenImport.add(key);
        if(dup){skipped++;return}
        existing.push({
          id:id(),deviceType:raw.deviceType||"",brand:typeof wfCanonicalBrand==="function"?wfCanonicalBrand(raw.brand||""):(raw.brand||""),category:raw.category||"",model:raw.model||"",code:raw.code||"",
          title:raw.title||"",cause:raw.cause||"",fix:raw.fix||"",note:raw.note||"",
          addedBy:raw.addedBy||"",media:Array.isArray(raw.media)?raw.media.slice(0,10):[],source:"imported",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
        });
        added++;
      });
      saveFaultCodesRecords(existing);
      alert(`تم استيراد ${added} (كود/تيست مود) جديد.${skipped?` (اتجاهل ${skipped} كود مكرر — موجود عندك أو متكرر في الملف).`:""}`);
      renderFaultCodes?.();
    }catch(err){alert("⚠️ ملف غير صالح. تأكد إنه ملف أكواد أعطال مُصدَّر من نفس النظام.")}
    input.value="";
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------------------
   🧹 دمج المكرر (أكواد + تيست مود): بيجمع اللي شبه بعض، وانت بتختار تسيب أنهي واحد،
   والباقي بيتدمج فيه (الناقص بيتكمّل، والمختلف بيتحط في الملاحظات عشان مايضيعش) وبعدين يتشال.
   الأكواد: نفس الكود حرفيًا + نفس النوع والماركة والتصنيف والموديلات (E1 و E01 مش بيتجمعوا).
   التيست مود: نفس العنوان، أو نفس زراير الدخول لنفس الماركة والموديلات.
--------------------------------------------------------------------- */
function findFaultDuplicateGroups(){
  const all=arr(K.fc).filter(Boolean),tests=all.filter(f=>f.kind==="test"),codes=all.filter(f=>f.kind!=="test"),groups=[];
  function cluster(list,same,kind){
    const parent=list.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(same(list[i],list[j]))parent[find(j)]=find(i);
    const by={};list.forEach((f,i)=>{(by[find(i)]=by[find(i)]||[]).push(f)});
    Object.values(by).forEach(g=>{if(g.length>1)groups.push({kind,items:g})});
  }
  cluster(tests,sameTestMode,"test");
  cluster(codes,(a,b)=>normalizeFaultText(a.code)===normalizeFaultText(b.code)&&normalizeFaultText(a.deviceType)===normalizeFaultText(b.deviceType)&&faultBrandKey(a.brand)===faultBrandKey(b.brand)&&faultCategoryMatch(a.category,b.category)&&!faultModelTokens(a.model).length===!faultModelTokens(b.model).length&&faultModelsMatch(a.model,b.model),"code"); /* كود عام وكود لموديل معيّن بنفس الرقم غالبًا عطلين مختلفين: مايتجمعوش */
  return groups;
}
const FC_MERGE_FIELDS={test:[["enter","طريقة الدخول"],["tests","الخطوات"],["exit","الخروج"]],code:[["title","الوصف"],["cause","السبب"],["fix","الحل"]]};
function faultRichness(f){return ["title","cause","fix","enter","tests","exit","note","model","category"].reduce((a,k)=>a+String(f[k]||"").length,0)+((f.media||[]).length*200)}
function mergeFaultRecords(keepId,dropIds){
  const all=arr(K.fc),keep=all.find(f=>f.id===keepId);if(!keep)return false;
  const drop=all.filter(f=>dropIds.indexOf(f.id)>-1&&f.id!==keepId);if(!drop.length)return false;
  const kind=keep.kind==="test"?"test":"code",notes=[];
  const has=(big,small)=>normalizeFaultText(big).indexOf(normalizeFaultText(small))>-1;
  drop.forEach(o=>{
    const extra=[];
    FC_MERGE_FIELDS[kind].forEach(([k,label])=>{
      const a=String(keep[k]||"").trim(),b=String(o[k]||"").trim();if(!b)return;
      if(!a){keep[k]=b;return}
      if(!has(a,b))extra.push(label+":\n"+b);
    });
    ["category","model"].forEach(k=>{const a=String(keep[k]||"").trim(),b=String(o[k]||"").trim();if(b&&!a)keep[k]=b;else if(b&&k==="model"&&!has(a,b))keep[k]=a+" / "+b});
    const on=String(o.note||"").trim();if(on&&!has(keep.note||"",on))extra.push("ملاحظات:\n"+on);
    if(extra.length)notes.push("📎 من النسخة المدموجة «"+(o.title||o.code||"")+"»:\n"+extra.join("\n"));
    const urls=new Set((keep.media||[]).map(m=>m&&m.url));(o.media||[]).forEach(m=>{if(m&&m.url&&!urls.has(m.url)){urls.add(m.url);(keep.media=keep.media||[]).push(m)}});
  });
  if(notes.length)keep.note=[String(keep.note||"").trim()].concat(notes).filter(Boolean).join("\n\n");
  if(keep.brand&&typeof wfCanonicalBrand==="function")keep.brand=wfCanonicalBrand(keep.brand);
  keep.updatedAt=new Date().toISOString();
  const ids=new Set(drop.map(f=>f.id));
  if(!saveFaultCodesRecords(all.filter(f=>!ids.has(f.id))))return false;
  try{window.auditLog?.("دمج مكرر",kind==="test"?"تيست مود":"كود عطل",keep.id,(keep.title||keep.code||"")+" ← "+drop.length+" نسخة")}catch(_){}
  return true;
}
function openFaultDupTool(){
  const groups=findFaultDuplicateGroups();
  if(!groups.length)return alert("✅ مفيش أكواد ولا تيست مود مكررين.");
  document.getElementById("fcDupModal")?.remove();
  const m=document.createElement("div");m.id="fcDupModal";m.style.cssText="position:fixed;inset:0;z-index:100000;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px;direction:rtl";
  const card=f=>{const sub=[f.model?"📟 "+f.model:"",f.category||"",f.createdAt?("🕐 "+String(f.createdAt).slice(0,10)):""].filter(Boolean).join(" • "),txt=f.kind==="test"?(f.enter||""):(f.cause||"");return `<label style="display:block;border:1px solid var(--border,#ccd);border-radius:10px;padding:8px;margin:6px 0;cursor:pointer"><input type="radio" name="__G__" value="${esc(f.id)}"> <b>${f.kind==="test"?"🧪 "+esc(f.title):"🧯 "+esc(f.code)+" — "+esc(f.title)}</b><div class="hint">${esc(f.brand||"كل الماركات")}${sub?" • "+esc(sub):""}</div><div class="hint" style="white-space:pre-line;max-height:4.8em;overflow:hidden">${esc(String(txt).slice(0,220))}</div></label>`};
  m.innerHTML=`<div style="background:var(--panel,#fff);color:var(--text,#172033);border-radius:14px;padding:14px;max-width:640px;width:100%;max-height:88vh;overflow:auto"><h3 style="margin-top:0">🧹 مراجعة المكرر (${groups.length} مجموعة)</h3><p class="hint">في كل مجموعة اختار النسخة اللي تفضل (المختارة تلقائي هي الأكمل). الباقي هيتدمج فيها: الناقص بيتكمّل، واللي مختلف بيتحط في ملاحظاتها، وبعدين يتشال. شيل علامة «ادمج» من أي مجموعة مش متكررة فعلًا.</p>${groups.map((g,i)=>{const best=g.items.slice().sort((a,b)=>faultRichness(b)-faultRichness(a))[0];return `<div class="item" data-g="${i}" style="margin:10px 0"><label><input type="checkbox" data-on checked> <b>ادمج المجموعة دي</b> <span class="hint">(${g.kind==="test"?"تيست مود":"كود"} • ${g.items.length} نسخ)</span></label>${g.items.map(card).join("").replace(/__G__/g,"g"+i).replace(`value="${esc(best.id)}"`,`value="${esc(best.id)}" checked`)}</div>`}).join("")}<div style="display:flex;gap:8px;position:sticky;bottom:0;background:inherit;padding-top:8px"><button type="button" class="primary" id="fcDupGo">🧹 ادمج المختار</button><button type="button" class="secondary" id="fcDupX">إغلاق</button></div></div>`;
  document.body.appendChild(m);
  m.addEventListener("click",e=>{if(e.target===m)m.remove()});
  m.querySelector("#fcDupX").onclick=()=>m.remove();
  m.querySelector("#fcDupGo").onclick=()=>{
    let n=0,gn=0;
    groups.forEach((g,i)=>{const box=m.querySelector(`[data-g="${i}"]`);if(!box.querySelector("[data-on]").checked)return;const keep=box.querySelector(`input[name="g${i}"]:checked`);if(!keep)return;const drop=g.items.map(f=>f.id).filter(x=>x!==keep.value);if(mergeFaultRecords(keep.value,drop)){n+=drop.length;gn++}});
    if(!gn)return alert("مااخترتش أي مجموعة.");
    m.remove();try{renderFaultCodes?.();window.WFTestModes?.render()}catch(_){}renderFaultDupBar();
    alert(`✅ اتدمج ${gn} مجموعة (اتشال ${n} نسخة مكررة).`);
  };
}
/* شريط صغير فوق القايمة بيظهر بس لو فيه مكرر */
function renderFaultDupBar(){
  const list=document.getElementById("faultList");if(!list)return;
  let bar=document.getElementById("fcDupBar");
  const n=findFaultDuplicateGroups().length;
  if(!n){bar?.remove();return}
  if(!bar){bar=document.createElement("div");bar.id="fcDupBar";bar.className="hint no-print";bar.style.cssText="margin:8px 0;padding:8px 10px;border:1px dashed var(--warn-text,#b45309);border-radius:10px";const anchor=document.getElementById("tmTabs");if(anchor)anchor.parentNode.insertBefore(bar,anchor.nextSibling);else list.parentNode.insertBefore(bar,list)}
  bar.innerHTML=`🧹 فيه <b>${n}</b> مجموعة شكلها مكرر (أكواد أو تيست مود). <button type="button" class="secondary small-btn" id="fcDupOpen">راجعها وادمجها</button>`;
  bar.querySelector("#fcDupOpen").onclick=openFaultDupTool;
}
window.findFaultDuplicateGroups=findFaultDuplicateGroups;window.mergeFaultRecords=mergeFaultRecords;window.openFaultDupTool=openFaultDupTool;
document.addEventListener("DOMContentLoaded",()=>{if(document.getElementById("faultList"))setTimeout(()=>{try{renderFaultDupBar()}catch(e){console.warn("dup bar",e)}},600)});
