"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STEMPEL_URL = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://loatycard.de";

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
  return { amount, phase: phaseLabelMap[phase] };
}

function DeleteButton({ token, leadId }: { token: string; leadId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const deleteLead = useMutation(api.shopLeads.deletePendingLead);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm) { setConfirm(true); return; }
    setLoading(true);
    try {
      await deleteLead({ token, leadId: leadId as any });
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
      style={confirm
        ? { background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#f87171" }
        : { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(242,237,228,.3)" }}>
      {loading ? "..." : confirm ? "Sicher?" : "Löschen"}
    </button>
  );
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

  const pending = leads?.filter((l: any) => l.status === "pending_payment") ?? [];
  const active  = leads?.filter((l: any) => l.status === "active") ?? [];
  const others  = leads?.filter((l: any) => l.status !== "active" && l.status !== "pending_payment") ?? [];
  const isEmpty = leads !== undefined && pending.length === 0 && active.length === 0 && others.length === 0;

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-6">

      {/* Header */}
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

      {isEmpty && (
        <div className="text-center py-12 space-y-3">
          <p className="text-[rgba(242,237,228,.4)] text-sm">Noch keine Shops</p>
          <Link href="/dashboard/shops/neu" className="text-[#c9a227] text-sm hover:underline">
            Ersten Shop einreichen →
          </Link>
        </div>
      )}

      {/* ── ZAHLUNG AUSSTEHEND ────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#c9a227]" />
            <p className="text-[10px] text-[rgba(242,237,228,.3)] uppercase tracking-wider font-semibold">
              Zahlung ausstehend ({pending.length})
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(201,162,39,.2)" }}>
            {pending.map((lead: any, i: number) => (
              <div key={lead._id}
                style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,.05)" } : {}}>
                <Link href={`/dashboard/shops/${lead._id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-[rgba(255,255,255,.02)] transition-colors"
                  style={{ display: "flex" }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#f2ede4] text-sm truncate">{lead.shopName}</p>
                    <p className="text-xs text-[rgba(242,237,228,.35)] truncate">
                      {lead.ownerName}{lead.city ? ` · ${lead.city}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {token && <DeleteButton token={token} leadId={lead._id} />}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,.6)" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trennlinie wenn beide Sektionen sichtbar */}
      {pending.length > 0 && active.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.06)" }} />
      )}

      {/* ── AKTIVE SHOPS ─────────────────────────────────────────────────── */}
      {active.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <p className="text-[10px] text-[rgba(242,237,228,.3)] uppercase tracking-wider font-semibold">
              Aktive Shops ({active.length})
            </p>
          </div>

          <div className="space-y-3">
            {active.map((lead: any) => {
              const contract = lead.contract;
              const next     = contract ? nextCommission(contract.planType, contract.paymentCount) : null;
              return (
                <div key={lead._id} className="rounded-2xl p-4 space-y-3"
                  style={{ background: "#17150f", border: "1px solid rgba(74,222,128,.15)" }}>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#f2ede4] truncate">{lead.shopName}</p>
                      <p className="text-xs text-[rgba(242,237,228,.4)]">
                        {lead.ownerName}{lead.city ? ` · ${lead.city}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-green-400">Aktiv</p>
                      <p className="text-[10px] text-[rgba(242,237,228,.3)]">
                        {contract?.planType === "annual" ? "Jahresabo" : "Monatsabo"}
                      </p>
                    </div>
                  </div>

                  {next && (
                    <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                      style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.12)" }}>
                      <p className="text-xs text-[rgba(242,237,228,.5)]">Nächste Provision · {next.phase}</p>
                      <p className="text-sm font-bold text-[#c9a227]">€{next.amount.toFixed(2)}</p>
                    </div>
                  )}

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
        </div>
      )}

      {/* ── SONSTIGE (abgelehnt etc.) ─────────────────────────────────────── */}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-[rgba(242,237,228,.2)] uppercase tracking-wider font-semibold">
            Weitere
          </p>
          {others.map((lead: any) => (
            <div key={lead._id} className="rounded-2xl px-4 py-3 flex items-start justify-between gap-3"
              style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <p className="text-sm font-semibold text-[rgba(242,237,228,.6)]">{lead.shopName || "—"}</p>
                <p className="text-xs text-[rgba(242,237,228,.3)]">{lead.ownerName}</p>
              </div>
              <span className={`text-xs font-semibold flex-shrink-0 ${
                lead.status === "rejected" ? "text-red-400" : "text-[rgba(242,237,228,.3)]"
              }`}>
                {lead.status === "rejected" ? "Abgelehnt" : "Eingereicht"}
              </span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
