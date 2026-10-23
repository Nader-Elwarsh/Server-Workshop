/* app-requests.js — قسم أوامر الشغل: النموذج، الحفظ، العرض، البروفايل، دورة الحالة والانتقالات، متابعة الورشة، قطع الغيار داخل الأمر. */
function initRequests(){let f=document.getElementById("requestForm");if(!f)return;let q=new URLSearchParams(location.search),editId=q.get("edit"),existing=editId?arr(K.r).find(x=>String(x.id)===String(editId)):null;if(existing?.closed){alert("أمر الشغل مغلق نهائيًا ولا يمكن تعديله.");location.href=`request.html?id=${existing.id}`;return}currentParts=existing?.parts?existing.parts.map(x=>({...x})):[];{const ep=document.getElementById("rExtPay");if(ep)ep.outerHTML=extPaySelectHtml("rExtPay",existing)}fillCustomerAutocomplete("rCustomer",existing?.customerId||q.get("customer")||"");fillAddress(rAddress,rCustomer.value,existing?.addressKey||"main");fillDevice(rDevice,rCustomer.value,existing?.deviceId||q.get("device")||"");let s=settings(),defPlace=existing?.executionPlace||(s.executionPlaces||[])[0]||"عند العميل",defWs=existing?.workshopStatus||(s.workshopStatuses||[])[0]||"غير مطلوب",defStatus=existing?.status||"جديد";fillList(rExecutionPlace,"executionPlaces",defPlace,"اختر مكان التنفيذ");fillList(rWorkshopStatus,"workshopStatuses",defWs,"اختر حالة الورشة");if(document.getElementById("rDepositWallet"))fillList(rDepositWallet,"wallets",existing?.depositWallet||((+existing?.deposit||0)>0?"":resolveDefaultWallet()),"بدون تحديد");rStatus.innerHTML=nextStatusOptions(defStatus).map(x=>`<option ${x===defStatus?"selected":""}>${esc(x)}</option>`).join("");if(document.getElementById("rTag"))fillListSearch("rTag","orderTag",existing?.tag||"");rCustomer.onchange=()=>{fillAddress(rAddress,rCustomer.value,"main");fillDevice(rDevice,rCustomer.value,"")};rLabor.oninput=calc;rDeposit.oninput=calc;if(existing){rVisit.value=existing.visit||"";rFault.value=existing.fault||"";rWork.value=existing.work||"";rLabor.value=(+existing.labor||0).toFixed(2);rDeposit.value=existing.deposit||0;renderOrderParts();f.classList.remove("hidden");f.querySelector("#requestSubmitBtn").textContent="💾 حفظ التعديلات وفتح أمر الشغل"}else if(q.get("customer")||q.get("device")||q.get("add")){f.classList.remove("hidden")}f.onsubmit=e=>saveRequest(e,existing);renderRequests();calc()}
function fillDevice(el,cid,selected=""){el.innerHTML='<option value="">اختر الجهاز</option>'+arrCached(K.d).filter(d=>d.customerId===cid).map(d=>`<option value="${d.id}" ${d.id===selected?"selected":""}>${esc(d.type)} — ${esc(d.brand)}</option>`).join("")}
let currentParts=[];
/* ---------- تمن القطعة اللي من بره المخزن اتدفع منين؟ (من الإدارة: صفحة الأمر / خط السير / نموذج الأمر) ----------
   «w:<محفظة>» → حركة صرف من المحفظة دي فورًا (لو هي عهدة فني الأمر بتتحسب عليه) • «own» → الفني دفعها من جيبه: بتتضاف لمستحقاته
   «none» → من غير أي حساب. الحركات مربوطة بالقطعة (payKey) فشيل القطعة/إلغاء الأمر بيشيلها وتعديل الكمية بيعدّلها. */
function extPayLabel(p){if(!p||!p.external||!p.paidBy)return"";const w=p.payWallet?` (${p.payWallet})`:"";return({custody:"💼 من عهدة الفني"+w,own:"👛 الفني دفعها من جيبه (تتردّ له)",workshop:"🏢 دفعتها الإدارة"+w,none:"🚫 من غير مصروف"})[p.paidBy]||""}
function extPaySelectHtml(selId,order){const ws=(settings().wallets||[]).map(String),tw=String(order?.techWallet||"").trim();let o=`<option value="">💵 تمنها اتدفع منين؟</option>`;ws.forEach(w=>{o+=`<option value="w:${escAttr(w)}">${w===tw?"💼 من عهدة الفني":"🏢 من محفظة"}: ${esc(w)}</option>`});if(order?.techId)o+=`<option value="own">👛 الفني دفعها من جيبه — تتردّ له مع مستحقاته</option>`;o+=`<option value="none">🚫 مفيش مصروف (العميل جابها / اتسجلت قبل كده)</option>`;return`<select id="${selId}" class="ext-pay-select">${o}</select>`}
function extPayPick(val,order,cost){val=String(val||"");if(!(+cost>0))return{paidBy:"none"};if(!val)return null;if(val==="none")return{paidBy:"none"};if(val==="own")return order?.techId?{paidBy:"own"}:null;if(val.startsWith("w:")){const w=val.slice(2);return{paidBy:w===String(order?.techWallet||"").trim()?"custody":"workshop",payWallet:w}}return null}
function extPartAmount(p){return Math.round((+p.cost||0)*(+p.qty||0)*100)/100}
function syncExtPartPayments(order,oldParts){
  if(!order)return true;
  // إلغاء الأمر مابيلغيش مصروف القطعة: الفلوس اتصرفت فعلًا (لو القطعة رجعت للمورد امسح الحركة من المحفظة)
  const live=(order.parts||[]).filter(p=>p&&p.external&&p.payKey);
  const want={};live.forEach(p=>{if((p.paidBy==="workshop"||p.paidBy==="custody")&&p.payWallet&&extPartAmount(p)>0)want["extpart-"+p.payKey]=p});
  let a=arr(K.wtx),changed=false;const seen={},now=new Date();
  a=a.map(x=>{
    if(!x||x.source!=="ext-part"||String(x.orderId)!==String(order.id))return x;
    const p=want[x.refKey];
    if(x.deleted){if(p&&!x.userDeleted&&!seen[x.refKey]){seen[x.refKey]=1;changed=true;return{...x,deleted:false,amount:extPartAmount(p),wallet:p.payWallet}}if(p)seen[x.refKey]=1;return x}
    seen[x.refKey]=1;
    if(!p){changed=true;return{...x,deleted:true}}
    if(x.manualOverride)return x;
    if(Math.abs((+x.amount||0)-extPartAmount(p))>0.004||x.wallet!==p.payWallet){changed=true;return{...x,amount:extPartAmount(p),wallet:p.payWallet}}
    return x;
  });
  Object.keys(want).forEach(k=>{if(seen[k])return;const p=want[k];changed=true;a.push({id:k,refKey:k,manualOverride:false,deleted:false,type:"out",amount:extPartAmount(p),wallet:p.payWallet,category:"مشتريات قطع غيار",reason:`🧳 قطعة: ${p.name||""} × ${p.qty} (أمر ${order.no||""})`+(p.paidBy==="custody"?` — من عهدة ${order.techName||"الفني"}`:""),note:"",date:localDateKey(now),time:now.toTimeString().slice(0,5),source:"ext-part",orderId:order.id,createdAt:now.toISOString()})});
  const ok=changed?put(K.wtx,a):true;
  // «من جيبه»: مصروف معتمد باسم الفني (بيتضاف لمستحقاته). مفتاح ثابت = ما يتكررش.
  try{
    const fs=window.firebase&&window.firebase.firestore?window.firebase.firestore():null;
    if(fs){
      const prev={};(oldParts||[]).forEach(p=>{if(p&&p.external&&p.payKey&&p.paidBy==="own")prev[p.payKey]=p});
      const cur={};live.forEach(p=>{if(p.paidBy==="own"&&order.techId&&extPartAmount(p)>0)cur[p.payKey]=p});
      Object.keys(cur).forEach(k=>{const p=cur[k],o=prev[k];if(o&&extPartAmount(o)===extPartAmount(p)&&o.qty===p.qty)return;const at=new Date().toISOString();fs.collection("techExpenses").doc("extpart-"+k).set({techId:String(order.techId),techName:order.techName||"",wallet:order.techWallet||"",amount:extPartAmount(p),note:`قطعة: ${p.name||""} × ${p.qty}`,orderId:String(order.id),orderNo:String(order.no||""),status:"approved",pay:"own",category:"part",at,decidedAt:at,decidedBy:(window.firebase.auth().currentUser||{}).uid||"",decisionNote:"سجّلتها الإدارة مع الأمر",source:"admin-part"}).catch(e=>console.warn("ext part own",e))});
      Object.keys(prev).forEach(k=>{if(!cur[k])fs.collection("techExpenses").doc("extpart-"+k).delete().catch(()=>{})});
      // قطعة ضافها الفني وشالتها الإدارة: مصروفها لو لسه معلّق يتلغي
      (oldParts||[]).forEach(p=>{if(p&&p.external&&p.expenseId&&!(order.parts||[]).some(n=>n&&n.expenseId===p.expenseId)){const ref=fs.collection("techExpenses").doc(p.expenseId);ref.get().then(d=>{if(d.exists&&(d.data()||{}).status==="pending")return ref.delete()}).catch(()=>{})}});
    }
  }catch(e){console.warn("ext part sync",e)}
  return ok;
}

