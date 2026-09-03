/* Flutterwave Inline monetisation with multi-currency pricing.
   ------------------------------------------------------------------
   Prices come from PRICING_TABLE keyed by the visitor's detected currency
   (see src/lib/geo.ts). Checkout runs through Flutterwave Inline
   (checkout.flutterwave.com/v3.js, loaded in index.html), so card / USSD /
   bank-transfer / mobile-money details never touch Vervox. The public key is
   read from environment variables only. With no key configured, a clearly
   labelled sandbox receipt is issued so the flow stays testable.
   ------------------------------------------------------------------ */
import { envPair } from "./env";
import { DEFAULT_CURRENCY, type Currency } from "./geo";
import type { Entitlements, Purchase, SkuId, Tier } from "./types";

export type { Currency };

/** Local amount per SKU per currency. Falls back to USD when unsupported. */
export const PRICING_TABLE: Record<SkuId, Partial<Record<Currency, number>>> = {
  themes_pack: { NGN: 1500, USD: 1.99, GBP: 1.5, EUR: 1.8, KES: 260, GHS: 22 },
  cloud_media: { NGN: 2500, USD: 2.99, GBP: 2.3, EUR: 2.7, KES: 390, GHS: 33 },
  pods_lifetime: { NGN: 4000, USD: 4.99, GBP: 3.9, EUR: 4.5, KES: 650, GHS: 55 },
  pro_bundle: { NGN: 5000, USD: 5.99, GBP: 4.6, EUR: 5.4, KES: 780, GHS: 66 },
};

export interface Sku {
  id: SkuId;
  name: string;
  interval: "once" | "month";
  blurb: string;
  perks: string[];
  badge?: string;
}

export const CATALOG: Record<SkuId, Sku> = {
  themes_pack: {
    id: "themes_pack",
    name: "Themes & Sounds Pack",
    interval: "once",
    blurb: "Four bright themes and four chime voices.",
    perks: ["Sky, Citrus & Graphite themes", "Bell, Marimba & Retro chimes", "One-time · yours forever"],
  },
  cloud_media: {
    id: "cloud_media",
    name: "Cloud Proof & Media",
    interval: "month",
    blurb: "Attach photo proof and 15-second voice notes to completed tasks.",
    perks: ["Firebase Storage uploads", "Photos + 15s voice notes", "Syncs across every device"],
  },
  pods_lifetime: {
    id: "pods_lifetime",
    name: "Lifetime Group Pods",
    interval: "once",
    blurb: "Unlock shared workspaces for up to six people.",
    perks: ["Pods of 3–6 members", "Shared task rows for the whole pod", "One-time · no subscription"],
  },
  pro_bundle: {
    id: "pro_bundle",
    name: "Pro Bundle",
    interval: "month",
    blurb: "Every Vervox feature, unlocked and synced.",
    perks: ["Themes & sound packs", "Cloud proof & media", "Group pods (6 members)", "Priority new features"],
    badge: "Best value",
  },
};

export const SKU_ORDER: SkuId[] = ["themes_pack", "cloud_media", "pods_lifetime", "pro_bundle"];

export const flutterwaveKey = (): string => "";

/** Amount for a SKU in the given currency (defaults to the detected one). */
export function skuPrice(sku: SkuId, currency: Currency = currentCurrency()): number {
  const row = PRICING_TABLE[sku] ?? {};
  return row[currency] ?? row.USD ?? 0;
}

const LOCALES: Partial<Record<Currency, string>> = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  KES: "en-KE",
  GHS: "en-GH",
};

const SYMBOLS: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€", KES: "KSh", GHS: "₵" };

