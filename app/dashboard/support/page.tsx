"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SupportPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const submit = useMutation(api.support.submitTicket);

  const [msg, setMsg]         = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState("");

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const myTickets = useQuery(api.support.listMyTickets, token ? { token } : "skip");

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );

  const send = async () => {
    setSending(true); setErr("");
    try {
      await submit({ token, message: msg, contact: contact || undefined });
      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Fehler beim Senden");
    } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Support</p>
          <h1 className="text-xl font-bold text-[#f2ede4]">Wir helfen dir</h1>
        </div>
        <Link href="/dashboard" className="text-xs text-[rgba(242,237,228,.4)] hover:text-[rgba(242,237,228,.7)]">← Zurück</Link>
      </div>

      {done ? (
        <div className="rounded-2xl p-5 text-center space-y-2"
          style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)" }}>
          <p className="text-sm font-semibold text-green-400">Nachricht gesendet!</p>
          <p className="text-xs text-[rgba(242,237,228,.5)]">Wir melden uns so schnell wie möglich bei dir.</p>
          <button onClick={() => { setDone(false); setMsg(""); setContact(""); }}
            className="text-xs text-[#c9a227] underline">Weitere Nachricht senden</button>
        </div>
      ) : (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
          <p className="text-xs text-[rgba(242,237,228,.5)]">
            Problem, Frage oder Feedback? Schreib uns — die Nachricht geht direkt ans Loatycard-Team.
          </p>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5}
            placeholder="Beschreibe dein Anliegen…"
            className="w-full px-4 py-3 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm resize-none" />
          <input value={contact} onChange={e => setContact(e.target.value)}
            placeholder="Rückruf-Nummer (optional — sonst antworten wir per E-Mail)"
            className="w-full px-4 py-3 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={send} disabled={sending || !msg.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-40"
            style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
            {sending ? "Sendet…" : "Nachricht senden"}
          </button>
        </div>
      )}

      {/* Bisherige Anfragen inkl. Antwort */}
      {myTickets && myTickets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[rgba(242,237,228,.45)] uppercase tracking-wider">Deine Anfragen</p>
          {myTickets.map(t => (
            <div key={t._id} className="rounded-2xl p-4 space-y-1.5" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-[rgba(242,237,228,.35)]">
                  {new Date(t.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={t.status === "open"
                    ? { background: "rgba(201,162,39,.15)", color: "#c9a227" }
                    : { background: "rgba(34,197,94,.12)", color: "#4ade80" }}>
                  {t.status === "open" ? "in Bearbeitung" : "beantwortet"}
                </span>
              </div>
              <p className="text-sm text-[#f2ede4] whitespace-pre-wrap">{t.message}</p>
              {t.reply && (
                <div className="rounded-lg px-3 py-2 mt-1" style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)" }}>
                  <p className="text-[9px] font-semibold text-green-400 mb-0.5">Antwort vom Loatycard-Team</p>
                  <p className="text-xs text-[rgba(242,237,228,.8)] whitespace-pre-wrap">{t.reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
