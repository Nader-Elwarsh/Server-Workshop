/* =========================================================
   الورشة الفنية — المحافظ (wallets.js)
   =========================================================
   ده قسم منفصل عن "الخزنة" (treasury.js) بالكامل ومختلف عنه في الغرض:
   - الخزنة (treasury.js) = درج نقدي واحد مستقل، لا يتأثر تلقائيًا بأي حاجة.
   - المحافظ (هنا) = كذا "مكان" فلوس فعلي (محفظتي الشخصية، محافظ موبايل،
     إنستاباي...) مربوطة فعليًا بأوامر الشغل: لما عميل يدفع عربون أو
     تحصيل نهائي، بيتحدد دفع في أنهي محفظة، وده بيتسجل هنا تلقائيًا.
     وبرضو تقدر تسجل منها مصاريفك الشخصية ومصاريف التشغيل يدويًا،
     فتعرف بالظبط "الفلوس اللي في المحفظة دي جايه منين ورايحة فين".

   أسماء المحافظ نفسها وتصنيفات الحركة (شخصي/تشغيل/تحصيل عميل...) قوايم
   قابلة للتعديل بالكامل (إضافة/تعديل/حذف/ترتيب) من صفحة الإعدادات، بنفس
   آلية باقي القوايم في النظام (settings().wallets / settings().walletCategories).
   ========================================================= */

/* ---------------------------------------------------------------------
   قراءة وحساب الأرصدة
--------------------------------------------------------------------- */
function walletTxEntries(){return (typeof arrCached==="function"?arrCached(K.wtx):arr(K.wtx)).filter(x=>!x.deleted)}
function walletTxFor(walletName){return walletTxEntries().filter(x=>x.wallet===walletName)}
function walletRawBalance(walletName){return walletTxFor(walletName).reduce((a,x)=>a+(x.type==="in"?(+x.amount||0):-(+x.amount||0)),0)}
// حد أقصى اختياري لمحفظة معينة (زي إنستاباي) — لو موجود، الرصيد المعروض/المحسوب
// في الإجمالي بيتوقف عنده حتى لو الحركات الفعلية جمعت لرقم أعلى. راجع
// s.walletCaps في shared-data.js وقسم الحسابات في الإعدادات لتعديله.
function walletCapOf(walletName){
  let cap=(settings().walletCaps||{})[walletName];
  cap=+cap;
  return Number.isFinite(cap)&&cap>0?cap:null;
}
function walletBalance(walletName){
  let raw=walletRawBalance(walletName),cap=walletCapOf(walletName);
  return cap!==null&&raw>cap?cap:raw;
}
// دفعات جزئية من خط السير سُجّلت في محفظة مختلفة (أو من غير محفظة) عن محفظة العربون الأساسي:
// بتتخزن في order.depositExtra، وحركة العربون الأساسية بتغطي الباقي بس (العربون − depositExtra)
// عشان نفس الفلوس ماتتحسبش مرتين ولا تنتقل من محفظة لمحفظة تانية.
function orderDepositExtra(o){let n=+o?.depositExtra;return Number.isFinite(n)&&n>0?Math.min(n,Math.max(0,+o?.deposit||0)):0}
function orderMainDeposit(o){return Math.max(0,(+o?.deposit||0)-orderDepositExtra(o))}
// حركة محفظة لدفعة جزئية منفصلة (بتتحذف مع الأمر لو اتحذف، وبتظهر مربوطة بيه).
function addOrderPartialPaymentTx(order,amount,wallet){
  wallet=String(wallet||"").trim();amount=+amount||0;
  if(!wallet||amount<=0)return true;
  return put(K.wtx,arr(K.wtx).concat({
    id:id(),refKey:null,orderId:order.id,manualOverride:true,deleted:false,type:"in",amount,wallet,
    category:"تحصيل عميل",reason:`💵 دفعة جزئية أمر الشغل ${order.no}`,note:"",
    date:localDateKey(new Date()),time:new Date().toTimeString().slice(0,5),
    source:"order-part",createdAt:new Date().toISOString()
  }));
}
// يزوّد عربون الأمر بمبلغ جديد (دفعة جزئية، أو فلوس مرتجع اتحوّلت لعربون) من غير ما ينقل فلوس العربون
// السابق من محفظته. بيعدّل الأمر بس ويرجّع {separate}: لو true المستدعي لازم يسجّل الحركة بـ addOrderPartialPaymentTx.
function applyAdditionalDeposit(r,amount,wallet){
  wallet=String(wallet||"").trim();amount=+amount||0;
  const existing=r.deposit==null||r.deposit===""?0:(+r.deposit||0);
  const mainTx=arr(K.wtx).find(x=>x&&x.refKey==="order-deposit-"+r.id&&!x.deleted);
  const mainWallet=mainTx?String(mainTx.wallet||"").trim():String(r.depositWallet||"").trim();
  const separate=existing>0&&(wallet!==mainWallet||!!(mainTx&&mainTx.manualOverride));
  r.deposit=existing+amount;
  if(separate)r.depositExtra=(+r.depositExtra||0)+amount;
  else r.depositWallet=wallet; // من غير محفظة = مفيش حركة، ومايتسجلش في محفظة قديمة محدّدة على الأمر
  return{separate};
}
function linkedOrderForWalletTx(tx){
  if(tx&&tx.orderId&&tx.source==="order-part")return arr(K.r).find(r=>String(r.id)===String(tx.orderId))||null;
  let ref=String(tx?.refKey||"");
  let match=ref.match(/^order-(?:deposit|final)-(.+)$/);
  return match?arr(K.r).find(r=>String(r.id)===match[1]):null;
}
function walletsOverview(){return (settings().wallets||[]).map(w=>({name:w,balance:walletBalance(w),raw:walletRawBalance(w),cap:walletCapOf(w)}))}
// إجمالي الرصيد الكلي عبر كل المحافظ مع بعض، للعرض السريع فوق الصفحة.
function walletsTotalBalance(){return walletsOverview().reduce((a,w)=>a+w.balance,0)}
// ملخص حسب تصنيف الحركة (شخصي/تشغيل/تحصيل عميل...): إجمالي وارد وصادر لكل تصنيف،
// عشان "أنا بصرف إيه شخصيًا وإيه مصاريف تشغيل" يبقى رقم واحد واضح.
function walletCategoryTotals(){
  let map={};
  walletTxEntries().forEach(x=>{
    let c=x.category||"أخرى";
    map[c]=map[c]||{in:0,out:0};
    if(x.type==="in")map[c].in+=(+x.amount||0);else map[c].out+=(+x.amount||0);
  });
  return Object.entries(map).map(([category,v])=>({category,...v}));
}
// حساب "مصاريفي الشخصية" و"مصاريف الورشة (تشغيل)" كرقمين ثابتين وواضحين
// فوق الصفحة على طول، بدل ما يكونوا مدفونين جوه تفصيل قابل للطي.
// بيعتمدوا على تصنيف الحركة نفسه ("مصروف شخصي" / "مصروف تشغيل")، فأي
// حركة (يدوية أو مربوطة بأمر شغل) بنفس التصنيف بتتحسب هنا تلقائيًا.
function personalVsWorkshopTotals(){
  let cat=walletCategoryTotals();
  let personal=cat.find(c=>c.category==="مصروف شخصي")||{in:0,out:0};
  let workshop=cat.find(c=>c.category==="مصروف تشغيل")||{in:0,out:0};
  return {personal:personal.out||0, workshop:workshop.out||0};
}

