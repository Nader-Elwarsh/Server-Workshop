/* backup-reminder.js — بانر في الصفحة الرئيسية بس، بيفكّر المستخدم لو
   فات على آخر نسخة احتياطية أكتر من 14 يوم (أو معملش نسخة أبدًا).
   بيعتمد على daysSinceLastBackup() الموجودة في app-data-management.js
   (لازم يتحمّل بعده). ممكن "يأجّل" التذكير 3 أيام من غير ما يعمل نسخة،
   محفوظ في wf_backup_reminder_snoozed_until (WFStorage). */
(function () {
  "use strict";

  var REMINDER_AFTER_DAYS = 14;
  var SNOOZE_DAYS = 3;

  // لازم ننتظر تحميل التخزين (IndexedDB) قبل القراءة؛ قبله آخر نسخة والتأجيل
  // بيرجعوا فاضيين فالبانر كان بيظهر غلط حتى بعد النسخ أو التأجيل.
  function ready(fn) {
    function go() { var r = window.WFStorageReady; if (r && typeof r.then === "function") r.then(fn, fn); else fn(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
    else go();
  }

  function isSnoozed() {
    try {
      var until = WFStorage.getItem("wf_backup_reminder_snoozed_until");
      if (!until) return false;
      return new Date(until).getTime() > Date.now();
    } catch (e) {
      return false;
    }
  }

  function snooze() {
    try {
      var d = new Date();
      d.setDate(d.getDate() + SNOOZE_DAYS);
      WFStorage.setItem("wf_backup_reminder_snoozed_until", d.toISOString());
      var save = typeof WFStorage.flush === "function" ? WFStorage.flush() : Promise.resolve(true);
      return Promise.resolve(save).then(function () {
        var reminder = document.getElementById("manualBackupReminder");
        if (reminder) reminder.remove();
        return true;
      }).catch(function (error) {
        console.error("[backup-reminder] تعذر حفظ التأجيل", error);
        var status = document.querySelector("#manualBackupReminder .backup-reminder-save-error");
        if (status) { status.hidden = false; status.textContent = "تعذر حفظ التأجيل. تحقق من اتصالك ثم حاول مرة أخرى."; }
        return false;
      });
    } catch (error) {
      console.error("[backup-reminder] تعذر حفظ التأجيل", error);
      return Promise.resolve(false);
    }
  }

  function removeManualReminder() {
    var reminder = document.getElementById("manualBackupReminder");
    if (reminder) reminder.remove();
  }

  function renderBackupReminder() {
    var host = document.getElementById("backupReminder");
    if (!host) return;
    if (typeof daysSinceLastBackup !== "function") return;
    if (isSnoozed()) {
      removeManualReminder();
      return;
    }
    var days = daysSinceLastBackup();
    var overdue = days === null || days >= REMINDER_AFTER_DAYS;
    if (!overdue) {
      removeManualReminder();
      return;
    }
    var msg = days === null
      ? "لسه معملتش أي نسخة احتياطية من بيانات الورشة أبدًا."
      : `فات ${days} يوم من غير نسخة احتياطية جديدة.`;
    var markup =
      '<div id="manualBackupReminder" class="notice backup-reminder-banner">' +
      "⚠️ " + msg + " لو الجهاز ضاع أو اتعطّل من غير نسخة، البيانات كلها بتضيع." +
      '<div class="backup-reminder-actions">' +
      '<a class="primary small-btn" href="settings.html#backup-restore">💾 اعمل نسخة دلوقتي</a>' +
      '<button class="secondary small-btn" type="button" data-wf-event="click" data-wf-code="snoozeBackupReminder()">تذكير بعد 3 أيام</button>' +
      '</div><small class="backup-reminder-save-error" role="status" hidden></small>' +
      "</div>";
    var existing = document.getElementById("manualBackupReminder");
    if (existing) existing.outerHTML = markup;
    else host.insertAdjacentHTML("afterbegin", markup);
    // بانر واحد بس في كل مرة: سؤال النسخ التلقائي يستنى لحد ما يختفي التذكير ده.
    var ask = document.getElementById("automaticBackupPermission");
    if (ask) ask.remove();
  }

  window.renderBackupReminder = renderBackupReminder;
  window.snoozeBackupReminder = snooze;

  ready(renderBackupReminder);
})();
