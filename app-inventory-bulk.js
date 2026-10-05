/* app-inventory-bulk.js — تعديل أسعار المخزن بالجملة (كل الأصناف مرة واحدة):
   1) زيادة/خفض سعر الشراء و/أو سعر الاستخدام بنسبة % أو مبلغ ثابت.
   2) توحيد نسبة الربح: ضبط سعر الاستخدام لكل الأصناف بحيث يكون أعلى من
      سعر الشراء بنسبة واحدة تُكتب مرة واحدة. */
function updateBulkOpUI(){
  const opEl=document.getElementById("bulkOp");if(!opEl)return;
  const isMargin=opEl.value==="margin";
  document.getElementById("bulkFieldWrap")?.classList.toggle("hidden",isMargin);
  document.getElementById("bulkDirWrap")?.classList.toggle("hidden",isMargin);
  document.getElementById("bulkTypeWrap")?.classList.toggle("hidden",isMargin);
  document.getElementById("bulkValueWrap")?.classList.toggle("hidden",isMargin);
  document.getElementById("bulkMarginWrap")?.classList.toggle("hidden",!isMargin);
}
function applyBulkPriceChange(){
  const scope=document.getElementById("bulkScope")?.value||"";
  const op=document.getElementById("bulkOp")?.value||"adjust";
  const all=arr(K.p);
  const targets=all.filter(p=>!p.archived&&(!scope||p.category===scope));
  if(!targets.length){alert("لا توجد أصناف مطابقة لهذا النطاق.");return}
  if(op==="margin"){
    const pctEl=document.getElementById("bulkMarginValue");
    const pct=+pctEl?.value;
    if(pctEl?.value===""||!Number.isFinite(pct)||pct<0){alert("من فضلك أدخل نسبة ربح صحيحة (صفر أو أكبر).");return}
    const updated=targets.map(p=>{const buy=Number(p.buy??0);if(!Number.isFinite(buy)||buy<0)return null;const next=Math.round(buy*(1+pct/100)*100)/100;return Number.isFinite(next)&&next>=0&&next<=Number.MAX_SAFE_INTEGER?next:null});
    if(updated.some(v=>v===null)){alert("نتيجة التعديل تتجاوز النطاق الرقمي الآمن. قلّل النسبة أو صحّح أسعار الشراء.");return}
    if(!confirm(`سيتم ضبط سعر الاستخدام لكل ${targets.length} صنف${scope?` في تصنيف «${scope}»`:" (كل الأصناف)"} بحيث يكون الربح ${pct}% فوق سعر الشراء لكل صنف.\n\nملحوظة: الأصناف اللي سعر شرائها 0 هتفضل سعر استخدامها 0.\n\nمتابعة؟`))return;
    targets.forEach((p,i)=>{p.use=updated[i]});
  }else{
    const field=document.getElementById("bulkField")?.value||"use";
    const dir=document.getElementById("bulkDir")?.value||"up";
    const type=document.getElementById("bulkType")?.value||"pct";
    const valEl=document.getElementById("bulkValue");
    const val=+valEl?.value;
    if(!valEl?.value||!Number.isFinite(val)||val<=0){alert("من فضلك أدخل قيمة تعديل موجبة وصالحة.");return}
    const sign=dir==="up"?1:-1;
    const fields=field==="both"?["buy","use"]:[field];
    if(!fields.every(f=>f==="buy"||f==="use")||!['up','down'].includes(dir)||!['pct','fixed'].includes(type)){alert("اختيارات تعديل الأسعار غير صالحة.");return}
    const fieldLabel=field==="both"?"سعر الشراء والاستخدام معًا":(field==="buy"?"سعر الشراء":"سعر الاستخدام");
    const updates=targets.map(p=>fields.map(f=>{
      const cur=Number(p[f]??0);if(!Number.isFinite(cur)||cur<0)return null;
      const delta=type==="pct"?(cur*val/100):val;
      const next=Math.max(0,cur+sign*delta),rounded=Math.round(next*100)/100;
      return Number.isFinite(rounded)&&rounded<=Number.MAX_SAFE_INTEGER?rounded:null;
    }));
    if(updates.some(row=>row.some(v=>v===null))){alert("نتيجة التعديل تتجاوز النطاق الرقمي الآمن. قلّل القيمة أو صحّح الأسعار الحالية.");return}
    if(!confirm(`سيتم ${dir==="up"?"زيادة":"خفض"} ${fieldLabel} بمقدار ${val}${type==="pct"?"%":" ج"} لكل ${targets.length} صنف${scope?` في تصنيف «${scope}»`:" (كل الأصناف)"}.\n\nمتابعة؟`))return;
    targets.forEach((p,i)=>fields.forEach((f,j)=>{p[f]=updates[i][j]}));
  }
  const saved=withRollback([K.p],()=>put(K.p,all)?{ok:true}:{ok:false});
  if(!saved?.ok)return;
  renderParts?.();
  refreshAllScreens?.();
  alert(`✅ تم تعديل ${targets.length} صنف بنجاح.`);
  document.getElementById("bulkPriceBox")?.classList.add("hidden");
}
function initInventoryBulk(){
  const box=document.getElementById("bulkPriceBox");if(!box)return;
  const scopeEl=document.getElementById("bulkScope");
  if(scopeEl)scopeEl.innerHTML='<option value="">🗂️ كل الأصناف</option>'+(settings().partCats||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  document.getElementById("bulkOp")?.addEventListener("change",updateBulkOpUI);
  updateBulkOpUI();
}