/* ---------------------------------------------------------------------
   حركة يدوية (من صفحة المحافظ نفسها أو من زر الإدخال السريع بالرئيسية)
--------------------------------------------------------------------- */
function addWalletManual(type,prefix="wt"){
  let amountEl=document.getElementById(prefix+"Amount"),walletEl=document.getElementById(prefix+"Wallet"),
      categoryEl=document.getElementById(prefix+"Category"),subCategoryEl=document.getElementById(prefix+"SubCategory"),
      reasonEl=document.getElementById(prefix+"Reason"),
      dateEl=document.getElementById(prefix+"Date"),timeEl=document.getElementById(prefix+"Time"),
      noteEl=document.getElementById(prefix+"Note");
  let amount=parseAmountInput(amountEl?.value),wallet=(walletEl?.value||"").trim(),
      category=categoryEl?.value||"أخرى",reason=(reasonEl?.value||"").trim(),
      date=dateEl?.value||localDateKey(new Date()),time=timeEl?.value||new Date().toTimeString().slice(0,5);
  if(amount<=0)return alert("أدخل مبلغ صحيح.");
  if(!wallet)return alert("اختر المحفظة.");
  if(!reason)return alert("اكتب سبب الحركة.");
  // نوع المصروف الفرعي (وقود، صيانة، إيجار... أو مواصلات، أكل، متفرقات لو
  // شخصي) بيتسجل لو التصنيف "مصروف تشغيل" أو "مصروف شخصي"، عشان تبويب
  // إحصائيات الصرف ("أكتر حاجة بيتصرف فيها") يشمل النوعين مش تشغيل بس.
  let subCategory=subCategoryKeyFor(category)?(subCategoryEl?.value||""):"";
  let entry={
    id:id(),refKey:null,manualOverride:true,deleted:false,type,amount,wallet,category,subCategory,
    date,time,reason,note:(noteEl?.value||"").trim(),source:"manual",createdAt:new Date().toISOString()
  };
  if(!saveJSONSafe(K.wtx,arr(K.wtx).concat(entry)))return null;
  window.auditLog?.(type==="in"?"إضافة وارد":"إضافة صرف", "محفظة", entry.id, `${wallet} ${amount.toFixed(2)} ج - ${reason}`);
  return entry;
}
function walletManualFromPage(type){
  addWalletManual(type,"wt");
  renderWallets();
}
// أي تصنيف حركة له قايمة "نوع فرعي" مرتبطة به (لأغراض إحصائيات الصرف)،
// وأي قايمة قابلة للتعديل بالكامل من ⚙️ الإعدادات ← الحسابات.
function subCategoryKeyFor(category){
  if(category==="مصروف تشغيل")return "expenseCategories";
  if(category==="مصروف شخصي")return "personalExpenseCategories";
  return null;
}
function subCategoryLabelFor(category){
  return category==="مصروف تشغيل"?"نوع مصروف التشغيل":"نوع المصروف الشخصي";
}
// إظهار/إخفاء خانة "النوع الفرعي" وتحديث قايمتها حسب التصنيف المختار —
// بتتنادى من onchange خانة التصنيف في أي فورم (صفحة الحسابات الرئيسية
// "wt" أو صفحة محفظة بعينها "wd").
function toggleExpenseSubCategory(prefix){
  let catEl=document.getElementById(prefix+"Category"),wrap=document.getElementById(prefix+"SubCatWrap"),
      sel=document.getElementById(prefix+"SubCategory"),labelEl=wrap?.querySelector("span")||wrap?.firstChild;
  if(!catEl||!wrap)return;
  let key=subCategoryKeyFor(catEl.value);
  wrap.classList.toggle("hidden",!key);
  if(key&&sel){
    let list=settings()[key]||[];
    sel.innerHTML=list.map(c=>`<option>${esc(c)}</option>`).join("");
  }
  let labelNode=wrap.querySelector(".subcat-label");
  if(labelNode)labelNode.textContent=subCategoryLabelFor(catEl.value);
}
// يقبل أرقام عربية/هندية وفاصلة عشرية عربية، ويرجّع 0 لو المدخل مش رقم مفهوم.
function parseAmountInput(v){
  let t=String(v??"").replace(/[\u0660-\u0669]/g,c=>c.charCodeAt(0)-1632).replace(/[\u06F0-\u06F9]/g,c=>c.charCodeAt(0)-1776).replace(/[٬,]/g,"").replace(/٫/g,".").trim();
  return /^\d+(\.\d+)?$/.test(t)?parseFloat(t):0;
}
function editWalletTx(txId){
  let a=arr(K.wtx),e=a.find(x=>x.id===txId);if(!e)return;
  let newAmount=prompt("المبلغ:",e.amount);if(newAmount===null)return;
  // قبل كده أي مدخل مش رقم (أو فاضي) كان بيتحوّل بصمت لـ 0 وتفضل الحركة موجودة بمبلغ صفر.
  let amt=parseAmountInput(newAmount);
  if(amt<=0)return alert("أدخل مبلغ صحيح أكبر من صفر.");
  let newReason=prompt("سبب الحركة:",e.reason||"");if(newReason===null)return;
  let newNote=prompt("تفاصيل إضافية:",e.note||"");if(newNote===null)return;
  let oldAmount=+e.amount||0;
  e.amount=amt;e.reason=(newReason||"").trim()||e.reason;e.note=(newNote||"").trim();
  if(e.refKey)e.manualOverride=true;
  // حركة التحويل ليها حركة مقابلة في الخزنة: لازم تتعدّل معاها في نفس العملية،
  // وإلا الطرفين يبقوا بمبلغين مختلفين (المحفظة نقصت 100 والخزنة زادت 80 مثلًا).
  if(e.source==="transfer"&&e.transferId){
    let t=arr(K.tr),tx=t.find(x=>x.transferId===e.transferId&&x.source==="transfer");
    if(tx){
      tx.amount=e.amount;tx.reason=e.reason;tx.note=e.note;
      if(!commitStorage({[K.wtx]:a,[K.tr]:t}))return;
      window.auditLog?.("تعديل حركة", "محفظة", e.id, `${oldAmount.toFixed(2)} ← ${e.amount.toFixed(2)} ج (مع حركة الخزنة المقابلة)`);
      renderWallets();renderWalletDetail();
      if(typeof renderTreasury==="function")renderTreasury();
      return;
    }
  }
  if(!saveJSONSafe(K.wtx,a))return;
  window.auditLog?.("تعديل حركة", "محفظة", e.id, `${oldAmount.toFixed(2)} ← ${e.amount.toFixed(2)} ج`);
  renderWallets();renderWalletDetail();
}
function deleteWalletTx(txId){
  let a=arr(K.wtx),e=a.find(x=>x.id===txId);if(!e)return;
  let isTransfer=e.source==="transfer"&&e.transferId;
  let msg=isTransfer?"هذه حركة تحويل مرتبطة بحركة مقابلة في الخزنة. حذف الحركتين معًا (من المحفظة والخزنة)؟":(e.refKey?"هذه الحركة مرتبطة بأمر شغل. حذفها من هنا لن يعدّل أمر الشغل نفسه، بس هتختفي من كشف المحفظة. تأكيد الحذف؟":"حذف هذه الحركة من كشف المحفظة؟");
  if(!confirm(msg))return;
  e.deleted=true;
  // علامة "اتحذفت بقصد": من غيرها أول حفظ تاني للأمر (أي تعديل بسيط زي إضافة قطعة)
  // كان بيعيد إنشاء الحركة اللي انت مسحتها. بنفتكر المبلغ/المحفظة وقت الحذف عشان
  // لو غيّرت العربون أو المحفظة في الأمر بعدها تتسجل حركة جديدة عادي.
  if(e.refKey){
    let snap=orderSnapshotForRef(e.refKey);
    e.userDeleted=true;e.deletedAmount=snap?snap.amount:(+e.amount||0);e.deletedWallet=snap?snap.wallet:(e.wallet||"");
    e.deletedAt=new Date().toISOString();
  }
  if(isTransfer){
    let t=arr(K.tr),tidx=t.findIndex(x=>x.transferId===e.transferId&&x.source==="transfer");
    if(tidx>=0){t.splice(tidx,1);if(!commitStorage({[K.wtx]:a,[K.tr]:t}))return}else if(!saveJSONSafe(K.wtx,a))return;
  }else if(!saveJSONSafe(K.wtx,a))return;
  window.auditLog?.("حذف", "حركة محفظة", txId, e.reason||"");
  renderWallets();renderWalletDetail();
  if(typeof renderTreasury==="function")renderTreasury();
}

