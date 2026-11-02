import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { TIERS, tierInfo, tierRangeLabel, type Tier } from "./pricing";
import { escapeHtml } from "./htmlEscape";

const RESEND_KEY  = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL ?? "LoyaltyCard <onboarding@resend.dev>";
const WHATSAPP_NR = process.env.SUPPORT_WHATSAPP ?? "+491634848207";

const vTier = v.union(v.literal("free"), v.literal("starter"), v.literal("business"), v.literal("premium"));

const eur = (n: number) => `€${n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ── Inhaber-Mails ─────────────────────────────────────────────────────────────
// (1) Willkommen: bei der Freischaltung (Bezahldaten hinterlegt bzw. vom Admin
//     aktiviert). Beim bloßen Anlegen (auch "Später zahlen") geht nichts raus.
// (2) Zahlungsbestätigung: nach jeder echten Zahlung > 0 € (Stripe-Rechnung).
// (3) Stufenwechsel: wenn der Shop eine Kartengrenze überschreitet.

function ownerMailShell(subtitle: string, inner: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0c0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0"
    style="background:#17150f;border-radius:20px;overflow:hidden;max-width:540px;width:100%;">
    <tr>
      <td style="background:#0d0c0a;padding:28px 32px;text-align:center;">
        <p style="margin:0;color:#c9a227;font-size:24px;font-weight:900;letter-spacing:6px;">LOYALTYCARD</p>
        <p style="margin:6px 0 0 0;color:rgba(242,237,228,0.45);font-size:12px;letter-spacing:2px;">${subtitle}</p>
      </td>
    </tr>
    ${inner}
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <p style="margin:0 0 14px 0;font-size:15px;color:#cfc9bd;line-height:1.75;">
          Fragen zur Abrechnung oder zu deiner Stempelkarte? Melde dich jederzeit:
        </p>
        <a href="https://wa.me/${WHATSAPP_NR.replace(/\D/g, "")}"
          style="display:inline-block;background:#25d366;color:#ffffff;padding:14px 28px;border-radius:12px;
                 text-decoration:none;font-weight:700;font-size:15px;">
          WhatsApp schreiben &rarr;
        </a>
        <p style="margin:12px 0 0 0;font-size:14px;color:#8a8577;">
          Oder ruf uns einfach an: <strong style="color:#cfc9bd;">${WHATSAPP_NR}</strong>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px 32px;border-top:1px solid #2a2620;">
        <p style="margin:24px 0 0 0;color:#f2ede4;font-size:15px;font-weight:600;">Dein LoyaltyCard-Team</p>
      </td>
    </tr>
    <tr>
      <td style="background:#1c1a13;padding:18px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b6558;">LoyaltyCard &middot; Digitale Stempelkarten für lokale Shops</p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

const para = (html: string) => `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.75;">${html}</p>
      </td>
    </tr>`;

const heading = (text: string) => `
    <tr>
      <td style="padding:36px 32px 16px 32px;">
        <h1 style="margin:0;font-size:22px;color:#f2ede4;font-weight:800;">${text}</h1>
      </td>
    </tr>`;

// Kasten mit Zeilen "Bezeichnung … Wert"
function box(title: string, rows: [string, string][]): string {
  return `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">${title}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows.map(([l, r]) => `
              <tr>
                <td style="padding:6px 12px 6px 0;color:#cfc9bd;font-size:14px;">${l}</td>
                <td style="padding:6px 0;text-align:right;white-space:nowrap;color:#f2ede4;font-weight:600;font-size:14px;">${r}</td>
              </tr>`).join("")}
            </table>
          </td></tr>
        </table>
      </td>
    </tr>`;
}

function checklist(title: string, items: string[]): string {
  return `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">${title}</p>
            ${items.map(e => `
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; ${e}
            </p>`).join("")}
          </td></tr>
        </table>
      </td>
    </tr>`;
}

