"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errMsg } from "@/app/lib/errMsg";

export default function LoginPage() {
  const router   = useRouter();
  const login    = useMutation(api.affiliates.login);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const hashPassword = async (pw: string) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const passwordHash = await hashPassword(password);
      const { token } = await login({ email, passwordHash });
      localStorage.setItem("affiliate_token", token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(errMsg(err, "Fehler beim Login"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase mb-2">Loatycard</div>
          <h1 className="text-2xl font-bold text-[#f2ede4]">Partner-Login</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.5)] text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
            {loading ? "Einloggen..." : "Einloggen"}
          </button>
        </form>

        <p className="text-center text-sm text-[rgba(242,237,228,.4)] mt-6">
          Noch kein Account?{" "}
          <Link href="/register" className="text-[#c9a227] hover:underline">Registrieren</Link>
        </p>
      </div>
    </div>
  );
}
