"use client";

import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { useState } from "react";
import TestPaymentButton from "./TestPaymentButton"; // ⚠️ TEST-ONLY — vor Live-Schaltung entfernen
import { errMsg } from "@/app/lib/errMsg";
import { TIERS, tierRangeLabel } from "@/convex/pricing";

export default function PayPage() {
  const params = useParams();
  const token  = params.token as string;

  const info                  = useQuery(api.payments.getByPaymentToken, { token });
  const createStripe          = useAction(api.payments.createStripeCheckout);
  const requestPayLater       = useMutation(api.payments.requestPayLater);

  const [payLaterLoading, setPayLaterLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [error, setError]                 = useState("");

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

  if (info.activated) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f2ede4]">Alles erledigt</h2>
          <p className="text-sm text-[rgba(242,237,228,.5)] mt-2">
            Deine Zahlungsdaten sind hinterlegt und deine LoyaltyCard-Stempelkarte wird eingerichtet.
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

  const isFree = info.amount === 0;

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-10 space-y-6 flex flex-col justify-center">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">LoyaltyCard</div>
        <h1 className="text-2xl font-bold text-[#f2ede4]">{isFree ? "Kostenlos starten" : "Zahlung einrichten"}</h1>
      </div>

      {/* Tarif-Übersicht */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.25)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#f2ede4]">{info.shopName}</p>
            <p className="text-xs text-[rgba(242,237,228,.4)]">Start: {info.tierName} ({info.tierRange})</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#c9a227]">€{info.amount}</p>
            <p className="text-[10px] text-[rgba(242,237,228,.4)]">pro Monat</p>
          </div>
        </div>

        {/* Alle Stufen */}
        <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,.06)]">
          {TIERS.map(t => (
            <div key={t.id} className="flex justify-between text-xs">
              <span className={t.id === info.tier ? "text-[#e8c96a] font-semibold" : "text-[rgba(242,237,228,.5)]"}>
                {t.name} · {tierRangeLabel(t.id)}
              </span>
              <span className={t.id === info.tier ? "text-[#e8c96a] font-semibold" : "text-[rgba(242,237,228,.7)]"}>
                {t.monthly === 0 ? "kostenlos" : `€${t.monthly}/Monat`}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-1">
            <span className="text-[rgba(242,237,228,.5)]">Einrichtung, Design & Bonusprogramm</span>
            <span className="text-green-400">inklusive</span>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-[rgba(242,237,228,.45)]">
          {isFree
            ? "Bis 25 Kunden zahlst du nichts. Du hinterlegst nur einmal deine Zahlungsdaten (SEPA-Lastschrift oder Karte). Erst wenn du mehr Kunden hast, gilt automatisch die nächste Stufe, wir sagen dir vorher Bescheid."
            : "Der Betrag wird monatlich über deine hinterlegte Zahlart abgebucht. Wächst du in eine höhere Stufe, sagen wir dir vorher Bescheid."}
        </p>
        <p className="text-[10px] text-[rgba(242,237,228,.3)]">Monatliche Abrechnung · jederzeit kündbar</p>
      </div>

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
              {isFree ? "Zahlungsdaten hinterlegen" : "Mit SEPA-Lastschrift / Karte zahlen"}
            </>
          )}
        </button>
      </div>

      {/* Später zahlen (nur Direkt-Shops): merkt die Zahlung vor, Link bleibt gültig */}
      {info.canPayLater && !info.payLaterAt && (
        <button
          onClick={async () => {
            setPayLaterLoading(true); setError("");
            try { await requestPayLater({ token }); }
            catch (e: any) { setError(errMsg(e, "Fehler")); }
            finally { setPayLaterLoading(false); }
          }}
          disabled={payLaterLoading}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-[rgba(242,237,228,.7)] disabled:opacity-50"
          style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.12)" }}>
          {payLaterLoading ? "Wird vorgemerkt..." : "Später einrichten"}
        </button>
      )}
      {info.payLaterAt ? (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.3)", color: "#e8c96a" }}>
          Alles klar, das ist zum späteren Abschluss vorgemerkt. Dieser Link
          bleibt gültig, du kannst jederzeit hierher zurückkommen.
        </div>
      ) : null}

      {error && (
        <p className="text-center text-red-400 text-sm">{error}</p>
      )}

      <TestPaymentButton token={token} />{/* ⚠️ TEST-ONLY — vor Live-Schaltung entfernen */}

      <p className="text-center text-[10px] text-[rgba(242,237,228,.2)]">
        Sichere Zahlung über Stripe · SSL-verschlüsselt · LoyaltyCard GmbH
      </p>
    </div>
  );
}