// Preisliste für Mails: "Free · bis 25 Kunden … €0/Monat"
const tierRows = (): [string, string][] =>
  TIERS.map(t => [`${t.name} &middot; ${tierRangeLabel(t.id)}`, `${eur(t.monthly)}/Monat`]);
const tierTextLines = () => TIERS.map(t => `- ${t.name} (${tierRangeLabel(t.id)}): ${eur(t.monthly)}/Monat`);

const INCLUDED = [
  "Digitale Stempelkarte für deine Kunden, ohne App-Download",
  "Individuelles Design: dein Logo, deine Farben, dein Look",
  "Bonusprogramm mit mehreren Belohnungsstufen",
  "QR-Code-Vorlagen für Theke und Aushang",
  "Betriebs-Dashboard mit Scanner und Kunden-Statistiken",
  "Persönlicher Support per WhatsApp und Telefon",
  "Alle Updates und neuen Funktionen inklusive",
];

const LEGAL_ITEMS = [
  "Impressum (Firmenname, Inhaber, Anschrift, Kontakt)",
  "Umsatzsteuer-ID bzw. Steuernummer",
  "Handelsregisternummer & Registergericht (falls eingetragen)",
  "AGB deines Shops (falls vorhanden)",
  "Datenschutzerklärung bzw. Datenschutz-Kontakt",
];

async function sendOwnerMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!RESEND_KEY) return;
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error(`Resend-Fehler ${res.status}: ${await res.text()}`);
}

export const sendWelcomeEmail = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName:  v.string(),
    shopName:   v.string(),
    tier:       vTier,
  },
  handler: async (_ctx, args) => {
    const t = tierInfo(args.tier as Tier);
    const html = ownerMailShell("WILLKOMMEN",
      heading(`Herzlich willkommen, ${escapeHtml(args.ownerName)}!`) +
      para(`Schön, dass du dabei bist! <strong style="color:#f2ede4;">${escapeHtml(args.shopName)}</strong> ist freigeschaltet
         und wir kümmern uns ab sofort darum, dass deine digitale Stempelkarte schnell und reibungslos an den Start geht.`) +
      box("Dein Tarif", [
        ["Aktuelle Stufe", `${t.name} (${tierRangeLabel(t.id)})`],
        ["Preis", `${eur(t.monthly)}/Monat`],
      ]) +
      para(`Der Preis richtet sich nach der Anzahl deiner Kunden mit Stempelkarte. Wächst du über eine Grenze,
         sagen wir dir Bescheid und die neue Stufe gilt ab der nächsten Abrechnung. Abgebucht wird monatlich
         über deine hinterlegte Zahlart.`) +
      box("Alle Stufen", tierRows()) +
      checklist("Das alles ist für dich enthalten", INCLUDED) +
      para(`Zu deinem Paket gehört ein <strong>individuelles Design</strong> deiner Stempelkarte. Wir melden uns
         <strong>innerhalb der nächsten 24 Stunden</strong> persönlich bei dir, damit deine Karte genauso aussieht,
         wie du es dir vorstellst.`) +
      checklist("Bitte halte diese Angaben bereit", LEGAL_ITEMS.map(escapeHtml)) +
      para(`Diese Angaben brauchen wir für das Impressum, damit deine Stempelkarte rechtlich sauber online gehen kann.
         Kein Stress, wir gehen alles gemeinsam mit dir durch.`),
    );

    const text = [
      `Herzlich willkommen, ${args.ownerName}!`,
      ``,
      `Schön, dass du dabei bist! "${args.shopName}" ist freigeschaltet und wir kümmern uns ab sofort darum, dass deine digitale Stempelkarte schnell und reibungslos an den Start geht.`,
      ``,
      `Dein Tarif: ${t.name} (${tierRangeLabel(t.id)}), ${eur(t.monthly)}/Monat`,
      `Der Preis richtet sich nach der Anzahl deiner Kunden mit Stempelkarte. Wächst du über eine Grenze, sagen wir dir Bescheid und die neue Stufe gilt ab der nächsten Abrechnung.`,
      ``,
      `Alle Stufen:`,
      ...tierTextLines(),
      ``,
      `Das alles ist enthalten:`,
      ...INCLUDED.map(e => `- ${e}`),
      ``,
      `Zu deinem Paket gehört ein individuelles Design deiner Stempelkarte.`,
      `Wir melden uns innerhalb der nächsten 24 Stunden persönlich bei dir.`,
      ``,
      `Bitte halte diese Angaben bereit (für das Impressum):`,
      ...LEGAL_ITEMS.map(e => `- ${e}`),
      ``,
      `Fragen? WhatsApp oder Anruf: ${WHATSAPP_NR}`,
      ``,
      `Dein LoyaltyCard-Team`,
      `LoyaltyCard · Digitale Stempelkarten für lokale Shops`,
    ].join("\n");

    await sendOwnerMail(args.ownerEmail, `Willkommen bei LoyaltyCard, ${args.shopName} ist freigeschaltet`, html, text);
  },
});

