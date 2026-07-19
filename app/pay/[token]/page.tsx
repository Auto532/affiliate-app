"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { useState } from "react";
import TestPaymentButton from "./TestPaymentButton"; // ⚠️ TEST-ONLY — vor Live-Schaltung entfernen
import { errMsg } from "@/app/lib/errMsg";

export default function PayPage() {
  const params = useParams();
  const token  = params.token as string;

  const info                  = useQuery(api.payments.getByPaymentToken, { token });
  const createStripe          = useAction(api.payments.createStripeCheckout);
  const applyDiscount         = useAction(api.payments.applyDiscountCode);

  const [stripeLoading, setStripeLoading] = useState(false);
  const [error, setError]                 = useState("");
  const [code, setCode]                   = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountMsg, setDiscountMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const handleApplyDiscount = async () => {
    if (!code.trim()) return;
    setDiscountLoading(true); setDiscountMsg(null);
    try {
      // Nur der eingetippte String geht raus — der Server entscheidet über den Rabatt.
      const res = await applyDiscount({ paymentToken: token, code });
      if (res.valid) {
        setDiscountMsg({ ok: true, text: `${res.label} aktiviert, du zahlst €${res.discountedPrice} statt €${res.normalPrice}.` });
      } else {
        setDiscountMsg({ ok: false, text: res.reason ?? "Code ungültig" });
      }
    } catch (e: any) {
      setDiscountMsg({ ok: false, text: errMsg(e, "Fehler") });
    } finally { setDiscountLoading(false); }
  };

  if (info === undefined) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );

  if (info === null) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <p className="text-xl font-bold text-[#f2ede4]">Ungültiger Zahlungslink</p>
        <p className="text-sm text-[rgba(242,237,228,.4)]">Dieser Link ist nicht gültig oder abgelaufen.</p>
      </div>
    </div>
  );

  if (info.paymentCount > 0) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f2ede4]">Zahlung abgeschlossen</h2>
          <p className="text-sm text-[rgba(242,237,228,.5)] mt-2">
            Deine Loatycard-Stempelkarte wird eingerichtet.
          </p>
        </div>
      </div>
    </div>
  );

  const handleStripe = async () => {
    setStripeLoading(true); setError("");
    try {
      const { url } = await createStripe({ paymentToken: token });
      if (url) window.location.href = url;
    } catch (e: any) {
      setError(errMsg(e, "Fehler"));
      setStripeLoading(false);
    }
  };

  const planLabel = info.planType === "annual" ? "Jahresabo" : "Monatsabo";

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-10 space-y-6 flex flex-col justify-center">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Loatycard</div>
        <h1 className="text-2xl font-bold text-[#f2ede4]">Zahlung abschließen</h1>
      </div>

      {/* Bestellübersicht */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.25)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#f2ede4]">{info.shopName}</p>
            <p className="text-xs text-[rgba(242,237,228,.4)]">Loatycard {planLabel}</p>
          </div>
          <div className="text-right">
            {info.firstYearDiscount ? (
              <>
                <p className="text-xs text-[rgba(242,237,228,.35)] line-through">€{info.normalPrice}</p>
                <p className="text-2xl font-bold text-[#c9a227]">€{info.payableAmount}</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-[#c9a227]">€{info.payableAmount}</p>
            )}
          </div>
        </div>

        {/* Aufschlüsselung */}
        <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,.06)]">
          <div className="flex justify-between text-xs">
            <span className="text-[rgba(242,237,228,.5)]">{planLabel}</span>
            <span className="text-[rgba(242,237,228,.7)]">€{info.aboPrice}</span>
          </div>
          {info.rewardCount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[rgba(242,237,228,.5)]">
                Bonusprogramm ({info.rewardCount} Belohnung{info.rewardCount === 1 ? "" : "en"})
              </span>
              <span className="text-[rgba(242,237,228,.7)]">€{info.rewardsPrice}</span>
            </div>
          )}
          {info.setupFee > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[rgba(242,237,228,.5)]">Einrichtung & individuelles Design (einmalig)</span>
              <span className="text-[rgba(242,237,228,.7)]">€{info.setupFee}</span>
            </div>
          )}
          {info.firstYearDiscount ? (
            <div className="flex justify-between text-xs">
              <span className="text-green-400">Rabatt {info.discountCode ?? ""} (−{Math.round(info.firstYearDiscount * 100)}%)</span>
              <span className="text-green-400">−€{Math.round((info.normalPrice - info.payableAmount) * 100) / 100}</span>
            </div>
          ) : null}
        </div>

        {info.firstYearDiscount && (
          <div className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", color: "#4ade80" }}>
            −{Math.round(info.firstYearDiscount * 100)}% {info.discountCode ?? "Rabatt"} · nur 1. Jahr
          </div>
        )}
        {info.planType === "annual" && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Einmalige Jahreszahlung · automatisch verlängerbar{info.firstYearDiscount ? " (ab Jahr 2 zum Normalpreis)" : ""}</p>
        )}
        {info.planType === "monthly" && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Monatliche Zahlung · jederzeit kündbar</p>
        )}
        {info.paymentCount > 0 && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Zahlung #{info.paymentCount + 1}</p>
        )}
      </div>

      {/* Rabattcode */}
      {info.paymentCount === 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Rabattcode"
              className="flex-1 px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm uppercase tracking-wider"
            />
            <button onClick={handleApplyDiscount} disabled={discountLoading || !code.trim()}
              className="px-5 py-3 rounded-xl text-sm font-semibold text-[#0d0c0a] disabled:opacity-40"
              style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
              {discountLoading ? "..." : "Einlösen"}
            </button>
          </div>
          {discountMsg && (
            <p className={`text-xs ${discountMsg.ok ? "text-green-400" : "text-red-400"}`}>{discountMsg.text}</p>
          )}
        </div>
      )}

      {/* Stripe */}
      <div className="space-y-3">
        <button onClick={handleStripe} disabled={stripeLoading}
          className="w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-3 disabled:opacity-50 transition-opacity"
          style={{ background: "#635BFF" }}>
          {stripeLoading ? (
            <span className="animate-pulse">Weiterleitung...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Mit Karte / SEPA zahlen
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="text-center text-red-400 text-sm">{error}</p>
      )}

      <TestPaymentButton token={token} />{/* ⚠️ TEST-ONLY — vor Live-Schaltung entfernen */}

      <p className="text-center text-[10px] text-[rgba(242,237,228,.2)]">
        Sichere Zahlung · SSL-verschlüsselt · Loatycard GmbH
      </p>
    </div>
  );
}