/* ---------------------------------------------------------------------
   الربط التلقائي بأوامر الشغل: كل ما تتغيّر قيمة العربون أو يتحصّل
   المبلغ النهائي مع تحديد محفظة، بتتسجل/تتحدّث حركة واحدة مرتبطة
   بنفس refKey (بدل ما تتكرر الحركة في كل مرة يتعدل فيها الأمر).
--------------------------------------------------------------------- */
// بيشيل التكرار: أي حركتين مربوطتين بنفس refKey (نفس عربون/تحصيل نفس الأمر)
// بيتساب واحدة بس (اللي اتعدلت يدويًا أولًا، وإلا الأقدم) والباقي بيتعلّم deleted.
function dedupeWalletTxByRef(){
  try{
    let a=arr(K.wtx),groups={},changed=false;
    // سجلين بنفس الـ id (كان بيحصل لما حركة عربون محذوفة تتعمل من جديد): نسيب الفعّال
    // بالـ id الأصلي وننقل التاني لـ id تاني، عشان الحذف/التعديل/المزامنة تشتغل على السجل الصح.
    let byId={};
    a.forEach((x,i)=>{
      if(!x||x.id==null)return;
      if(byId[x.id]===undefined){byId[x.id]=i;return}
      let j=byId[x.id],loser=(a[j].deleted&&!x.deleted)?j:i,keeper=loser===j?i:j;
      a[loser]={...a[loser],id:String(x.id)+"~dup"+loser};byId[x.id]=keeper;changed=true;
    });
    a.forEach((x,i)=>{if(x&&x.refKey&&!x.deleted)(groups[x.refKey]??=[]).push(i)});
    Object.values(groups).forEach(ix=>{
      if(ix.length<2)return;
      ix.sort((p,q)=>((a[q].manualOverride?1:0)-(a[p].manualOverride?1:0))||String(a[p].createdAt||"").localeCompare(String(a[q].createdAt||"")));
      ix.slice(1).forEach(i=>{a[i]={...a[i],deleted:true};changed=true});
    });
    if(changed)put(K.wtx,a);
    return changed;
  }catch(e){console.warn("dedupeWalletTxByRef",e);return false}
}
// تسجيل تلقائي لأي عربون/تحصيل نهائي على أمر ليه محفظة محددة لكن حركته ناقصة من المحفظة
// (حفظ اتقطع، مزامنة، أمر اتعدّل من جهاز تاني...). بيتخطى أي حركة انت مسحتها بإيدك
// (userDeleted) وأي أمر ملغي أو اتفتح تاني، فمفيش حاجة بتتسجل مرتين أو بتتعاد بعد حذفك.
let _autoHealAt=0;
function _orderTxDate(v){const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?localDateKey(d):localDateKey(new Date())}
function autoHealOrderWalletTx(force){
  try{
    if(typeof arr!=="function"||typeof K==="undefined"||!K.r||!K.wtx)return 0;
    // مرة كل دقيقة بالكتير (لو مش force) عشان الدالة متتكررش مع كل رسم للصفحة لما الداتا تكبر.
    const nowMs=Date.now();if(!force&&nowMs-_autoHealAt<60000)return 0;_autoHealAt=nowMs;
    const rd=typeof arrCached==="function"?arrCached:arr;
    const orders=rd(K.r);if(!orders.length)return 0;
    const wallets=new Set((settings().wallets||[]).map(w=>String(w||"").trim()));
    const txs=rd(K.wtx).map(x=>x&&typeof x==="object"?x:x);
    const active=new Set(),userDel=new Set(),goneIdx={};
    txs.forEach((x,i)=>{if(!x||!x.refKey)return;if(!x.deleted)active.add(x.refKey);else if(x.userDeleted)userDel.add(x.refKey);else goneIdx[x.refKey]=i});
    const todo=[];
    orders.forEach(r=>{
      if(!r||!r.id||r.status==="ملغي")return;
      const dRef="order-deposit-"+r.id,fRef="order-final-"+r.id;
      const dw=String(r.depositWallet||"").trim(),dAmt=orderMainDeposit(r);
      if(dAmt>0&&dw&&wallets.has(dw)&&!active.has(dRef)&&!userDel.has(dRef))todo.push({ref:dRef,date:_orderTxDate(r.createdAt),amount:dAmt,wallet:dw,reason:`💵 عربون أمر الشغل ${r.no}`});
      const cw=String(r.closeWallet||"").trim(),coll=Math.max(0,(+r.total||0)-(+r.deposit||0));
      if(r.closed&&r.paid&&coll>0&&cw&&wallets.has(cw)&&!active.has(fRef)&&!userDel.has(fRef))todo.push({ref:fRef,date:_orderTxDate(r.closedAt||r.paidAt),amount:coll,wallet:cw,reason:`💳 تحصيل نهائي أمر الشغل ${r.no}`});
    });
    if(!todo.length)return 0;
    // كتابة واحدة لكل الحركات الناقصة (بدل كتابة كاملة لكل حركة) — مهم لما عدد الأوامر يكبر.
    const a=arr(K.wtx).slice(),today=localDateKey(new Date()),time=new Date().toTimeString().slice(0,5);
    todo.forEach(d=>{
      const gi=a.findIndex(x=>x&&x.refKey===d.ref&&x.deleted&&!x.userDeleted);
      if(gi>=0){const {userDeleted,deletedAmount,deletedWallet,deletedAt,...rest}=a[gi];a[gi]={...rest,deleted:false,manualOverride:false,type:"in",amount:d.amount,wallet:d.wallet,category:"تحصيل عميل",reason:d.reason,date:d.date||a[gi].date}}
      else a.push({id:d.ref,refKey:d.ref,manualOverride:false,deleted:false,type:"in",amount:d.amount,wallet:d.wallet,category:"تحصيل عميل",reason:d.reason,note:"",date:d.date||today,time,source:"order-link",createdAt:new Date().toISOString()});
    });
    return put(K.wtx,a)?todo.length:0;
  }catch(e){console.warn("autoHealOrderWalletTx",e);return 0}
}
// المبلغ/المحفظة الحاليين على أمر الشغل المرتبطة بيه الحركة (عربون أو تحصيل نهائي)،
// بنفس الطريقة اللي syncWalletForOrderDeposit/Close بيحسبوا بيها.
function orderSnapshotForRef(refKey){
  let m=String(refKey||"").match(/^order-(deposit|final)-(.+)$/);if(!m)return null;
  let r=arr(K.r).find(x=>String(x.id)===m[2]);if(!r)return null;
  return m[1]==="deposit"
    ?{amount:orderMainDeposit(r),wallet:String(r.depositWallet||"").trim()}
    :{amount:Math.max(0,(+r.total||0)-(+r.deposit||0)),wallet:String(r.closeWallet||"").trim()};
}
function upsertWalletTxForRef(refKey,data){
  dedupeWalletTxByRef();
  let a=arr(K.wtx),idx=a.findIndex(x=>x.refKey===refKey&&!x.deleted);
  // لو المستخدم عدّل الحركة دي يدويًا من صفحة المحفظة (editWalletTx بيحط
  // manualOverride:true)، معناها بقى بيديرها بنفسه — فمينفعش أي حفظ تاني
  // للأمر المرتبط بيها (حتى لغرض تاني تمامًا زي إضافة قطعة) يدوس على تعديله
  // ويرجّعها للمبلغ التلقائي القديم بصمت. قبل الإصلاح ده، manualOverride
  // كان بيتسجّل بس من غير ما حد يتحقق منه في أي مكان.
  if(idx>=0&&a[idx].manualOverride)return true;
  let amount=+data.amount||0,wallet=(data.wallet||"").trim();
  if(!wallet||amount<=0){
    if(idx>=0)return put(K.wtx,a.map((x,i)=>i===idx?{...x,deleted:true}:x));
    return true;
  }
  if(idx>=0){
    Object.assign(a[idx],{amount,wallet,category:data.category||a[idx].category,reason:data.reason||a[idx].reason,date:data.date||a[idx].date});
  }else{
    // فيه حركة قديمة بنفس المرجع اتعلّمت deleted؟ (مسحتها أنت، أو اتشالت لما العربون بقى صفر).
    // - لو مسحتها أنت والأمر لسه بنفس المبلغ/المحفظة: نحترم الحذف ومانعيدهاش.
    // - غير كده: نعيد تفعيل نفس السجل مكانه بدل ما نضيف سجل تاني بنفس الـ id
    //   (id بيتشتق من refKey، والتكرار كان بيبوّظ المزامنة وأي عرض بيعتمد على الـ id).
    let ti=a.findIndex(x=>x&&x.refKey===refKey&&x.deleted&&x.id===refKey);
    if(ti<0)ti=a.map((x,i)=>x&&x.refKey===refKey&&x.deleted?i:-1).filter(i=>i>=0).pop()??-1;
    if(ti>=0){
      let t=a[ti];
      if(t.userDeleted&&Math.abs((+t.deletedAmount||0)-amount)<0.005&&String(t.deletedWallet||"")===wallet)return true;
      let {userDeleted,deletedAmount,deletedWallet,deletedAt,...rest}=t;
      a[ti]={...rest,id:t.id||refKey,deleted:false,manualOverride:false,type:"in",amount,wallet,
        category:data.category||t.category||"تحصيل عميل",reason:data.reason||t.reason||"",note:data.note||t.note||"",
        date:data.date||t.date||localDateKey(new Date()),time:new Date().toTimeString().slice(0,5)};
      return put(K.wtx,a);
    }
    a.push({
      // id ثابت مشتق من refKey: لو جهازين سجلوا نفس التحصيل أوفلاين، المزامنة
      // هتدمجهم في سجل واحد بدل ما تطلع حركتين (كان ده سبب التكرار).
      id:refKey,refKey,manualOverride:false,deleted:false,type:"in",amount,wallet,
      category:data.category||"تحصيل عميل",reason:data.reason||"",note:data.note||"",
      date:data.date||localDateKey(new Date()),time:new Date().toTimeString().slice(0,5),
      source:"order-link",createdAt:new Date().toISOString()
    });
  }
  return put(K.wtx,a);
}
// بيتنادى بعد حفظ أمر الشغل (جديد أو تعديل)؛ لو مفيش محفظة متحددة أو
// العربون صفر، الحركة (لو كانت موجودة من قبل) بتتشال تلقائيًا.
function syncWalletForOrderDeposit(order){
  return upsertWalletTxForRef("order-deposit-"+order.id,{
    amount:orderMainDeposit(order),wallet:order.depositWallet,category:"تحصيل عميل",
    reason:`💵 عربون أمر الشغل ${order.no}`
  });
}
// بيتنادى وقت "تم الدفع بالكامل وإغلاق الأمر" مع تحديد المحفظة اللي
// اتحصل فيها المبلغ المتبقي.
function syncWalletForOrderClose(order,collected,wallet){
  return upsertWalletTxForRef("order-final-"+order.id,{
    amount:collected,wallet,category:"تحصيل عميل",
    reason:`💳 تحصيل نهائي أمر الشغل ${order.no}`
  });
}
// يبني نسخة حركات المحفظة اللازمة لعملية المرتجع دون كتابتها منفردة؛
// المستدعي يحفظها مع الأمر في commitStorageAsync واحد متعدد المخازن.
function walletTxEntriesForOrderReturn(order,entries,depositAdded,depositWallet,separatePayment){
  const a=(entries||[]).map(x=>x&&typeof x==="object"?{...x}:x);
  const closeRef="order-final-"+order.id;
  a.forEach(x=>{if(x&&x.refKey===closeRef&&!x.deleted)x.deleted=true});
  if(!(+depositAdded>0))return a;
  const refKey="order-deposit-"+order.id,amount=orderMainDeposit(order),wallet=String(order.depositWallet||"").trim();
  let active=a.map((x,i)=>x&&x.refKey===refKey&&!x.deleted?i:-1).filter(i=>i>=0);
  if(active.length>1){
    active.sort((i,j)=>((a[j].manualOverride?1:0)-(a[i].manualOverride?1:0))||String(a[i].createdAt||"").localeCompare(String(a[j].createdAt||"")));
    active.slice(1).forEach(i=>{a[i].deleted=true});active=active.slice(0,1);
  }
  let idx=active.length?active[0]:-1;
  const preserveManual=idx>=0&&a[idx].manualOverride;
  if(!preserveManual&&!wallet||!preserveManual&&amount<=0){if(idx>=0)a[idx].deleted=true}
  else if(!preserveManual&&idx>=0){Object.assign(a[idx],{amount,wallet,category:"تحصيل عميل",reason:`💵 عربون أمر الشغل ${order.no}`})}
  else if(!preserveManual){
    let ti=a.findIndex(x=>x&&x.refKey===refKey&&x.deleted&&x.id===refKey);
    if(ti<0)ti=a.map((x,i)=>x&&x.refKey===refKey&&x.deleted?i:-1).filter(i=>i>=0).pop()??-1;
    if(ti>=0){
      const t=a[ti];
      if(!(t.userDeleted&&Math.abs((+t.deletedAmount||0)-amount)<0.005&&String(t.deletedWallet||"")===wallet)){
        const {userDeleted,deletedAmount,deletedWallet,deletedAt,...rest}=t;
        a[ti]={...rest,id:t.id||refKey,deleted:false,manualOverride:false,type:"in",amount,wallet,category:"تحصيل عميل",reason:`💵 عربون أمر الشغل ${order.no}`,date:t.date||localDateKey(new Date()),time:new Date().toTimeString().slice(0,5)};
      }
    }else{
      a.push({id:refKey,refKey,manualOverride:false,deleted:false,type:"in",amount,wallet,category:"تحصيل عميل",reason:`💵 عربون أمر الشغل ${order.no}`,note:"",date:localDateKey(new Date()),time:new Date().toTimeString().slice(0,5),source:"order-link",createdAt:new Date().toISOString()});
    }
  }
  if(separatePayment&&String(depositWallet||"").trim()&&+depositAdded>0){
    a.push({id:id(),refKey:null,orderId:order.id,manualOverride:true,deleted:false,type:"in",amount:+depositAdded,wallet:String(depositWallet).trim(),category:"تحصيل عميل",reason:`💵 دفعة جزئية أمر الشغل ${order.no}`,note:"",date:localDateKey(new Date()),time:new Date().toTimeString().slice(0,5),source:"order-part",createdAt:new Date().toISOString()});
  }
  return a;
}

