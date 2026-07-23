"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { phaseLabel } from "@/convex/commissionEngine";

const STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Ausstehend",  color: "text-orange-400" },
  confirmed: { label: "Bestätigt",   color: "text-green-400" },
  paid:      { label: "Ausgezahlt",  color: "text-[rgba(242,237,228,.4)]" },
  canceled:  { label: "Storniert",   color: "text-red-400" },
};

export default function ProvisionsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const commissions = useQuery(api.shopLeads.myCommissions, token ? { token } : "skip");
  const profile     = useQuery(api.affiliates.me,            token ? { token } : "skip");

  const total    = commissions?.reduce((s: number, c: { amount: number }) => s + c.amount, 0) ?? 0;
  const pending  = commissions?.filter((c: { status: string }) => c.status === "pending").reduce((s: number, c: { amount: number }) => s + c.amount, 0) ?? 0;
  const confirmed = commissions?.filter((c: { status: string }) => c.status === "confirmed").reduce((s: number, c: { amount: number }) => s + c.amount, 0) ?? 0;

  const PRIVATE_LIMIT = 256;
  const isPrivate     = profile?.businessType === "private";
  const currentYear   = new Date().getFullYear();
  const yearTotal     = commissions?.filter((c: { triggeredAt: number }) =>
    new Date(c.triggeredAt).getFullYear() === currentYear
  ).reduce((s: number, c: { amount: number }) => s + c.amount, 0) ?? 0;
  const limitPct      = Math.min((yearTotal / PRIVATE_LIMIT) * 100, 100);

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/dashboard" className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2ede4" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-[#f2ede4]">Provisionen</h1>
      </div>

      {/* Summen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gesamt",     value: total,     color: "text-[#f2ede4]" },
          { label: "Ausstehend", value: pending,   color: "text-orange-400" },
          { label: "Bestätigt",  value: confirmed, color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl p-3 text-center"
            style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
            <p className={`text-lg font-bold ${color}`}>€{value.toFixed(2)}</p>
            <p className="text-[10px] text-[rgba(242,237,228,.4)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[rgba(242,237,228,.4)] leading-relaxed px-1">
        Provisionen werden 14 Tage nach der Zahlungsbestätigung des Shops zur Auszahlung freigegeben (gesetzliche Widerrufsfrist).
      </p>

      {/* Privatperson-Grenze */}
      {isPrivate && (
        <div className="rounded-2xl p-4 space-y-2"
          style={{ background: yearTotal >= PRIVATE_LIMIT ? "rgba(239,68,68,.06)" : "rgba(251,191,36,.06)",
                   border: `1px solid ${yearTotal >= PRIVATE_LIMIT ? "rgba(239,68,68,.25)" : "rgba(251,191,36,.2)"}` }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: yearTotal >= PRIVATE_LIMIT ? "#f87171" : "#fbbf24" }}>
              {yearTotal >= PRIVATE_LIMIT ? "⚠ Freigrenze überschritten" : "Jahres-Freigrenze (Privatperson)"}
            </p>
            <p className="text-xs font-bold" style={{ color: yearTotal >= PRIVATE_LIMIT ? "#f87171" : "#fbbf24" }}>
              €{yearTotal.toFixed(2)} / €{PRIVATE_LIMIT}
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-[rgba(255,255,255,.06)]">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${limitPct}%`, background: yearTotal >= PRIVATE_LIMIT ? "#f87171" : "#fbbf24" }} />
          </div>
          <p className="text-[10px] text-[rgba(242,237,228,.4)] leading-relaxed">
            {yearTotal >= PRIVATE_LIMIT
              ? `Du hast die gesetzliche Freigrenze von ${PRIVATE_LIMIT} €/Jahr (§22 Nr. 3 EStG) überschritten. Bitte melde dich bei uns und erwäge eine Gewerbeanmeldung.`
              : `Als Privatperson gilt die gesetzliche Freigrenze von ${PRIVATE_LIMIT} €/Jahr (§22 Nr. 3 EStG). Über dieser Grenze musst du deine Provisionen vollständig versteuern.`}
          </p>
        </div>
      )}

      {/* Liste */}
      {commissions === undefined && (
        <p className="text-center text-[rgba(242,237,228,.4)] text-sm py-10 animate-pulse">Laden...</p>
      )}
      {commissions?.length === 0 && (
        <p className="text-center text-[rgba(242,237,228,.4)] text-sm py-10">Noch keine Provisionen</p>
      )}

      <div className="space-y-3">
        {commissions?.map(c => {
          const st = STATUS[c.status];
          return (
            <div key={c._id} className="rounded-2xl p-4"
              style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-sm text-[#f2ede4]">{(c as any).shopName}</p>
                  <p className="text-xs text-[rgba(242,237,228,.4)] mt-0.5">
                    {phaseLabel(c.phase, c.planType, c.rate)} · Zahlung #{c.paymentNumber}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-[#c9a227]">€{c.amount.toFixed(2)}</p>
                  <p className={`text-xs ${st.color}`}>{st.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[rgba(242,237,228,.25)]">
                <span>{c.planType === "annual" ? "Jahresabo" : "Monatsabo"}</span>
                <span>·</span>
                <span>{c.rate * 100}% von €{c.baseAmount}</span>
                <span>·</span>
                <span>{new Date(c.triggeredAt).toLocaleDateString("de-DE")}</span>
              </div>
              {c.status === "pending" && (
                <p className="text-[10px] mt-1.5 text-[rgba(242,237,228,.4)]">
                  {(c as any).payable
                    ? "Widerrufsfrist abgelaufen, zur Auszahlung freigegeben."
                    : `Auszahlbar ab ${new Date((c as any).payableAt).toLocaleDateString("de-DE")} (14 Tage Widerrufsfrist)`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
