"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "react-qr-code";

const APP_URL     = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL     ?? "http://localhost:3000";
const STEMPEL_URL = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://loatycard.de";

function nextCommission(planType: "annual" | "monthly", paymentCount: number) {
  const next = paymentCount + 1;
  const phase =
    planType === "annual"
      ? next === 1 ? "initial" : next === 2 ? "year2" : next === 3 ? "year3" : "year4_plus"
      : next <= 12 ? "initial" : next <= 24 ? "year2" : next <= 36 ? "year3" : "year4_plus";
  const rates: Record<string, number> = { initial: 0.20, year2: 0.05, year3: 0.10, year4_plus: 0.15 };
  const base   = planType === "annual" ? 240 : 20; // Provision nur auf den Abo-Anteil
  const amount = Math.round(base * rates[phase] * 100) / 100;
  return { amount, rate: rates[phase] };
}

export default function ShopDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const leadId   = params.leadId as string;
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const leads = useQuery(api.shopLeads.myLeads, token ? { token } : "skip");
  const lead  = leads?.find((l: any) => l._id === leadId);

  if (leads === undefined) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );

  if (!lead) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <p className="text-[#f2ede4] font-semibold">Shop nicht gefunden</p>
        <Link href="/dashboard/shops" className="text-[#c9a227] text-sm hover:underline">← Zurück</Link>
      </div>
    </div>
  );

  const contract   = (lead as any).contract;
  const payLink    = contract?.paymentToken ? `${APP_URL}/pay/${contract.paymentToken}` : null;
  const shopLink   = lead.loatycardShopSlug ? `${STEMPEL_URL}/join/${lead.loatycardShopSlug}` : null;
  const next       = contract ? nextCommission(contract.planType, contract.paymentCount) : null;
  const isPaid     = contract && contract.paymentCount > 0;

  const handleCopy = () => {
    if (!payLink) return;
    navigator.clipboard.writeText(payLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const statusLabel: Record<string, string> = {
    draft: "Entwurf", submitted: "Eingereicht", under_review: "In Prüfung",
    approved: "Genehmigt", rejected: "Abgelehnt",
    pending_payment: "Zahlung ausstehend", active: "Aktiv",
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/shops" className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2ede4" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[#f2ede4]">{lead.shopName}</h1>
          <p className="text-xs text-[rgba(242,237,228,.4)]">{lead.ownerName} · {lead.city ?? "—"}</p>
        </div>
      </div>

      {/* Status */}
      <div className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
        <p className="text-sm text-[rgba(242,237,228,.5)]">Status</p>
        <span className={`text-sm font-semibold ${
          lead.status === "active" ? "text-green-400" :
          lead.status === "rejected" ? "text-red-400" :
          lead.status === "pending_payment" ? "text-[#c9a227]" : "text-[rgba(242,237,228,.4)]"
        }`}>{statusLabel[lead.status] ?? lead.status}</span>
      </div>

      {/* Zahlungslink — nur vor erster Zahlung */}
      {payLink && !isPaid && !lead.loatycardShopId && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.25)" }}>
          <div>
            <p className="text-xs font-semibold text-[#c9a227] mb-1">Zahlungslink für den Inhaber</p>
            <p className="text-[11px] text-[rgba(242,237,228,.4)]">
              Schick diesen Link an {lead.ownerName} — er zahlt direkt online.
            </p>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
            style={{ background: "rgba(201,162,39,.06)", border: "1px solid rgba(201,162,39,.15)" }}>
            <p className="flex-1 text-[10px] text-[rgba(242,237,228,.4)] font-mono truncate">{payLink}</p>
            <button onClick={handleCopy}
              className="text-xs font-semibold flex-shrink-0 transition-colors"
              style={{ color: copied ? "#4ade80" : "#c9a227" }}>
              {copied ? "✓ Kopiert!" : "Kopieren"}
            </button>
          </div>
          <div className="flex gap-2">
            <a href={`mailto:${lead.ownerEmail}?subject=Dein Loatycard Zahlungslink&body=Hallo ${lead.ownerName},%0A%0Ahier ist dein persönlicher Zahlungslink:%0A${payLink}%0A%0ABei Fragen melde dich gerne.`}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-center transition-colors"
              style={{ background: "rgba(201,162,39,.1)", border: "1px solid rgba(201,162,39,.2)", color: "#c9a227" }}>
              Per E-Mail
            </a>
            <button onClick={() => setShowQR(v => !v)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors"
              style={showQR
                ? { background: "rgba(201,162,39,.2)", border: "1px solid rgba(201,162,39,.4)", color: "#c9a227" }
                : { background: "rgba(201,162,39,.1)", border: "1px solid rgba(201,162,39,.2)", color: "#c9a227" }}>
              {showQR ? "QR ausblenden" : "QR-Code"}
            </button>
          </div>

          <Link href="/dashboard/shops"
            className="block w-full py-2.5 rounded-xl text-xs font-semibold text-center mt-1"
            style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)", color: "rgba(242,237,228,.4)" }}>
            Kunde zahlt später — zur Übersicht
          </Link>

          {showQR && (
            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="rounded-2xl p-4 bg-white">
                <QRCode value={payLink} size={180} />
              </div>
              <p className="text-[10px] text-[rgba(242,237,228,.3)] text-center">
                Kamera draufhalten — öffnet den Zahlungslink direkt
              </p>
            </div>
          )}
        </div>
      )}

      {/* Shop live */}
      {shopLink && (
        <a href={shopLink} target="_blank" rel="noreferrer"
          className="flex items-center justify-between rounded-2xl p-4"
          style={{ background: "rgba(74,222,128,.06)", border: "1px solid rgba(74,222,128,.2)" }}>
          <div>
            <p className="text-sm font-semibold text-green-400">✓ Shop ist live</p>
            <p className="text-[10px] text-[rgba(242,237,228,.4)] font-mono mt-0.5">{lead.loatycardShopSlug}</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}

      {/* Vertrag & Provision */}
      {contract && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
          <p className="text-xs font-semibold text-[rgba(242,237,228,.3)] uppercase tracking-wider">Vertrag</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[rgba(242,237,228,.6)]">Plan</p>
            <p className="text-sm font-semibold text-[#f2ede4]">
              {contract.planType === "annual" ? "Jahresabo (€240)" : "Monatsabo (€20)"}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[rgba(242,237,228,.6)]">Zahlungen</p>
            <p className="text-sm font-semibold text-[#f2ede4]">{contract.paymentCount}</p>
          </div>
          {next && (
            <div className="flex items-center justify-between pt-2"
              style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <p className="text-sm text-[rgba(242,237,228,.6)]">Nächste Provision</p>
              <p className="text-sm font-bold text-[#c9a227]">€{next.amount.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* Inhaber-Info */}
      <div className="rounded-2xl p-4 space-y-2"
        style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
        <p className="text-xs font-semibold text-[rgba(242,237,228,.3)] uppercase tracking-wider">Inhaber</p>
        <p className="text-sm text-[#f2ede4]">{lead.ownerName}</p>
        <a href={`mailto:${lead.ownerEmail}`} className="text-xs text-[#c9a227] hover:underline">{lead.ownerEmail}</a>
        {lead.city && <p className="text-xs text-[rgba(242,237,228,.4)]">{lead.city}</p>}
      </div>

    </div>
  );
}