/* ---------------------------------------------------------------------
   التحويل بين المحافظ والخزنة (الدرج)
   =========================================================
   الخزنة (treasury.js) والمحافظ (هنا) حسابان مستقلان تمامًا في حساباتهم
   (رصيد كل واحد منهم بيتحسب من حركاته هو بس). التحويل هنا مجرد وسيلة
   لنقل مبلغ من حساب لحساب: بيسجل حركة "صادر" في المصدر وحركة "وارد" في
   الوجهة في نفس اللحظة، بدون ما يدمج الحسابين أو يخليهم يتأثروا ببعض
   تلقائيًا بأي شكل تاني. الحركتان مربوطتان ببعض بس بـ transferId
   للعرض/المرجعية فقط.
--------------------------------------------------------------------- */
let _wfTransferLast=0;
function transferBetweenWalletAndTreasury(direction,walletName,amount,date,time,reason,note){
  // منع الضغط المزدوج (كان بيسجّل تحويلين). والمبلغ السالب بيتم رفضه بدل ما يتحوّل لموجب بصمت.
  if(Date.now()-_wfTransferLast<900)return;
  amount=+amount||0;
  if(amount<=0)return alert("أدخل مبلغ صحيح.");
  if(!walletName)return alert("اختر المحفظة.");
  date=date||localDateKey(new Date());time=time||new Date().toTimeString().slice(0,5);
  _wfTransferLast=Date.now();
  let transferId=id();
  let baseReason=(reason||"").trim()||(direction==="toTreasury"?`🔁 تحويل من ${walletName} إلى الخزنة`:`🔁 تحويل من الخزنة إلى ${walletName}`);
  let noteVal=(note||"").trim();
  const now=new Date().toISOString();
  const walletTx={id:id(),refKey:null,manualOverride:true,deleted:false,type:direction==="toTreasury"?"out":"in",amount,wallet:walletName,category:"سلفة / تحويل",date,time,reason:baseReason,note:noteVal,source:"transfer",transferId,createdAt:now};
  const treasuryTx={id:id(),refKey:null,manualOverride:true,deleted:false,type:direction==="toTreasury"?"in":"out",amount,date,time,reason:baseReason,counterparty:walletName,place:"",category:"تحويل",note:noteVal,source:"transfer",transferId,createdAt:now};
  const result=withRollback([K.wtx,K.tr],()=>{
    if(!put(K.wtx,arr(K.wtx).concat(walletTx)))return{ok:false};
    if(!put(K.tr,arr(K.tr).concat(treasuryTx)))return{ok:false};
    return{ok:true};
  });
  if(!result?.ok)return alert("تعذر حفظ التحويل كاملًا؛ لم يتم تسجيل أي من طرفيه.");
  window.auditLog?.("تحويل", "محفظة/خزنة", transferId, `${direction==="toTreasury"?walletName+" ← الخزنة":"الخزنة ← "+walletName} ${amount.toFixed(2)} ج`);
  renderWallets();renderTreasury();renderWalletDetail();
  return result;
}
function toggleWalletTransferPanel(){
  let body=document.getElementById("walletTransferBody"),btn=document.getElementById("walletTransferToggleBtn");
  if(!body||!btn)return;
  let opening=body.classList.contains("hidden");
  body.classList.toggle("hidden");
  btn.textContent=opening?"🔁 تحويل بين المحافظ والخزنة (دوس للإغلاق)":"🔁 تحويل بين المحافظ والخزنة (دوس للفتح)";
  btn.classList.toggle("quick-order-open",opening);
  if(opening)setTimeout(()=>body.scrollIntoView({behavior:"smooth",block:"nearest"}),50);
}
function walletTransferWidgetHtml(){
  let wallets=settings().wallets||[],today=localDateKey(new Date());
  return `<section class="panel" id="walletTransferPanel" style="margin-bottom:14px">
    <button type="button" id="walletTransferToggleBtn" class="quick-order-toggle" data-wf-event="click" data-wf-code="toggleWalletTransferPanel()">🔁 تحويل بين المحافظ والخزنة (دوس للفتح)</button>
    <div id="walletTransferBody" class="hidden">
      <div class="hint" style="margin-top:10px">كل حساب بيفضل مستقل في حساباته؛ التحويل بيسجل حركة صادر من المصدر ووارد في الوجهة بس، من غير ما يدمج الحسابين.</div>
      <div class="form-grid" style="margin-top:8px">
        <label>الاتجاه<select id="wtrDirection">
          <option value="toTreasury">من محفظة ← إلى الخزنة</option>
          <option value="toWallet">من الخزنة ← إلى محفظة</option>
        </select></label>
        <label>المحفظة<select id="wtrWallet">${wallets.length?wallets.map(w=>`<option>${esc(w)}</option>`).join(""):`<option value="">لا توجد محافظ</option>`}</select></label>
        <label>المبلغ<input id="wtrAmount" type="number" step="0.01" min="0" placeholder="0.00"></label>
        <label>التاريخ<input id="wtrDate" type="date" value="${today}"></label>
        <label>الوقت<input id="wtrTime" type="time" value="${new Date().toTimeString().slice(0,5)}"></label>
        <label class="wide">السبب (اختياري)<input id="wtrReason" placeholder="مثال: سحب من المحفظة للخزنة"></label>
        <label class="wide">تفاصيل إضافية<input id="wtrNote" placeholder="اختياري"></label>
      </div>
      <div class="actions">
        <button type="button" class="primary" data-wf-event="click" data-wf-code="executeWalletTreasuryTransfer()">🔁 نفّذ التحويل</button>
      </div>
    </div>
  </section>`;
}
function executeWalletTreasuryTransfer(){
  let dir=document.getElementById("wtrDirection")?.value||"toTreasury",
      wallet=document.getElementById("wtrWallet")?.value||"",
      amount=parseAmountInput(document.getElementById("wtrAmount")?.value),
      date=document.getElementById("wtrDate")?.value,
      time=document.getElementById("wtrTime")?.value,
      reason=document.getElementById("wtrReason")?.value||"",
      note=document.getElementById("wtrNote")?.value||"";
  transferBetweenWalletAndTreasury(dir,wallet,amount,date,time,reason,note);
}
/* ---------------------------------------------------------------------
   العرض: صفحة تفاصيل محفظة واحدة (أو تصنيف حركة واحد كحساب تجميعي)
   =========================================================
   بتتفتح من الكارت/الأيقونة في صفحة المحافظ الرئيسية:
   wallet.html?type=wallet&name=... لمحفظة فعلية (بها إضافة حركة مباشرة)
   wallet.html?type=category&name=... لحساب تجميعي حسب تصنيف الحركة
   (زي "مصروف شخصي")، وده عرض فقط لأنه بيجمع من كذا محفظة.
--------------------------------------------------------------------- */
function walletDetailParams(){
  let q=new URLSearchParams(location.search);
  return {type:q.get("type")==="category"?"category":"wallet",name:q.get("name")||""};
}
function walletDetailEntries(type,name){
  return type==="category"?walletTxEntries().filter(x=>(x.category||"أخرى")===name):walletTxFor(name);
}
function walletDetailBalance(type,name){
  if(type==="wallet")return walletBalance(name); // بيحترم الحد الأقصى لو متحدد للمحفظة دي
  return walletDetailEntries(type,name).reduce((a,x)=>a+(x.type==="in"?(+x.amount||0):-(+x.amount||0)),0);
}
function walletManualFromDetail(type,walletName){
  let amountEl=document.getElementById("wdAmount"),categoryEl=document.getElementById("wdCategory"),
      subCategoryEl=document.getElementById("wdSubCategory"),
      reasonEl=document.getElementById("wdReason"),dateEl=document.getElementById("wdDate"),
      timeEl=document.getElementById("wdTime"),noteEl=document.getElementById("wdNote");
  let amount=parseAmountInput(amountEl?.value),category=categoryEl?.value||"أخرى",reason=(reasonEl?.value||"").trim(),
      date=dateEl?.value||localDateKey(new Date()),time=timeEl?.value||new Date().toTimeString().slice(0,5);
  if(amount<=0)return alert("أدخل مبلغ صحيح.");
  if(!reason)return alert("اكتب سبب الحركة.");
  let subCategory=subCategoryKeyFor(category)?(subCategoryEl?.value||""):"";
  let entry={id:id(),refKey:null,manualOverride:true,deleted:false,type,amount,wallet:walletName,category,subCategory,
    date,time,reason,note:(noteEl?.value||"").trim(),source:"manual",createdAt:new Date().toISOString()};
  if(!saveJSONSafe(K.wtx,arr(K.wtx).concat(entry)))return;
  window.auditLog?.(type==="in"?"إضافة وارد":"إضافة صرف", "محفظة", entry.id, `${walletName} ${amount.toFixed(2)} ج - ${reason}`);
  renderWalletDetail();
}
function renderWalletDetail(){dedupeWalletTxByRef();
  let el=document.getElementById("walletDetailPage");if(!el)return;
  let {type,name}=walletDetailParams();
  if(!name){el.innerHTML="<div class='item'>الحساب غير محدد.</div>";return}
  let categories=settings().walletCategories||[];
  let isWallet=type==="wallet";
  let filterCategory=document.getElementById("wdFilterCategory")?.value||"";
  let today=localDateKey(new Date());
  let entries=walletDetailEntries(type,name)
    .filter(x=>!filterCategory||x.category===filterCategory)
    .sort((a,b)=>new Date((b.date||"")+"T"+(b.time||"00:00"))-new Date((a.date||"")+"T"+(a.time||"00:00"))||new Date(b.createdAt)-new Date(a.createdAt));
  let balance=walletDetailBalance(type,name);
  let rawBalance=isWallet?walletRawBalance(name):balance,cap=isWallet?walletCapOf(name):null;
  let icon=isWallet?"💳":(name==="مصروف شخصي"?"🙋":name==="مصروف تشغيل"?"🔧":"🏷️");
  el.classList.add("ps-context-target");el.setAttribute("data-ps-title",`حساب ${name}`);
  el.innerHTML=`
    <div class="page-head"><h1 class="profile-title">${icon} ${esc(name)}</h1><span class="ps-inline-actions no-print" aria-label="إجراءات الطباعة والمشاركة"><button type="button" class="ps-icon-btn" title="طباعة" aria-label="طباعة" data-wf-event="click" data-wf-code="printWorkshopTarget(this)">🖨️</button><button type="button" class="ps-icon-btn" title="مشاركة" aria-label="مشاركة" data-wf-event="click" data-wf-code="shareWorkshopTarget(this)">↗️</button></span></div>
    <div class="treasury-balance ${balance<0?"negative":""}">
      <span>${isWallet?"رصيد المحفظة الحالي":"إجمالي حركات هذا التصنيف عبر كل المحافظ"}</span><b>${balance.toFixed(2)} ج</b>
    </div>
    ${cap!==null?`<div class="hint">🔒 هذا الحساب له حد أقصى مضبوط من ⚙️ الإعدادات: ${cap.toFixed(2)} ج${rawBalance>cap?` (الرصيد الفعلي من الحركات المسجّلة هنا ${rawBalance.toFixed(2)} ج، لكن المعروض والمحسوب في الإجمالي متوقف عند الحد الأقصى).`:"."}</div>`:""}
    ${isWallet?`
    <div class="treasury-actions">
      <div class="form-grid">
        <label>المبلغ<input id="wdAmount" type="number" step="0.01" min="0" placeholder="0.00"></label>
        <label>التصنيف <a class="mini-action" href="settings.html#wallet-settings-panel" title="تعديل التصنيف/النوع من الإعدادات">⚙️</a><select id="wdCategory" data-wf-event="change" data-wf-code="toggleExpenseSubCategory('wd')">${categories.map(c=>`<option>${esc(c)}</option>`).join("")}</select></label>
        <label id="wdSubCatWrap" class="${subCategoryKeyFor(categories[0])?"":"hidden"}"><span class="subcat-label">${subCategoryLabelFor(categories[0])}</span><a class="mini-action" href="settings.html#wallet-settings-panel" title="تعديل التصنيف/النوع من الإعدادات">⚙️</a><select id="wdSubCategory">${(settings()[subCategoryKeyFor(categories[0])||"expenseCategories"]||[]).map(c=>`<option>${esc(c)}</option>`).join("")}</select></label>
        <label>التاريخ<input id="wdDate" type="date" value="${today}"></label>
        <label>الوقت<input id="wdTime" type="time" value="${new Date().toTimeString().slice(0,5)}"></label>
        <label class="wide">السبب<input id="wdReason" placeholder="مثال: سحب شخصي، بنزين..."></label>
        <label class="wide">تفاصيل إضافية<input id="wdNote" placeholder="اختياري"></label>
      </div>
      <div class="actions">
        <button type="button" class="primary" data-wf-event="click" data-wf-code="walletManualFromDetail('in','${escAttr(name)}')">➕ وارد</button>
        <button type="button" class="secondary danger-btn" data-wf-event="click" data-wf-code="walletManualFromDetail('out','${escAttr(name)}')">➖ صرف</button>
      </div>
    </div>
    ${walletTransferWidgetHtml()}`:`<div class="hint">ده حساب تجميعي حسب تصنيف الحركة "${esc(name)}" عبر كل المحافظ مع بعض، مش محفظة فعلية بذاتها. لتسجيل حركة جديدة بنفس التصنيف، من صفحة أي حساب أو من صفحة الحسابات الرئيسية.</div>`}
    <div class="filters">
      <select id="wdFilterCategory" data-wf-event="change" data-wf-code="renderWalletDetail()"><option value="">كل التصنيفات</option>${categories.map(c=>`<option ${c===filterCategory?"selected":""}>${esc(c)}</option>`).join("")}</select>
    </div>
    <h3 class="treasury-list-title">📋 كشف حركات ${isWallet?"المحفظة":"التصنيف"}</h3>
    ${entries.length?entries.map(x=>`<div class="treasury-row ${x.type}" id="tx-${x.id}">
      <div class="treasury-row-main">
        <b>${(()=>{let order=linkedOrderForWalletTx(x);return order?`<a href="request.html?id=${encodeURIComponent(order.id)}" title="فتح أمر الشغل ${escAttr(order.no||"")}">${esc(x.reason||"—")} ↗</a>`:esc(x.reason||"—")})()}</b>
        <small>${esc(new Date((x.date||today)+"T"+(x.time||"00:00")).toLocaleString("ar-EG"))}${!isWallet?` • 💳 ${esc(x.wallet||"—")}`:""} • 🏷️ ${esc(x.category||"أخرى")}${x.subCategory?` • 📂 ${esc(x.subCategory)}`:""}${x.source==="order-link"||x.source==="order-part"?" • 🔗 أمر شغل":""}${x.source==="transfer"?" • 🔁 تحويل":""}${x.source==="migrated-expense"?" • ↩️ مرحّل من كشف الحساب القديم":""}</small>
        ${x.note?`<small>📝 ${esc(x.note)}</small>`:""}
      </div>
      <div class="treasury-row-amount ${x.type}">${x.type==="in"?"+":"−"}${(+x.amount||0).toFixed(2)} ج</div>
      <div class="treasury-row-actions"><button type="button" class="mini-action" data-wf-event="click" data-wf-code="editWalletTx('${x.id}')">✏️</button><button type="button" class="mini-action" data-wf-event="click" data-wf-code="deleteWalletTx('${x.id}')">🗑️</button></div>
    </div>`).join(""):`<div class="hint">لا توجد حركات بعد.</div>`}
  `;
}

