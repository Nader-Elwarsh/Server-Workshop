/* سجل تدقيق محلي للعمليات الحساسة. لا يسجل كلمات المرور أو نصوص العملاء الحساسة. */
(function () {
  "use strict";
  const KEY = "wf_audit_log", LIMIT = 300;
  function readStored() { try { const v = JSON.parse(WFStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function read() { return readStored().concat(pending).slice(-LIMIT); }
  let pending = [], scheduled = false;
  function flush() { scheduled = false; if (!pending.length) return; const add = pending; pending = []; const list = readStored(); list.push.apply(list, add); write(list); }
  function write(v) { try { WFStorage.setItem(KEY, JSON.stringify(v.slice(-LIMIT))); return true; } catch (_) { return false; } }
  window.auditLog = function (action, entity, entityId, details) {
    const row = { id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(), at: new Date().toISOString(), action: String(action || ""), entity: String(entity || ""), entityId: String(entityId || "") };
    if (details) row.details = String(details).slice(0, 240);
    // كذا عملية ورا بعض (زي تصحيح أرقام أوامر كتير): كتابة واحدة في آخر الدورة بدل كتابة السجل كله مع كل سطر
    pending.push(row);
    if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
    return row;
  };
  window.getAuditLog = function () { return read().slice().reverse(); };
  window.clearAuditLog = function () { pending = []; return write([]); };
})();
