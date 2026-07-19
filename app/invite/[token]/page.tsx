"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";

export default function InvitePage() {
  const params    = useParams();
  const router    = useRouter();
  const token     = params.token as string;
  const acceptInvite = useMutation(api.shopLeads.acceptInvite);

  const [form, setForm] = useState({
    shopName: "", ownerName: "", ownerEmail: "",
    ownerPhone: "", businessType: "", city: "",
  });
  const [rewardCount, setRewardCount] = useState(0);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await acceptInvite({
        inviteToken:  token,
        shopName:     form.shopName,
        ownerName:    form.ownerName,
        ownerEmail:   form.ownerEmail,
        ownerPhone:   form.ownerPhone   || undefined,
        businessType: form.businessType || undefined,
        city:         form.city         || undefined,
        rewardCount:  rewardCount || undefined,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Ungültiger oder abgelaufener Einladungslink");
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f2ede4]">Anfrage eingegangen!</h2>
          <p className="text-sm text-[rgba(242,237,228,.5)] mt-2">
            Dein Shop wird geprüft. Du erhältst eine Rückmeldung sobald alles bereit ist.
          </p>
        </div>
        <div className="rounded-xl px-4 py-3 text-sm text-[rgba(242,237,228,.6)]"
          style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.2)" }}>
          Powered by <span className="font-bold text-[#c9a227]">Loatycard Wallet</span>
          <br />
          <span className="text-xs">Digitale Stempelkarten für lokale Geschäfte</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-10 space-y-6">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Loatycard Wallet</div>
        <h1 className="text-2xl font-bold text-[#f2ede4]">Du wurdest eingeladen</h1>
        <p className="text-sm text-[rgba(242,237,228,.5)]">
          Füll deine Shop-Daten aus, wir kümmern uns um den Rest.
        </p>
      </div>

      {/* Was ist Loatycard */}
      <div className="rounded-2xl p-4 space-y-2"
        style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.2)", borderLeft: "3px solid #c9a227" }}>
        <p className="text-sm font-semibold text-[#f2ede4]">Was ist Loatycard Wallet?</p>
        <p className="text-xs text-[rgba(242,237,228,.5)] leading-relaxed">
          Digitale Stempelkarten für dein Geschäft, ohne App und ohne Plastikkarten.
          Deine Kunden sammeln Stempel per QR-Code und du bindest sie langfristig.
        </p>
      </div>

      {/* Formular */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { key: "shopName",     label: "Name deines Geschäfts *", placeholder: "z.B. Café Müller",       required: true  },
          { key: "ownerName",    label: "Dein Name *",             placeholder: "Max Müller",             required: true  },
          { key: "ownerEmail",   label: "Deine E-Mail *",          placeholder: "max@cafe.de",            required: true, type: "email" },
          { key: "ownerPhone",   label: "Telefon",                 placeholder: "+49 ...",                required: false, type: "tel" },
          { key: "businessType", label: "Branche",                 placeholder: "z.B. Café, Barbershop", required: false },
          { key: "city",         label: "Stadt",                   placeholder: "z.B. München",           required: false },
        ].map(({ key, label, placeholder, required, type }) => (
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

        {/* Bonusprogramm (optional) */}
        <div>
          <label className="block text-xs text-[rgba(242,237,228,.5)] mb-1.5">
            Bonusprogramm: Anzahl Belohnungen (optional)
          </label>
          <div className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
            <div>
              <p className="text-sm font-semibold text-[#f2ede4]">{rewardCount} Belohnung{rewardCount === 1 ? "" : "en"}</p>
              <p className="text-[10px] text-[rgba(242,237,228,.4)] mt-0.5">5 € / Monat pro Belohnung</p>
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

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-400"
            style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl font-semibold text-[#0d0c0a] disabled:opacity-50"
          style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
          {loading ? "Wird gesendet..." : "Jetzt registrieren →"}
        </button>

        <p className="text-center text-[10px] text-[rgba(242,237,228,.25)]">
          Mit dem Absenden stimmst du zu, dass wir dich kontaktieren dürfen.
        </p>
      </form>
    </div>
  );
}
