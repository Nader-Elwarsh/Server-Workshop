"use strict";

const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineString, defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const cloudName = defineString("CLOUDINARY_CLOUD_NAME");
const apiKey = defineString("CLOUDINARY_API_KEY");
const allowedOrigins = defineString("UPLOAD_ALLOWED_ORIGINS");
const apiSecret = defineSecret("CLOUDINARY_API_SECRET");
const MAX_BYTES = 12 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"]);

function validMagic(buffer, mime) {
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/);
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/heic" || mime === "image/heif") return buffer.subarray(4, 12).toString("ascii").includes("ftyp");
  if (mime === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (mime === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mime === "audio/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === "audio/mpeg") return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  return false;
}
function sign(params, secret) {
  const canonical = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return crypto.createHash("sha1").update(canonical + secret).digest("hex");
}
function json(res, status, body) { res.status(status).set("Cache-Control", "no-store").json(body); }

exports.uploadImage = onRequest({ region: "us-central1", secrets: [apiSecret], timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  const origins = allowedOrigins.value().split(",").map((x) => x.trim()).filter(Boolean);
  const origin = req.get("origin") || "";
  if (!origins.includes(origin)) return json(res, 403, { error: "origin_not_allowed" });
  res.set("Access-Control-Allow-Origin", origin).set("Vary", "Origin").set("Access-Control-Allow-Headers", "Authorization, Content-Type").set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) return json(res, 401, { error: "authentication_required" });
    const decoded = await getAuth().verifyIdToken(match[1]);
    const db = getFirestore();
    const staff = await db.doc(`staff/${decoded.uid}`).get();
    if (!staff.exists) {
      const link = await db.doc(`portalLinks/${decoded.uid}`).get();
      let allowed = false;
      if (link.exists) allowed = link.data().disabled !== true && typeof link.data().customerId === "string";
      else { // عميل سجّل بنفسه من البوابة: مفيش portalLinks، والهوية = customers/{uid} (نفس منطق قواعد Firestore own()).
        const own = await db.doc(`customers/${decoded.uid}`).get();
        allowed = own.exists && own.data().portal === true;
      }
      if (!allowed) return json(res, 403, { error: "upload_not_authorized" });
    }
    const mime = String(req.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const file = req.rawBody;
    if (!MIME_TYPES.has(mime)) return json(res, 415, { error: "file_type_not_allowed" });
    if (!Buffer.isBuffer(file) || !file.length || file.length > MAX_BYTES) return json(res, 413, { error: "file_size_limit_12mb" });
    if (!validMagic(file, mime)) return json(res, 415, { error: "file_signature_invalid" });

    const cloud = cloudName.value();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "workshop-secure";
    const signature = sign({ folder, timestamp }, apiSecret.value());
    const resource = mime.startsWith("audio/") ? "video" : "image";
    const form = new FormData();
    form.append("file", new Blob([file], { type: mime }), "upload");
    form.append("api_key", apiKey.value());
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("signature", signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resource}/upload`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url) {
      console.error("Cloudinary upload rejected", response.status, result.error && result.error.message);
      return json(res, 502, { error: "cloud_upload_failed" });
    }
    return json(res, 200, { secure_url: result.secure_url, bytes: result.bytes, format: result.format });
  } catch (error) {
    console.error("Authenticated upload failed", error && error.message);
    return json(res, 500, { error: "upload_failed" });
  }
});
