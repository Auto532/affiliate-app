"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export default function RegisterPage() {
  const register = useMutation(api.affiliates.register);
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [businessType, setBusinessType] = useState<"private" | "business">("business");
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  const hashPassword = async (pw: string) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const passwordHash = await hashPassword(password);
      await register({ name, email, passwordHash, businessType });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Fehler bei der Registrierung");
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.3)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#f2ede4]">Anfrage eingegangen</h2>
        <p className="text-sm text-[rgba(242,237,228,.5)]">
          Dein Account wartet auf Freigabe. Du erhältst eine Nachricht sobald du loslegen kannst.
        </p>
        <Link href="/login" className="block text-[#c9a227] text-sm hover:underline">Zum Login</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase mb-2">Loatycard</div>
          <h1 className="text-2xl font-bold text-[#f2ede4]">Partner werden</h1>
          <p className="text-sm text-[rgba(242,237,228,.4)] mt-1">Nach Registrierung prüfen wir deinen Account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[rgba(242,237,228,.5)] mb-1.5">Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.5)] text-sm"
              placeholder="Dein Name"
            />
          </div>
          <div>
            <label className="block text-xs text-[rgba(242,237,228,.5)] mb-1.5">E-Mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.5)] text-sm"
              placeholder="deine@email.de"
            />
          </div>
          <div>
            <label className="block text-xs text-[rgba(242,237,228,.5)] mb-1.5">Passwort</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.5)] text-sm"
              placeholder="Mindestens 8 Zeichen"
            />
          </div>

          {/* Gewerbe / Privat */}
          <div>
            <label className="block text-xs text-[rgba(242,237,228,.5)] mb-2">Ich mache das als</label>
            <div className="grid grid-cols-2 gap-2">
              {(["business", "private"] as const).map(type => (
                <button key={type} type="button" onClick={() => setBusinessType(type)}
                  className="py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background:  businessType === type ? "rgba(201,162,39,.15)" : "#17150f",
                    border:      businessType === type ? "1px solid rgba(201,162,39,.5)" : "1px solid rgba(255,255,255,.08)",
                    color:       businessType === type ? "#c9a227" : "rgba(242,237,228,.5)",
                  }}>
                  {type === "business" ? "Gewerbe / Firma" : "Privatperson"}
                </button>
              ))}
            </div>
            {businessType === "private" && (
              <div className="mt-2 rounded-xl px-3 py-3 space-y-1"
                style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)" }}>
                <p className="text-xs font-semibold text-yellow-400">Wichtiger Hinweis</p>
                <p className="text-[11px] text-[rgba(242,237,228,.5)] leading-relaxed">
                  Als Privatperson gilt die gesetzliche Freigrenze von <strong className="text-[rgba(242,237,228,.8)]">256 €/Jahr</strong> (§22 Nr. 3 EStG). Übersteigen deine Provisionen diesen Betrag, musst du sie vollständig in der Steuererklärung angeben. Bei regelmäßiger Tätigkeit wird eine Gewerbeanmeldung empfohlen.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-50"
            style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
            {loading ? "Registrieren..." : "Registrieren"}
          </button>
        </form>

        <p className="text-center text-sm text-[rgba(242,237,228,.4)] mt-6">
          Bereits Partner?{" "}
          <Link href="/login" className="text-[#c9a227] hover:underline">Einloggen</Link>
        </p>
      </div>
    </div>
  );
}
