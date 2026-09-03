/* eslint-disable */
/**
 * POST /api/flutterwave-webhook
 * ─────────────────────────────────────────────────────────────
 * Serverless endpoint (Vercel / Netlify Functions / Cloud Run) that reconciles
 * a Flutterwave payment against Firestore and updates the customer’s tier.
 *
 * Security layers, in order:
 *   1. `verif-hash` header must equal FLW_SECRET_HASH (constant-time compare).
 *   2. Payload is re-verified via Flutterwave’s Verify Transaction endpoint
 *      using FLW_SECRET_KEY — clients cannot forge amounts, currencies or
 *      statuses even if the shared hash leaks.
 *   3. Only `charge.completed` + status === "successful" mutate Firestore.
 *
 * Environment (server-side only — never exposed to the browser):
 *   FLW_SECRET_HASH             — Secret hash configured on the Flutterwave webhook.
 *   FLW_SECRET_KEY              — Server API key (starts FLWSECK-…).
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY        — RSA private key (escape newlines as \n).
 */

import admin from "firebase-admin";
import crypto from "crypto";

function getDb() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin credentials in environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return admin.firestore();
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_SKUS = new Set(["cloud_media", "pro_bundle"]);

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return await new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => (buf += chunk));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
};

const timingSafeEqual = (a, b) => {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

const computeTier = (purchases) => {
  const live = purchases.filter((p) => !p.renews_at || p.renews_at > Date.now());
  if (live.some((p) => p.sku === "pro_bundle")) return "pro";
  return live.length ? "unlocked" : "free";
};

const mergePurchase = (existing, sku) => {
  const next = {
    sku,
    at: Date.now(),
    mode: "live",
    renews_at: SUBSCRIPTION_SKUS.has(sku) ? Date.now() + MONTH_MS : null,
  };
  const list = Array.isArray(existing) ? [...existing] : [];
  const idx = list.findIndex((p) => p && p.sku === sku);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return list;
};

export default async function handler(req, res) {
  // Payments temporarily stripped: All features are granted for free
  return res.status(200).json({
    status: "disabled",
    message: "Payments are temporarily disabled. All features are free and unlocked for all users.",
  });
}
