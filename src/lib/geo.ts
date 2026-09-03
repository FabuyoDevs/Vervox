/* Automatic country & currency detection.
   ------------------------------------------------------------------
   Resolves the visitor's billing currency from IP metadata (ipapi.co, free,
   no key required). Result is cached for 24h, mirrored onto
   `window.userDetectedCurrency` (used by the Flutterwave trigger) and always
   degrades gracefully to USD when the request fails or is blocked.
   ------------------------------------------------------------------ */

export type Currency = "NGN" | "USD" | "GBP" | "EUR" | "KES" | "GHS";

export const SUPPORTED_CURRENCIES: Currency[] = ["NGN", "USD", "GBP", "EUR", "KES", "GHS"];
export const DEFAULT_CURRENCY: Currency = "USD";

const LS_CURRENCY = "vervox:currency";
const LS_COUNTRY = "vervox:country";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface GeoResult {
  currency: Currency;
  country: string | null;
  source: "cache" | "ip" | "fallback";
}

declare global {
  interface Window {
    userDetectedCurrency?: string;
  }
}

const normalise = (code: unknown): Currency | null => {
  if (typeof code !== "string") return null;
  const upper = code.toUpperCase() as Currency;
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : null;
};

const cache = (currency: Currency, country: string | null) => {
  try {
    localStorage.setItem(LS_CURRENCY, JSON.stringify({ currency, country, at: Date.now() }));
  } catch {
    /* private mode — detection simply re-runs next session */
  }
};

export const storedCurrency = (): Currency | null => {
  try {
    const raw = localStorage.getItem(LS_CURRENCY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { currency?: string; at?: number };
    if (!parsed.at || Date.now() - parsed.at > TTL_MS) return null;
    return normalise(parsed.currency);
  } catch {
    return null;
  }
};

export const storedCountry = (): string | null => {
  try {
    return localStorage.getItem(LS_COUNTRY);
  } catch {
    return null;
  }
};

/** Best-effort IP lookup; never throws, never blocks the UI for long. */
export async function detectCurrency(timeoutMs = 4500): Promise<GeoResult> {
  const cached = storedCurrency();
  if (cached) return { currency: cached, country: storedCountry(), source: "cache" };

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: controller?.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`geo lookup ${res.status}`);
    const data = (await res.json()) as { currency?: string; country_name?: string; country?: string };
    const currency = normalise(data.currency) ?? DEFAULT_CURRENCY;
    const country = data.country_name ?? data.country ?? null;
    cache(currency, country);
    if (country) {
      try {
        localStorage.setItem(LS_COUNTRY, country);
      } catch {
        /* ignore */
      }
    }
    return { currency, country, source: "ip" };
  } catch {
    return { currency: DEFAULT_CURRENCY, country: null, source: "fallback" };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