let _requestSaving=false;
const _requestMutationLocks=new Set();
async function withRequestMutationLock(requestId,work){const key=String(requestId||"");if(!key||_requestMutationLocks.has(key))return false;_requestMutationLocks.add(key);try{return await work()}finally{_requestMutationLocks.delete(key)}}
async function updateRequestRecordAsync(requestId,update){return withRequestMutationLock(requestId,async()=>{if(typeof updateRecordFast==="function"){const fast=await updateRecordFast(K.r,requestId,update);if(fast!==null)return fast}const records=arr(K.r),record=records.find(x=>String(x.id)===String(requestId));if(!record)return false;if(update(records,record)===false)return false;return putAsync(K.r,records)})}
function partsStockTotal(list){return (list||[]).reduce((a,x)=>a+(+x.qty||0)*(+x.sell||0),0)}
function partsStockCost(list){return (list||[]).reduce((a,x)=>a+(+x.qty||0)*(+x.cost||0),0)}
function filterOrderPartOptions(q){
  const box=document.getElementById("rPartResults");if(!box)return;
  const hidden=document.getElementById("rPart");
  if(hidden){hidden.value="";hidden.removeAttribute("data-qty")}
  q=String(q??document.getElementById("rPartSearch")?.value??"").trim();
  const list=arr(K.p).filter(p=>!p.archived);
  const qLower=q.toLowerCase();
  const matches=(q?list.filter(p=>(p.name||"").toLowerCase().includes(qLower)||(p.code||"").toLowerCase().includes(qLower)):list).slice(0,50);
  let html=matches.length?matches.map(p=>`<div class="part-ac-item" data-value="${esc(p.id)}"><b>${esc(p.name)}</b><span>${(+p.use||0).toFixed(2)} ج — ${+p.qty||0} متاح</span></div>`).join(""):'<div class="part-ac-empty">لا توجد أصناف مطابقة.</div>';
  if(q&&!list.some(p=>(p.name||"").toLowerCase()===qLower)){
    html+=`<div class="part-ac-item ac-add-new" data-addpart="${esc(q)}"><b>➕ إضافة "${esc(q)}" كقطعة جديدة للمخزن</b></div>`;
  }
  box.innerHTML=html;
  box.querySelectorAll("[data-value]").forEach(item=>{item.onmousedown=()=>selectOrderPart(item.dataset.value)});
  box.querySelectorAll("[data-addpart]").forEach(item=>{item.onmousedown=()=>{box.classList.add("hidden");openQuickAddPart(item.dataset.addpart,{anchor:"rPartResults",onCreated:p=>selectOrderPart(p.id)})}});
  box.classList.remove("hidden");
}
function selectOrderPart(pid){
  const p=arr(K.p).find(x=>x.id===pid);if(!p)return;
  const hidden=document.getElementById("rPart"),search=document.getElementById("rPartSearch"),box=document.getElementById("rPartResults");
  if(hidden){hidden.value=pid;hidden.dataset.qty=+p.qty||0}
  if(search)search.value=p.name;
  if(box)box.classList.add("hidden");
}
function hideOrderPartResults(){setTimeout(()=>document.getElementById("rPartResults")?.classList.add("hidden"),150)}
function addPartToOrder(){let hidden=document.getElementById("rPart"),pid=hidden?.value||"",q=+(document.getElementById("rPartQty")?.value||1),p=arr(K.p).find(x=>x.id===pid);if(!pid||!p)return alert("اكتب اسم القطعة واختر واحدة من نتائج البحث أولًا.");if(!Number.isInteger(q)||q<1)return alert("اكتب كمية صحيحة كعدد صحيح.");let existing=currentParts.find(x=>!x.external&&x.partId===pid&&+x.sell===+p.use&&+x.cost===+p.buy),already=existing?(+existing.qty||0):0,available=+(p.qty||0),editing=!!new URLSearchParams(location.search).get("edit"),required=editing?q:q+already;if(required>available)return alert(`الكمية المطلوبة ${required} أكبر من المتاح ${available}.`);if(existing)existing.qty=already+q;else currentParts.push({partId:pid,qty:q,sell:+p.use||0,cost:+p.buy||0});renderOrderParts();calc();if(hidden)hidden.value="";const search=document.getElementById("rPartSearch");if(search)search.value="";if(document.getElementById("rPartQty"))document.getElementById("rPartQty").value=1}
function addExternalPartToOrder(){let nameEl=document.getElementById("rExtName"),buyEl=document.getElementById("rExtBuy"),sellEl=document.getElementById("rExtSell"),qtyEl=document.getElementById("rExtQty");let name=(nameEl?.value||"").trim();if(!name)return alert("اكتب اسم القطعة.");let cost=+(buyEl?.value||0),sell=+(sellEl?.value||0),q=+(qtyEl?.value||1);if(!Number.isInteger(q)||q<1){alert("اكتب كمية صحيحة كعدد صحيح.");return}if(!Number.isFinite(cost)||cost<0||!Number.isFinite(sell)||sell<0)return alert("اكتب أسعار صحيحة.");const formOrder=arr(K.r).find(x=>String(x.id)===String(new URLSearchParams(location.search).get("edit")))||null,pick=extPayPick(document.getElementById("rExtPay")?.value,formOrder,cost*q);if(!pick)return alert("اختار تمن القطعة اتدفع منين (محفظة، عهدة الفني، من جيب الفني، أو مفيش مصروف).");currentParts.push({external:true,name,qty:q,sell,cost,payKey:id(),addedBy:"admin",...pick});renderOrderParts();calc();if(document.getElementById("rExtPay"))document.getElementById("rExtPay").value="";if(nameEl)nameEl.value="";if(buyEl)buyEl.value="";if(sellEl)sellEl.value="";if(qtyEl)qtyEl.value=1}
function updateOrderPartQty(i,value){let q=+value;if(!Number.isInteger(q)||q<1){alert("اكتب كمية صحيحة كعدد صحيح.");return}if(!currentParts[i])return;currentParts[i].qty=q;calc();renderOrderParts()}
function removeOrderPart(i){if(!currentParts[i])return;currentParts.splice(i,1);renderOrderParts();calc()}
function renderOrderParts(){let el=document.getElementById("orderParts");el.innerHTML=currentParts.map((x,i)=>{let p=x.external?null:arr(K.p).find(z=>z.id===x.partId);let nm=x.external?(x.name||"قطعة خارجية"):(p?.name||"قطعة محذوفة");let amount=x.qty*x.sell;let amountLabel=`${amount.toFixed(2)} ج`;return `<div class="part-row${x.external?" part-row-external":""}"><span>${x.external?"🧳 ":""}${esc(nm)}${x.external?` <small class="ext-badge">خارج المخزن</small>`:""}${extPayLabel(x)?`<small class="ext-cost-note"> ${esc(extPayLabel(x))}</small>`:""}</span><input type="number" min="1" value="${x.qty}" data-wf-event="change" data-wf-code="updateOrderPartQty(${i},this.value)"><span title="${x.external?`سعر الشراء ${(+x.cost||0).toFixed(2)} ج`:""}">${amountLabel}</span><button type="button" class="secondary" data-wf-event="click" data-wf-code="removeOrderPart(${i})">🗑️</button></div>`}).join("")}
function calc(){let ps=partsStockTotal(currentParts),t=ps+(+rLabor.value||0),dep=+rDeposit.value||0;rPartsTotal.value=ps.toFixed(2);rTotal.value=t.toFixed(2);remainBox.classList.toggle("hidden",dep<=0);rRemain.value=Math.max(0,t-dep).toFixed(2)}
function adjustStockForOrder(oldParts,newParts,requestId,stock=arr(K.p),moves=arr(K.m)){let delta={};oldParts.filter(x=>x.partId&&!x.external).forEach(x=>delta[x.partId]=(delta[x.partId]||0)+x.qty);newParts.filter(x=>x.partId&&!x.external).forEach(x=>delta[x.partId]=(delta[x.partId]||0)-x.qty);for(let [pid,d] of Object.entries(delta)){if(!d)continue;let p=stock.find(z=>z.id===pid);if(!p)return false;if(d>0)p.qty=(+p.qty||0)+d;else{let need=-d;if(need>(+p.qty||0))return false;p.qty=(+p.qty||0)-need}moves.push({id:id(),partId:pid,type:d>0?"إرجاع بسبب تعديل أمر":"خروج بسبب تعديل أمر",qty:Math.abs(d),requestId,at:new Date().toISOString()})}return {stock,moves}}
// saveRequest() كانت بتخلط بين قراءة الفورم من الـ DOM ومنطق الحفظ والمخزون في
// دالة واحدة. اتقسمت لـ 3: قراءة الفورم (collectRequestFormData) — منطق الحفظ
// الصِرف اللي مبيلمسش DOM خالص (persistRequestRecord، ممكن يُختبر لوحده أو
// يُستخدم من مكان تاني زي استيراد جماعي) — ودالة تحكم رفيعة (saveRequest) بتربط
// بينهم. السلوك الفعلي (الحسابات، ترتيب العمليات، رسائل الخطأ) لم يتغيّر.
function collectRequestFormData(existing){let t=+rTotal.value||0,dep=+rDeposit.value||0,tag=document.getElementById("rTag")?rTag.value:(existing?.tag||""),depositWallet=document.getElementById("rDepositWallet")?.value||"";return{customerId:rCustomer.value,deviceId:rDevice.value,addressKey:rAddress.value,visit:rVisit.value,status:rStatus.value,executionPlace:rExecutionPlace.value,workshopStatus:rWorkshopStatus.value,partsWaiting:!!document.getElementById("rPartsWaiting")?.checked,tag,fault:rFault.value,work:rWork.value,labor:(+rLabor.value||0),parts:currentParts,partsTotal:+rPartsTotal.value||0,total:t,deposit:dep,depositWallet}}
async function persistRequestRecord(formData,existing){
  const customerId=String(formData?.customerId||"");
  if(!customerId||!arr(K.c).some(c=>String(c.id)===customerId))return{ok:false,error:"العميل المحدد غير موجود. اختر عميلًا صالحًا ثم حاول مرة أخرى."};
  if(formData.deviceId){
    const device=arr(K.d).find(d=>String(d.id)===String(formData.deviceId));
    if(!device)return{ok:false,error:"الجهاز المحدد غير موجود. أعد اختياره ثم حاول مرة أخرى."};
    if(String(device.customerId||"")!==customerId)return{ok:false,error:"الجهاز المحدد تابع لعميل آخر. اختر جهازًا تابعًا لنفس العميل."};
  }
  // اللي كان قبل كده backup يدوي بـ JSON.stringify لمفتاح wf_p بس، دلوقتي
  // withRollback (shared-data.js) بيغطي wf_p وwf_m مع بعض، وبيرجعهم
  // تلقائيًا لو رجّعنا {ok:false} أو حصل استثناء — بدل ما نعمل الإرجاع يدوي.
  let partsCost=partsStockCost(formData.parts);
  return withRollbackAsync([K.p,K.m,K.r,K.wtx],async()=>{
    if(existing){
      // الأمر الملغي لا تكون قطعه محجوزة من المخزن؛ نحسب فرق المخزون
      // بين الحالة السابقة والجديدة مرة واحدة فقط، حتى لا تتكرر الإعادة
      // أو الخصم عند تعديل أمر ملغي أو إعادة فتحه.
      const prevParts=(existing.parts||[]).map(x=>({...x}));
      let oldParts=existing.status==="ملغي"?[]:(existing.parts||[]);
      let newParts=formData.status==="ملغي"?[]:formData.parts;
      let stock=arr(K.p),moves=arr(K.m),adjusted=adjustStockForOrder(oldParts,newParts,existing.id,stock,moves);
      if(!adjusted){
        return{ok:false,error:"الكمية الجديدة غير متاحة في المخزن."}
      }
      let fromStatus=existing.status;
      if(fromStatus!==formData.status&&!canTransitionStatus(fromStatus,formData.status)){
        return{ok:false,error:`لا يمكن الانتقال من حالة «${fromStatus}» إلى «${formData.status}» مباشرة.`}
      }
      Object.assign(existing,{customerId:formData.customerId,deviceId:formData.deviceId,addressKey:formData.addressKey,visit:formData.visit,status:formData.status,executionPlace:formData.executionPlace,workshopStatus:formData.workshopStatus,partsWaiting:formData.partsWaiting,tag:formData.tag,fault:formData.fault,work:formData.work,labor:formData.labor,parts:formData.parts,partsTotal:formData.partsTotal,partsCost,total:formData.total,deposit:formData.deposit,depositWallet:formData.depositWallet,remain:orderRemainAmt({total:formData.total,deposit:formData.deposit,depositRefunded:existing.depositRefunded})});
      applyStatusTimestamp(existing,existing.status);
      if(fromStatus!==existing.status){
        if(existing.status==="ملغي"){existing.cancelReason=formData.cancelReason||"";existing.cancelledAt=new Date().toISOString()}
        if(fromStatus==="ملغي"&&existing.status==="جديد"){existing.cancelReason="";existing.cancelledAt=null;existing.reopenedAt=new Date().toISOString()}
        recordStatusHistory(existing,fromStatus,existing.status);
      }
      let saved=await commitStorageAsync({[K.p]:stock,[K.m]:moves,[K.r]:arr(K.r).map(x=>x.id===existing.id?existing:x)});
      if(!saved)return{ok:false,error:"تعذر حفظ الأمر والمخزون. لم يتم تغيير البيانات."};
      syncTreasuryForOrderDeposit(existing);
      if(typeof syncWalletForOrderDeposit==="function"&&!syncWalletForOrderDeposit(existing))return{ok:false,error:"تعذر حفظ حركة العربون. تم التراجع عن العملية."};
      if(!syncExtPartPayments(existing,prevParts))return{ok:false,error:"تعذر حفظ مصروف القطع اللي من بره المخزن. تم التراجع عن العملية."};
      return{ok:true,request:existing}
    }
    let r={id:id(),no:orderNo(),customerId:formData.customerId,deviceId:formData.deviceId,addressKey:formData.addressKey,visit:formData.visit,status:formData.status,executionPlace:formData.executionPlace,workshopStatus:formData.workshopStatus,partsWaiting:formData.partsWaiting,tag:formData.tag,fault:formData.fault,work:formData.work,labor:formData.labor,parts:formData.parts,partsTotal:formData.partsTotal,partsCost,total:formData.total,deposit:formData.deposit,depositWallet:formData.depositWallet,remain:orderRemainAmt({total:formData.total,deposit:formData.deposit}),closed:false,createdAt:new Date().toISOString()};
    if(formData.warrantyDecision){r.warrantyDecision=formData.warrantyDecision;r.warrantyOf=formData.warrantyOf||"";r.warrantyOfNo=formData.warrantyOfNo||"";r.warrantyOfScope=formData.warrantyOfScope||""}
    applyStatusTimestamp(r,r.status);
    recordStatusHistory(r,"",r.status);
    let stock=arr(K.p),moves=arr(K.m),m0=moves.length;
    if(!adjustStockForOrder([],formData.parts,r.id,stock,moves))return{ok:false,error:"قطعة من الأمر لم تعد متاحة بالكمية المطلوبة في المخزن. راجع الكميات ثم حاول الحفظ مجددًا."};
    for(let k=m0;k<moves.length;k++)moves[k].type="خروج بسبب أمر شغل جديد";
    if(!await commitStorageAsync({[K.p]:stock,[K.m]:moves,[K.r]:arr(K.r).concat(r)}))return{ok:false,error:"تعذر حفظ الأمر والمخزون. لم يتم تغيير البيانات."};
    syncTreasuryForOrderDeposit(r);
    if(typeof syncWalletForOrderDeposit==="function"&&!syncWalletForOrderDeposit(r))return{ok:false,error:"تعذر حفظ حركة العربون. تم التراجع عن العملية."};
    if(!syncExtPartPayments(r,[]))return{ok:false,error:"تعذر حفظ مصروف القطع اللي من بره المخزن. تم التراجع عن العملية."};
    return{ok:true,request:r}
  })
}
async function saveRequest(e,existing=null){
  e.preventDefault();
  if(_requestSaving)return;
  if(!document.getElementById("rCustomer")?.value)return alert("اختر العميل أولاً من نتائج البحث.");
  let formData=collectRequestFormData(existing);
  // تنبيه ضمان: لو الأمر ده جديد فعلاً (مش تعديل) والجهاز ده له أمر سابق
  // مقفول ولسه في فترة الضمان، نلفت نظر المستخدم قبل الحفظ — يمكن يكون
  // نفس العطل ومفروض ميتحصّلش من العميل تاني بدل ما يكتشف بعد ما يقفل
  // الأمر الجديد ويحصّل فلوس غلط.
  if(!existing&&formData.deviceId){
    let prior=typeof priorWarrantyOrder==="function"?priorWarrantyOrder({deviceId:formData.deviceId,createdAt:new Date().toISOString()}):null;
    if(prior){
      const dec=await warrantyDecisionDialog(prior);
      if(!dec)return;
      applyWarrantyDecisionToForm(formData,prior,dec);
    }
  }
  // نفس مشكلة تحصيل إقفال الأمر: لو فيه عربون بمبلغ فعلي من غير تحديد
  // محفظة، upsertWalletTxForRef مش هيسجل حركة أصلًا (ولو كانت حركة قديمة
  // موجودة من عربون سابق، هيمسحها) — المبلغ ساعتها بيفضل مسجل في أمر
  // الشغل نفسه بس من غير أي أثر في الحسابات/المحافظ. نحذّر المستخدم هنا
  // زي ما بالظبط بيحصل عند تقفيل الأمر (markPaidAndClose).
  if((+formData.deposit||0)>0&&!formData.depositWallet&&!confirm(`مفيش محفظة محددة للعربون (${(+formData.deposit).toFixed(2)} ج)، فمش هيتسجل كحركة في الحسابات.\n\nمتابعة الحفظ من غير تسجيله في محفظة؟`))return;
  if(existing&&existing.status!==formData.status){
    if(!canTransitionStatus(existing.status,formData.status)){alert(`لا يمكن الانتقال من حالة «${existing.status}» إلى «${formData.status}» مباشرة.`);return}
    if(formData.status==="ملغي"){
      let reason=askCancelReason();
      if(reason===null)return;
      if(!reason){alert("سبب الإلغاء مطلوب لإلغاء أمر الشغل.");return}
      formData.cancelReason=reason;
    }
    if(existing.status==="ملغي"&&formData.status==="جديد"&&!confirm("تأكيد إعادة فتح أمر الشغل الملغي؟"))return;
    if(existing.status==="مكتمل"&&formData.status==="جاري التنفيذ"&&!confirm("تأكيد إعادة فتح أمر الشغل المكتمل عند الحاجة؟"))return;
  }
  _requestSaving=true;
  try{
    let result=await persistRequestRecord(formData,existing);
    if(!result.ok)return alert(result.error);
    // تعديل أمر موجود: نرجع لصفحة الأمر نفسها (مش خطوة جديدة) عشان زر الرجوع مايفتحش فورم التعديل تاني.
    if(existing&&typeof wfLeaveTo==="function")await wfLeaveTo(`request.html?id=${result.request.id}`,true);
    else if(typeof wfNavigate==="function")await wfNavigate(`request.html?id=${result.request.id}`);else location.href=`request.html?id=${result.request.id}`
  }finally{_requestSaving=false}
}
/* كود عطل مكتوب في وصف العطل (زي E1 أو F-05) ومسجّل في «أكواد أعطال الأجهزة» لنفس النوع/الماركة: نعرض معناه وسببه تحت العطل */
function requestFaultCodeHintsHtml(r){
  try{
    const txt=String(r.fault||"");if(!txt||!K.fc)return"";
    const toks=(txt.match(/[A-Za-z]{1,3}\s?-?\s?\d{1,3}/g)||[]).map(t=>t.toLowerCase().replace(/[\s-]/g,""));if(!toks.length)return"";
    const d=arr(K.d).find(x=>x.id===r.deviceId)||{},n=v=>String(v||"").toLowerCase().replace(/[\s\-_.]/g,"");
    const hits=arr(K.fc).filter(f=>toks.includes(n(f.code))&&(!f.deviceType||f.deviceType===d.type)&&(!f.brand||n(f.brand)===n(d.brand))).slice(0,3);
    return hits.map(f=>`<div class="hint" style="margin-top:4px">🧯 <a href="faultcode.html?id=${esc(f.id)}"><b>${esc(f.code)}</b> — ${esc(f.title||"")}</a>${f.cause?` • السبب المحتمل: ${esc(f.cause)}`:""}</div>`).join("");
  }catch(e){return""}
}
function requestWarrantyBannerHtml(r){
  if(r.warrantyDecision==="warranty")return `<div class="hint" style="background:var(--bg-sunken);border-radius:10px;padding:8px 10px;margin:8px 0">🛡️ <b>أمر ضمان</b> على الأمر ${r.warrantyOf?`<a href="request.html?id=${esc(r.warrantyOf)}">${esc(r.warrantyOfNo||"السابق")}</a>`:esc(r.warrantyOfNo||"")} — المصنعية مش بتتحسب على العميل. لو فيه قطعة جديدة مش تحت الضمان سيبها بسعرها.</div>`;
  if(r.closed||r.warrantyDecision||typeof priorWarrantyOrder!=="function")return"";
  const p=priorWarrantyOrder(r);if(!p)return"";
  return `<div class="hint no-print" style="background:#fff7e6;color:#7a4b00;border-radius:10px;padding:8px 10px;margin:8px 0">⚠️ الجهاز ده لسه في ضمان الأمر <a href="request.html?id=${esc(p.id)}">${esc(p.no||"")}</a> (لحد ${esc(new Date(p.warrantyUntil).toLocaleDateString("ar-EG"))}) على: <span style="white-space:pre-wrap">${esc(warrantyScopeText(p))}</span><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="primary mini-action" data-wf-event="click" data-wf-code="setWarrantyDecision('${r.id}','warranty')">🛡️ نفس العطل — ضمان</button><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="setWarrantyDecision('${r.id}','paid')">🔧 عطل تاني — بفلوس</button></div></div>`;
}
/* ---------- أمر جديد على جهاز لسه في الضمان: ضمان (نفس العطل/القطعة) ولا شغل جديد بفلوس؟ ---------- */
function warrantyDecisionDialog(prior){
  const D=document;
  if(!D||!D.body||typeof D.createElement!=="function"){return Promise.resolve(confirm(`الجهاز في ضمان الأمر ${prior.no||""}. نفس العطل (ضمان)؟\n✅ موافق = ضمان • ❌ إلغاء = شغل جديد بفلوس`)?"warranty":"paid")}
  return new Promise(resolve=>{
    const m=D.createElement("div");m.className="txd-modal";m.id="warrantyDecision";
    const scope=typeof warrantyScopeText==="function"?warrantyScopeText(prior):"";
    m.innerHTML=`<div class="txd-sheet rd-sheet" role="dialog" aria-label="الجهاز في الضمان"><div class="txd-title">🛡️ الجهاز ده لسه في ضمان الأمر ${esc(prior.no||"")}</div>
      <div class="hint">الضمان لحد ${esc(new Date(prior.warrantyUntil).toLocaleDateString("ar-EG"))} — وهو على اللي اتعمل في الأمر ده بس:</div>
      <div class="kv" style="white-space:pre-wrap;margin:6px 0">${esc(scope||"—")}</div>
      <div class="hint">لو العطل الجديد هو نفس العطل أو في نفس القطعة اللي اتغيرت = ضمان. لو عطل تاني أو قطعة تانية = شغل جديد بفلوس.</div>
      <div class="txd-actions" style="flex-direction:column;align-items:stretch">
        <button type="button" class="primary" data-d="warranty">🛡️ نفس العطل — ضمان (المصنعية صفر)</button>
        <button type="button" class="secondary" data-d="paid">🔧 عطل تاني — شغل جديد بفلوس</button>
        <button type="button" class="secondary" data-d="">إلغاء</button></div></div>`;
    const done=v=>{m.remove();resolve(v||null)};
    m.addEventListener("click",e=>{const b=e.target.closest("[data-d]");if(b)done(b.getAttribute("data-d"));else if(e.target===m)done(null)});
    D.body.appendChild(m);
  });
}
function applyWarrantyDecisionToForm(fd,prior,dec){
  fd.warrantyDecision=dec;fd.warrantyOf=prior.id;fd.warrantyOfNo=prior.no||"";fd.warrantyOfScope=typeof warrantyScopeText==="function"?warrantyScopeText(prior):""; /* الفني يشوف الضمان على إيه (الأمر القديم مش عنده) */
  if(dec==="warranty"){fd.labor=0;fd.total=Math.round(((+fd.partsTotal||0))*100)/100}
}
/* قرار الضمان لأمر اتعمل من غير السؤال (من البوابة أو الفني أو إضافة سريعة) — من صفحة الأمر */
async function setWarrantyDecision(i,dec){
  if(dec!=="warranty"&&dec!=="paid")return;
  const r0=arr(K.r).find(x=>String(x.id)===String(i)),prior=r0&&typeof priorWarrantyOrder==="function"?priorWarrantyOrder(r0):null;
  if(!r0||!prior||r0.closed)return;
  if(dec==="warranty"&&(+r0.labor||0)>0&&!confirm(`هيتسجل الأمر ضمان على الأمر ${prior.no||""} والمصنعية (${(+r0.labor).toFixed(2)} ج) هتبقى صفر. تكمل؟`))return;
  const ok=await updateRequestRecordAsync(i,(_,r)=>{if(r.closed)return false;r.warrantyDecision=dec;r.warrantyOf=prior.id;r.warrantyOfNo=prior.no||"";r.warrantyOfScope=typeof warrantyScopeText==="function"?warrantyScopeText(prior):"";if(dec==="warranty"){r.labor=0;r.total=Math.round((+r.partsTotal||0)*100)/100;r.remain=orderRemainAmt(r)}return true});
  if(ok){window.auditLog?.("قرار ضمان","أمر شغل",i,dec==="warranty"?`ضمان أمر ${prior.no||""}`:"شغل جديد بفلوس");requestProfile()}
}
async function saveWarrantyScope(i){
  const el=document.getElementById("warrantyScopeInput-"+i);if(!el)return;
  const v=String(el.value||"").trim(),r=arr(K.r).find(x=>String(x.id)===String(i));
  const auto=typeof warrantyScopeAuto==="function"?warrantyScopeAuto(r):"";
  const ok=await updateRequestRecordAsync(i,(_,cur)=>{if(v&&v!==auto)cur.warrantyScope=v;else delete cur.warrantyScope;return true});
  if(ok)requestProfile();
}
// renderRequests: كانت هنا نسخة "أساسية" بتفلتر بعناصر statusFilter/workshopFilter
// اللي مش موجودة في requests.html أصلًا (البحث بقى عن طريق فولدرات/فلاتر تانية
// requestOpsStatus/requestOpsWorkshop)، والصفحة الوحيدة اللي فيها #requestList هي
// requests.html وهي دايمًا بتحمّل workshop-mini-simple-ui.js اللي بيستبدل الدالة دي
// (defineOverride) قبل أي استدعاء ليها فعليًا — يعني منطق العرض القديم هنا كان كود
// ميت تمامًا. لكن الدالة لازم تفضل معرّفة برضه: صفحات زي request.html (بروفايل أمر
// الشغل) بتنادي renderRequests() بشكل مباشر (من changeRequestStatus/changeRequestTag
// وغيرها) من غير ما تحمّل workshop-mini-simple-ui.js أصلًا، فلو مسحنا الدالة كليًا
// هيبقى فيه خطأ "renderRequests is not defined" في الصفحات دي. الحل: نسيبها موجودة
// بس بأقل شكل ممكن (تخرج فورًا لو #requestList مش موجود، وهو الحال دايمًا هنا).
function renderRequests(){if(!document.getElementById("requestList"))return}

