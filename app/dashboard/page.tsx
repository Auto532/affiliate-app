"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const me        = useQuery(api.affiliates.me,           token ? { token } : "skip");
  const dashboard = useQuery(api.affiliates.getDashboard, token ? { token } : "skip");

  if (!token || me === undefined) return <LoadingScreen />;
  if (!me) { router.push("/login"); return null; }

  const c = dashboard?.commission;

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">LoyaltyCard</p>
          <h1 className="text-xl font-bold text-[#f2ede4]">Hallo, {me.name.split(" ")[0]}</h1>
        </div>
        <button onClick={() => { localStorage.removeItem("affiliate_token"); router.push("/login"); }}
          className="text-xs text-[rgba(242,237,228,.4)] hover:text-[rgba(242,237,228,.7)] transition-colors">
          Ausloggen
        </button>
      </div>

      {/* Referral-Code */}
      <div className="rounded-2xl p-4" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
        <p className="text-xs text-[rgba(242,237,228,.4)] mb-1">Dein Partner-Code</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xl font-bold tracking-widest text-[#c9a227]">{me.referralCode}</span>
          <button onClick={() => navigator.clipboard.writeText(me.referralCode)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(201,162,39,.12)", border: "1px solid rgba(201,162,39,.3)", color: "#c9a227" }}>
            Kopieren
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Shops aktiv",    value: dashboard?.leads.active ?? 0,    color: "text-[#c9a227]" },
          { label: "In Prüfung",     value: dashboard?.leads.inReview ?? 0,  color: "text-blue-400" },
          { label: "Ausstehend",     value: `€${(c?.totalPending ?? 0).toFixed(2)}`,    color: "text-orange-400" },
          { label: "Bestätigt",      value: `€${(c?.totalConfirmed ?? 0).toFixed(2)}`,  color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-[rgba(242,237,228,.4)] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="space-y-3">
        <NavCard href="/dashboard/shops/neu" title="Neuen Shop einreichen" sub="Formular ausfüllen und einreichen" icon="+" gold />
        <NavCard href="/dashboard/shops" title="Meine Shops" sub={`${dashboard?.leads.total ?? 0} Shops gesamt`} icon="🏪" />
        <NavCard href="/dashboard/provisionen" title="Provisionen" sub={`€${(c?.totalPaid ?? 0).toFixed(2)} bereits ausgezahlt`} icon="💰" />
        <NavCard href="/dashboard/unterlagen" title="Verkaufsunterlagen" sub="Pitch, Einwände, Design-Beispiele" icon="📚" />
        <NavCard href="/dashboard/support" title="Support" sub="Problem? Schreib uns direkt" icon="🆘" />
        <NavCard href="/dashboard/profil" title="Mein Profil" sub="Daten & Bankverbindung ändern" icon="👤" />
      </div>
    </div>
  );
}

function NavCard({ href, title, sub, icon, gold }: { href: string; title: string; sub: string; icon: string; gold?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:opacity-80"
      style={gold
        ? { background: "linear-gradient(120deg, rgba(232,201,106,.15), rgba(201,162,39,.1))", border: "1px solid rgba(201,162,39,.3)" }
        : { background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
        style={{ background: gold ? "rgba(201,162,39,.2)" : "rgba(255,255,255,.05)" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-[#f2ede4]">{title}</p>
        <p className="text-xs text-[rgba(242,237,228,.4)] mt-0.5">{sub}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,.3)" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );
}
