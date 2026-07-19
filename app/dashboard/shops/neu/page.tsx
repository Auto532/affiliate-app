"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewShopPage() {
  const router     = useRouter();
  const submitLead = useMutation(api.shopLeads.submitLead);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const [form, setForm] = useState({
    shopName: "", ownerName: "", ownerEmail: "",
    ownerPhone: "", businessType: "", city: "",
  });
  const [planType,    setPlanType]    = useState<"annual" | "monthly">("annual");
  const [rewardCount, setRewardCount] = useState(0);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(""); setLoading(true);
    try {
      const leadId = await submitLead({
        token, planType,
        rewardCount: rewardCount || undefined,
        ...form,
        ownerPhone:   form.ownerPhone   || undefined,
        businessType: form.businessType || undefined,
        city:         form.city         || undefined,
      });
      router.push(`/dashboard/shops/${leadId}`);
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Einreichen");
    } finally { setLoading(false); }
  };

  const fields = [
    { key: "shopName",     label: "Shop-Name *",       placeholder: "z.B. Café Müller",      required: true },
    { key: "ownerName",    label: "Inhaber-Name *",     placeholder: "Max Müller",            required: true },
    { key: "ownerEmail",   label: "Inhaber E-Mail *",   placeholder: "max@cafe.de",           required: true, type: "email" },
    { key: "ownerPhone",   label: "Telefon",            placeholder: "+49 ...",               required: false, type: "tel" },
    { key: "businessType", label: "Branche",            placeholder: "z.B. Café, Barbershop", required: false },
    { key: "city",         label: "Stadt",              placeholder: "z.B. München",          required: false },
  ];

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/shops" className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2ede4" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-[#f2ede4]">Shop einreichen</h1>
      </div>

      {/* Info-Banner */}
      <div className="rounded-xl px-4 py-3 text-sm text-[rgba(242,237,228,.6)]"
        style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.2)", borderLeft: "3px solid #c9a227" }}>
        Der Shop wird sofort aktiv — deine Provision startet ab der ersten Zahlung.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Plan-Auswahl */}
        <div>
          <label className="block text-xs text-[rgba(242,237,228,.5)] mb-2">Vertragsmodell *</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "annual",  label: "Jahresabo",  price: "€240 / Jahr",  comm: "20% = €48" },
              { id: "monthly", label: "Monatsabo",  price: "€20 / Monat",  comm: "20% = €4"  },
            ] as const).map(p => (
              <button key={p.id} type="button" onClick={() => setPlanType(p.id)}
                className="rounded-xl p-3 text-left transition-colors"
                style={planType === p.id
                  ? { background: "rgba(201,162,39,.12)", border: "1px solid rgba(201,162,39,.4)" }
                  : { background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
                <p className="text-sm font-semibold text-[#f2ede4]">{p.label}</p>
                <p className="text-xs text-[rgba(242,237,228,.4)] mt-0.5">{p.price}</p>
                <p className="text-[10px] text-[#c9a227] mt-1">Provision: {p.comm}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Immer inklusive: Einrichtung + Design */}
        <div className="rounded-xl p-3"
          style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.2)" }}>
          <p className="text-sm font-semibold text-[#f2ede4]">Einrichtung & individuelles Design</p>
          <p className="text-[11px] text-[rgba(242,237,228,.5)] mt-0.5">
            Einmalig €99 — bei jedem Shop automatisch dabei (eigenes Logo, eigene Farben).
          </p>
        </div>

        {/* Bonusprogramm */}
        <div>
          <label className="block text-xs text-[rgba(242,237,228,.5)] mb-2">
            Bonusprogramm — Anzahl Belohnungen (optional)
          </label>
          <div className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
            <div>
              <p className="text-sm font-semibold text-[#f2ede4]">{rewardCount} Belohnung{rewardCount === 1 ? "" : "en"}</p>
              <p className="text-[10px] text-[rgba(242,237,228,.4)] mt-0.5">
                €5 / Monat pro Belohnung{planType === "annual" ? " (€60 / Jahr)" : ""}
                {rewardCount > 0 && ` · gesamt ${planType === "annual" ? `€${rewardCount * 60} / Jahr` : `€${rewardCount * 5} / Monat`}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRewardCount(c => Math.max(0, c - 1))}
                className="w-9 h-9 rounded-lg text-lg font-bold text-[#f2ede4]"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}>−</button>
              <button type="button" onClick={() => setRewardCount(c => Math.min(20, c + 1))}
                className="w-9 h-9 rounded-lg text-lg font-bold text-[#0d0c0a]"
                style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>+</button>
            </div>
          </div>
        </div>

        {/* Shop-Felder */}
        {fields.map(({ key, label, placeholder, required, type }) => (
          <div key={key}>
            <label className="block text-xs text-[rgba(242,237,228,.5)] mb-1.5">{label}</label>
            <input
              type={type ?? "text"}
              value={(form as any)[key]}
              onChange={set(key)}
              required={required}
              placeholder={placeholder}
              className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.5)] text-sm"
            />
          </div>
        ))}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading || !token}
          className="w-full py-3.5 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-50"
          style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
          {loading ? "Wird eingereicht..." : "Shop einreichen & aktivieren →"}
        </button>
      </form>
    </div>
  );
}
