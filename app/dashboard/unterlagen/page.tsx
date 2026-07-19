"use client";

// Verkaufsunterlagen für Partner: Pitch, Einwände, Argumente, Verhalten,
// Ablauf eines Abschlusses und Design-Beispiele zum Zeigen im Gespräch.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "react-qr-code";

const GOLD = "#c9a227";
const CARD: React.CSSProperties = { background: "#17150f", border: "1px solid rgba(255,255,255,.06)" };
const DEMO_URL = `${process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://loatycard.de"}/demo`;

// ── Design-Beispiele: Farbpaletten der echten Themes (Mini-Mockups) ───────────
const DESIGN_EXAMPLES: { name: string; branche: string; accent: string; cardBg: string; text: string; sub: string }[] = [
  { name: "Beate's Grill", branche: "Imbiss / Grill",    accent: "#E8A020", cardBg: "#120900", text: "#F5E8C0", sub: "#A06815" },
  { name: "Asia Taste",    branche: "Restaurant",        accent: "#cf6a35", cardBg: "#131a15", text: "#f2ead4", sub: "#85907f" },
  { name: "Barbershop",    branche: "Friseur / Barber",  accent: "#d7d2c6", cardBg: "#141414", text: "#f1e9d6", sub: "#8d877b" },
  { name: "Block 13",      branche: "Shisha / Lounge",   accent: "#c9a227", cardBg: "#17150f", text: "#f2ede4", sub: "#8a6f1b" },
  { name: "Entenhaus",     branche: "Restaurant",        accent: "#C9A560", cardBg: "#1C100B", text: "#F0E4CC", sub: "#7E6738" },
  { name: "Eiszauber",     branche: "Eisdiele",          accent: "#ff4fa0", cardBg: "#fffafe", text: "#2c1020", sub: "#c93d82" },
  { name: "Bäckerei",      branche: "Bäckerei",          accent: "#d97706", cardBg: "#fffbeb", text: "#451a03", sub: "#b45309" },
  { name: "Ozean",         branche: "Beispiel-Vorlage",  accent: "#60a5fa", cardBg: "#0f172a", text: "#eff6ff", sub: "#94a3b8" },
];

function MiniCard({ d }: { d: (typeof DESIGN_EXAMPLES)[number] }) {
  return (
    <div className="rounded-xl p-3" style={{ background: d.cardBg, border: `1px solid ${d.accent}44` }}>
      <p className="text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: d.sub }}>Stempelkarte</p>
      <p className="text-xs font-bold leading-tight mb-2 truncate" style={{ color: d.text }}>{d.name}</p>
      <div className="flex gap-1 mb-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="w-3 h-3 rounded-full"
            style={i < 4
              ? { background: d.accent, boxShadow: `0 0 4px ${d.accent}66` }
              : { border: `1px solid ${d.accent}55` }} />
        ))}
      </div>
      <p className="text-[8px]" style={{ color: d.sub }}>{d.branche}</p>
    </div>
  );
}

// ── Inhalte ───────────────────────────────────────────────────────────────────