export const sendPaymentConfirmationEmail = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName:  v.string(),
    shopName:   v.string(),
    planType:   v.union(v.literal("annual"), v.literal("monthly")),
    tier:       vTier,
    totalPaid:  v.number(),
  },
  handler: async (_ctx, args) => {
    const t      = tierInfo(args.tier as Tier);
    const period = args.planType === "annual" ? "Jahr" : "Monat";
    const list   = t.monthly * (args.planType === "annual" ? 12 : 1);
    const html = ownerMailShell("ZAHLUNGSBEST&Auml;TIGUNG",
      heading(`Zahlung erhalten, danke ${escapeHtml(args.ownerName)}!`) +
      para(`Deine Zahlung für <strong style="color:#f2ede4;">${escapeHtml(args.shopName)}</strong> ist eingegangen. Hier deine Übersicht:`) +
      box("Abrechnung", [
        [`LoyaltyCard ${t.name} (${tierRangeLabel(t.id)})`, `${eur(list)}/${period}`],
        ["Gezahlt", eur(args.totalPaid)],
      ]),
    );
    const text = [
      `Zahlung erhalten, danke ${args.ownerName}!`,
      ``,
      `Deine Zahlung für "${args.shopName}" ist eingegangen.`,
      `- LoyaltyCard ${t.name} (${tierRangeLabel(t.id)}): ${eur(list)}/${period}`,
      `Gezahlt: ${eur(args.totalPaid)}`,
      ``,
      `Fragen? WhatsApp oder Anruf: ${WHATSAPP_NR}`,
      ``,
      `Dein LoyaltyCard-Team`,
    ].join("\n");
    await sendOwnerMail(args.ownerEmail, `Zahlung erhalten: ${args.shopName} (${eur(args.totalPaid)})`, html, text);
  },
});

