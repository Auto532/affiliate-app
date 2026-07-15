"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY = {
  name: "", email: "", password: "", passwordConfirm: "", phone: "",
  company: "", dateOfBirth: "", taxId: "", vatId: "",
  address: "", zip: "", city: "", country: "Deutschland",
  bankIban: "", bankBic: "", bankName: "",
};

type Section = "zugangsdaten" | "rechtliches" | "adresse" | "bank";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "zugangsdaten", label: "Zugangsdaten" },
  { id: "rechtliches",  label: "Rechtliches"  },
  { id: "adresse",      label: "Adresse"      },
  { id: "bank",         label: "Bankverbindung" },
];

export default function PartnerInvitePage() {
  const params = useParams();
  const token  = params.token as string;
  const accept = useMutation(api.affiliates.acceptAffiliateInvite);

  const [form, setForm]             = useState(EMPTY);
  const [businessType, setBusinessType] = useState<"private" | "business">("business");
  const [section, setSection]       = useState<Section>("zugangsdaten");
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.passwordConfirm) { setError("Passwörter stimmen nicht überein"); return; }
    if (!form.name || !form.email || !form.password) { setError("Bitte Name, E-Mail und Passwort ausfüllen"); return; }
    setError(""); setLoading(true);
    try {
      const passwordHash = await sha256(form.password);
      await accept({
        inviteToken:  token,
        businessType,
        name:         form.name,
        email:        form.email,
        passwordHash,
        phone:        form.phone        || undefined,
        company:      form.company      || undefined,
        dateOfBirth:  form.dateOfBirth  || undefined,
        taxId:        form.taxId        || undefined,
        vatId:        form.vatId        || undefined,
        address:      form.address      || undefined,
        zip:          form.zip          || undefined,
        city:         form.city         || undefined,
        country:      form.country      || undefined,
        bankIban:     form.bankIban     || undefined,
        bankBic:      form.bankBic      || undefined,
        bankName:     form.bankName     || undefined,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Registrieren");
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
          <h2 className="text-xl font-bold text-[#f2ede4]">Registrierung erfolgreich!</h2>
          <p className="text-sm text-[rgba(242,237,228,.5)] mt-2">
            Dein Account wartet auf Freigabe. Sobald du freigeschaltet bist, kannst du dich einloggen.
          </p>
        </div>
        <a href="/login"
          className="block w-full py-3 rounded-xl font-semibold text-sm text-[#0d0c0a] text-center"
          style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
          Zum Login
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-10 space-y-6">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Loatycard Wallet</div>
        <h1 className="text-2xl font-bold text-[#f2ede4]">Partner werden</h1>
        <p className="text-sm text-[rgba(242,237,228,.5)]">Füll deine Daten aus — du wirst danach freigeschaltet.</p>
      </div>

      {/* Section Tabs */}
      <div className="grid grid-cols-4 gap-1">
        {SECTIONS.map(s => (
          <button key={s.id} type="button" onClick={() => setSection(s.id)}
            className="py-2 rounded-xl text-[10px] font-semibold transition-colors"
            style={section === s.id
              ? { background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.3)", color: "#c9a227" }
              : { background: "#17150f", border: "1px solid rgba(255,255,255,.06)", color: "rgba(242,237,228,.35)" }}>
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">

        {/* Zugangsdaten */}
        {section === "zugangsdaten" && (
          <div className="space-y-3">
            {[
              { k: "name",            label: "Vollständiger Name *",    type: "text"     },
              { k: "email",           label: "E-Mail (Login) *",        type: "email"    },
              { k: "password",        label: "Passwort *",              type: "password" },
              { k: "passwordConfirm", label: "Passwort bestätigen *",   type: "password" },
              { k: "phone",           label: "Telefon",                 type: "tel"      },
            ].map(({ k, label, type }) => (
              <div key={k}>
                <label className="block text-xs text-[rgba(242,237,228,.4)] mb-1.5">{label}</label>
                <input type={type} value={(form as any)[k]} onChange={set(k)}
                  className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.3)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
              </div>
            ))}
            <button type="button" onClick={() => setSection("rechtliches")}
              className="w-full py-3 rounded-xl text-sm font-semibold text-[#0d0c0a]"
              style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
              Weiter →
            </button>
          </div>
        )}

        {/* Rechtliches */}
        {section === "rechtliches" && (
          <div className="space-y-3">
            <div className="rounded-xl px-4 py-3 text-xs text-[rgba(242,237,228,.5)]"
              style={{ background: "rgba(201,162,39,.06)", border: "1px solid rgba(201,162,39,.15)" }}>
              Diese Angaben werden für die Provisionsabrechnung und steuerliche Erfassung benötigt.
            </div>

            <div>
              <label className="block text-xs text-[rgba(242,237,228,.4)] mb-2">Ich mache das als</label>
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
            {[
              { k: "company",     label: "Firmenname",   placeholder: "",              onlyBusiness: true  },
              { k: "dateOfBirth", label: "Geburtsdatum", placeholder: "15.03.1990",   onlyBusiness: false },
              { k: "taxId",       label: "Steuernummer", placeholder: "123/456/78901", onlyBusiness: true  },
              { k: "vatId",       label: "USt-IdNr.",    placeholder: "DE123456789",  onlyBusiness: true  },
            ].filter(f => !f.onlyBusiness || businessType === "business").map(({ k, label, placeholder }) => (
              <div key={k}>
                <label className="block text-xs text-[rgba(242,237,228,.4)] mb-1.5">{label}</label>
                <input type="text" value={(form as any)[k]} onChange={set(k)} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.2)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={() => setSection("zugangsdaten")}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-[rgba(242,237,228,.5)]"
                style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>← Zurück</button>
              <button type="button" onClick={() => setSection("adresse")}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-[#0d0c0a]"
                style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>Weiter →</button>
            </div>
          </div>
        )}

        {/* Adresse */}
        {section === "adresse" && (
          <div className="space-y-3">
            {[
              { k: "address", label: "Straße + Hausnummer *", placeholder: "Musterstraße 12" },
              { k: "zip",     label: "PLZ *",                 placeholder: "80331"            },
              { k: "city",    label: "Stadt *",               placeholder: "München"           },
              { k: "country", label: "Land",                  placeholder: "Deutschland"       },
            ].map(({ k, label, placeholder }) => (
              <div key={k}>
                <label className="block text-xs text-[rgba(242,237,228,.4)] mb-1.5">{label}</label>
                <input type="text" value={(form as any)[k]} onChange={set(k)} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.2)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={() => setSection("rechtliches")}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-[rgba(242,237,228,.5)]"
                style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>← Zurück</button>
              <button type="button" onClick={() => setSection("bank")}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-[#0d0c0a]"
                style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>Weiter →</button>
            </div>
          </div>
        )}

        {/* Bankverbindung */}
        {section === "bank" && (
          <div className="space-y-3">
            <div className="rounded-xl px-4 py-3 text-xs text-[rgba(242,237,228,.5)]"
              style={{ background: "rgba(201,162,39,.06)", border: "1px solid rgba(201,162,39,.15)" }}>
              Deine Bankdaten werden ausschließlich für Provisionszahlungen verwendet.
            </div>
            {[
              { k: "bankIban", label: "IBAN *",        placeholder: "DE89 3704 0044 ..."  },
              { k: "bankBic",  label: "BIC / SWIFT *", placeholder: "COBADEFFXXX"         },
              { k: "bankName", label: "Bankname",       placeholder: "Commerzbank"         },
            ].map(({ k, label, placeholder }) => (
              <div key={k}>
                <label className="block text-xs text-[rgba(242,237,228,.4)] mb-1.5">{label}</label>
                <input type="text" value={(form as any)[k]} onChange={set(k)} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-[#17150f] border border-[rgba(255,255,255,.08)] rounded-xl text-[#f2ede4] placeholder-[rgba(242,237,228,.2)] focus:outline-none focus:border-[rgba(201,162,39,.4)] text-sm" />
              </div>
            ))}

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-400"
                style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setSection("adresse")}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-[rgba(242,237,228,.5)]"
                style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>← Zurück</button>
              <button type="submit" disabled={loading}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-[#0d0c0a] disabled:opacity-50"
                style={{ background: "linear-gradient(120deg, #e8c96a, #c9a227)" }}>
                {loading ? "Wird gesendet..." : "Registrieren →"}
              </button>
            </div>

            <p className="text-center text-[10px] text-[rgba(242,237,228,.2)]">
              Mit der Registrierung stimmst du unseren Partnerschaftsbedingungen zu.
            </p>
          </div>
        )}

      </form>
    </div>
  );
}