type Section = { id: string; title: string; icon: string; body: React.ReactNode };

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-[rgba(242,237,228,.75)]">{children}</p>;
}
function H({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-wider mt-4 mb-1.5" style={{ color: GOLD }}>{children}</p>;
}
function Li({ items, color }: { items: React.ReactNode[]; color?: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="text-sm leading-relaxed text-[rgba(242,237,228,.75)] flex gap-2">
          <span style={{ color: color ?? GOLD }} className="shrink-0">•</span><span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
function Einwand({ e, a }: { e: string; a: string }) {
  return (
    <div className="rounded-xl p-3 space-y-1.5" style={{ background: "#1c1a13", border: "1px solid rgba(255,255,255,.05)" }}>
      <p className="text-sm font-semibold text-[#f2ede4]">„{e}"</p>
      <p className="text-sm leading-relaxed text-[rgba(242,237,228,.65)]">{a}</p>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "pitch30", title: "Das Produkt in 30 Sekunden", icon: "⚡",
    body: (
      <div className="space-y-3">
        <div className="rounded-xl p-3" style={{ background: "rgba(201,162,39,.08)", border: "1px solid rgba(201,162,39,.25)" }}>
          <P>
            „Loatycard ersetzt die Papier-Stempelkarte durch eine digitale Karte auf dem Handy —
            <b> ohne App-Download</b>, für niemanden. Der Kunde scannt einmal einen QR-Code, hat seine
            Karte immer dabei und kommt öfter wieder. Und Sie sehen zum ersten Mal, wer Ihre
            Stammkunden wirklich sind."
          </P>
        </div>
        <P>Das ist dein Elevator Pitch. Auswendig können, natürlich sagen. Danach sofort die Demo: eigenen QR-Code am Handy zeigen und einen Stempel geben lassen — das Produkt verkauft sich visuell.</P>
      </div>
    ),
  },
  {
    id: "demo", title: "Live-Demo zum Scannen", icon: "📱",
    body: (
      <div className="space-y-3">
        <P>
          Dein stärkstes Werkzeug im Gespräch: Lass den Inhaber diesen QR-Code <b>mit seiner
          normalen Handy-Kamera</b> scannen — keine App, keine Registrierung, nichts zu kaufen.
          Er bekommt sofort eine <b>interaktive Stempelkarte</b>: selbst Stempel geben, die
          Animation sehen und oben <b>alle Designs durchschalten</b> (inkl. der Custom-Beispiele).
        </P>
        <div className="flex justify-center py-2">
          <div className="bg-white rounded-2xl p-3">
            <QRCode value={DEMO_URL} size={168} />
          </div>
        </div>
        <p className="text-center text-[10px] font-mono text-[rgba(242,237,228,.35)] break-all">{DEMO_URL}</p>
        <P>
          Der Moment dafür: direkt nach dem Pitch. <b>„Scannen Sie mal — genau das sehen Ihre
          Kunden."</b> Ab da verkauft sich das Produkt selbst, und der Design-Umschalter zeigt
          direkt, wie das eigene Design aussehen wird — bei jedem Shop inklusive.
        </P>
      </div>
    ),
  },
  {
    id: "leitfaden", title: "Gesprächsleitfaden", icon: "🗣",
    body: (
      <div className="space-y-1">
        <H>1. Einstieg (ruhige Uhrzeit wählen)</H>
        <P>„Haben Sie 3 Minuten? Ich zeig Ihnen was, das Ihre Stammkunden öfter zurückbringt." Direkt an den Inhaber — nicht an Aushilfen pitchen.</P>
        <H>2. Bedarf wecken</H>
        <P>Fragen stellen statt reden: „Haben Sie Stempelkarten? Wie viele kommen ausgefüllt zurück? Wissen Sie, wer Ihre 20 besten Kunden sind?" — Fast niemand weiß es. Genau da setzt du an.</P>
        <H>3. Demo</H>
        <P>Dein Handy raus, Karte zeigen, Stempel-Animation zeigen. Dann: „So sieht das mit Ihrem Logo und Ihren Farben aus" — Design-Beispiele (unten) zeigen.</P>
        <H>4. Abschluss</H>
        <P>„Die Einrichtung übernehmen komplett wir. Sie bekommen den fertigen QR-Aufsteller-Code und Ihren Zugang. Sollen wir das direkt anlegen?" — Formular gemeinsam ausfüllen oder Einladungslink dalassen.</P>
      </div>
    ),
  },
  {
    id: "preise", title: "Preise & Produkte", icon: "💶",
    body: (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {[
            { name: "Jahresabo",               preis: "360 € / Jahr",   detail: "Nicht mal 1 € pro Tag. Das Hauptprodukt — digitale Stempelkarte, QR-Scanner, Kunden-Statistiken." },
            { name: "Monatsabo",               preis: "30 € / Monat",   detail: "Der flexible Einstieg für Zögerer. Gleicher Funktionsumfang." },
            { name: "Einrichtung & Design",    preis: "99 € einmalig",  detail: "Bei jedem Shop dabei (Pflichtbestandteil): komplette Einrichtung plus individuelles Design — eigenes Logo, eigene Farben, eigener Look. ‚Mit Ihrem Logo wirkt das wie Ihre eigene App.'" },
            { name: "Bonusprogramm",           preis: "5 € / Monat pro Belohnung", detail: "Mehrstufige Belohnungen (z.B. Stufe 1 nach 5 Stempeln, Stufe 2 nach 10). Pro eingerichteter Belohnung 5 € im Monat — beim Jahresabo 60 € im Jahr. Anzahl wird beim Anlegen des Shops festgelegt." },
          ].map(p => (
            <div key={p.name} className="rounded-xl p-3" style={{ background: "#1c1a13", border: "1px solid rgba(255,255,255,.05)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-[#f2ede4]">{p.name}</p>
                <p className="text-sm font-bold" style={{ color: GOLD }}>{p.preis}</p>
              </div>
              <p className="text-xs leading-relaxed text-[rgba(242,237,228,.55)] mt-1">{p.detail}</p>
            </div>
          ))}
        </div>
        <P><b>Rabattcodes:</b> Nur einsetzen, wenn du dafür freigeschaltet bist (steht in deinem Profil bzw. sag uns Bescheid). Niemals eigenmächtig Rabatte versprechen.</P>
      </div>
    ),
  },
  {
    id: "argumente", title: "Argumente: Pro & Contra", icon: "⚖️",
    body: (
      <div className="space-y-3">
        <H>Was dafür spricht</H>
        <Li items={[
          <><b>Kein App-Download</b> — läuft im Browser, ein QR-Scan reicht. Das größte Gegenargument gegen „digital" fällt weg.</>,
          <><b>Karte ist immer dabei</b> — nichts geht verloren, nichts wird vergessen oder durchgewaschen.</>,
          <><b>Der Betrieb sieht endlich Daten</b> — wer kommt wie oft, was wird eingelöst, wer sind die Top-Kunden.</>,
          <><b>Bonus-Stufen & Meilensteine</b> — mehrstufige Belohnungen bringen Kunden messbar öfter zurück als „10 Stempel = 1 gratis".</>,
          <><b>Einrichtung ohne Aufwand</b> — Loatycard richtet alles ein, der Betrieb stellt nur den QR-Code auf.</>,
          <><b>Eigenes Design</b> — mit Logo und Farben fühlt es sich wie die eigene App des Ladens an.</>,
        ]} />
        <H>Wo die Grenzen sind (ehrlich bleiben!)</H>
        <Li color="#b45309" items={[
          <>Kunden ohne Smartphone erreicht es nicht — Papierkarte kann am Anfang parallel weiterlaufen.</>,
          <>Das Personal muss beim Stempeln kurz den QR-Code des Kunden scannen — Umgewöhnung von 1–2 Tagen.</>,
          <>Es ist ein Werkzeug für Kundenbindung — schlechten Service oder schlechtes Produkt rettet es nicht.</>,
        ]} />
        <P>Ehrlichkeit über die Grenzen macht dich glaubwürdig — und Glaubwürdigkeit verkauft mehr als jedes Argument.</P>
      </div>
    ),
  },
  {
    id: "einwaende", title: "Einwände & Antworten", icon: "🛡",
    body: (
      <div className="space-y-2">
        <Einwand e="Das ist mir zu teuer."
          a="Das Jahresabo kostet rund 1 Euro pro Tag. Wenn dadurch nur ein einziger Kunde pro Woche einmal öfter kommt, hat es sich mehrfach bezahlt. Rechnen Sie es an Ihrem Durchschnittsbon durch." />
        <Einwand e="Meine Papierkarten funktionieren doch."
          a="Wie viele kommen tatsächlich voll zurück? Die meisten landen in der Waschmaschine oder im Müll. Und: Papier sagt Ihnen nicht, wer Ihre Stammkunden sind — die digitale Karte schon." />
        <Einwand e="Meine Kunden sind nicht so digital."
          a="Es gibt nichts zu installieren. QR-Code scannen kennt seit der Speisekarte jeder. Und für die Übergangszeit können Sie Papier einfach parallel weiterlaufen lassen." />
        <Einwand e="Ich habe keine Zeit, mich darum zu kümmern."
          a="Müssen Sie nicht. Die Einrichtung machen wir komplett — Sie bekommen den fertigen QR-Code und Ihren Zugang. Ihr Aufwand ist: aufstellen." />
        <Einwand e="Was ist mit Datenschutz?"
          a="Es werden nur Name und Telefonnummer der Kunden gespeichert, mit Einwilligung, DSGVO-konform, Daten liegen auf Servern in der EU." />
        <Einwand e="Ich überlege es mir."
          a="Klar. Zwei Angebote: das Monatsabo für 30 € als unverbindlicher Einstieg — oder ich lasse Ihnen den Einladungslink da und Sie schauen es sich in Ruhe an. Wann darf ich nochmal vorbeikommen?" />
      </div>
    ),
  },
  {
    id: "designs", title: "Design-Beispiele zum Zeigen", icon: "🎨",
    body: (
      <div className="space-y-3">
        <P>Zeig diese Beispiele im Gespräch — echte Designs von Loatycard-Shops und Vorlagen. Der Satz dazu: <b>„So sieht Ihre Karte aus — mit Ihrem Logo und Ihren Farben. Das individuelle Design ist bei jedem Shop dabei."</b></P>
        <div className="grid grid-cols-2 gap-2">
          {DESIGN_EXAMPLES.map(d => <MiniCard key={d.name} d={d} />)}
        </div>
        <P>Jeder Shop bekommt sein eigenes Design — Teil der einmaligen Einrichtung (99 €). Es gibt keine Shops „von der Stange" mehr.</P>
      </div>
    ),
  },
  {
    id: "verhalten", title: "Do's & Don'ts", icon: "🤝",
    body: (
      <div className="space-y-3">
        <H>Do</H>
        <Li color="#4ade80" items={[
          <>Zur ruhigen Tageszeit kommen (nicht mittags in die Gastro).</>,
          <>Mit dem Inhaber sprechen — freundlich nach ihm fragen, wenn er nicht da ist, und wiederkommen.</>,
          <>Immer die Live-Demo am eigenen Handy zeigen. Zeigen schlägt Erzählen.</>,
          <>Konkreten nächsten Schritt vereinbaren: Abschluss, Folgetermin oder Einladungslink.</>,
          <>Gepflegt auftreten — du repräsentierst Loatycard.</>,
        ]} />
        <H>Don't</H>
        <Li color="#f87171" items={[
          <>Nichts versprechen, was das Produkt nicht kann (keine „Umsatzgarantien").</>,
          <>Keine Rabatte oder Gratis-Monate zusagen, für die du nicht freigeschaltet bist.</>,
          <>Nicht drängen. Ein „Nein, danke" akzeptieren und die Tür für später offen lassen.</>,
          <>Keine Design-Zusagen im Detail („das Logo blinkt dann…") — Design-Wünsche nehmen wir auf und setzen um, was gut aussieht.</>,
          <>Niemals schlecht über andere Anbieter oder den Laden reden.</>,
        ]} />
      </div>
    ),
  },
  {
    id: "ablauf", title: "So läuft ein Abschluss", icon: "📋",
    body: (
      <div className="space-y-2">
        {[
          { n: 1, t: "Shop einreichen", d: "Über ‚Neuen Shop einreichen' das Formular ausfüllen — oder dem Inhaber deinen Einladungslink geben, dann füllt er es selbst aus." },
          { n: 2, t: "Bestätigung", d: "Der Inhaber bekommt automatisch eine Bestätigungs-E-Mail. Du siehst den Shop sofort unter ‚Meine Shops'." },
          { n: 3, t: "Zahlung", d: "Der Inhaber zahlt über den Zahlungslink (Karte oder SEPA). Den Link findest du beim Shop unter ‚Meine Shops'." },
          { n: 4, t: "Automatische Einrichtung", d: "Direkt nach der Zahlung wird die Stempelkarte automatisch angelegt. Der Inhaber erhält QR-Code und Zugang." },
          { n: 5, t: "Deine Provision", d: "Erscheint sofort unter ‚Provisionen' und wird nach Bestätigung per SEPA ausgezahlt." },
        ].map(s => (
          <div key={s.n} className="flex gap-3 rounded-xl p-3" style={{ background: "#1c1a13", border: "1px solid rgba(255,255,255,.05)" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
              style={{ background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.4)", color: GOLD }}>{s.n}</div>
            <div>
              <p className="text-sm font-semibold text-[#f2ede4]">{s.t}</p>
              <p className="text-xs leading-relaxed text-[rgba(242,237,228,.55)] mt-0.5">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

// ── Seite ─────────────────────────────────────────────────────────────────────

export default function UnterlagenPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>("pitch30");

  useEffect(() => {
    const t = localStorage.getItem("affiliate_token");
    if (!t) { router.push("/login"); return; }
    setToken(t);
  }, [router]);

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.3em] uppercase" style={{ color: GOLD }}>Unterlagen</p>
          <h1 className="text-xl font-bold text-[#f2ede4]">Verkaufen mit Loatycard</h1>
        </div>
        <Link href="/dashboard" className="text-xs text-[rgba(242,237,228,.4)] hover:text-[rgba(242,237,228,.7)]">← Zurück</Link>
      </div>

      <p className="text-xs leading-relaxed text-[rgba(242,237,228,.45)]">
        Alles, was du fürs Gespräch brauchst: Pitch, Einwände, Argumente, Design-Beispiele und der Ablauf bis zur Provision.
      </p>

      {SECTIONS.map(s => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-2xl overflow-hidden" style={CARD}>
            <button type="button" onClick={() => setOpenId(open ? null : s.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <span className="text-base">{s.icon}</span>
              <span className="text-sm font-semibold text-[#f2ede4] flex-1">{s.title}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,.3)" strokeWidth="2"
                className={`transition-transform ${open ? "rotate-90" : ""}`}>
                <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open && (
              <div className="px-4 pb-4 border-t border-[rgba(255,255,255,.05)] pt-3">
                {s.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