async function requestProfile(){let el=document.getElementById("requestProfile");if(!el)return;let r=arrCached(K.r).find(x=>String(x.id)===String(new URLSearchParams(location.search).get("id")));if(!r){el.innerHTML="<div class='item'>الأمر غير موجود.</div>";return}let parts=(r.parts||[]).map(x=>{let p=x.external?null:byIdCached(K.p).get(x.partId);let nm=x.external?(x.name||"قطعة خارجية"):(p?.name||"قطعة محذوفة");let amount=(x.qty||0)*(x.sell||0);let amountLabel=`${amount.toFixed(2)} ج`;let extCost=x.external?`<div class="ext-cost-note">💵 سعر الشراء: ${(+x.cost||0).toFixed(2)} ج × ${x.qty} = ${((+x.cost||0)*(x.qty||0)).toFixed(2)} ج${extPayLabel(x)?` • ${esc(extPayLabel(x))}`:""}</div>`:"";return `<div class="part-row compact-part${x.external?" part-row-external":""}"><span>${x.external?"🧳":"🔧"} ${esc(nm)}${x.external?' <small class="ext-badge">خارج المخزن</small>':""}${extCost}</span><span>× ${x.qty}</span><strong>${amountLabel}</strong></div>`}).join("");let canEdit=!r.closed&&!r.paid;let cust=byIdCached(K.c).get(r.customerId)||{};let custPhone=(cust.phone||"").trim();let paid=!!r.paid;let ws=r.workshopStatus||"غير مطلوب";let workshopTrack=ws!=="غير مطلوب"?`<div class="workshop-track"><h3>🏭 متابعة الجهاز داخل الورشة</h3><div class="workshop-state"><b>${esc(ws)}</b>${r.workshopAt?`<small>آخر تحديث: ${new Date(r.workshopAt).toLocaleString("ar-EG")}</small>`:""}${r.pulledAt?`<small>📦 تم سحب الجهاز: ${new Date(r.pulledAt).toLocaleString("ar-EG")}</small>`:""}</div>${canEdit?`<div class="workshop-actions">${["تم السحب","تم التسليم"].map(x=>`<button type="button" class="secondary mini-action ${ws===x?"active-track":""}" data-wf-event="click" data-wf-code="setWorkshopStatus('${r.id}','${x}')">${x}</button>`).join("")}</div>`:""}</div>`:!canEdit?"":`<div class="workshop-track"><h3>🏭 سحب الجهاز للورشة</h3><div class="hint">لو الجهاز يحتاج إصلاح داخل الورشة، سجّل سحبه هنا وسيظهر في أوامر الورشة ويمكن متابعة حالته حتى التسليم.</div><button type="button" class="secondary mini-action workshop-pull" data-wf-event="click" data-wf-code="requestWorkshopPull('${r.id}')">📦 سحب الجهاز للورشة</button></div>`;el.innerHTML=`<div class="profile request-one-page ps-context-target" data-ps-title="أمر الشغل ${esc(r.no)}"><div class="request-top"><div><h1 class="profile-title request-title">🛠️ ${esc(r.no)}</h1>${r.renumberedFrom?`<small class="hint" style="display:block">ℹ️ رقمه كان ${esc(r.renumberedFrom)} واتغير لأنه اتكرر مع أمر تاني</small>`:""}${psActions("أمر الشغل "+r.no)}<span class="badge">${paid?"مدفوع بالكامل":esc(r.status)}${r.closed?" 🔒":""}</span>${canReturnRequest(r)?`<button type="button" class="secondary mini-action return-btn" data-wf-event="click" data-wf-code="markRequestReturned('${r.id}')">🔄 مرتجع${r.closed?` (متبقي ${Math.max(0,returnWindowDaysLeft(r))} يوم)`:""}</button>`:(r.closed&&r.status==="مكتمل"?`<span class="badge">⏹️ انتهت مهلة المرتجع</span>`:"")}</div><div class="compact-actions">${canEdit?`<button class='secondary mini-action' data-wf-event="click" data-wf-code="editRequest('${r.id}')">✏️ تعديل</button>`:""}<button class='danger-btn mini-action' data-wf-event="click" data-wf-code="deleteRequestRecord('${r.id}')">🗑️ حذف</button></div></div>${requestCommActionsHtml(r,custPhone)}<div class="wf-ai-msg-slot no-print" data-ai-rid="${esc(r.id)}" style="display:none"></div>${requestWarrantyBannerHtml(r)}<div class="request-grid"><div class="kv"><b>👤 العميل</b><a href="customer.html?id=${r.customerId}">${esc(customerName(r.customerId))}</a></div><div class="kv"><b>📞 التليفون</b>${contactLinksHtml(custPhone)}</div><div class="kv"><b>🔧 الجهاز</b><a href="device.html?id=${r.deviceId}">${esc(deviceName(r.deviceId))}</a></div><div class="kv"><b>📍 العنوان</b>${esc(addressText(requestAddressObj(r,cust)))}${window.WFLoc?WFLoc.linkHtml(requestLoc(r,cust),"🗺️ اللوكيشن"):""}</div>${window.WFLoc?`<div class="kv request-wide"><b>🧭 اللوكيشن على الخريطة</b>${canEdit?WFLoc.field("rLocBox",requestLoc(r,cust),{hint:"مفيش لوكيشن — الصق اللينك اللي العميل بعته على واتساب، أو «موقعي الحالي» لو إنت عند العميل."}):(WFLoc.linkHtml(requestLoc(r,cust),"🗺️ افتح الخريطة")||"—")}${requestLoc(r,cust)?` <a class="wfloc-link" href="${esc(WFLoc.navHref(requestLoc(r,cust)))}" target="_blank" rel="noopener noreferrer">🧭 ابدأ الملاحة</a>`:""}</div>`:""}<div class="kv"><b>🏷️ التصنيف اليدوي</b>${canEdit?`<select class="inline-status" data-wf-event="change" data-wf-code="changeRequestTag('${r.id}',this.value)"><option value="" ${!r.tag?"selected":""}>بدون تصنيف</option>${(settings().orderTags||[]).concat(r.tag&&!(settings().orderTags||[]).includes(r.tag)?[r.tag]:[]).map(x=>`<option value="${esc(x)}" ${r.tag===x?"selected":""}>${esc(x)}${r.tag===x&&!(settings().orderTags||[]).includes(x)?" (قديم/متوقف)":""}</option>`).join("")}<option value="__add__">➕ إضافة تصنيف جديد…</option></select>`:(esc(r.tag)||"بدون تصنيف")}</div><div class="kv"><b>📅 موعد الزيارة</b>${canEdit?`<input type="datetime-local" class="inline-status" value="${r.visit||""}" data-wf-event="change" data-wf-code="changeRequestVisit('${r.id}',this.value)">`:(r.visit?esc(new Date(r.visit).toLocaleString("ar-EG")) : "—")}</div><div class="kv"><b>🏠 التنفيذ</b>${canEdit?`<select class="inline-status" data-wf-event="change" data-wf-code="changeRequestExecutionPlace('${r.id}',this.value)">${(settings().executionPlaces||["عند العميل","الورشة"]).map(x=>`<option ${r.executionPlace===x?"selected":""}>${esc(x)}</option>`).join("")}</select>`:(r.executionPlace==="الورشة"?"🏭 الورشة":"🏠 عند العميل")}</div><div class="kv"><b>🧾 الحالة</b>${canEdit?`<select class="inline-status" data-wf-event="change" data-wf-code="changeRequestStatus('${r.id}',this.value)">${nextStatusOptions(r.status).map(x=>`<option ${r.status===x?"selected":""}>${esc(x)}</option>`).join("")}</select>`:esc(r.status)}</div>${r.status==="ملغي"&&r.cancelReason?`<div class="kv request-wide"><b>❌ سبب الإلغاء</b>${esc(r.cancelReason)}</div>`:""}${r.status==="مجمد"?`<div class="kv request-wide"><b>❄️ ملاحظة التجميد</b>${esc(r.freezeNote)||"—"}</div>`:""}<div class="kv"><b>🕐 تسجيل البلاغ</b>${requestCreatedDate(r)?esc(requestCreatedDate(r).toLocaleString("ar-EG")):"—"}${r.restartedAt?`<small style="display:block;color:var(--warn-text)">🔄 المدة بتتحسب من المرتجع: ${esc(new Date(r.restartedAt).toLocaleString("ar-EG"))}</small>`:""}</div><div class="kv"><b>▶️ بدء التنفيذ</b>${requestStartedDate(r)?esc(requestStartedDate(r).toLocaleString("ar-EG")):"—"}</div><div class="kv"><b>✅ تاريخ الوصول لمكتمل</b>${requestCompletedDate(r)?esc(requestCompletedDate(r).toLocaleString("ar-EG")):"—"}</div><div class="kv"><b>⏱️ مدة الإكمال</b>${formatDuration(requestTotalCompletionMs(r))}</div>${r.executionPlace==="الورشة"?`<div class="kv"><b>🏭 مدة تنفيذ الورشة</b>${formatDuration(requestWorkshopExecutionMs(r))}</div><div class="kv"><b>🏭 مدة بقاء الجهاز بالورشة</b>${formatDuration(requestWorkshopStayMs(r))}</div><div class="kv request-wide"><b>🏭 حالة الورشة</b>${esc(ws)}</div>`:""}<div class="kv request-wide"><b>📝 العطل</b>${canEdit?`<input type="text" class="inline-status-wide" value="${esc(r.fault||"")}" data-wf-event="change" data-wf-code="changeRequestFault('${r.id}',this.value)">`:(esc(r.fault)||"—")}${requestFaultCodeHintsHtml(r)}</div><div class="request-wide wf-ai-slot" data-ai-rid="${esc(r.id)}" style="display:none;grid-column:1/-1"></div><div class="kv request-wide"><b>🔨 الأعمال</b>${canEdit?`<textarea class="inline-status-wide" rows="2" data-wf-event="change" data-wf-code="changeRequestWork('${r.id}',this.value)">${esc(r.work||"")}</textarea>`:(esc(r.work)||"—")}</div><div class="request-account"><h3>💰 الحساب</h3><table class="month-table compact-money"><tr><td>🔨 المصنعية</td><td>${(+r.labor||0).toFixed(2)} ج</td></tr><tr><td>🔧 قطع الغيار</td><td>${(+r.partsTotal||0).toFixed(2)} ج</td></tr><tr class="total-row"><td>💰 الإجمالي</td><td>${(+r.total||0).toFixed(2)} ج</td></tr><tr><td>💵 العربون</td><td>${(+r.deposit||0).toFixed(2)} ج${r.depositWallet?` <small>(💳 ${esc(r.depositWallet)})</small>`:""}</td></tr>${(+r.depositRefunded||0)>0?`<tr><td>↩️ اترد للعميل</td><td>${(+r.depositRefunded).toFixed(2)} ج <small>(زيادة العربون عن الإجمالي)</small></td></tr>`:""}<tr><td>💳 حالة الدفع</td><td>${paid?"تم الدفع بالكامل":"غير مكتمل"}${paid&&r.closeWallet?` <small>(💳 ${esc(r.closeWallet)})</small>`:""}</td></tr></table><div class="kv" style="margin-top:8px"><b>🛡️ الضمان</b><input type="number" min="0" class="inline-status" id="warrantyDaysInput-${r.id}" value="${+r.warrantyDays||0}"> يوم <button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="confirmRequestWarrantyDays('${r.id}')">✅ تأكيد</button> ${warrantyStatusHtml(r)}</div>${typeof warrantyScopeText==="function"?`<div class="kv request-wide" style="margin-top:6px"><b>🛡️ الضمان على</b><textarea id="warrantyScopeInput-${r.id}" rows="2" class="inline-status-wide" placeholder="${esc(warrantyScopeAuto(r)||"الشغل والقطع اللي اتغيرت")}">${esc(String(r.warrantyScope||"").trim()||warrantyScopeAuto(r))}</textarea><small class="hint">${esc(WARRANTY_SCOPE_NOTE)} بيظهر للعميل في الإيصال وفي البوابة.</small> <button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="saveWarrantyScope('${r.id}')">✅ حفظ</button></div>`:""}${!r.closed&&r.status==="مكتمل"&&!paid?`<div class="form-grid"><label class="wide">💳 المتبقي هيتحصل في محفظة إيه؟ <small>اختياري — لو سايبها فاضية، المبلغ مش هيتسجل في أي محفظة</small><select id="rCloseWallet"><option value="">بدون تحديد</option>${(settings().wallets||[]).map(w=>`<option ${resolveDefaultWallet(r)===w?"selected":""}>${esc(w)}</option>`).join("")}</select></label></div><button type="button" class="primary pay-close-btn" data-wf-event="click" data-wf-code="markPaidAndClose('${r.id}')">💳 تم الدفع بالكامل وإغلاق الأمر</button>`:""}</div><div class="request-parts"><h3>🔧 قطع الغيار المستخدمة</h3>${parts||"<div class='empty-inline'>لا توجد قطع غيار مضافة.</div>"}${canEdit&&r.status==="ملغي"?`<div class="hint">❌ الأمر ملغي — قطعه رجعت المخزن. لو هتكمّل شغل عليه رجّع حالته «جديد» الأول وبعدين ضيف القطع.</div>`:""}${canEdit&&r.status!=="ملغي"&&window.wfSyncMode==="scoped"?`<a class="secondary mini-action" style="display:inline-block;margin-top:8px;text-decoration:none" href="tech.html?id=${encodeURIComponent(r.id)}">➕ إضافة قطعة (من المخزن أو من بره) من بوابة الفني</a>`:""}${canEdit&&r.status!=="ملغي"&&window.wfSyncMode!=="scoped"?`<div class="part-add request-part-add part-autocomplete-row"><div class="part-autocomplete"><input type="text" id="rpPartSearch" class="part-autocomplete-input" placeholder="🔍 اكتب اسم القطعة (مثال: ثرموستات)..." autocomplete="off" data-wf-event="input" data-wf-code="filterRequestPartOptions(this.value)" data-wf-refocus-code="filterRequestPartOptions(this.value)" data-wf-blur="hideRequestPartResults"><input type="hidden" id="rpPart"><div id="rpPartResults" class="part-autocomplete-results hidden"></div></div><input id="rpQty" type="number" min="1" value="1" inputmode="numeric"><button type="button" class="primary mini-action" data-wf-event="click" data-wf-code="confirmAddPartToRequest('${r.id}')">➕ إضافة من المخزن</button></div><div id="rpStockHint" class="hint">اختر قطعة لمعرفة الكمية المتاحة.</div><div class="part-add request-part-add part-add-external"><input id="rpExtName" type="text" placeholder="اسم القطعة (خارج المخزن)"><input id="rpExtBuy" type="number" min="0" step=".01" placeholder="سعر الشراء"><input id="rpExtSell" type="number" min="0" step=".01" placeholder="سعر البيع"><input id="rpExtQty" type="number" min="1" value="1" inputmode="numeric">${extPaySelectHtml("rpExtPay",r)}<button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="confirmAddExternalPartToRequest('${r.id}')">🧳 إضافة قطعة خارج المخزن</button></div><div class="hint">قطعة خارج المخزن: بتتسجل بسعر البيع بالكامل ضمن "قطع الغيار" واحتساب الإجمالي زي أي قطعة عادية بالظبط، وسعر الشراء بيتسجل مصروف من المكان اللي تختاره (محفظة ورشة، عهدة الفني، أو يتردّ للفني لو دفعها من جيبه). مالهاش علاقة بكمية المخزن أو بند "المصنعية".</div>`:""}</div><div id="requestProfileMedia" style="grid-column:1/-1"></div><div id="requestProfileRecordings"></div>${workshopTrack}${statusHistoryHtml(r)}</div></div>`;
  // تسجيلات مكالمات مرفقة (لو الأمر اتعمل أو اتضاف له تسجيل من صفحة
  // مشاركة مكالمة — راجع share-target.html). كل عنصر بيتخزن في
  // IndexedDB بنفس طريقة الصور بالظبط (ImageStore بيتعامل مع أي
  // dataURL، مش بس الصور). الأمر ممكن ياخد أكتر من تسجيل (لو العميل
  // اتصل أكتر من مرة على نفس العطل).
  requestMediaSection(r,canEdit);
  requestLocBind(r);
  let recs=Array.isArray(r.callRecordings)?r.callRecordings:[];
  let box=document.getElementById("requestProfileRecordings");
  if(box&&recs.length){
    let items=await Promise.all(recs.map(async(cr,i)=>{
      let src=window.ImageStore?await window.ImageStore.resolveSrc(cr.ref):"";
      if(!src)return "";
      let when=cr.at?new Date(cr.at).toLocaleString("ar-EG"):"";
      return `<div class="kv"><b>🎙️ تسجيل ${i+1}${recs.length>1?` من ${recs.length}`:""}</b>${when?`<small>${esc(when)}</small>`:""}<audio controls src="${esc(src)}" style="width:100%"></audio></div>`;
    }));
    let html=items.join("");
    if(html)box.innerHTML=`<div class="workshop-track"><h3>🎙️ تسجيلات المكالمات (${recs.length})</h3>${html}</div>`;
  }
}
/* ---------- لوكيشن الأمر وفيديو/صوت العطل ----------
   لوكيشن الأمر = اللي اتحدد على الأمر نفسه (من البوابة أو الفني) وإلا لوكيشن عنوان العميل.
   الفيديو والصوت بيترفعوا على Cloudinary (wf-media.js) والأمر بيحفظ اللينكات بس في r.media. */