/** Formats 1500 NGN → "₦1,500", 1.99 USD → "$1.99", 1.5 GBP → "£1.50". */
export function formatPrice(amount: number, currency: Currency = currentCurrency()): string {
  const fractionDigits = Number.isInteger(amount) && currency !== "USD" ? 0 : 2;
  try {
    return new Intl.NumberFormat(LOCALES[currency] ?? "en", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${SYMBOLS[currency] ?? ""}${amount.toLocaleString("en")}`;
  }
}

export const priceLabel = (sku: Sku, currency: Currency = currentCurrency()) =>
  `${formatPrice(skuPrice(sku.id, currency), currency)}${sku.interval === "month" ? " / mo" : " once"}`;

/* ------------------------- Entitlements ------------------------- */

const LS_PURCHASES = "vervox:purchases";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const SUBSCRIPTION_SKUS: SkuId[] = ["cloud_media", "pro_bundle"];

export const DEFAULT_FREE_PURCHASES: Purchase[] = [
  { sku: "pro_bundle", at: 0, mode: "demo", renews_at: null },
  { sku: "themes_pack", at: 0, mode: "demo", renews_at: null },
  { sku: "cloud_media", at: 0, mode: "demo", renews_at: null },
  { sku: "pods_lifetime", at: 0, mode: "demo", renews_at: null },
];

export const isActive = (p: Purchase): boolean => !p.renews_at || p.renews_at > Date.now();

/**
 * Free Pro Tier Active: Unconditionally returns Pro status and grants all feature entitlements
 * (themes, cloud media, pods) while preserving the underlying IAP data contract.
 */
export function computeEntitlements(purchases: Purchase[] = []): Entitlements {
  const effective = purchases && purchases.length > 0 ? purchases : DEFAULT_FREE_PURCHASES;
  return {
    tier: "pro",
    pro: true,
    themes: true,
    cloudMedia: true,
    pods: true,
    purchases: effective,
  };
}

export const FREE_ENTITLEMENTS: Entitlements = computeEntitlements(DEFAULT_FREE_PURCHASES);

export const loadPurchases = (): Purchase[] => {
  try {
    const raw = localStorage.getItem(LS_PURCHASES);
    if (!raw) {
      savePurchases(DEFAULT_FREE_PURCHASES);
      return DEFAULT_FREE_PURCHASES;
    }
    const parsed = JSON.parse(raw) as Purchase[];
    return parsed.length > 0 ? parsed : DEFAULT_FREE_PURCHASES;
  } catch {
    return DEFAULT_FREE_PURCHASES;
  }
};

export const savePurchases = (list: Purchase[]) => localStorage.setItem(LS_PURCHASES, JSON.stringify(list));

export function recordPurchase(sku: SkuId, mode: "live" | "demo" = "demo"): Purchase {
  const purchase: Purchase = {
    sku,
    at: Date.now(),
    mode,
    renews_at: null,
  };
  const list = loadPurchases();
  const index = list.findIndex((p) => p.sku === sku);
  if (index >= 0) list[index] = purchase;
  else list.push(purchase);
  savePurchases(list);
  return purchase;
}

/* ---------------- Payment / IAP Hooks (Preserved) ---------------- */

export interface PaymentOptions {
  email?: string;
  name?: string;
  deviceId?: string;
  uid?: string | null;
  onSuccess?: (data: unknown, sku: SkuId) => void;
  onClose?: () => void;
  onUnavailable?: () => void;
}

/** Currency resolved by src/lib/geo.ts (window.userDetectedCurrency), else USD. */
export function currentCurrency(): Currency {
  const fromWindow = window.userDetectedCurrency;
  const upper = typeof fromWindow === "string" ? (fromWindow.toUpperCase() as Currency) : null;
  return upper && upper in PRICING_TABLE.themes_pack ? upper : DEFAULT_CURRENCY;
}

/**
 * Payments stripped: All features are granted for free.
 * Preserved as a stub for future App Store / Google Play In-App Purchases (IAP).
 */
export function triggerFlutterwavePayment(_sku: SkuId, _title: string, options: PaymentOptions = {}): boolean {
  options.onUnavailable?.();
  return false;
}

export interface CheckoutResult {
  ok: boolean;
  mode: "live" | "demo";
  message: string;
  purchase?: Purchase;
}
