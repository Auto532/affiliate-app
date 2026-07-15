"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

const APP_URL       = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL ?? "http://localhost:3000";
const STEMPEL_URL   = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://loatycard.de";

function CopyPaymentLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${APP_URL}/pay/${token}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-[rgba(242,237,228,.4)] uppercase tracking-wider">Zahlungslink für Shop-Inhaber</p>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ background: "rgba(201,162,39,.06)", border: "1px solid rgba(201,162,39,.2)" }}>
        <p className="flex-1 text-[10px] text-[rgba(242,237,228,.4)] font-mono truncate">{link}</p>
        <button onClick={handleCopy}
          className="text-xs font-semibold flex-shrink-0 transition-colors"
          style={{ color: copied ? "#4ade80" : "#c9a227" }}>
          {copied ? "✓ Kopiert!" : "Kopieren"}
        </button>
      </div>
      <p className="text-[10px] text-[rgba(242,237,228,.25)]">
        Schick diesen Link dem Shop-Inhaber — er zahlt direkt online.
      </p>
    </div>
  );
}

function nextCommission(planType: "annual" | "monthly", paymentCount: number) {
  const next = paymentCount + 1;
  const phase =
    planType === "annual"
      ? next === 1 ? "initial" : next === 2 ? "year2" : next === 3 ? "year3" : "year4_plus"
      : next <= 12 ? "initial" : next <= 24 ? "year2" : next <= 36 ? "year3" : "year4_plus";
  const rates: Record<string, number> = { initial: 0.20, year2: 0.05, year3: 0.10, year4_plus: 0.15 };
  const base   = planType === "annual" ? 389 : 39;
  const amount = Math.round(base * rates[phase] * 100) / 100;
  const phaseLabelMap: Record<string, string> = { initial: "Erstprovision", year2: "Jahr 2", year3: "Jahr 3", year4_plus: "Jahr 4+" };
  return { amount, phase: phaseLabelMap[phase], rate: rates[phase] };
}

export default function ShopsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const leads = useQuery(api.shopLeads.myLeads, token ? { token } : "skip");

  const active   = leads?.filter((l: any) => l.status === "active") ?? [];
  const others   = leads?.filter((l: any) => l.status !== "active") ?? [];

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-5">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2ede4" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-[#f2ede4]">Meine Shops</h1>
        </div>
        <Link href="/dashboard/shops/neu"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.3)", color: "#c9a227" }}>
          + Neu
        </Link>
      </div>

      {leads === undefined && (
        <p className="text-center text-[rgba(242,237,228,.4)] text-sm py-10 animate-pulse">Laden...</p>
      )}

      {leads?.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-[rgba(242,237,228,.4)] text-sm">Noch keine Shops eingereicht</p>
          <Link href="/dashboard/shops/neu" className="text-[#c9a227] text-sm hover:underline">
            Ersten Shop einreichen →
          </Link>
        </div>
      )}

      {/* Aktive Shops */}
      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] text-[rgba(242,237,228,.3)] uppercase tracking-wider font-semibold">
            Aktive Shops ({active.length})
          </p>
          {active.map((lead: any) => {
            const contract = lead.contract;
            const next     = contract ? nextCommission(contract.planType, contract.paymentCount) : null;
            return (
              <div key={lead._id} className="rounded-2xl p-4 space-y-4"
                style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.2)" }}>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#f2ede4]">{lead.shopName}</p>
                    <p className="text-xs text-[rgba(242,237,228,.4)]">{lead.ownerName} · {lead.city ?? "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-[#c9a227]">
                      {contract?.planType === "annual" ? "Jahresabo" : "Monatsabo"}
                    </p>
                    <p className="text-[10px] text-[rgba(242,237,228,.3)]">
                      {contract?.paymentCount ?? 0} Zahlung{contract?.paymentCount !== 1 ? "en" : ""}
                    </p>
                  </div>
                </div>

                {/* Nächste Provision */}
                {next && (
                  <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                    style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.15)" }}>
                    <p className="text-xs text-[rgba(242,237,228,.5)]">Nächste Provision ({next.phase})</p>
                    <p className="text-sm font-bold text-[#c9a227]">€{next.amount.toFixed(2)}</p>
                  </div>
                )}

                {/* Zahlungslink — nur vor erster Zahlung */}
                {contract?.paymentToken && contract.paymentCount === 0 && (
                  <CopyPaymentLink token={contract.paymentToken} />
                )}

                {/* Shop-Link — nach erster Zahlung */}
                {lead.loatycardShopSlug && (
                  <a href={`${STEMPEL_URL}/join/${lead.loatycardShopSlug}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(74,222,128,.06)", border: "1px solid rgba(74,222,128,.2)" }}>
                    <span className="text-xs text-green-400 font-semibold">✓ Shop ist live</span>
                    <span className="text-[10px] text-[rgba(242,237,228,.4)] font-mono">{lead.loatycardShopSlug}</span>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Andere Shops */}
      {others.length > 0 && (
        <div className="space-y-3">
          {active.length > 0 && (
            <p className="text-[10px] text-[rgba(242,237,228,.3)] uppercase tracking-wider font-semibold">
              Weitere
            </p>
          )}
          {others.map((lead: any) => (
            <div key={lead._id} className="rounded-2xl p-4 space-y-2"
              style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#f2ede4]">{lead.shopName || "—"}</p>
                  <p className="text-xs text-[rgba(242,237,228,.4)]">{lead.ownerName} · {lead.city ?? "—"}</p>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${
                  lead.status === "rejected" ? "text-red-400" : "text-[rgba(242,237,228,.4)]"
                }`}>
                  {lead.status === "rejected" ? "Abgelehnt" : "Eingereicht"}
                </span>
              </div>
              {lead.rejectionReason && (
                <p className="text-xs text-red-400 rounded-lg px-3 py-2"
                  style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" }}>
                  {lead.rejectionReason}
                </p>
              )}
              <p className="text-[10px] text-[rgba(242,237,228,.25)]">
                {new Date(lead._creationTime).toLocaleDateString("de-DE")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