function requestAddressObj(r,c){c=c||arr(K.c).find(x=>x.id===r.customerId)||{};return(r.addressKey==="extra"&&c.extraAddress&&(c.extraAddress.center||c.extraAddress.street)?c.extraAddress:c.mainAddress)||{}}
function requestLoc(r,c){if(!window.WFLoc)return null;return WFLoc.clean(r.loc)||WFLoc.clean(requestAddressObj(r,c).loc)}
function requestLocBind(r){const box=document.getElementById("rLocBox");if(!box||box.__wfBound)return;box.__wfBound=true;box.addEventListener("wfloc-change",async e=>{const l=e.detail||null;const ok=await updateRequestRecordAsync(r.id,(_,cur)=>{if(cur.closed||cur.paid)return false;if(l)cur.loc=l;else delete cur.loc;return true});
  // لو العنوان نفسه مالوش لوكيشن، بنحفظه في ملف العميل كمان عشان الأوامر الجاية.
  if(ok&&l){const cs=arr(K.c),c=cs.find(x=>x.id===r.customerId);if(c){const key=r.addressKey==="extra"&&c.extraAddress&&(c.extraAddress.center||c.extraAddress.street)?"extraAddress":"mainAddress";if(!(window.WFLoc&&WFLoc.clean((c[key]||{}).loc))){c[key]=Object.assign({},c[key]||{},{loc:l});await putAsync(K.c,cs)}}}
  if(ok)requestProfile()})}
function requestMediaBy(){try{const u=window.firebase&&firebase.apps.length&&firebase.auth().currentUser;return(u&&(u.displayName||""))||"الإدارة"}catch(e){return"الإدارة"}}
function requestMediaSection(r,canEdit){const box=document.getElementById("requestProfileMedia");if(!box||!window.WFMedia)return;const list=WFMedia.clean(r.media),key="rq-"+r.id;
  const cleared=+r.mediaCleared||0,clearedNote=cleared?`<div class="hint">🧹 اتمسح ${cleared} مرفق قديم من السحابة لتوفير المساحة.</div>`:"";
  if(!list.length&&!canEdit){box.innerHTML=cleared?`<div class="workshop-track"><h3>📎 مرفقات العطل</h3>${clearedNote}</div>`:"";return}
  WFMedia.bind(key,{max:20,count:()=>WFMedia.clean((arr(K.r).find(x=>x.id===r.id)||{}).media).length,by:requestMediaBy,
    onAdd:async it=>{const ok=await updateRequestRecordAsync(r.id,(_,cur)=>{cur.media=WFMedia.clean(cur.media).concat(it);return true});if(ok)requestProfile();else alert("اترفع الملف بس تعذّر حفظه في الأمر. جرّب تاني.")},
    onRemove:async i=>{const ok=await updateRequestRecordAsync(r.id,(_,cur)=>{const m=WFMedia.clean(cur.media);m.splice(i,1);if(m.length)cur.media=m;else delete cur.media;return true});if(ok)requestProfile()}});
  box.innerHTML=`<div class="workshop-track"><h3>📎 صور وفيديو وصوت العطل${list.length?` (${list.length})`:""}</h3>${WFMedia.listHtml(list,{removable:canEdit,key,empty:'<div class="hint">مفيش مرفقات. ممكن تضيف صور أو فيديو أو تسجيل صوت للعطل — والعميل يقدر يبعتهم من البوابة مع الطلب.</div>'})}${clearedNote}${canEdit?WFMedia.actsHtml(key):""}</div>`}
async function requestWorkshopPull(i){let r=arr(K.r).find(x=>String(x.id)===String(i));if(!r||r.closed||r.paid)return;if(r.workshopStatus&&r.workshopStatus!=="غير مطلوب")return;if(!confirm("تأكيد سحب الجهاز إلى الورشة؟"))return;const saved=await updateRequestRecordAsync(i,(_,current)=>{if(current.closed||current.paid||(current.workshopStatus&&current.workshopStatus!=="غير مطلوب"))return false;let now=new Date().toISOString();current.executionPlace="الورشة";current.workshopStatus="تم السحب";current.workshopAt=now;current.pulledAt=now;if(!current.workshopEnteredAt)current.workshopEnteredAt=now;if(current.status==="جاري التنفيذ"&&!current.workshopStartedAt)current.workshopStartedAt=current.startedAt||now;return true});if(saved)requestProfile()}
async function setWorkshopStatus(i,status){const saved=await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;let now=new Date().toISOString();r.executionPlace="الورشة";r.workshopStatus=status;r.workshopAt=now;if(status==="تم السحب"&&!r.workshopEnteredAt)r.workshopEnteredAt=now;if(r.status==="جاري التنفيذ"&&!r.workshopStartedAt)r.workshopStartedAt=r.startedAt||now;return true});if(saved)requestProfile()}

