/* =========================================================
   الورشة الفنية — المهام والمتابعة (tasks.js)
   =========================================================
   منقول من app.js زي ما هو بالظبط (بند 4: فصل app.js تدريجيًا). قسم
   مستقل منطقيًا عن الدورة الأساسية (عملاء/أجهزة/أوامر شغل)، بيستخدم بس
   customerName/fillCustomer (من shared-data.js/app.js) وK/arr/put/esc/id
   العامة. الترتيب في الصفحة: tasks.js قبل app.js.
   ========================================================= */

/* ---------------------------------------------------------------------
   📋 المهام والمتابعة: قسم مستقل عن الدورة الأساسية.
--------------------------------------------------------------------- */
function taskRows(){return (typeof arrCached==="function"?arrCached(K.tasks):arr(K.tasks)).filter(x=>!x.deleted)} // قراءة (عرض وعدّ) — التعديل بيقرا arr بنفسه
function taskPriorityClass(p){return p==="عاجلة"?"negative":p==="عالية"?"high":""}
/* الإضافة والتعديل من نفس الفورم (قبل كده التعديل كان 5 رسايل prompt ورا بعض). */
let taskEditingId="";
function taskFormEl(id){return document.getElementById(id)}
function saveTask(){
  let title=(taskFormEl("taskTitle")?.value||"").trim();
  if(!title)return alert("اكتب عنوان المهمة.");
  let v={
    title,
    note:(taskFormEl("taskNote")?.value||"").trim(),
    date:taskFormEl("taskDate")?.value||localDateKey(new Date()),
    time:taskFormEl("taskTime")?.value||"",
    priority:taskFormEl("taskPriority")?.value||"عادية",
    customerId:taskFormEl("taskCustomer")?.value||"",
    requestId:taskFormEl("taskRequest")?.value||""
  };
  let a=arr(K.tasks);
  if(taskEditingId){
    const t=a.find(x=>x.id===taskEditingId);
    if(!t){taskEditingId="";return alert("المهمة دي اتحذفت أو اتغيرت. حدّث الصفحة.")}
    Object.assign(t,v,{updatedAt:new Date().toISOString()});
  }else a=a.concat(Object.assign({id:id()},v,{completed:false,createdAt:new Date().toISOString()}));
  // الفورم ماتتمسحش لو الحفظ فشل (قبل كده المستخدم كان بيخسر اللي كتبه).
  if(!put(K.tasks,a))return;clearTaskForm();renderTasks();
}
function clearTaskForm(){
  ["taskTitle","taskNote","taskTime","taskCustomer","taskCustomerSearch"].forEach(idv=>{let e=taskFormEl(idv);if(e)e.value=""});
  let d=taskFormEl("taskDate");if(d)d.value=localDateKey(new Date());
  let p=taskFormEl("taskPriority");if(p)p.value="عادية";
  fillTaskRequests(taskFormEl("taskRequest"),"");
  taskEditingId="";
  const b=document.querySelector('[data-wf-click="saveTask"]');if(b)b.textContent="💾 حفظ المهمة";
  const h=taskFormEl("taskFormTitle");if(h)h.textContent="➕ مهمة جديدة";
}
function toggleTask(idv){
  let a=arr(K.tasks),t=a.find(x=>x.id===idv);if(!t)return;t.completed=!t.completed;t.completedAt=t.completed?new Date().toISOString():"";if(!put(K.tasks,a))return;renderTasks();
}
function deleteTask(idv){
  let a=arr(K.tasks),t=a.find(x=>x.id===idv);if(!t)return;
  if(!confirm(`حذف المهمة «${t.title||""}»؟`))return;
  if(!put(K.tasks,a.filter(x=>x.id!==idv)))return;if(taskEditingId===idv)clearTaskForm();renderTasks();
}
function editTask(idv){
  let t=arr(K.tasks).find(x=>x.id===idv);if(!t)return;
  taskEditingId=idv;
  const set=(k,v)=>{const e=taskFormEl(k);if(e)e.value=v||""};
  set("taskTitle",t.title);set("taskNote",t.note);set("taskDate",t.date);set("taskTime",t.time);set("taskPriority",t.priority||"عادية");
  if(typeof fillCustomerAutocomplete==="function"&&taskFormEl("taskCustomerSearch"))fillCustomerAutocomplete("taskCustomer",t.customerId||"");else set("taskCustomer",t.customerId);
  fillTaskRequests(taskFormEl("taskRequest"),t.customerId||"",t.requestId||"");
  const b=document.querySelector('[data-wf-click="saveTask"]');if(b)b.textContent="💾 حفظ التعديل";
  const h=taskFormEl("taskFormTitle");if(h)h.textContent="✏️ تعديل المهمة";
  const f=taskFormEl("taskTitle");if(f&&typeof f.scrollIntoView==="function"){f.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>{try{f.focus()}catch(e){}},300)}
}
function renderTasks(){
  let el=document.getElementById("taskList");if(!el)return;
  let q=(document.getElementById("taskSearch")?.value||"").toLowerCase().trim(),
      filter=document.getElementById("taskFilter")?.value||"open",
      today=localDateKey(new Date());
  let rows=taskRows().filter(t=>{
    let text=(t.title+" "+t.note+" "+customerName(t.customerId)).toLowerCase();
    if(q&&!(typeof wfMatch==="function"?wfMatch([t.title,t.note,customerName(t.customerId)],q):text.includes(q)))return false;
    if(filter==="open"&&t.completed)return false;
    if(filter==="done"&&!t.completed)return false;
    if(filter==="today"&&t.date!==today)return false;
    if(filter==="overdue"&&(t.completed||!t.date||t.date>=today))return false;
    return true;
  }).sort((a,b)=>Number(a.completed)-Number(b.completed)||String(a.date||"").localeCompare(String(b.date||""))||String(a.time||"").localeCompare(String(b.time||"")));
  let open=taskRows().filter(x=>!x.completed).length,done=taskRows().filter(x=>x.completed).length;
  let stats=document.getElementById("taskStats");if(stats)stats.innerHTML=`<div class="compact-stats"><div class="stat"><b>${open}</b><span>مفتوحة</span></div><div class="stat"><b>${done}</b><span>مكتملة</span></div><div class="stat"><b>${taskRows().filter(x=>!x.completed&&x.date===today).length}</b><span>مهام اليوم</span></div><div class="stat"><b>${taskRows().filter(x=>!x.completed&&x.date&&x.date<today).length}</b><span>متأخرة</span></div></div>`;
  el.innerHTML=rows.length?WFPager.render("tasks",rows,t=>{
    let c=t.customerId?customerName(t.customerId):"";
    let r=t.requestId?(byIdCached(K.r).get(t.requestId)||null):null;
    return `<div class="item record-card ${t.completed?"task-done":""}">
      <div class="card-side-actions">
        <button class="primary small-btn" type="button" data-wf-event="click" data-wf-code="toggleTask('${t.id}')">${t.completed?"↩️ إعادة فتح":"✅ مكتملة"}</button>
        <button class="secondary small-btn" type="button" data-wf-event="click" data-wf-code="editTask('${t.id}')">✏️ تعديل</button>
        <button class="danger-btn small-btn" type="button" data-wf-event="click" data-wf-code="deleteTask('${t.id}')">🗑️ حذف</button>
      </div>
      <div class="record-main">
        <div class="item-head"><b>${t.completed?"✅":"📋"} ${esc(t.title)}</b><span class="badge ${taskPriorityClass(t.priority)}">${esc(t.priority||"عادية")}</span></div>
        <div>📅 ${esc(t.date||"بدون تاريخ")}${t.time?" • ⏰ "+esc(t.time):""}${t.date&&t.date<today&&!t.completed?" • ⚠️ متأخرة":""}</div>
        ${c?`<div>👤 <a href="customer.html?id=${t.customerId}">${esc(c)}</a></div>`:""}
        ${r?`<div>🛠️ <a href="request.html?id=${r.id}">${esc(r.no)}</a></div>`:""}
        ${t.note?`<div>📝 ${esc(t.note)}</div>`:""}
      </div>
    </div>`;
  },[q,filter].join("|")).html:'<div class="item">لا توجد مهام بهذا الفلتر.</div>';
}
function initTasks(){
  if(!document.getElementById("taskList"))return;
  let d=taskFormEl("taskDate");if(d&&!d.value)d.value=localDateKey(new Date());
  let qs=new URLSearchParams(location.search);
  let c=taskFormEl("taskCustomer"),r=taskFormEl("taskRequest");
  // مهمة من صفحة أمر شغل أو عميل: tasks.html?request=..&customer=..
  let qr=qs.get("request")||"",qo=qr?arr(K.r).find(x=>String(x.id)===String(qr)):null,qc=qs.get("customer")||(qo?qo.customerId:"")||"";
  if(c){
    if(taskFormEl("taskCustomerSearch")&&typeof fillCustomerAutocomplete==="function")fillCustomerAutocomplete("taskCustomer",qc);else{fillCustomer(c);c.value=qc}
    c.onchange=()=>{if(r)fillTaskRequests(r,c.value)};
  }
  if(r)fillTaskRequests(r,qc,qo?qo.id:"");
  if(qo&&taskFormEl("taskTitle")&&!taskFormEl("taskTitle").value)taskFormEl("taskTitle").value=`متابعة أمر ${qo.no||""}`;
  document.getElementById("taskSearch")?.addEventListener("input",renderTasks);
  document.getElementById("taskFilter")?.addEventListener("change",renderTasks);
  let qsf=qs.get("filter");if(qsf&&document.getElementById("taskFilter"))document.getElementById("taskFilter").value=qsf;
  window.WFNavState?.keep({q:"taskSearch",filter:"taskFilter"});
  renderTasks();
}
/* أوامر الربط: من غير عميل = الأوامر المفتوحة بس (الأحدث الأول) بدل كل أوامر الورشة؛ مع عميل = كل أوامره. */
function fillTaskRequests(el,cid,selected){
  if(!el)return;
  const ts=x=>String(x.createdAt||"");
  let rows=arr(K.r).filter(x=>cid?x.customerId===cid:(!x.closed&&x.status!=="ملغي")).sort((a,b)=>ts(b).localeCompare(ts(a)));
  if(!cid&&rows.length>200)rows=rows.slice(0,200);
  if(selected&&!rows.some(x=>x.id===selected)){const o=arr(K.r).find(x=>x.id===selected);if(o)rows.unshift(o)}
  el.innerHTML=`<option value="">${cid?"بدون ربط بأمر شغل":"بدون ربط بأمر شغل (الأوامر المفتوحة — اختار العميل لأوامره كلها)"}</option>`+rows.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?"selected":""}>${esc(x.no)} — ${esc(customerName(x.customerId))}${x.closed?" 🔒":""}</option>`).join("");
}