export const sendTierChangeEmail = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName:  v.string(),
    shopName:   v.string(),
    oldTier:    vTier,
    newTier:    vTier,
    cardCount:  v.number(),
  },
  handler: async (_ctx, args) => {
    const oldT = tierInfo(args.oldTier as Tier);
    const newT = tierInfo(args.newTier as Tier);
    const up   = newT.monthly > oldT.monthly;
    const shop = escapeHtml(args.shopName);
    const html = ownerMailShell("DEIN TARIF",
      heading(up ? `Glückwunsch, ${shop} wächst!` : `Dein Tarif wurde angepasst`) +
      para(up
        ? `Du hast jetzt <strong style="color:#f2ede4;">${args.cardCount} Kunden</strong> mit Stempelkarte, das ist mehr, als in
           <strong>${oldT.name}</strong> enthalten ist. Deshalb gilt ab deiner <strong>nächsten Abrechnung</strong> die Stufe
           <strong style="color:#e8c96a;">${newT.name}</strong>. Du musst nichts tun, alle deine Kunden und Karten bleiben, wie sie sind.`
        : `Du hast jetzt <strong style="color:#f2ede4;">${args.cardCount} Kunden</strong> mit Stempelkarte. Ab deiner
           <strong>nächsten Abrechnung</strong> gilt deshalb die günstigere Stufe <strong style="color:#e8c96a;">${newT.name}</strong>.`) +
      box("Neuer Tarif", [
        ["Bisher", `${oldT.name} &middot; ${eur(oldT.monthly)}/Monat`],
        ["Ab nächster Abrechnung", `${newT.name} &middot; ${eur(newT.monthly)}/Monat`],
      ]) +
      box("Alle Stufen", tierRows()),
    );
    const text = [
      up ? `Glückwunsch, ${args.shopName} wächst!` : `Dein Tarif wurde angepasst`,
      ``,
      `Du hast jetzt ${args.cardCount} Kunden mit Stempelkarte. Ab deiner nächsten Abrechnung gilt die Stufe ${newT.name} (${eur(newT.monthly)}/Monat) statt ${oldT.name} (${eur(oldT.monthly)}/Monat).`,
      ...(up ? [`Du musst nichts tun, alle deine Kunden und Karten bleiben, wie sie sind.`] : []),
      ``,
      `Alle Stufen:`,
      ...tierTextLines(),
      ``,
      `Fragen? WhatsApp oder Anruf: ${WHATSAPP_NR}`,
      ``,
      `Dein LoyaltyCard-Team`,
    ].join("\n");
    await sendOwnerMail(
      args.ownerEmail,
      up ? `${args.shopName}: neue Stufe ${newT.name} ab nächster Abrechnung` : `${args.shopName}: Tarif angepasst`,
      html, text,
    );
  },
});

// ── Partner-Mails ─────────────────────────────────────────────────────────────
// (1) Nach der Registrierung (offen oder Einladungslink): Anfrage eingegangen,
//     wird geprüft. (2) Nach der Admin-Freigabe: Willkommens-Mail mit
//     Login-Link, Partner-Code und Provisions-Konditionen.

const PARTNER_APP_URL = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL ?? "https://partner.loyaltycard.info";

function partnerMailShell(inner: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0c0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0"
    style="background:#17150f;border-radius:20px;overflow:hidden;max-width:540px;width:100%;">
    <tr>
      <td style="background:#0d0c0a;padding:28px 32px;text-align:center;">
        <p style="margin:0;color:#c9a227;font-size:24px;font-weight:900;letter-spacing:6px;">LOYALTYCARD</p>
        <p style="margin:6px 0 0 0;color:rgba(242,237,228,0.45);font-size:12px;letter-spacing:2px;">PARTNERPROGRAMM</p>
      </td>
    </tr>
    ${inner}
    <tr>
      <td style="padding:0 32px 32px 32px;border-top:1px solid #2a2620;">
        <p style="margin:16px 0 0 0;color:#f2ede4;font-size:15px;font-weight:600;">Dein LoyaltyCard-Team</p>
      </td>
    </tr>
    <tr>
      <td style="background:#1c1a13;padding:18px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b6558;">LoyaltyCard &middot; Digitale Stempelkarten für lokale Shops</p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error(`Resend-Fehler ${res.status}: ${await res.text()}`);
}