function filterRequestPartOptions(q){
  const box=document.getElementById("rpPartResults");if(!box)return;
  const hidden=document.getElementById("rpPart");
  if(hidden)hidden.value="";
  syncRequestPartQty();
  q=String(q??document.getElementById("rpPartSearch")?.value??"").trim();
  const list=arr(K.p).filter(p=>!p.archived);
  const qLower=q.toLowerCase();
  const matches=(q?list.filter(p=>(p.name||"").toLowerCase().includes(qLower)||(p.code||"").toLowerCase().includes(qLower)):list).slice(0,50);
  let html=matches.length?matches.map(p=>`<div class="part-ac-item" data-value="${esc(p.id)}"><b>${esc(p.name)}</b><span>${(+p.use||0).toFixed(2)} ج — ${+p.qty||0} متاح</span></div>`).join(""):'<div class="part-ac-empty">لا توجد أصناف مطابقة.</div>';
  if(q&&!list.some(p=>(p.name||"").toLowerCase()===qLower)){
    html+=`<div class="part-ac-item ac-add-new" data-addpart="${esc(q)}"><b>➕ إضافة "${esc(q)}" كقطعة جديدة للمخزن</b></div>`;
  }
  box.innerHTML=html;
  box.querySelectorAll("[data-value]").forEach(item=>{item.onmousedown=()=>selectRequestPart(item.dataset.value)});
  box.querySelectorAll("[data-addpart]").forEach(item=>{item.onmousedown=()=>{box.classList.add("hidden");openQuickAddPart(item.dataset.addpart,{anchor:"rpPartResults",onCreated:p=>selectRequestPart(p.id)})}});
  box.classList.remove("hidden");
}
function selectRequestPart(pid){
  const p=arr(K.p).find(x=>x.id===pid);if(!p)return;
  const hidden=document.getElementById("rpPart"),search=document.getElementById("rpPartSearch"),box=document.getElementById("rpPartResults");
  if(hidden)hidden.value=pid;
  if(search)search.value=p.name;
  if(box)box.classList.add("hidden");
  syncRequestPartQty();
}
function hideRequestPartResults(){setTimeout(()=>document.getElementById("rpPartResults")?.classList.add("hidden"),150)}
function syncRequestPartQty(){let hiddenEl=document.getElementById("rpPart"),q=document.getElementById("rpQty"),h=document.getElementById("rpStockHint"),selectedId=hiddenEl?.value||"",available=+(arr(K.p).find(x=>x.id===selectedId)?.qty||0);if(q&&selectedId){q.max=Math.max(1,available);q.value=Math.min(Math.max(1,+q.value||1),Math.max(1,available));if(available<1)q.value=0}if(h)h.textContent=selectedId?`المتاح في المخزن: ${available} قطعة — سيتم استخدام الكمية المكتوبة فقط.`:"اكتب اسم القطعة واختر من نتائج البحث لمعرفة الكمية المتاحة."}
async function confirmAddPartToRequest(requestId){return withRequestMutationLock(requestId,async()=>{let rs=arr(K.r),r=rs.find(x=>String(x.id)===String(requestId));if(!r)return alert("أمر الشغل غير موجود.");if(r.closed||r.paid)return alert("الأمر مغلق أو مدفوع بالكامل ولا يمكن إضافة قطع غيار.");if(r.status==="ملغي")return alert("الأمر ملغي — رجّع حالته «جديد» الأول وبعدين ضيف القطع.");let pid=document.getElementById("rpPart")?.value||"";if(!pid)return alert("اكتب اسم القطعة واختر واحدة من نتائج البحث أولًا ثم اضغط تأكيد إضافة القطعة.");let q=+(document.getElementById("rpQty")?.value||1),stock=arr(K.p),p=stock.find(x=>x.id===pid),available=+(p?.qty||0);if(!p)return alert("قطعة الغيار المختارة غير موجودة في المخزن.");if(!Number.isInteger(q)||q<1)return alert("اكتب كمية صحيحة كعدد صحيح.");let updatedParts=(r.parts||[]).map(x=>({...x})),existing=updatedParts.find(x=>!x.external&&x.partId===pid&&+x.sell===+p.use&&+x.cost===+p.buy),already=existing?(+existing.qty||0):0;if(available<q)return alert(`الكمية المطلوبة ${q} أكبر من المتاح ${available}.`);if(existing)existing.qty=already+q;else updatedParts.push({partId:pid,qty:q,sell:+p.use||0,cost:+p.buy||0});let partsTotal=partsStockTotal(updatedParts),partsCost=partsStockCost(updatedParts),total=(+r.labor||0)+partsTotal;let newStock=stock.map(x=>x.id===pid?{...x,qty:(+x.qty||0)-q}:x),moves=arr(K.m);moves.push({id:id(),partId:pid,type:"خروج بسبب إضافة قطعة لأمر شغل",qty:q,requestId:r.id,at:new Date().toISOString()});let updated={...r,parts:updatedParts,partsTotal,partsCost,total,remain:orderRemainAmt({...r,total})};if(!await commitStorageAsync({[K.p]:newStock,[K.m]:moves,[K.r]:rs.map(x=>x.id===r.id?updated:x)}))return;requestProfile();return true})}
async function confirmAddExternalPartToRequest(requestId){let nameEl=document.getElementById("rpExtName"),buyEl=document.getElementById("rpExtBuy"),sellEl=document.getElementById("rpExtSell"),qtyEl=document.getElementById("rpExtQty");let name=(nameEl?.value||"").trim();if(!name)return alert("اكتب اسم القطعة.");let cost=+(buyEl?.value||0),sell=+(sellEl?.value||0),q=+(qtyEl?.value||1);if(!Number.isInteger(q)||q<1){alert("اكتب كمية صحيحة كعدد صحيح.");return}if(!Number.isFinite(cost)||cost<0||!Number.isFinite(sell)||sell<0)return alert("اكتب أسعار صحيحة.");if((arr(K.r).find(x=>String(x.id)===String(requestId))||{}).status==="ملغي")return alert("الأمر ملغي — رجّع حالته «جديد» الأول وبعدين ضيف القطع.");const ord0=arr(K.r).find(x=>String(x.id)===String(requestId)),pick=extPayPick(document.getElementById("rpExtPay")?.value,ord0,cost*q);if(!pick)return alert("اختار تمن القطعة اتدفع منين (محفظة، عهدة الفني، من جيب الفني، أو مفيش مصروف).");const newPart={external:true,name,qty:q,sell,cost,payKey:id(),addedBy:"admin",...pick};let oldParts=[];const saved=await updateRequestRecordAsync(requestId,(_,r)=>{if(r.closed||r.paid)return false;oldParts=(r.parts||[]).map(x=>({...x}));let updatedParts=(r.parts||[]).map(x=>({...x}));updatedParts.push(newPart);let partsTotal=partsStockTotal(updatedParts),partsCost=partsStockCost(updatedParts),total=(+r.labor||0)+partsTotal;r.parts=updatedParts;r.partsTotal=partsTotal;r.partsCost=partsCost;r.total=total;r.remain=orderRemainAmt({...r,total});return true});if(!saved){alert("تعذر حفظ إضافة القطعة. لم يتم تغيير أمر الشغل.");return}syncExtPartPayments(arr(K.r).find(x=>String(x.id)===String(requestId)),oldParts);if(nameEl)nameEl.value="";if(buyEl)buyEl.value="";if(sellEl)sellEl.value="";if(qtyEl)qtyEl.value=1;requestProfile()}
// markPaidAndClose / closeOrder: اتنقلوا لنسخة واحدة موحّدة في app-shared.js
// (بيتحمّل قبل الملف ده في كل صفحة) بدل ما يتكرروا هنا وفي
// workshop-mini-simple-ui.js بنفس المنطق بالظبط.
function editCustomer(i){location.href="customers.html?edit="+encodeURIComponent(i)}
function editDevice(i){location.href="devices.html?edit="+encodeURIComponent(i)}
function editPart(i){location.href="inventory.html?edit="+encodeURIComponent(i)}
function applyStatusTimestamp(r,newStatus){
  const now=new Date().toISOString();
  r.statusHistory=Array.isArray(r.statusHistory)?r.statusHistory:[];
  if(newStatus==="جاري التنفيذ"){
    if(!r.startedAt)r.startedAt=now;
    if(r.executionPlace==="الورشة"&&!r.workshopStartedAt)r.workshopStartedAt=now;
  }
  if(newStatus==="مكتمل"){
    r.completedAt=now;
    if(r.executionPlace==="الورشة"&&!r.workshopStartedAt){
      r.workshopStartedAt=r.startedAt||now;
    }
  }
  // عند إعادة فتح الأمر لا نمسح التوقيتات القديمة؛ آخر تاريخ مكتمل يظل
  // متاحًا للتحليل، وسجل الحالة يحتفظ بكل دورة انتقال.
}
async function changeRequestStatus(i,status){
  return withRequestMutationLock(i,async()=>{
    let a=arr(K.r),r=a.find(x=>String(x.id)===String(i));
    if(!r||r.closed||r.paid)return;
    if(status===r.status)return;
    if(!canTransitionStatus(r.status,status)){alert(`لا يمكن الانتقال من حالة «${r.status}» إلى «${status}» مباشرة.`);renderRequests();requestProfile();return}
    let from=r.status,reason="",freezeNote="";
    if(status==="ملغي"){
      reason=askCancelReason();
      if(reason===null){renderRequests();requestProfile();return}
      if(!reason){alert("سبب الإلغاء مطلوب لإلغاء أمر الشغل.");renderRequests();requestProfile();return}
      if((+r.deposit||0)>0&&String(r.depositWallet||"").trim()&&!confirm(`الأمر عليه عربون ${(+r.deposit).toFixed(2)} ج في محفظة «${r.depositWallet}» وهيفضل محسوب في رصيدها بعد الإلغاء. لو هترجّعه للعميل سجّل صرف يدوي من المحفظة. تكمّل الإلغاء؟`)){renderRequests();requestProfile();return}
    }
    if(status==="مجمد"){
      freezeNote=prompt("ملاحظة التجميد (اختياري) — مثلاً: العميل مش بيرد بعد وصول القطعة:","");
      if(freezeNote===null){renderRequests();requestProfile();return}
      freezeNote=freezeNote.trim();
    }
    if(from==="ملغي"&&status==="جديد"&&!confirm("تأكيد إعادة فتح أمر الشغل الملغي؟")){renderRequests();requestProfile();return}
    if(from==="مكتمل"&&status==="جاري التنفيذ"&&!confirm("تأكيد إعادة فتح أمر الشغل المكتمل عند الحاجة؟")){renderRequests();requestProfile();return}
    const stockTouched=status==="ملغي"||(from==="ملغي"&&status==="جديد");
    const stock=arr(K.p),moves=arr(K.m);
    if(stockTouched){
      const adjusted=status==="ملغي"?adjustStockForOrder(r.parts||[],[],r.id,stock,moves):adjustStockForOrder([],r.parts||[],r.id,stock,moves);
      if(!adjusted){alert("تعذر إعادة فتح الأمر: قطع الغيار المستخدمة فيه لم تعد متاحة بنفس الكمية في المخزن.");renderRequests();requestProfile();return}
    }
    r.status=status;
    applyStatusTimestamp(r,status);
    if(from==="مجمد"&&status!=="مجمد"){
      r.frozenMs=(+r.frozenMs||0)+(r.frozenAt?Math.max(0,Date.now()-new Date(r.frozenAt).getTime()):0);
      r.frozenAt=null;
    }
    if(status==="مجمد"){r.frozenAt=new Date().toISOString();r.freezeNote=freezeNote}
    if(status==="ملغي"){r.cancelReason=reason;r.cancelledAt=new Date().toISOString()}
    if(from==="ملغي"&&status==="جديد"){r.cancelReason="";r.cancelledAt=null;r.reopenedAt=new Date().toISOString()}
    recordStatusHistory(r,from,status,status==="مجمد"?freezeNote:(status==="ملغي"?reason:""));
    const values={[K.r]:a};
    if(stockTouched){values[K.p]=stock;values[K.m]=moves}
    if(!await commitStorageAsync(values)){renderRequests();requestProfile();return}
    window.auditLog?.("تغيير حالة", "أمر شغل", r.id, `${from} ← ${status}`);renderRequests();renderDash();requestProfile();return true;
  });
}
/* سبب الإلغاء: أسباب جاهزة برقم (عشان تقرير «المعاينات اللي ماتحولتش لشغل» يجمّعها صح) أو تكتب سبب من عندك. */
const CANCEL_REASONS=["السعر عالي على العميل","العميل اتراجع / مش عايز يصلّح","القطعة مش متوفرة","الجهاز مايستاهلش التصليح","العميل مابيردّش","أمر مكرر / اتسجل بالغلط"];
function askCancelReason(){
  let v=prompt("سبب إلغاء أمر الشغل (مطلوب) — اكتب رقم أو سبب من عندك:\n"+CANCEL_REASONS.map((x,i)=>(i+1)+") "+x).join("\n"),"");
  if(v===null)return null;
  v=String(v).trim().replace(/[\u0660-\u0669]/g,c=>String(c.charCodeAt(0)-1632));
  if(/^\d+$/.test(v)&&CANCEL_REASONS[+v-1])return CANCEL_REASONS[+v-1];
  return v;
}
// إعادة فتح أمر شغل "مكتمل" كمرتجع: بيرجّعه لحالة "جاري التنفيذ" (نفس الانتقال
// المعتمد في دورة الحالة) عشان تقدر تفعّله أو تعدّل عليه، مع تسجيل سبب/ملاحظة
// المرتجع في سجل تغييرات الحالة. مفيش حالة جديدة اتضافت والدورة المعتمدة
// (WORK_ORDER_LIFECYCLE_APPROVED.md) متغيّرتش.
async function markRequestReturned(i){
  return withRequestMutationLock(i,async()=>{
    let a=arr(K.r),r=a.find(x=>String(x.id)===String(i));
    if(!r)return;
    if(r.status!=="مكتمل")return;
    if(!canReturnRequest(r)){
      if(r.closed){let d=settings().returnWindowDays||7;alert(`انتهت مهلة المرتجع (${d} يوم من تاريخ الإغلاق) لهذا الأمر — لم يعد يمكن إرجاعه أو التعديل عليه.`)}
      return;
    }
    if(!canTransitionStatus(r.status,"جاري التنفيذ")){alert(`لا يمكن الانتقال من حالة «${r.status}» إلى «جاري التنفيذ» مباشرة.`);return}
    const fin=r.closed?arr(K.wtx).find(x=>x&&x.refKey==="order-final-"+r.id&&!x.deleted):null;
    const collected=r.closed?(fin?(+fin.amount||0):orderRemainAmt(r)):0;
    const finWallet=fin?String(fin.wallet||"").trim():String(r.closeWallet||"").trim();
    let choice="none",refund=0;
    if(r.closed&&collected>0){
      const where=finWallet?` في «${finWallet}»`:" (من غير محفظة)";
      if(confirm(`الأمر ده اتحصّل فيه ${collected.toFixed(2)} ج${where}. عايز إيه يحصل في الفلوس دي؟\n\n✅ موافق = تتحوّل لعربون على الأمر (تفضل في المحفظة ومش هتتحصّل تاني لما تقفله).\n❌ إلغاء = خيارات تانية (رد الفلوس للعميل / من غير تسجيل).`)){
        choice="deposit";
      }else if(confirm(`الفلوس اتردّت للعميل فعلًا؟\n\n✅ موافق = أسجّل رد فلوس (المبلغ المردود بيتشال من رصيد المحفظة، وأي باقي بيتحوّل لعربون).\n❌ إلغاء = من غير تسجيل أي حاجة.`)){
        const v=prompt(`المبلغ اللي اتردّ للعميل (أقصى ${collected.toFixed(2)} ج، والباقي لو فيه بيتحوّل لعربون):`,String(collected));
        if(v===null)return;
        const n=typeof parseAmountInput==="function"?parseAmountInput(v):+v;
        if(!(n>0)||n>collected+0.001){alert("مبلغ الرد لازم يكون أكبر من صفر ومايزيدش عن المبلغ المحصّل.");return}
        choice="refund";refund=Math.min(n,collected);
      }else if(!confirm(`مفيش تحويل لعربون ولا تسجيل رد: التحصيل (${collected.toFixed(2)} ج) هيتشال من الرصيد تلقائيًا.\n\nلو الفلوس لسه معاك فالرصيد في التطبيق هيبقى أقل من الفعلي لحد ما تقفل الأمر تاني.\n\nمتابعة؟`))return;
    }
    const opts=await returnOptionsDialog(r);
    if(!opts)return;
    let reason=opts.reason;
    // الحوار بياخد وقت: نقرا الأوامر من جديد عشان مانكتبش فوق أي تعديل حصل في الوقت ده (مزامنة/جهاز تاني)
    a=arr(K.r);r=a.find(x=>String(x.id)===String(i));
    if(!r||r.status!=="مكتمل"){alert("الأمر اتغيّر في الوقت ده — حدّث الصفحة وجرّب تاني.");return}
    let from=r.status,wasClosed=!!r.closed;
    r.status="جاري التنفيذ";
    let depAmount=0,separate=false;
    if(wasClosed){
      r.closed=false;r.paid=false;
      r.reopenedAt=new Date().toISOString();r.reopenedFromClosedAt=r.closedAt||"";
      r.closedAt=null;r.paidAt=null;r.closeWallet="";
      depAmount=choice==="deposit"?collected:(choice==="refund"?Math.max(0,collected-refund):0);
      if(depAmount>0&&typeof applyAdditionalDeposit==="function")separate=applyAdditionalDeposit(r,depAmount,finWallet).separate;
      else depAmount=0;
      r.remain=orderRemainAmt(r);
      if(choice!=="none")r.returnMoney={choice,collected,refund,at:r.reopenedAt};
    }
    applyReturnOptions(r,opts);
    applyStatusTimestamp(r,r.status);
    const moneyNote=choice==="deposit"?` — التحصيل ${collected.toFixed(2)} ج اتحوّل لعربون`:(choice==="refund"?` — اتردّ ${refund.toFixed(2)} ج للعميل${depAmount>0?` والباقي ${depAmount.toFixed(2)} ج اتحوّل لعربون`:""}`:"");
    recordStatusHistory(r,from,r.status,`مرتجع${wasClosed?" (كان مغلقًا)":""}: ${reason}${moneyNote}${opts.note?" — "+opts.note:""}`);
    const values={[K.r]:a};
    if(wasClosed){
      if(typeof walletTxEntriesForOrderReturn!=="function"){alert("تعذر تجهيز حركة المحفظة للمرتجع؛ لم يتم تغيير الأمر.");return}
      values[K.wtx]=walletTxEntriesForOrderReturn(r,arr(K.wtx),depAmount,finWallet,separate);
    }
    if(!await commitStorageAsync(values)){alert("تعذر حفظ المرتجع وتحديث الحركة المالية معًا؛ لم يتم تغيير الأمر.");return}
    window.auditLog?.("إرجاع أمر", "أمر شغل", r.id, reason+moneyNote);renderRequests();renderDash();requestProfile();return true;
  });
}


