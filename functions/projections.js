"use strict";
/* projections.js — بيكتب نسخ العرض (techOrders / portalOrders) من السيرفر مع كل تعديل في requests/{id}.
   بيتضاف لـ index.js بسطر: Object.assign(exports, require("./projections"));
   الأجهزة القديمة لسه بتكتب نفس النسخ وهي مفتوحة — نفس المحتوى، فمفيش تعارض. */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const P = require("./projections-core");

const region = defineString("NOTIFY_REGION", { default: "us-central1" });

const project = P.makeProject(() => FieldValue.serverTimestamp());

exports.projectRequest = onDocumentWritten({ document: "requests/{id}", region, maxInstances: 5, memory: "256MiB", timeoutSeconds: 60, retry: false }, async (ev) => {
  try { await project(getFirestore(), ev.params.id, ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null); }
  catch (e) { console.error("[projectRequest]", ev.params.id, e && e.message); }
});
