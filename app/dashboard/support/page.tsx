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
  const reply  = useMutation(api.support.replyTicket);

  const [msg, setMsg]         = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState("");
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [expandedT, setExpandedT] = useState<Record<string, boolean>>({});

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
            Problem, Frage oder Feedback? Schreib uns, die Nachricht geht direkt ans Loatycard-Team.
          </p>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5}
            placeholder="Beschreibe dein Anliegen…"
            className="w-full px-4 py-3 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm resize-none" />
          <input value={contact} onChange={e => setContact(e.target.value)}
            placeholder="Rückruf-Nummer (optional, sonst antworten wir per E-Mail)"
            className="w-full px-4 py-3 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={send} disabled={sending || !msg.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-40"
            style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
            {sending ? "Sendet…" : "Nachricht senden"}
          </button>
        </div>
      )}

      {/* Bisherige Anfragen: Verlauf + Antworten bis zur Schließung */}
      {myTickets && myTickets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[rgba(242,237,228,.45)] uppercase tracking-wider">Deine Anfragen</p>
          {myTickets.map(t => {
            const isTOpen = t.status === "open" || !!expandedT[t._id];
            const num = `#${String(t.number).padStart(3, "0")}`;
            if (!isTOpen) {
              // Abgeschlossen: nur Nummer — Klick öffnet den Verlauf
              return (
                <button key={t._id} type="button"
                  onClick={() => setExpandedT(e => ({ ...e, [t._id]: true }))}
                  className="w-full rounded-2xl px-4 py-3 flex items-center gap-2 text-left"
                  style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
                  <span className="text-xs font-mono font-bold text-[rgba(242,237,228,.55)]">Ticket {num}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto"
                    style={{ background: "rgba(34,197,94,.12)", color: "#4ade80" }}>abgeschlossen</span>
                  <span className="text-[10px] text-[rgba(242,237,228,.3)]">▸</span>
                </button>
              );
            }
            return (
            <div key={t._id} className="rounded-2xl p-4 space-y-2" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between gap-2">
                <button type="button"
                  onClick={() => { if (t.status !== "open") setExpandedT(e => ({ ...e, [t._id]: false })); }}
                  className="text-[10px] font-mono font-bold text-left text-[rgba(242,237,228,.45)]">
                  Ticket {num} · {new Date(t.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </button>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={t.status === "open"
                    ? { background: "rgba(201,162,39,.15)", color: "#c9a227" }
                    : { background: "rgba(34,197,94,.12)", color: "#4ade80" }}>
                  {t.status === "open" ? "offen" : "abgeschlossen"}
                </span>
              </div>
              {t.thread.map((m, i) => (
                <div key={i} className={`flex ${m.from === "admin" ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[85%] rounded-lg px-3 py-2"
                    style={m.from === "admin"
                      ? { background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)" }
                      : { background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.25)" }}>
                    <p className="text-[9px] font-semibold mb-0.5" style={{ color: m.from === "admin" ? "#4ade80" : "#c9a227" }}>
                      {m.from === "admin" ? "Loatycard-Team" : "Du"}
                    </p>
                    <p className="text-xs text-[rgba(242,237,228,.85)] whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ))}
              {t.status === "open" ? (
                <div className="flex gap-2 pt-1">
                  <input value={replyMap[t._id] ?? ""} onChange={e => setReplyMap(m => ({ ...m, [t._id]: e.target.value }))}
                    placeholder="Antworten…"
                    className="flex-1 px-3 py-2 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-lg text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-xs" />
                  <button onClick={async () => {
                      const text = (replyMap[t._id] ?? "").trim();
                      if (!text || !token) return;
                      setReplyingId(t._id);
                      try { await reply({ token, ticketId: t._id, message: text }); setReplyMap(m => ({ ...m, [t._id]: "" })); }
                      finally { setReplyingId(null); }
                    }}
                    disabled={replyingId === t._id || !(replyMap[t._id] ?? "").trim()}
                    className="px-3 py-2 rounded-lg text-xs font-semibold text-[#0d0c0a] disabled:opacity-40"
                    style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
                    {replyingId === t._id ? "…" : "Senden"}
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-[rgba(242,237,228,.35)]">Ticket abgeschlossen. Bei neuem Anliegen einfach oben eine neue Anfrage senden.</p>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
