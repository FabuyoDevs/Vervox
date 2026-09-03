import { useState, type ReactNode } from "react";
import { IconCheck, IconCloud, IconInbox, IconLink, IconX } from "@/components/Icons";
import { CATALOG, formatPrice, priceLabel, skuPrice, SKU_ORDER, type Currency, type Sku } from "@/lib/billing";
import type { Entitlements, SkuId, Tier } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  entitlements: Entitlements;
  currency: Currency;
  onBuy: (sku: SkuId) => Promise<unknown>;
  onRestore: () => Promise<void>;
  sandbox: boolean;
}

const TIER_LABEL: Record<Tier, string> = { free: "Free", unlocked: "Unlocked", pro: "Pro" };

const owned = (sku: Sku, e: Entitlements): boolean =>
  sku.id === "themes_pack" ? e.themes : sku.id === "cloud_media" ? e.cloudMedia : sku.id === "pods_lifetime" ? e.pods : e.pro;

const ICONS: Record<SkuId, ReactNode> = {
  themes_pack: <span className="text-lg">🎨</span>,
  cloud_media: <IconCloud width={18} height={18} />,
  pods_lifetime: <IconLink width={18} height={18} />,
  pro_bundle: <IconInbox width={18} height={18} />,
};

export default function StoreSheet({ open, onClose, entitlements, currency, onBuy, onRestore, sandbox }: Props) {
  const [busy, setBusy] = useState<SkuId | null>(null);
  if (!open) return null;

  const purchase = async (sku: SkuId) => {
    setBusy(sku);
    try {
      await onBuy(sku);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vx-overlay fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm sm:items-center sm:p-4">
      <div className="vx-sheet max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-3xl border sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Vervox Store</h2>
            <p className="text-[11px] text-slate-500">
              Current tier:{" "}
              <span
                className={`font-semibold ${
                  entitlements.tier === "pro" ? "text-indigo-600" : entitlements.tier === "unlocked" ? "text-emerald-600" : "text-slate-600"
                }`}
              >
                {TIER_LABEL[entitlements.tier]}
              </span>
              <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">
                {currency}
              </span>
              {sandbox && <span className="ml-2 text-amber-600">· sandbox mode</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <IconX width={18} height={18} />
          </button>
        </div>

        <div className="max-h-[68vh] space-y-2.5 overflow-y-auto px-4 py-4">
          {SKU_ORDER.map((id) => {
            const sku = CATALOG[id] as Sku;
            const isOwned = owned(sku, entitlements);
            const includedInPro = entitlements.pro && !isOwned;
            return (
              <div
                key={id}
                className={`rounded-2xl border p-3.5 ${
                  isOwned ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-indigo-600">
                    {ICONS[id]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-semibold text-slate-900">{sku.name}</p>
                      {sku.badge && !isOwned && (
                        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700">
                          {sku.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">{sku.blurb}</p>
                    <ul className="mt-1.5 space-y-0.5">
                      {sku.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          <IconCheck width={11} height={11} className="text-emerald-500" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold text-slate-900">{priceLabel(sku, currency)}</p>
                    {isOwned ? (
                      <span className="mt-1.5 inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Owned
                      </span>
                    ) : includedInPro ? (
                      <span className="mt-1.5 inline-block rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                        In Pro
                      </span>
                    ) : (
                      <button
                        onClick={() => void purchase(id)}
                        disabled={busy === id}
                        className="mt-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {busy === id ? "…" : "Buy"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <button onClick={() => void onRestore()} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
            Restore purchases
          </button>
          <span className="text-[10px] text-slate-400">
            Paying in {currency} · {formatPrice(skuPrice("pro_bundle", currency), currency)} for the Pro Bundle
          </span>
        </div>

        <p className="px-4 pb-4 text-center text-[10px] leading-relaxed text-slate-500">
          {sandbox
            ? "No Flutterwave public key configured — purchases are issued as sandbox receipts so the flow stays testable. Set REACT_APP_FLUTTERWAVE_PUBLIC_KEY to charge real money."
            : "Payments are handled by Flutterwave Inline — card, USSD, bank transfer and mobile money in your local currency."}
        </p>
      </div>
    </div>
  );
}
