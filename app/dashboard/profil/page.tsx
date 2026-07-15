"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Felder, die sofort übernommen werden vs. die auf Admin-Freigabe warten.
const IMMEDIATE = ["phone", "address", "zip", "city", "country"] as const;
const SENSITIVE = ["name", "company", "taxId", "vatId", "dateOfBirth", "bankIban", "bankBic", "bankName"] as const;
type FieldKey = (typeof IMMEDIATE)[number] | (typeof SENSITIVE)[number];

const LABELS: Record<FieldKey, string> = {
  name: "Name", company: "Firmenname", taxId: "Steuernummer", vatId: "USt-IdNr.",
  dateOfBirth: "Geburtsdatum", bankIban: "IBAN", bankBic: "BIC / SWIFT", bankName: "Bankname",
  phone: "Telefon", address: "Straße + Hausnummer", zip: "PLZ", city: "Stadt", country: "Land",
};

const GROUPS: { title: string; note?: string; fields: FieldKey[] }[] = [
  { title: "Kontakt & Adresse", note: "Wird sofort übernommen.", fields: ["phone", "address", "zip", "city", "country"] },
  { title: "Rechtliches", note: "Änderungen brauchen unsere Freigabe.", fields: ["name", "company", "taxId", "vatId", "dateOfBirth"] },
  { title: "Bankverbindung", note: "Änderungen brauchen unsere Freigabe.", fields: ["bankIban", "bankBic", "bankName"] },
];

export default function ProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  const profile = useQuery(api.affiliates.getMyProfile, token ? { token } : "skip");
  const update  = useMutation(api.affiliates.updateOwnProfile);

  const [form, setForm]       = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const pending = (profile?.pendingProfile ?? null) as Record<string, any> | null;

  // Prefill: sensible Felder mit ggf. bereits eingereichtem (pending) Wert, sonst freigegebener Stand.
  useEffect(() => {
    if (!profile) return;
    const init: Record<string, string> = {};
    for (const k of [...IMMEDIATE, ...SENSITIVE]) {
      const pendingVal = pending && k in pending ? pending[k] : undefined;
      init[k] = (pendingVal ?? (profile as any)[k] ?? "") as string;
    }
    setForm(init);
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const pendingKeys = useMemo(
    () => (pending ? SENSITIVE.filter(k => k in pending) : []),
    [pending],
  );

  if (!token || profile === undefined) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );
  if (profile === null) { router.push("/login"); return null; }

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await update({
        token: token!,
        ...Object.fromEntries([...IMMEDIATE, ...SENSITIVE].map(k => [k, form[k]?.trim() || undefined])),
      });
      if (res.pending) {
        setMsg({ ok: true, text: `Gespeichert. ${res.pendingFields.length} Änderung(en) warten auf Freigabe: ${res.pendingFields.map(k => LABELS[k as FieldKey]).join(", ")}.` });
      } else {
        setMsg({ ok: true, text: "Profil aktualisiert." });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Fehler beim Speichern" });
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Profil</p>
          <h1 className="text-xl font-bold text-[#f2ede4]">Meine Daten</h1>
        </div>
        <Link href="/dashboard" className="text-xs text-[rgba(242,237,228,.4)] hover:text-[rgba(242,237,228,.7)]">← Zurück</Link>
      </div>

      {/* Login-Info (read-only) */}
      <div className="rounded-2xl p-4 space-y-1" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
        <p className="text-xs text-[rgba(242,237,228,.4)]">E-Mail (Login) · Partner-Code</p>
        <p className="text-sm text-[#f2ede4]">{(profile as any).email} · <span className="text-[#c9a227] font-semibold">{(profile as any).referralCode}</span></p>
      </div>

      {/* Pending-Hinweis */}
      {pendingKeys.length > 0 && (
        <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.25)" }}>
          <p className="text-xs font-semibold text-yellow-400">Warten auf Freigabe</p>
          <p className="text-[11px] text-[rgba(242,237,228,.6)] mt-1">
            {pendingKeys.map(k => LABELS[k]).join(", ")} — sichtbar wird die Änderung, sobald wir sie freigegeben haben.
          </p>
        </div>
      )}

      {GROUPS.map(group => (
        <div key={group.title} className="rounded-2xl p-4 space-y-3" style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.06)" }}>
          <div>
            <p className="text-sm font-semibold text-[#f2ede4]">{group.title}</p>
            {group.note && <p className="text-[11px] text-[rgba(242,237,228,.35)]">{group.note}</p>}
          </div>
          {group.fields.map(k => (
            <div key={k}>
              <label className="block text-xs text-[rgba(242,237,228,.4)] mb-1.5">
                {LABELS[k]}
                {SENSITIVE.includes(k as any) && pending && k in pending && (
                  <span className="ml-2 text-[10px] text-yellow-400">· wartet auf Freigabe</span>
                )}
              </label>
              <input
                value={form[k] ?? ""} onChange={set(k)}
                className="w-full px-4 py-3 bg-[#0d0c0a] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm"
              />
            </div>
          ))}
        </div>
      ))}

      {msg && (
        <p className={`text-center text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] disabled:opacity-50"
        style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
        {saving ? "Speichern..." : "Speichern"}
      </button>
    </div>
  );
}