/* ---------- اختيارات المرتجع: الفني، موعد الزيارة، وبداية حساب مدة الأمر ---------- */
function returnOptionsDialog(r){
  const D=typeof document!=="undefined"?document:null;
  // بيئة من غير واجهة (اختبارات/صفحة قديمة): السبب بس، والباقي زي ما هو
  if(!D||!D.body||typeof D.createElement!=="function"||typeof D.body.appendChild!=="function"){
    let reason=prompt("سبب/ملاحظة المرتجع (مطلوب):","");if(reason===null)return Promise.resolve(null);reason=reason.trim();
    if(!reason){alert("سبب/ملاحظة المرتجع مطلوبة.");return Promise.resolve(null)}
    return Promise.resolve({reason,tech:"keep",visit:"keep",restart:false});
  }
  const dirP=window.WFTech&&typeof window.WFTech.directory==="function"?window.WFTech.directory().catch(()=>[]):Promise.resolve([]);
  return dirP.then(users=>new Promise(resolve=>{
    const techs=(users||[]).filter(u=>u&&u.uid&&(u.scope==="assigned"||u.wallet||u.uid===r.techId));
    const visitTxt=r.visit?new Date(r.visit).toLocaleString("ar-EG",{weekday:"long",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"مفيش موعد";
    const started=r.startedAt?new Date(r.startedAt).toLocaleDateString("ar-EG"):"";
    // حساب الفني: للي عنده صلاحية أجور الفنيين، ولو الأمر عليه فني أو أجرة
    const TP=window.WFTechPay,canPay=!!(TP&&TP.canPay&&TP.canPay()),curPay=+r.techPay||0,types=canPay?(TP.config().types||[]):[];
    const payBoxHtml=canPay&&(r.techId||curPay)?`<div class="rd-g" id="rdPayBox"><b>💰 حساب الفني على الأمر</b><small class="hint">الأجرة الحالية: ${curPay.toFixed(2)} ج${r.techName?" — "+esc(r.techName):""}</small>
        <label><input type="radio" name="rdPay" value="later" checked><span><b style="display:inline">قرّر بعدين</b> — بعد ما الفني يكشف وتعرف غلط مين أو عطل تاني (الأجرة بتتعلّق لحد ما تحددها من صفحة الأمر)</span></label>
        <label><input type="radio" name="rdPay" value="same"><span><b style="display:inline">نفس الحساب</b> — الأجرة تفضل زي ما هي وتتحسب مرة واحدة لما الأمر يتقفل تاني (ضمان من غير زيادة)</span></label>
        <label><input type="radio" name="rdPay" value="split"><span><b style="display:inline">حساب جديد للمرتجع</b> — الشغل الأول يتحسب لوحده دلوقتي، وزيارة المرتجع ليها أجرة لوحدها</span></label>
        <div class="rd-sub" id="rdSplit">
          ${r.techId?`<label><span>أجرة الشغل الأول لـ ${esc(r.techName||"الفني")}:</span><select id="rdFirst"><option value="full">كاملة (${curPay.toFixed(2)} ج)</option><option value="deduct">يتخصم منها مبلغ…</option><option value="none">تتلغي (الغلط من الفني)</option></select><input type="number" id="rdFirstAmt" min="0" step="any" inputmode="decimal" placeholder="مبلغ الخصم" style="display:none"></label>`:""}
          <label><span>أجرة شغل المرتجع (للفني اللي هيكمل):</span><select id="rdNew"><option value="zero">من غير أجرة (ضمان)</option><option value="amount">مبلغ محدد…</option>${types.length?`<option value="type">حسب نوع الشغل…</option>`:""}</select><input type="number" id="rdNewAmt" min="0" step="any" inputmode="decimal" placeholder="المبلغ" style="display:none">${types.length?`<select id="rdNewType" style="display:none">${types.map(t=>`<option value="${escAttr(t.id)}">${esc(t.name)}</option>`).join("")}</select>`:""}</label>
          <small class="hint">الخصم ممكن يزيد عن الأجرة: الزيادة بتتخصم من مستحقاته.</small>
        </div></div>`:"";
    const m=D.createElement("div");m.className="txd-modal";m.id="returnDialog";
    m.innerHTML=`<div class="txd-sheet rd-sheet" role="dialog" aria-label="مرتجع أمر الشغل"><div class="txd-title">🔄 مرتجع أمر ${esc(r.no||"")}</div>
      <label class="rd-l">سبب/ملاحظة المرتجع (مطلوب)<textarea id="rdReason" rows="2" placeholder="مثلًا: العطل رجع تاني بعد يومين"></textarea></label>
      <div class="rd-g"><b>👷 الفني</b>
        ${r.techId?`<label><input type="radio" name="rdTech" value="keep" checked><span>يفضل مع ${esc(r.techName||"نفس الفني")}</span></label>`:""}
        ${techs.filter(u=>u.uid!==r.techId).length?`<label><input type="radio" name="rdTech" value="other" ${r.techId?"":"checked"}> فني تاني: <select id="rdTechSel">${techs.filter(u=>u.uid!==r.techId).map(u=>`<option value="${escAttr(u.uid)}">${esc(u.name||u.uid)}</option>`).join("")}</select></label>`:""}
        <label><input type="radio" name="rdTech" value="none" ${!r.techId&&!techs.length?"checked":""}><span>من غير فني (يتحدد بعدين من «التوزيع»)</span></label></div>
      <div class="rd-g"><b>📅 موعد الزيارة</b>
        <label><input type="radio" name="rdVisit" value="keep" ${r.visit?"checked":""}><span>يفضل زي ما هو (${esc(visitTxt)})</span></label>
        <label><input type="radio" name="rdVisit" value="new"> موعد جديد: <input type="datetime-local" id="rdVisitVal"></label>
        <label><input type="radio" name="rdVisit" value="clear" ${r.visit?"":"checked"}><span>من غير موعد (يظهر في «بدون موعد» لحد ما تحدده)</span></label></div>
      ${payBoxHtml}
      <div class="rd-g"><b>⏱️ مدة الأمر</b>
        <label><input type="radio" name="rdStart" value="keep" checked><span>تكمّل من بداية الأمر الأصلية${started?` (بدأ ${esc(started)})`:""}</span></label>
        <label><input type="radio" name="rdStart" value="restart"><span>تبدأ من جديد من النهارده (عمر الأمر ومدد التنفيذ تتحسب من المرتجع)</span></label></div>
      <p class="hint" id="rdMsg" style="color:var(--danger-text)"></p>
      <div class="txd-actions"><button type="button" class="primary" id="rdOk">✅ تأكيد المرتجع</button><button type="button" class="secondary" id="rdCancel">إلغاء</button></div></div>`;
    const done=v=>{m.remove();resolve(v)};
    D.body.appendChild(m);
    const q=s=>m.querySelector(s),val=n=>(m.querySelector(`input[name="${n}"]:checked`)||{}).value;
    if(!m.querySelector('input[name="rdTech"]:checked')){const f=m.querySelector('input[name="rdTech"]');if(f)f.checked=true}
    q("#rdVisitVal").addEventListener("input",()=>{q('input[name="rdVisit"][value="new"]').checked=true});
    if(q("#rdTechSel"))q("#rdTechSel").addEventListener("change",()=>{q('input[name="rdTech"][value="other"]').checked=true});
    const syncPay=()=>{const box=q("#rdSplit");if(!box)return;const on=val("rdPay")==="split";box.style.display=on?"":"none";
      const f=q("#rdFirst"),fa=q("#rdFirstAmt");if(f&&fa)fa.style.display=f.value==="deduct"?"":"none";
      const nw=q("#rdNew"),na=q("#rdNewAmt"),nt=q("#rdNewType");if(nw){if(na)na.style.display=nw.value==="amount"?"":"none";if(nt)nt.style.display=nw.value==="type"?"":"none"}};
    m.querySelectorAll('input[name="rdPay"],#rdFirst,#rdNew').forEach(e=>e.addEventListener("change",syncPay));
    // تغيير الفني مع «نفس الحساب» يخلّي أجرة الشغل الأول تروح للفني الجديد: بنحوّلها لحساب جديد تلقائي
    m.querySelectorAll('input[name="rdTech"]').forEach(e=>e.addEventListener("change",()=>{const sp=q('input[name="rdPay"][value="same"]'),lt=q('input[name="rdPay"][value="later"]');if(sp&&sp.checked&&val("rdTech")!=="keep"&&lt){lt.checked=true;syncPay()}}));
    syncPay();
    q("#rdCancel").onclick=()=>done(null);
    m.addEventListener("click",e=>{if(e.target===m)done(null)});
    q("#rdOk").onclick=()=>{
      const reason=q("#rdReason").value.trim();if(!reason){q("#rdMsg").textContent="اكتب سبب المرتجع.";q("#rdReason").focus();return}
      const tech=val("rdTech")||"keep",visit=val("rdVisit")||"keep",restart=val("rdStart")==="restart";
      const visitVal=q("#rdVisitVal").value;if(visit==="new"&&!visitVal){q("#rdMsg").textContent="اختار الموعد الجديد.";return}
      const sel=tech==="other"?techs.find(u=>u.uid===(q("#rdTechSel")||{}).value):null;
      if(tech==="other"&&!sel){q("#rdMsg").textContent="اختار الفني.";return}
      let pay=q("#rdPayBox")&&val("rdPay")==="later"?{mode:"later"}:null;
      if(q("#rdPayBox")&&val("rdPay")==="split"){
        const first=q("#rdFirst")?q("#rdFirst").value:"none",firstAmt=+((q("#rdFirstAmt")||{}).value||0),nw=q("#rdNew").value,newAmt=+((q("#rdNewAmt")||{}).value||0),newType=(q("#rdNewType")||{}).value||"";
        if(first==="deduct"&&!(firstAmt>0)){q("#rdMsg").textContent="اكتب مبلغ الخصم.";return}
        if(nw==="amount"&&!(newAmt>=0&&(q("#rdNewAmt")||{}).value!=="")){q("#rdMsg").textContent="اكتب أجرة شغل المرتجع.";return}
        pay={mode:"split",first,firstAmt,nw,newAmt,newType};
      }
      done({reason,tech,techUser:sel,visit,visitVal,restart,pay});
    };
    setTimeout(()=>{try{q("#rdReason").focus()}catch(_){}},50);
  }));
}
/* قرار حساب الفني في المرتجع (وقت المرتجع أو بعد الكشف):
   الشغل الأول → حصة ثابتة للفني الأولاني (كاملة/بخصم/تتلغي)، وشغل المرتجع → أجرة الأمر الحالية (ضمان/مبلغ/نوع شغل) */
function applyReturnPayDecision(r,p,oldTech,oldPay){
  const now=new Date().toISOString(),r2=n=>Math.round((+n||0)*100)/100,shares=Array.isArray(r.payShares)?r.payShares.slice():[];
  let idx=-1;for(let k=shares.length-1;k>=0;k--){if(shares[k]&&shares[k].pending){idx=k;break}}
  const tech=idx>=0?{uid:shares[idx].uid,name:shares[idx].name}:(oldTech||{}),base=idx>=0?(+shares[idx].base||0):(+oldPay||0),notes=[];
  if(tech.uid){
    const amt=p.first==="full"?base:(p.first==="deduct"?r2(base-p.firstAmt):0);
    const label=p.first==="full"?"أجرة الشغل الأول (قبل المرتجع)":(p.first==="deduct"?`أجرة الشغل الأول بعد خصم ${r2(p.firstAmt)} ج (مرتجع)`:"أجرة الشغل الأول اتلغت (مرتجع)");
    const sh={uid:tech.uid,name:tech.name,amount:amt,base,note:label,at:idx>=0?shares[idx].at:now,decidedAt:now};
    if(idx>=0)shares[idx]=sh;else shares.push(sh);
    r.payShares=shares;r.payShareUids=Array.from(new Set((r.payShareUids||[]).concat(tech.uid)));
    notes.push(`${tech.name||"الفني"}: ${label} = ${amt.toFixed(2)} ج`);
  }
  if(p.nw==="type"&&p.newType&&window.WFTechPay){r.jobType=p.newType;r.jobTypeName=window.WFTechPay.typeName(p.newType);r.techPayManual=false;r.techPay=r.techId?window.WFTechPay.payFor(p.newType,r.techId):0}
  else{r.techPay=p.nw==="amount"?r2(p.newAmt):0;r.techPayManual=true}
  r.techPayAt=now;r.returnPayPending=false;
  notes.push(`أجرة شغل المرتجع: ${(+r.techPay||0).toFixed(2)} ج`);
  return notes.join("، ");
}
function applyReturnOptions(r,o){
  const now=new Date().toISOString(),notes=[],oldTech={uid:r.techId||"",name:r.techName||""},oldPay=+r.techPay||0;
  if(o.tech==="other"&&o.techUser){
    const u=o.techUser;notes.push(`الفني اتغيّر من ${r.techName||"—"} لـ ${u.name||u.uid}`);
    r.techId=u.uid;r.techName=u.name||"";r.techWallet=u.wallet||"";r.assignedAt=now;r.assignedBy=(window.firebase&&window.firebase.auth&&window.firebase.auth().currentUser||{}).uid||"";
    if(r.jobType&&!r.techPayManual&&window.WFTechPay)r.techPay=window.WFTechPay.payFor(r.jobType,u.uid);
  }else if(o.tech==="none"&&r.techId){
    notes.push(`اتشال تعيين ${r.techName||"الفني"}`);r.techId="";r.techName="";r.techWallet="";r.assignedAt=now;
  }
  if(o.pay&&o.pay.mode==="later"&&oldTech.uid&&oldPay!==0){ // الأجرة بتتعلّق: الشغل الأول محفوظ لحساب الفني الأولاني لحد القرار
    r.payShares=(Array.isArray(r.payShares)?r.payShares:[]).concat({uid:oldTech.uid,name:oldTech.name,amount:0,base:oldPay,pending:true,note:"أجرة الشغل الأول — مستنية قرار المرتجع",at:now});
    r.payShareUids=Array.from(new Set((r.payShareUids||[]).concat(oldTech.uid)));
    r.techPay=0;r.techPayManual=true;r.returnPayPending=true;r.techPayAt=now;
    notes.push("حساب الفني: هيتحدد بعد الكشف");
  }else if(o.pay&&o.pay.mode==="split"){notes.push(applyReturnPayDecision(r,o.pay,oldTech,oldPay))}
  if(o.visit==="new"){r.visit=o.visitVal;notes.push("موعد جديد")}
  else if(o.visit==="clear"){r.visit="";notes.push("من غير موعد")}
  if(o.restart){
    r.restartedAt=now;r.startedAt=now;r.completedAt=null;r.frozenMs=0;r.frozenAt=null;
    if(r.executionPlace==="الورشة")r.workshopStartedAt=now;else delete r.workshopStartedAt;
    notes.push("المدة بدأت من جديد");
  }
  o.note=notes.join("، ");
  return r;
}
async function changeRequestVisit(i,val){if(await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;r.visit=val;return true})){requestProfile();renderRequests()}}
// تعديل مكان التنفيذ/العطل/الأعمال المنفذة كانوا نص ثابت مالهوش أي تحكم في
// صفحة عرض الأمر — أي تغيير كان لازم يدخل على وضع التعديل الكامل من فوق.
// دلوقتي بقوا قابلين للتعديل مباشرة هنا (زي التصنيف اليدوي وموعد الزيارة
// بالظبط)، بنفس شرط canEdit (الأمر لسه مش مقفول أو متحصّل بالكامل).
async function changeRequestExecutionPlace(i,val){if(await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;r.executionPlace=val;return true})){requestProfile();renderRequests()}}
async function changeRequestFault(i,val){if(await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;r.fault=val;return true})){requestProfile();renderRequests()}}
async function changeRequestWork(i,val){if(await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;r.work=val;return true})){requestProfile();renderRequests()}}
// مدة الضمان قابلة للتعديل دايمًا (حتى لو الأمر مقفول) — عكس باقي حقول
// أمر الشغل، لأن الضمان أصلاً حاجة بتتحدد وتتعدّل بعد التقفيل، مش قبله.
// بيتحسب من تاريخ التقفيل لو موجود، وإلا من دلوقتي.
async function changeRequestWarrantyDays(i,val){
  let days=+val;if(!Number.isFinite(days)||days<0)days=0;
  const saved=await updateRequestRecordAsync(i,(_,r)=>{
    let base=r.closedAt?new Date(r.closedAt):new Date();
    r.warrantyDays=days;
    r.warrantyUntil=days>0?new Date(base.getTime()+days*86400000).toISOString():"";
  // علّم إن المدة دي اتحددت يدويًا (حتى لو صفر لأمر كشف/معاينة) عشان
  // تقفيل الأمر (markPaidAndClose) ميرجعش يكتب فوقها المدة الافتراضية
  // من الإعدادات تاني. من غير العلامة دي، تعديلك اليدوي كان بيتمسح
  // ويرجع للمدة الافتراضية بمجرد ما تقفل الأمر.
    r.warrantyManual=true;
    return true;
  });
  if(saved)requestProfile();
}
// بدل ما مدة الضمان تتحفظ تلقائي بمجرد ما تدوس برّه الخانة (change) —
// وده كان بيسهّل حفظ رقم اتغيّر بالغلط أثناء التمرير أو اللمس — بقى
// محتاج ضغطة "✅ تأكيد" صريحة عشان يتحفظ فعلاً.
function confirmRequestWarrantyDays(requestId){
  let input=document.getElementById("warrantyDaysInput-"+requestId);
  if(!input)return;
  changeRequestWarrantyDays(requestId,input.value);
}
function warrantyStatusHtml(r){
  if(!r.warrantyUntil)return `<span class="hint">غير محدد</span>`;
  let until=new Date(r.warrantyUntil),active=until>=new Date();
  let dateLabel=until.toLocaleDateString("ar-EG");
  if(active){let daysLeft=Math.ceil((until-new Date())/86400000);return `<span class="badge">🛡️ سارٍ حتى ${dateLabel} (باقي ${daysLeft} يوم)</span>`}
  return `<span class="hint">⏹️ انتهى في ${dateLabel}</span>`;
}
async function changeRequestTag(i,val){if(val==="__add__"){let s=settings(),v=prompt("اكتب اسم التصنيف الجديد:");if(!v||!v.trim()){requestProfile();return}v=v.trim();s.orderTags=s.orderTags||[];if(!s.orderTags.includes(v))s.orderTags.push(v);if(!saveJSONSafe(K.s,s))return;val=v}if(await updateRequestRecordAsync(i,(_,r)=>{if(r.closed||r.paid)return false;r.tag=val;return true})){requestProfile();renderRequests()}}
function editRequest(i){location.href=window.wfSyncMode==="scoped"?"tech.html?id="+encodeURIComponent(i):"requests.html?edit="+encodeURIComponent(i)} // الفني بيعدّل من بوابته (الحقول المسموحة له بس)