export const sendPartnerRequestReceivedEmail = internalAction({
  args: { name: v.string(), email: v.string() },
  handler: async (_ctx, args) => {
    if (!RESEND_KEY) return;

    const inner = `
    <tr>
      <td style="padding:36px 32px 20px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#f2ede4;font-weight:800;">
          Deine Anfrage ist eingegangen, ${escapeHtml(args.name)}!
        </h1>
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          Danke für deine Registrierung im <strong style="color:#f2ede4;">LoyaltyCard-Partnerprogramm</strong>.
          Wir prüfen deine Angaben jetzt und schalten deinen Zugang frei. Das geht
          normalerweise schnell, meist innerhalb von 24 Stunden.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;color:#cfc9bd;font-size:14px;line-height:1.7;">
              <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; Du musst nichts weiter tun.
              Sobald dein Zugang freigeschaltet ist, bekommst du eine E-Mail von uns und kannst direkt loslegen.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>`;

    const text = [
      `Deine Anfrage ist eingegangen, ${args.name}!`,
      ``,
      `Danke für deine Registrierung im LoyaltyCard-Partnerprogramm.`,
      `Wir prüfen deine Angaben jetzt und schalten deinen Zugang frei, meist innerhalb von 24 Stunden.`,
      ``,
      `Du musst nichts weiter tun. Sobald dein Zugang freigeschaltet ist, bekommst du eine E-Mail von uns.`,
      ``,
      `Dein LoyaltyCard-Team`,
    ].join("\n");

    await sendViaResend(args.email, "Deine Partner-Anfrage bei LoyaltyCard ist eingegangen",
      partnerMailShell(inner), text);
  },
});

export const sendPartnerWelcomeEmail = internalAction({
  args: { name: v.string(), email: v.string(), referralCode: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    if (!RESEND_KEY) return;

    const codeRow = args.referralCode ? `
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; Dein Partner-Code: <strong style="color:#e8c96a;">${escapeHtml(args.referralCode)}</strong>
            </p>` : "";

    const inner = `
    <tr>
      <td style="padding:36px 32px 20px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#f2ede4;font-weight:800;">
          Willkommen im Partnerprogramm, ${escapeHtml(args.name)}!
        </h1>
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          Deine Anfrage ist geprüft und dein Zugang ist <strong style="color:#f2ede4;">ab sofort freigeschaltet</strong>.
          Du kannst dich jetzt einloggen und deine ersten Shops einreichen.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">
              Deine Konditionen
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; 35% Provision auf den Monatsbeitrag in den ersten 12 bezahlten Monaten
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; Danach dauerhaft 15%, solange der Shop aktiv bleibt
            </p>${codeRow}
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <a href="${PARTNER_APP_URL}/login"
          style="display:inline-block;background:linear-gradient(120deg,#e8c96a,#c9a227);color:#0d0c0a;padding:14px 28px;border-radius:12px;
                 text-decoration:none;font-weight:700;font-size:15px;">
          Zum Partner-Login &rarr;
        </a>
        <p style="margin:14px 0 0 0;font-size:13px;color:#8a8577;line-height:1.6;">
          Tipp: Im Dashboard findest du unter <strong style="color:#cfc9bd;">Unterlagen</strong> alles
          fürs Verkaufsgespräch, vom Pitch über Einwände bis zur Live-Demo.
          Bei Fragen erreichst du uns per WhatsApp: <strong style="color:#cfc9bd;">${WHATSAPP_NR}</strong>
        </p>
      </td>
    </tr>`;

    const text = [
      `Willkommen im Partnerprogramm, ${args.name}!`,
      ``,
      `Deine Anfrage ist geprüft und dein Zugang ist ab sofort freigeschaltet.`,
      ``,
      `Deine Konditionen:`,
      `- 35% Provision auf den Monatsbeitrag in den ersten 12 bezahlten Monaten`,
      `- danach dauerhaft 15%, solange der Shop aktiv bleibt`,
      ...(args.referralCode ? [`- dein Partner-Code: ${args.referralCode}`] : []),
      ``,
      `Login: ${PARTNER_APP_URL}/login`,
      `Tipp: Im Dashboard findest du unter Unterlagen alles fürs Verkaufsgespräch.`,
      `Fragen? WhatsApp: ${WHATSAPP_NR}`,
      ``,
      `Dein LoyaltyCard-Team`,
    ].join("\n");

    await sendViaResend(args.email, "Willkommen im LoyaltyCard-Partnerprogramm! Dein Zugang ist freigeschaltet",
      partnerMailShell(inner), text);
  },
});