/* ---------------------------------------------------------------------
   مطابقة الرصيد: "ليه رصيد المحفظة في التطبيق مختلف عن اللي في جيبي؟"
   =========================================================
   بتفحص كل حركة مربوطة بأمر شغل مقابل الأمر نفسه، وبتطلّع أي حاجة ممكن تفرّق
   الرصيد المعروض عن الفعلي. مفيش أي تعديل بيتم هنا — عرض بس. كل بند له اتجاه:
   up = بيرفع الرصيد المعروض (الأرقام في التطبيق أعلى من الفعلي)
   down = بيخفضه، info = للعلم.
--------------------------------------------------------------------- */
function walletAudit(){
  const orders=arr(K.r),byId=new Map(orders.map(r=>[String(r.id),r]));
  const all=arr(K.wtx),active=all.filter(x=>x&&!x.deleted);
  const known=new Set(settings().wallets||[]);
  const issues=[];
  const add=(o)=>issues.push(o);
  const money=n=>(+n||0);
  active.forEach(x=>{
    const m=String(x.refKey||"").match(/^order-(deposit|final)-(.+)$/);
    const isIn=x.type==="in",amt=money(x.amount);
    if(x.source==="order-part"&&x.orderId){
      const po=byId.get(String(x.orderId));
      if(!po)add({kind:"order-missing",dir:"up",tx:x,amount:amt,text:"دفعة جزئية مربوطة بأمر شغل مش موجود (اتحذف؟) — لسه محسوبة في الرصيد."});
      else if(po.status==="ملغي")add({kind:"order-cancelled",dir:"up",tx:x,order:po,amount:amt,text:"أمر "+(po.no||"")+" ملغي لكن دفعته الجزئية لسه محسوبة. لو رجّعت الفلوس للعميل لازم تسجّل صرف."});
    }
    if(!known.has(x.wallet))add({kind:"unknown-wallet",dir:"info",tx:x,amount:amt,text:"الحركة على محفظة «"+(x.wallet||"—")+"» مش موجودة في الإعدادات، فمش داخلة في إجمالي أي محفظة معروضة."});
    if(!m)return;
    const r=byId.get(m[2]),kind=m[1];
    if(!r){add({kind:"order-missing",dir:isIn?"up":"down",tx:x,amount:amt,text:"حركة مربوطة بأمر شغل مش موجود (اتحذف؟) — لسه محسوبة في الرصيد."});return}
    if(r.status==="ملغي")add({kind:"order-cancelled",dir:isIn?"up":"down",tx:x,order:r,amount:amt,text:"أمر "+(r.no||"")+" ملغي لكن حركته لسه محسوبة. لو رجّعت الفلوس للعميل لازم تسجّل صرف."});
    if(kind==="final"&&!r.closed)add({kind:"final-on-open",dir:isIn?"up":"down",tx:x,order:r,amount:amt,text:"أمر "+(r.no||"")+" اتفتح تاني (مرتجع/تعديل) وتحصيله النهائي لسه محسوب. لو رجّعت الفلوس سجّل صرف، ولو لأ سيبه لحد ما تقفله تاني."});
    const expect=kind==="deposit"?orderMainDeposit(r):Math.max(0,money(r.total)-money(r.deposit));
    if(Math.abs(expect-amt)>0.005)add({kind:"amount-mismatch",dir:amt>expect?"up":"down",tx:x,order:r,amount:amt-expect,text:"أمر "+(r.no||"")+": الحركة "+amt.toFixed(2)+" لكن "+(kind==="deposit"?"العربون":"المتبقي (الإجمالي − العربون)")+" على الأمر "+expect.toFixed(2)+(x.manualOverride?" (انت معدّل الحركة بإيدك).":".")});
    const w=String((kind==="deposit"?r.depositWallet:r.closeWallet)||"").trim();
    if(w&&w!==x.wallet)add({kind:"wallet-mismatch",dir:"info",tx:x,order:r,amount:amt,text:"أمر "+(r.no||"")+": المحفظة على الأمر «"+w+"» لكن الحركة على «"+(x.wallet||"—")+"»."});
    const lag=x.createdAt&&r.createdAt?new Date(x.createdAt)-new Date(r.createdAt):0;
    if(x.source==="order-link"&&lag>2*86400000)add({kind:"late-entry",dir:"info",tx:x,order:r,amount:amt,text:"أمر "+(r.no||"")+": الحركة اتسجلت بعد إنشاء الأمر بـ "+Math.round(lag/86400000)+" يوم (أمر قديم اتسجّل متأخر؟)."});
  });
  // أوامر ليها محفظة ومبلغ لكن مفيش حركة خالص (ولا حتى محذوفة بقصد) => الرصيد المعروض أقل
  orders.forEach(r=>{
    if(r.status==="ملغي")return;
    const has=(ref)=>all.some(x=>x&&x.refKey===ref&&!x.deleted);
    const gone=(ref)=>all.filter(x=>x&&x.refKey===ref&&x.deleted);
    const mainDep=orderMainDeposit(r);
    if(mainDep>0&&String(r.depositWallet||"").trim()&&!has("order-deposit-"+r.id)){
      const g=gone("order-deposit-"+r.id),byUser=g.some(x=>x.userDeleted);
      // اللي اتحذف منك بقصد (tombstone) مابيتعدّش ناقص.
      if(!byUser)add({kind:"missing-deposit",dir:"down",order:r,amount:mainDep,fix:{type:"deposit",orderId:r.id},text:"أمر "+(r.no||"")+": عربون "+mainDep.toFixed(2)+" على الأمر ومحفظته «"+String(r.depositWallet).trim()+"»، لكن "+(g.length?"حركته في المحفظة اتشالت تلقائيًا (مش محسوبة في الرصيد).":"مفيش حركة في المحفظة.")});
    }
    const coll=Math.max(0,money(r.total)-money(r.deposit));
    if(r.closed&&coll>0&&String(r.closeWallet||"").trim()&&!has("order-final-"+r.id)){
      const g=gone("order-final-"+r.id),byUser=g.some(x=>x.userDeleted);
      if(!byUser)add({kind:"missing-final",dir:"down",order:r,amount:coll,fix:{type:"final",orderId:r.id},text:"أمر "+(r.no||"")+": اتقفل بتحصيل "+coll.toFixed(2)+" في «"+String(r.closeWallet).trim()+"» لكن "+(g.length?"حركة التحصيل اتشالت تلقائيًا (مش محسوبة في الرصيد).":"مفيش حركة تحصيل في المحفظة.")});
    }
    // أمر اتفتح تاني (مرتجع/تعديل) فالتحصيل النهائي اتشال من المحفظة تلقائيًا: الفلوس غالبًا لسه معاك فالرصيد المعروض أقل من الفعلي لحد ما تقفله تاني.
    if(!r.closed&&r.reopenedFromClosedAt&&!(r.returnMoney&&r.returnMoney.choice&&r.returnMoney.choice!=="none")){
      const gf=gone("order-final-"+r.id).filter(x=>!x.userDeleted&&money(x.amount)>0);
      if(gf.length&&!has("order-final-"+r.id)){const last=gf[gf.length-1];add({kind:"reopened-final",dir:"info",order:r,amount:money(last.amount),text:"أمر "+(r.no||"")+" اتفتح تاني بعد التقفيل، وتحصيله النهائي "+money(last.amount).toFixed(2)+" ج اتشال من «"+(last.wallet||"—")+"» تلقائيًا. هيرجع لما تقفل الأمر تاني (لو الفلوس لسه معاك فالرصيد الفعلي أعلى من المعروض)."})}
    }
    if(r.closed&&coll>0&&!String(r.closeWallet||"").trim())add({kind:"closed-no-wallet",dir:"info",order:r,amount:coll,text:"أمر "+(r.no||"")+": اتقفل بتحصيل "+coll.toFixed(2)+" من غير تحديد محفظة (مش محسوب في أي رصيد)."});
  });
  // احتمال تكرار: نفس المحفظة/النوع/المبلغ/اليوم/السبب أكتر من مرة
  const groups={};
  active.forEach(x=>{const k=[x.wallet,x.type,money(x.amount).toFixed(2),x.date,String(x.reason||"").trim()].join("|");(groups[k]=groups[k]||[]).push(x)});
  Object.values(groups).forEach(g=>{if(g.length>1)add({kind:"possible-duplicate",dir:g[0].type==="in"?"up":"down",tx:g[0],amount:money(g[0].amount)*(g.length-1),text:g.length+" حركات متطابقة ("+(g[0].reason||"بدون سبب")+" — "+money(g[0].amount).toFixed(2)+" ج) — هل دي حركة واحدة اتسجلت أكتر من مرة؟"})});
  // وارد يدوي بنفس مبلغ حركة أمر شغل في نفس المحفظة وبفارق يوم أو أقل: غالبًا نفس الفلوس اتسجلت مرتين
  // (مرة تلقائي من الأمر ومرة بإيدك) => الرصيد المعروض أعلى من الفعلي.
  const linked=active.filter(x=>/^order-(deposit|final)-/.test(String(x.refKey||""))&&x.type==="in");
  const day=x=>new Date((x.date||"1970-01-01")+"T00:00:00").getTime();
  active.filter(x=>!x.refKey&&x.type==="in"&&x.source!=="transfer"&&x.source!=="migrated-expense"&&x.source!=="order-part").forEach(x=>{
    const twin=linked.find(l=>l.wallet===x.wallet&&Math.abs(money(l.amount)-money(x.amount))<0.005&&Math.abs(day(l)-day(x))<=86400000);
    if(twin)add({kind:"manual-vs-order",dir:"up",tx:x,amount:money(x.amount),text:"وارد يدوي "+money(x.amount).toFixed(2)+" ج ("+(x.reason||"بدون سبب")+") بنفس مبلغ «"+(twin.reason||"")+"» في نفس اليوم تقريبًا — هل اتسجل مرتين؟"});
  });
  // تحويل ناقص طرف
  const tr=arr(K.tr).filter(x=>x&&!x.deleted);
  active.filter(x=>x.source==="transfer"&&x.transferId).forEach(x=>{if(!tr.some(t=>t.transferId===x.transferId))add({kind:"transfer-orphan",dir:"info",tx:x,amount:money(x.amount),text:"تحويل "+money(x.amount).toFixed(2)+" ج ليه طرف في المحفظة بس ومفيش طرف مقابل في الخزنة."})});
  // الحد الأقصى
  const wallets=(settings().wallets||[]).map(name=>{
    const raw=walletRawBalance(name),bal=walletBalance(name),cap=walletCapOf(name);
    if(cap!==null&&raw>cap)add({kind:"cap",dir:"down",wallet:name,amount:raw-cap,text:"محفظة «"+name+"» عليها حد أقصى "+cap.toFixed(2)+" فالمعروض أقل من الفعلي من الحركات بـ "+(raw-cap).toFixed(2)+"."});
    const txs=walletTxFor(name);
    return{name,raw,balance:bal,cap,count:txs.length,inSum:txs.filter(x=>x.type==="in").reduce((a,x)=>a+money(x.amount),0),outSum:txs.filter(x=>x.type!=="in").reduce((a,x)=>a+money(x.amount),0)};
  });
  const sum=d=>issues.filter(i=>i.dir===d).reduce((a,i)=>a+Math.abs(+i.amount||0),0);
  return{wallets,issues,upTotal:sum("up"),downTotal:sum("down")};
}
const WALLET_AUDIT_TITLES={"order-missing":"حركات مربوطة بأوامر اتحذفت","order-cancelled":"أوامر ملغية وحركاتها لسه محسوبة","final-on-open":"تحصيل نهائي على أوامر اتفتحت تاني","amount-mismatch":"مبلغ الحركة غير مطابق للأمر","possible-duplicate":"احتمال حركات مكررة","manual-vs-order":"وارد يدوي بنفس مبلغ حركة أمر","missing-deposit":"عرابين على أوامر ومفيش حركة ليها","missing-final":"تحصيلات مقفولة ومفيش حركة ليها","closed-no-wallet":"أوامر اتقفلت من غير محفظة","wallet-mismatch":"محفظة الحركة غير محفظة الأمر","late-entry":"حركات أوامر قديمة اتسجلت متأخر","unknown-wallet":"حركات على محفظة غير معروفة","transfer-orphan":"تحويلات ناقصة","cap":"حد أقصى بيخفّض المعروض","reopened-final":"أوامر اتفتحت تاني وتحصيلها اتشال من المحفظة"};
// يرجّع حركة عربون/تحصيل أمر اتشالت تلقائيًا من المحفظة، بعد تأكيد صريح منك (بتتسجل بنفس مبلغ ومحفظة الأمر).
function restoreOrderWalletTx(orderId,kind){
  const r=arr(K.r).find(x=>String(x.id)===String(orderId));if(!r)return alert("الأمر مش موجود.");
  const isDep=kind==="deposit";
  const amount=isDep?orderMainDeposit(r):Math.max(0,(+r.total||0)-(+r.deposit||0));
  const wallet=String((isDep?r.depositWallet:r.closeWallet)||"").trim();
  if(!(amount>0)||!wallet)return alert("مفيش مبلغ أو محفظة على الأمر لتسجيلهم.");
  if(!confirm(`هتتسجل ${isDep?"عربون":"تحصيل"} أمر ${r.no||""} بمبلغ ${amount.toFixed(2)} ج كوارد في «${wallet}». لو الفلوس دي اتسجلت عندك بطريقة تانية (وارد يدوي مثلًا) هتتحسب مرتين. تأكيد؟`))return;
  const ok=isDep?syncWalletForOrderDeposit(r):syncWalletForOrderClose(r,amount,wallet);
  if(!ok)return alert("تعذر تسجيل الحركة.");
  window.auditLog?.("استرجاع حركة أمر","محفظة",r.id,`${wallet} ${amount.toFixed(2)} ج`);
  renderWallets();document.getElementById("walletAuditPanel")?.setAttribute("open","");renderWalletAudit();
}
function renderWalletAudit(){
  const box=document.getElementById("walletAuditBody");if(!box)return;
  const a=walletAudit(),fmt=n=>(+n||0).toFixed(2);
  const order=["order-missing","order-cancelled","final-on-open","amount-mismatch","possible-duplicate","manual-vs-order","missing-deposit","missing-final","closed-no-wallet","wallet-mismatch","late-entry","unknown-wallet","transfer-orphan","reopened-final","cap"];
  const link=i=>i.tx?(i.tx.wallet?'wallet.html?type=wallet&name='+encodeURIComponent(i.tx.wallet)+'#tx-'+encodeURIComponent(i.tx.id):"wallets.html"):(i.order?'request.html?id='+encodeURIComponent(i.order.id):"");
  const dirIcon={up:"⬆️",down:"⬇️",info:"ℹ️"};
  let html='<div class="profile-grid">'+a.wallets.map(w=>'<div class="kv"><b>'+esc(w.name)+'</b>وارد '+fmt(w.inSum)+' − صادر '+fmt(w.outSum)+' = <b>'+fmt(w.raw)+'</b>'+(w.cap!==null&&w.raw>w.cap?' (المعروض '+fmt(w.balance)+')':'')+' <small>('+w.count+' حركة)</small></div>').join("")+'</div>';
  html+='<div class="hint" style="margin:8px 0">⬆️ بنود بتخلّي الرصيد المعروض <b>أعلى</b> من الفعلي: '+fmt(a.upTotal)+' ج محتمل · ⬇️ بنود بتخليه <b>أقل</b>: '+fmt(a.downTotal)+' ج محتمل. مجرد مؤشرات للمراجعة — مفيش حاجة اتغيّرت.</div>';
  if(!a.issues.length)html+='<div class="hint">✅ مفيش أي حاجة مريبة: كل الحركات المربوطة بأوامر مطابقة لأوامرها. فالفرق غالبًا في حركات يدوية (مصروف/وارد) أو فلوس اتحصّلت ومتسجلتش — راجع كشف المحفظة يدويًا.</div>';
  order.forEach(k=>{
    const l=a.issues.filter(i=>i.kind===k);if(!l.length)return;
    const tot=l.reduce((s,i)=>s+Math.abs(+i.amount||0),0);
    html+='<details class="expense-panel" '+(l[0].dir!=="info"?"open":"")+'><summary>'+dirIcon[l[0].dir]+' '+esc(WALLET_AUDIT_TITLES[k])+' — '+l.length+' ('+fmt(tot)+' ج)</summary>'+l.slice(0,50).map(i=>{const h=link(i);const fx=i.fix?'<button type="button" class="mini-action" data-wf-event="click" data-wf-code="restoreOrderWalletTx(\''+escAttr(i.fix.orderId)+'\',\''+i.fix.type+'\')">↩️ سجّلها</button>':"";return'<div class="treasury-row '+(i.tx?i.tx.type:"")+'"><div class="treasury-row-main"><small>'+esc(i.text)+'</small></div>'+((h||fx)?'<div class="treasury-row-actions">'+fx+(h?'<a class="mini-action" href="'+h+'">فتح</a>':"")+'</div>':"")+'</div>'}).join("")+(l.length>50?'<div class="hint">معروض أول 50.</div>':"")+'</details>';
  });
  box.innerHTML=html;
}