// ===== رسائل واتساب جاهزة من صفحة أمر الشغل =====
function fillWaTemplate(text,r){
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let info=settings().receiptInfo||{};
  let map={
    "اسم_العميل": customerName(r.customerId),
    "رابط_البوابة": new URL("portal.html",location.href).href,
    "رقم_الدخول": String(cust.phone||"").replace(/\D/g,""),
    "اسم_الجهاز": deviceName(r.deviceId),
    "رقم_الأمر": r.no||"",
    "الحالة": r.paid?"مدفوع بالكامل":(r.status||""),
    "العطل": r.fault||"",
    "الإجمالي": (+r.total||0).toFixed(2)+" ج",
    "المتبقي": (r.paid?0:orderRemainAmt(r)).toFixed(2)+" ج",
    "اسم_الورشة": (info.name||"").trim()||(window.WL?WL.name():"الورشة الفنية"),
    "التوقيع": (info.footer||"").trim(),
    "شروط_الضمان": ((settings().warranty||{}).terms||"").trim(),
    "نطاق_الضمان": typeof warrantyScopeText==="function"?warrantyScopeText(r):"",
    "الضمان_لحد": r.warrantyUntil?new Date(r.warrantyUntil).toLocaleDateString("ar-EG"):""
  };
  return String(text||"").replace(/\{([^}]+)\}/g,(m,k)=>map[k]!==undefined?map[k]:m);
}
function sendWaTemplate(requestId,tplIndex){
  let r=arr(K.r).find(x=>String(x.id)===String(requestId));if(!r)return;
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let wa=typeof waNumber==="function"?waNumber(cust.phone):"";
  if(!wa)return alert("لا يوجد رقم هاتف مسجل لهذا العميل.");
  let tpl=(settings().waTemplates||[])[tplIndex];if(!tpl)return;
  let msg=fillWaTemplate(tpl.text,r);
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`,"_blank","noopener");
}

// ===== الإيصال القابل للطباعة/المشاركة =====
function buildReceiptHtml(r){
  let s=settings();
  let info=s.receiptInfo||{};
  let fields=(s.receiptFields&&s.receiptFields.length?s.receiptFields:defaultReceiptFields()).filter(f=>f.enabled!==false);
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let partsListText=(r.parts||[]).map(x=>{
    let p=x.external?null:arr(K.p).find(z=>z.id===x.partId);
    let nm=x.external?(x.name||"قطعة خارجية"):(p?.name||"قطعة محذوفة");
    let amount=(x.qty||0)*(x.sell||0);
    return `${esc(nm)} × ${x.qty} = ${amount.toFixed(2)} ج`;
  }).join("<br>")||"—";
  const valueFor={
    orderNo: esc(r.no||"—"),
    orderDate: requestCreatedDate(r)?esc(requestCreatedDate(r).toLocaleString("ar-EG")):"—",
    customerName: esc(customerName(r.customerId)),
    customerPhone: esc(cust.phone||"—"),
    deviceInfo: esc(deviceName(r.deviceId)),
    fault: esc(r.fault||"—"),
    work: esc(r.work||"—"),
    partsList: partsListText,
    labor: (+r.labor||0).toFixed(2)+" ج",
    partsTotal: (+r.partsTotal||0).toFixed(2)+" ج",
    total: (+r.total||0).toFixed(2)+" ج",
    deposit: (+r.deposit||0).toFixed(2)+" ج",
    remaining: (r.paid?0:orderRemainAmt(r)).toFixed(2)+" ج",
    paymentStatus: r.paid?"مدفوع بالكامل":"غير مكتمل",
    warranty: r.warrantyUntil?(new Date(r.warrantyUntil)>=new Date()?`سارٍ حتى ${esc(new Date(r.warrantyUntil).toLocaleDateString("ar-EG"))}${typeof warrantyScopeText==="function"&&warrantyScopeText(r)?`<br>على: ${esc(warrantyScopeText(r)).replace(/\n/g,"<br>")}<br><small>${esc(WARRANTY_SCOPE_NOTE)}</small>`:""}`:`انتهى في ${esc(new Date(r.warrantyUntil).toLocaleDateString("ar-EG"))}`):"—",
    warrantyTerms: esc((settings().warranty||{}).terms||"")
  };
  let rows=fields.map(f=>{
    let val=f.builtin?valueFor[f.id]:esc(f.staticText||"");
    if(val===undefined||val==="")return "";
    return `<tr><td class="receipt-label">${esc(f.label||"")}</td><td class="receipt-value">${val}</td></tr>`;
  }).join("");
  return `<div class="receipt-doc"><div class="receipt-head"><img class="receipt-logo" data-wf-brand="logo" src="workshop-logo.svg" alt=""><h2>${esc((info.name||"").trim()||(window.WL?WL.name():"الورشة الفنية"))}</h2>${(info.phone||"").trim()?`<div>📞 ${esc(info.phone.trim())}</div>`:""}${(info.address||"").trim()?`<div>📍 ${esc(info.address.trim())}</div>`:""}</div><table class="receipt-table">${rows}</table>${(info.footer||"").trim()?`<div class="receipt-footer">${esc(info.footer.trim())}</div>`:""}</div>`;
}
// نسخة نصية مخصّصة من الإيصال لمشاركة واتساب/الأنظمة التانية، بدل الاعتماد
// على استخراج innerText من جدول receipt-table: الخلايا المتجاورة (td) في
// أغلب المتصفحات/الـWebViews بترجع من غير أي فاصل واضح بين التسمية
// والقيمة (فبيوصل النص ملزّق زي "العربون400.00ج")، وده مختلف تمامًا عن شكل
// الطباعة الفعلي (جدول منظم). الدالة دي بتاخد بالظبط نفس البنود والترتيب
// والتفعيل من buildReceiptHtml وتطلعها سطر لكل بند "التسمية: القيمة".
function buildReceiptText(r){
  let s=settings();
  let info=s.receiptInfo||{};
  let fields=(s.receiptFields&&s.receiptFields.length?s.receiptFields:defaultReceiptFields()).filter(f=>f.enabled!==false);
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let partsListText=(r.parts||[]).map(x=>{
    let p=x.external?null:arr(K.p).find(z=>z.id===x.partId);
    let nm=x.external?(x.name||"قطعة خارجية"):(p?.name||"قطعة محذوفة");
    let amount=(x.qty||0)*(x.sell||0);
    return `${nm} × ${x.qty} = ${amount.toFixed(2)} ج`;
  }).join("\n")||"—";
  const valueFor={
    orderNo: r.no||"—",
    orderDate: requestCreatedDate(r)?requestCreatedDate(r).toLocaleString("ar-EG"):"—",
    customerName: customerName(r.customerId),
    customerPhone: cust.phone||"—",
    deviceInfo: deviceName(r.deviceId),
    fault: r.fault||"—",
    work: r.work||"—",
    partsList: partsListText,
    labor: (+r.labor||0).toFixed(2)+" ج",
    partsTotal: (+r.partsTotal||0).toFixed(2)+" ج",
    total: (+r.total||0).toFixed(2)+" ج",
    deposit: (+r.deposit||0).toFixed(2)+" ج",
    remaining: (r.paid?0:orderRemainAmt(r)).toFixed(2)+" ج",
    paymentStatus: r.paid?"مدفوع بالكامل":"غير مكتمل",
    warranty: r.warrantyUntil?(new Date(r.warrantyUntil)>=new Date()?`سارٍ حتى ${new Date(r.warrantyUntil).toLocaleDateString("ar-EG")}${typeof warrantyScopeText==="function"&&warrantyScopeText(r)?`\nعلى: ${warrantyScopeText(r)}\n(${WARRANTY_SCOPE_NOTE})`:""}`:`انتهى في ${new Date(r.warrantyUntil).toLocaleDateString("ar-EG")}`):"—",
    warrantyTerms: (settings().warranty||{}).terms||""
  };
  let lines=fields.map(f=>{
    let val=f.builtin?valueFor[f.id]:(f.staticText||"");
    if(val===undefined||val==="")return "";
    return `${f.label||""}: ${val}`;
  }).filter(Boolean);
  let sep="——————————————";
  let head=[(info.name||"").trim()||(window.WL?WL.name():"الورشة الفنية")];
  if((info.phone||"").trim())head.push("📞 "+info.phone.trim());
  if((info.address||"").trim())head.push("📍 "+info.address.trim());
  let out=head.join("\n")+"\n"+sep+"\n"+lines.join("\n");
  if((info.footer||"").trim())out+="\n"+sep+"\n"+info.footer.trim();
  return out;
}
// بيلف نص طويل على أكتر من سطر حسب العرض المتاح على الكانفاس، كلمة
// كلمة، ولو كلمة واحدة (رقم هاتف مثلاً) أطول من العرض نفسه بيلفها حرف
// حرف. من غير اللف ده أي نص طويل كان هيتقطع برّه حواف الصورة.
function wrapCanvasText(ctx,text,maxWidth){
  // سطر جديد صريح (\n) بيبدأ سطر جديد في الصورة كمان
  if(/\n/.test(String(text||"")))return String(text).split("\n").reduce((all,part)=>all.concat(wrapCanvasText(ctx,part,maxWidth)),[]);
  let words=String(text||"").split(/\s+/).filter(Boolean);
  let lines=[],cur="";
  for(let w of words){
    let test=cur?cur+" "+w:w;
    if(ctx.measureText(test).width<=maxWidth){cur=test;continue}
    if(cur)lines.push(cur);
    if(ctx.measureText(w).width>maxWidth){
      let sub="";
      for(let ch of w){
        let t2=sub+ch;
        if(ctx.measureText(t2).width<=maxWidth)sub=t2;
        else{lines.push(sub);sub=ch;}
      }
      cur=sub;
    }else cur=w;
  }
  if(cur)lines.push(cur);
  return lines.length?lines:[""];
}
// صورة للإيصال (PNG) بنفس بيانات الإيصال بالظبط — بديل لما تحب ترفق شكل
// احترافي يدوي (مش إرسال نص مباشر). الأهم: الارتفاع بيتحسب بتمريرة قياس
// أولى قبل الرسم الفعلي حسب طول المحتوى الحقيقي (اسم الورشة/العنوان/كل
// حقل)، مش ارتفاع ثابت — فأي نص تضيفه (حتى لو طويل جدًا) ياخد المساحة
// اللي محتاجها فعليًا ومفيش أي قص/اقتطاع لأي حاجة أبدًا.
async function shareReceiptImageView(requestId){
  let r=arr(K.r).find(x=>String(x.id)===String(requestId));if(!r)return;
  try{await buildAndShareReceiptImage(r)}
  catch(e){console.warn("تعذر إنشاء صورة الإيصال",e);alert("تعذر إنشاء صورة الإيصال على هذا الجهاز.")}
}
async function buildAndShareReceiptImage(r){
  let s=settings();
  let info=s.receiptInfo||{};
  let fields=(s.receiptFields&&s.receiptFields.length?s.receiptFields:defaultReceiptFields()).filter(f=>f.enabled!==false);
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let partsListText=(r.parts||[]).map(x=>{
    let p=x.external?null:arr(K.p).find(z=>z.id===x.partId);
    let nm=x.external?(x.name||"قطعة خارجية"):(p?.name||"قطعة محذوفة");
    let amount=(x.qty||0)*(x.sell||0);
    return `${nm} × ${x.qty} = ${amount.toFixed(2)} ج`;
  }).join("، ")||"—";
  const valueFor={
    orderNo: r.no||"—",
    orderDate: requestCreatedDate(r)?requestCreatedDate(r).toLocaleString("ar-EG"):"—",
    customerName: customerName(r.customerId),
    customerPhone: cust.phone||"—",
    deviceInfo: deviceName(r.deviceId),
    fault: r.fault||"—",
    work: r.work||"—",
    partsList: partsListText,
    labor: (+r.labor||0).toFixed(2)+" ج",
    partsTotal: (+r.partsTotal||0).toFixed(2)+" ج",
    total: (+r.total||0).toFixed(2)+" ج",
    deposit: (+r.deposit||0).toFixed(2)+" ج",
    remaining: (r.paid?0:orderRemainAmt(r)).toFixed(2)+" ج",
    paymentStatus: r.paid?"مدفوع بالكامل":"غير مكتمل",
    warranty: r.warrantyUntil?(new Date(r.warrantyUntil)>=new Date()?`سارٍ حتى ${new Date(r.warrantyUntil).toLocaleDateString("ar-EG")}${typeof warrantyScopeText==="function"&&warrantyScopeText(r)?`\nعلى: ${warrantyScopeText(r)}\n(${WARRANTY_SCOPE_NOTE})`:""}`:`انتهى في ${new Date(r.warrantyUntil).toLocaleDateString("ar-EG")}`):"—",
    warrantyTerms: (settings().warranty||{}).terms||""
  };
  let rowsData=fields.map(f=>{
    let val=f.builtin?valueFor[f.id]:(f.staticText||"");
    if(val===undefined||val==="")return null;
    return {label:f.label||"",value:String(val)};
  }).filter(Boolean);

  const W=720,PAD=32;
  const nameFont='bold 34px system-ui,-apple-system,"Segoe UI",Tahoma,Arial';
  const subFont='20px system-ui,-apple-system,"Segoe UI",Tahoma,Arial';
  const labelFont='bold 22px system-ui,-apple-system,"Segoe UI",Tahoma,Arial';
  const valueFont='22px system-ui,-apple-system,"Segoe UI",Tahoma,Arial';
  const footerFont='18px system-ui,-apple-system,"Segoe UI",Tahoma,Arial';
  const contentWidth=W-PAD*2;

  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("canvas 2d context not available");
  ctx.direction="rtl";

  // شعار الورشة (من الإعدادات ← الهوية والشعار). لو تعذّر تحميله الإيصال يترسم عادي من غيره.
  let logoImg=null,logoW=0,logoH=0;
  try{
    const lu=(window.WFBrand&&WFBrand.logoDataUrl)?await WFBrand.logoDataUrl():"workshop-logo.svg";
    logoImg=await new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src=lu;setTimeout(()=>no(new Error("timeout")),4000)});
    const ratio=(logoImg.naturalWidth||logoImg.width||3)/(logoImg.naturalHeight||logoImg.height||1);
    logoH=84;logoW=logoH*ratio;
    if(logoW>contentWidth*0.7){logoW=contentWidth*0.7;logoH=logoW/ratio}
  }catch(e){logoImg=null}

  // ===== تمريرة القياس: نحسب عدد الأسطر المطلوبة فعليًا لكل جزء =====
  ctx.font=nameFont;
  const nameLines=wrapCanvasText(ctx,(info.name||"").trim()||(window.WL?WL.name():"الورشة الفنية"),contentWidth);
  ctx.font=subFont;
  const phoneLines=(info.phone||"").trim()?wrapCanvasText(ctx,"📞 "+info.phone.trim(),contentWidth):[];
  const addrLines=(info.address||"").trim()?wrapCanvasText(ctx,"📍 "+info.address.trim(),contentWidth):[];
  const rowLineSets=rowsData.map(row=>{
    ctx.font=valueFont;
    let oneLine=row.label+": "+row.value;
    if(ctx.measureText(oneLine).width<=contentWidth)return [oneLine];
    return [row.label+":", ...wrapCanvasText(ctx,row.value,contentWidth-20)];
  });
  ctx.font=footerFont;
  const footerLines=(info.footer||"").trim()?wrapCanvasText(ctx,info.footer.trim(),contentWidth):[];

  let y=PAD;
  if(logoImg)y+=logoH+12;
  y+=nameLines.length*40;
  y+=phoneLines.length*26;
  y+=addrLines.length*26;
  y+=10+2+20;
  rowLineSets.forEach(vLines=>{y+=vLines.length*30+14});
  if(footerLines.length)y+=6+footerLines.length*24;
  y+=PAD;

  canvas.width=W;
  canvas.height=Math.ceil(y);

  // ===== تمريرة الرسم الفعلي بنفس القياسات بالظبط =====
  ctx.direction="rtl";
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#111111";
  ctx.textBaseline="top";

  let cy=PAD;
  if(logoImg){try{ctx.drawImage(logoImg,(W-logoW)/2,cy,logoW,logoH)}catch(e){}cy+=logoH+12}
  ctx.font=nameFont;ctx.textAlign="center";
  nameLines.forEach(l=>{ctx.fillText(l,W/2,cy);cy+=40});
  ctx.font=subFont;
  phoneLines.forEach(l=>{ctx.fillText(l,W/2,cy);cy+=26});
  addrLines.forEach(l=>{ctx.fillText(l,W/2,cy);cy+=26});
  cy+=10;
  ctx.strokeStyle="#111111";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(PAD,cy);ctx.lineTo(W-PAD,cy);ctx.stroke();
  cy+=20;

  ctx.textAlign="right";
  rowsData.forEach((row,i)=>{
    let vLines=rowLineSets[i];
    if(vLines.length===1){
      ctx.font=labelFont;
      ctx.fillText(row.label+": ",W-PAD,cy);
      let labelW=ctx.measureText(row.label+": ").width;
      ctx.font=valueFont;
      ctx.fillText(row.value,W-PAD-labelW,cy);
      cy+=30;
    }else{
      ctx.font=labelFont;
      ctx.fillText(vLines[0],W-PAD,cy);cy+=30;
      ctx.font=valueFont;
      for(let k=1;k<vLines.length;k++){ctx.fillText(vLines[k],W-PAD-20,cy);cy+=30}
    }
    ctx.strokeStyle="#dddddd";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(PAD,cy+4);ctx.lineTo(W-PAD,cy+4);ctx.stroke();
    cy+=14;
  });

  if(footerLines.length){
    cy+=6;
    ctx.font=footerFont;ctx.textAlign="center";ctx.fillStyle="#555555";
    footerLines.forEach(l=>{ctx.fillText(l,W/2,cy);cy+=24});
  }

  canvas.toBlob(async blob=>{
    try{
      if(!blob)return alert("تعذر إنشاء صورة الإيصال.");
      const fileName="receipt-"+(r.no||r.id)+".png";
      const file=new File([blob],fileName,{type:"image/png"});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:"إيصال "+(r.no||"")});return}
        catch(e){if(e?.name==="AbortError")return}
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=fileName;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){console.warn("تعذر مشاركة/تحميل صورة الإيصال",e);alert("تعذر حفظ أو مشاركة صورة الإيصال.")}
  },"image/png");
}
function ensureReceiptPrintHost(r){
  let host=document.getElementById("receiptPrintArea");
  if(!host){host=document.createElement("div");host.id="receiptPrintArea";host.className="hidden";document.body.appendChild(host)}
  host.innerHTML=`<div class="ps-context-target" data-ps-title="إيصال ${esc(r.no)}">${buildReceiptHtml(r)}</div>`;
  return host.querySelector(".ps-context-target");
}
function printReceiptView(requestId){
  let r=arr(K.r).find(x=>String(x.id)===String(requestId));if(!r)return;
  let target=ensureReceiptPrintHost(r);
  if(typeof window.printWorkshopTarget==="function")window.printWorkshopTarget({closest:()=>target});
}
// بدل ما تفتح شاشة المشاركة العامة (اختار أي تطبيق/جهة اتصال)، لو العميل
// عنده رقم هاتف مسجل بنفتح واتساب مباشرة له هو بالتحديد برسالة الإيصال
// جاهزة — نفس فكرة أزرار رسائل أوامر الشغل الجاهزة بالظبط. لو مفيش رقم
// مسجل، نرجع للمشاركة العامة كحل بديل وحيد.
function shareReceiptView(requestId){
  let r=arr(K.r).find(x=>String(x.id)===String(requestId));if(!r)return;
  let text=buildReceiptText(r);
  let cust=arr(K.c).find(c=>c.id===r.customerId)||{};
  let wa=typeof waNumber==="function"?waNumber(cust.phone):"";
  if(wa){
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`,"_blank","noopener");
    return;
  }
  let title=(window.WL?WL.name():"الورشة الفنية")+" — إيصال "+(r.no||"");
  if(navigator.share){
    navigator.share({title,text}).catch(e=>{if(e?.name!=="AbortError"&&typeof window.psCopyFallback==="function")window.psCopyFallback(text)});
  }else if(typeof window.psCopyFallback==="function")window.psCopyFallback(text);
}
function requestCommActionsHtml(r,custPhone){
  let templates=(settings().waTemplates||[]).map((t,i)=>({...t,i})).filter(t=>t.enabled!==false);
  let waRow=(templates.length&&custPhone)?`<div class="wa-send-row">${templates.map(t=>`<button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="sendWaTemplate('${r.id}',${t.i})">💬 ${esc(t.name||"رسالة")}</button>`).join("")}</div>`:"";
  return `<div class="request-comm-actions no-print">${waRow}<div class="receipt-actions-row"><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="printReceiptView('${r.id}')">🖨️ طباعة الإيصال</button><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shareReceiptView('${r.id}')">💬 إرسال الإيصال واتساب</button><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shareReceiptImageView('${r.id}')">🖼️ صورة الإيصال</button>${window.wfSyncMode==="scoped"?"":(()=>{const n=arr(K.tasks).filter(t=>t&&!t.deleted&&!t.completed&&String(t.requestId)===String(r.id)).length;return `<a class="secondary mini-action" style="text-decoration:none" href="tasks.html?request=${encodeURIComponent(r.id)}">📋 مهمة متابعة${n?` (${n} مفتوحة)`:""}</a>`})()}</div></div>`;
}