/* ---------------------------------------------------------------------
   العرض: صفحة المحافظ الكاملة
--------------------------------------------------------------------- */
function renderWallets(){dedupeWalletTxByRef();autoHealOrderWalletTx(true);
  let el=document.getElementById("walletsPage");if(!el)return;
  let wallets=settings().wallets||[],categories=settings().walletCategories||[];
  let overview=walletsOverview(),catTotals=walletCategoryTotals(),pvw=personalVsWorkshopTotals();
  let today=localDateKey(new Date());
  el.innerHTML=`
    <div class="treasury-balance">
      <span>إجمالي أرصدة كل الحسابات</span><b>${walletsTotalBalance().toFixed(2)} ج</b>
    </div>
    <a class="wallet-icon-card treasury-peek" href="treasury.html" style="display:flex;margin:10px 0"><i>🏦</i><b>رصيد الخزنة (درج نقدي مستقل)</b><span>${(typeof treasuryBalance==="function"?treasuryBalance():0).toFixed(2)} ج</span></a>
    <div class="hint" style="margin:-4px 0 10px">🏦 الخزنة حساب مستقل تمامًا ومش داخلة في الإجمالي اللي فوق.</div>
    <div class="wallet-icon-grid">
      <a class="wallet-icon-card" href="wallet.html?type=category&name=${encodeURIComponent("مصروف شخصي")}"><i>🙋</i><b>حساب مصاريفي الشخصية</b><span>${pvw.personal.toFixed(2)} ج</span></a>
      <a class="wallet-icon-card" href="wallet.html?type=category&name=${encodeURIComponent("مصروف تشغيل")}"><i>🔧</i><b>حساب مصاريف الورشة (تشغيل)</b><span>${pvw.workshop.toFixed(2)} ج</span></a>
      ${overview.map(w=>`<a class="wallet-icon-card" href="wallet.html?type=wallet&name=${encodeURIComponent(w.name)}"><i>💳</i><b>${esc(w.name)}${w.cap!==null?" 🔒":""}</b><span>${w.balance.toFixed(2)} ج${w.cap!==null&&w.raw>w.cap?` <small>(الفعلي ${w.raw.toFixed(2)})</small>`:""}</span></a>`).join("")}
    </div>
    <div class="hint" style="margin-top:6px">ملحوظة: "مصاريفي الشخصية" و"مصاريف الورشة" مش رصيد فلوس منفصل، هما تجميع للحركات اللي جوه المحافظ فوق أصلاً — عشان كده مش بيتحسبوا في الإجمالي، ولو جمعتهم هيبقى فيه تكرار. 🔒 بجانب اسم المحفظة معناه إن لها حد أقصى مضبوط من ⚙️ الإعدادات (زي إنستاباي عادةً) — راجع صفحتها لتفاصيل أكتر.</div>
    ${overview.length?"":`<div class="hint">لا توجد حسابات بعد. أضفها من ⚙️ الإعدادات ← الحسابات.</div>`}
    ${renderSpendingStatsHtml()}
    ${walletTransferWidgetHtml()}
    <details class="expense-panel" id="walletAuditPanel">
      <summary>🔎 مطابقة الرصيد — ليه الرصيد في التطبيق مختلف عن الفعلي؟</summary>
      <div class="hint" style="margin:8px 0">بيفحص كل حركة مربوطة بأمر شغل مقابل الأمر نفسه ويطلّع أي حاجة ممكن تفرّق الأرقام (أوامر ملغية/مرتجعة، مبالغ مش متطابقة، تكرار...). عرض بس، مش بيغيّر حاجة.</div>
      <button type="button" class="secondary" data-wf-event="click" data-wf-code="renderWalletAudit()">🔎 افحص دلوقتي</button>
      <div id="walletAuditBody"></div>
    </details>
    <details class="expense-panel">
      <summary>📊 ملخص كل تصنيف حركة على حدة (شخصي / تشغيل / تحصيل عميل...)</summary>
      <div class="profile-grid">
        ${catTotals.length?catTotals.map(c=>`<div class="kv"><b>${esc(c.category)}</b>وارد ${c.in.toFixed(2)} ج · صادر ${c.out.toFixed(2)} ج</div>`).join(""):`<div class="hint">لا توجد حركات بعد.</div>`}
      </div>
    </details>
    <div class="treasury-actions">
      <div class="form-grid">
        <label>المبلغ<input id="wtAmount" type="number" step="0.01" min="0" placeholder="0.00"></label>
        <label>المحفظة<select id="wtWallet">${wallets.map(w=>`<option>${esc(w)}</option>`).join("")}</select></label>
        <label>التصنيف <a class="mini-action" href="settings.html#wallet-settings-panel" title="تعديل التصنيف/النوع من الإعدادات">⚙️</a><select id="wtCategory" data-wf-event="change" data-wf-code="toggleExpenseSubCategory('wt')">${categories.map(c=>`<option>${esc(c)}</option>`).join("")}</select></label>
        <label id="wtSubCatWrap" class="${subCategoryKeyFor(categories[0])?"":"hidden"}"><span class="subcat-label">${subCategoryLabelFor(categories[0])}</span><a class="mini-action" href="settings.html#wallet-settings-panel" title="تعديل التصنيف/النوع من الإعدادات">⚙️</a><select id="wtSubCategory">${(settings()[subCategoryKeyFor(categories[0])||"expenseCategories"]||[]).map(c=>`<option>${esc(c)}</option>`).join("")}</select></label>
        <label>التاريخ<input id="wtDate" type="date" value="${today}"></label>
        <label>الوقت<input id="wtTime" type="time" value="${new Date().toTimeString().slice(0,5)}"></label>
        <label class="wide">السبب<input id="wtReason" placeholder="مثال: عربون، سحب شخصي، بنزين..."></label>
        <label class="wide">تفاصيل إضافية<input id="wtNote" placeholder="اختياري"></label>
      </div>
      <div class="actions">
        <button type="button" class="primary" data-wf-event="click" data-wf-code="walletManualFromPage('in')">➕ وارد</button>
        <button type="button" class="secondary danger-btn" data-wf-event="click" data-wf-code="walletManualFromPage('out')">➖ صرف</button>
      </div>
    </div>
    <div class="hint">📋 كشف الحركات التفصيلي لكل حساب بقى جوه صفحته الخاصة — دوس على أي أيقونة فوق لعرضه وإضافة حركات ليه.</div>
  `;
}
