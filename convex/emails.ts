import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_PRICES, SETUP_FEE, SETUP_FEE_PROMO, REWARD_PRICE_PER_MONTH, recurringPrice } from "./pricing";
import { escapeHtml } from "./htmlEscape";

const RESEND_KEY  = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL ?? "LoyaltyCard <onboarding@resend.dev>";
const WHATSAPP_NR = process.env.SUPPORT_WHATSAPP ?? "+491634848207";

export const sendWelcomeEmail = internalAction({
  args: {
    ownerEmail:       v.string(),
    ownerName:        v.string(),
    shopName:         v.string(),
    planType:         v.union(v.literal("annual"), v.literal("monthly")),
    rewardCount:      v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    if (!RESEND_KEY) return;

    const planLabel = args.planType === "annual"
      ? `Jahresabo (€${PLAN_PRICES.annual} / Jahr)`
      : `Monatsabo (€${PLAN_PRICES.monthly} / Monat)`;

    const rewardCount = args.rewardCount ?? 0;
    const extras = [
      `Individuelles Design & Einrichtung (einmalig €${SETUP_FEE})`,
      ...(rewardCount > 0
        ? [`Bonusprogramm: ${rewardCount} Belohnung${rewardCount === 1 ? "" : "en"} (€${REWARD_PRICE_PER_MONTH}/Monat pro Belohnung)`]
        : []),
    ];

    const extrasSection = `
        <tr><td style="padding:0 32px 24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#201a0d;border-radius:10px;border-left:4px solid #c9a227;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">
                In deinem Paket enthalten
              </p>
              ${extras.map(e => `
              <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
                <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; ${e}
              </p>`).join("")}
            </td></tr>
          </table>
        </td></tr>`;

    const designSection = `
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.7;">
            Zu deinem Paket gehört ein <strong>individuelles Design</strong> deiner
            Stempelkarte. Wir melden uns <strong>innerhalb der nächsten 24 Stunden</strong>
            persönlich bei dir, damit deine Karte genauso aussieht, wie du es dir vorstellst.
          </p>
        </td></tr>`;

    const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0c0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0"
    style="background:#17150f;border-radius:20px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="background:#0d0c0a;padding:28px 32px;text-align:center;">
        <p style="margin:0;color:#c9a227;font-size:24px;font-weight:900;letter-spacing:6px;">LOYALTYCARD</p>
        <p style="margin:6px 0 0 0;color:rgba(242,237,228,0.45);font-size:12px;letter-spacing:2px;">DIGITALE KUNDENKARTE</p>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:36px 32px 20px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#f2ede4;font-weight:800;">
          Herzlich willkommen, ${escapeHtml(args.ownerName)}!
        </h1>
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          Schön, dass du dabei bist! Dein Shop <strong style="color:#f2ede4;">${escapeHtml(args.shopName)}</strong>
          ist bei uns registriert und wir kümmern uns ab sofort darum, dass deine
          digitale Stempelkarte schnell und reibungslos an den Start geht.
        </p>
      </td>
    </tr>

    <!-- Plan Info -->
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#1c1a13;border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#8a8577;text-transform:uppercase;letter-spacing:1px;">Dein Paket</p>
              <p style="margin:0;font-size:16px;font-weight:700;color:#f2ede4;">${planLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${extrasSection}
    ${designSection}

    <!-- Rechtliche Unterlagen -->
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">
              Bitte halte diese Angaben bereit
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Impressum (Firmenname, Inhaber, Anschrift, Kontakt)
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; AGB deines Shops (falls vorhanden)
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Datenschutzerkl&auml;rung bzw. Datenschutz-Kontakt
            </p>
            <p style="margin:12px 0 0 0;color:#8a8577;font-size:13px;line-height:1.6;">
              Diese Angaben brauchen wir, damit deine Stempelkarte rechtlich sauber
              online gehen kann. Kein Stress, wir gehen alles gemeinsam mit dir durch.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- What happens next -->
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <p style="margin:0 0 14px 0;font-size:15px;color:#cfc9bd;line-height:1.75;">
          In der Zwischenzeit stehen wir dir bei allen Fragen zur Seite.
          Melde dich einfach per WhatsApp oder ruf direkt bei uns an:
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

    <!-- Closing -->
    <tr>
      <td style="padding:0 32px 32px 32px;border-top:1px solid #2a2620;">
        <p style="margin:24px 0 0 0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          Wir freuen uns darauf, gemeinsam mit dir mehr Stammkunden zu gewinnen.
          Danke für dein Vertrauen!
        </p>
        <p style="margin:16px 0 0 0;color:#f2ede4;font-size:15px;font-weight:600;">
          Dein LoyaltyCard-Team
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#1c1a13;padding:18px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b6558;">
          LoyaltyCard &middot; Digitale Stempelkarten für lokale Shops
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

    const text = [
      `Herzlich willkommen, ${args.ownerName}!`,
      ``,
      `Schön, dass du dabei bist! Dein Shop "${args.shopName}" ist bei uns registriert`,
      `und wir kümmern uns ab sofort darum, dass deine digitale Stempelkarte`,
      `schnell und reibungslos an den Start geht.`,
      ``,
      `Dein Paket: ${planLabel}`,
      ``,
      `In deinem Paket enthalten:`,
      ...extras.map(e => `- ${e}`),
      ``,
      `Bitte halte diese Angaben bereit:`,
      `- Impressum (Firmenname, Inhaber, Anschrift, Kontakt)`,
      `- AGB deines Shops (falls vorhanden)`,
      `- Datenschutzerklärung bzw. Datenschutz-Kontakt`,
      ``,
      `Bei Fragen erreichst du uns jederzeit per WhatsApp oder Anruf: ${WHATSAPP_NR}`,
      ``,
      `Wir freuen uns darauf, gemeinsam mit dir mehr Stammkunden zu gewinnen!`,
      ``,
      `Dein LoyaltyCard-Team`,
      `LoyaltyCard · Digitale Stempelkarten für lokale Shops`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [args.ownerEmail],
        subject: `Willkommen bei LoyaltyCard! ${args.shopName} ist registriert`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error(`Resend-Fehler ${res.status}: ${await res.text()}`);
    }
  },
});

// ── Zahlungsbestätigung ───────────────────────────────────────────────────────
// Geht nach jedem Zahlungseingang raus (Stripe-Webhook / Test-Zahlung) und
// zeigt die echte Abrechnung. Mit Rabattcode: Normalpreise durchgestrichen
// (Einrichtung 99 € → 45 € Aktionspreis) + Hinweis, dass das Angebot nur für
// die erste Rechnung gilt.
// Bei Zahlung #1 ist das gleichzeitig die Willkommens-Mail (Begrüßung,
// Design-Hinweis, rechtliche Unterlagen): Der Inhaber bekommt genau EINE Mail,
// und zwar erst nach Zahlungsabschluss. Beim Anlegen (auch "Später zahlen")
// geht bewusst nichts raus.

export const sendPaymentConfirmationEmail = internalAction({
  args: {
    ownerEmail:        v.string(),
    ownerName:         v.string(),
    shopName:          v.string(),
    planType:          v.union(v.literal("annual"), v.literal("monthly")),
    rewardCount:       v.number(),
    paymentNumber:     v.number(),
    aboList:           v.number(),
    aboPaid:           v.number(),
    rewardsList:       v.number(),
    rewardsPaid:       v.number(),
    setupList:         v.number(),
    setupPaid:         v.number(),
    totalPaid:         v.number(),
    discountCode:      v.optional(v.string()),
    firstYearDiscount: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    if (!RESEND_KEY) return;

    const eur = (n: number) => `€${n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    const periodTxt   = args.planType === "annual" ? "Jahr" : "Monat";
    const planLabel   = args.planType === "annual" ? "Jahresabo" : "Monatsabo";
    const hasDiscount = !!args.discountCode;
    const renewal     = recurringPrice(args.planType, args.rewardCount);
    const isFirst     = args.paymentNumber === 1;

    // Eine Rechnungszeile: bei Rabatt Normalpreis durchgestrichen + Aktionspreis in Gold.
    // Wichtig für Handy-Clients: Betrags-Zelle komplett ohne umbrechbare Leerzeichen,
    // sonst bricht der Betrag bei schmalen Displays mitten auseinander.
    const row = (label: string, list: number, paid: number) => `
              <tr>
                <td style="padding:7px 12px 7px 0;color:#cfc9bd;font-size:14px;">${label}</td>
                <td style="padding:7px 0;text-align:right;white-space:nowrap;">${hasDiscount && paid < list
                    ? `<span style="color:#6b6558;text-decoration:line-through;font-size:13px;">${eur(list)}</span>&nbsp;<span style="color:#e8c96a;font-weight:700;font-size:14px;">${eur(paid)}</span>`
                    : `<span style="color:#f2ede4;font-weight:600;font-size:14px;">${eur(paid)}</span>`}</td>
              </tr>`;

    const rows = [
      row(`LoyaltyCard ${planLabel}`, args.aboList, args.aboPaid),
      ...(args.rewardCount > 0
        ? [row(`Bonusprogramm (${args.rewardCount} Belohnung${args.rewardCount === 1 ? "" : "en"})`, args.rewardsList, args.rewardsPaid)]
        : []),
      ...(args.setupList > 0
        ? [row("Einrichtung & individuelles Design (einmalig)", args.setupList, args.setupPaid)]
        : []),
    ].join("");

    const discountBox = hasDiscount ? `
        <tr><td style="padding:0 32px 24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#201a0d;border-radius:10px;border-left:4px solid #c9a227;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#e8c96a;">
                Dein Angebot: ${escapeHtml(args.discountCode ?? "")}
              </p>
              <p style="margin:0;color:#cfc9bd;font-size:13px;line-height:1.6;">
                Der Aktionspreis gilt nur für deine erste Rechnung${args.planType === "annual" ? " (dein erstes Jahr)" : ""}.
                Danach läuft dein Abo zum Normalpreis von <strong style="color:#f2ede4;">${eur(renewal)} pro ${periodTxt}</strong> weiter.
                Die Einrichtung fällt natürlich nur einmalig an.
              </p>
            </td></tr>
          </table>
        </td></tr>` : "";

    const included = [
      "Digitale Stempelkarte für deine Kunden, ohne App-Download",
      "Individuelles Design: dein Logo, deine Farben, dein Look",
      "QR-Code-Vorlagen für Theke und Aushang",
      "Betriebs-Dashboard mit Scanner und Kunden-Statistiken",
      ...(args.rewardCount > 0 ? [`Bonusprogramm mit ${args.rewardCount} Belohnungsstufe${args.rewardCount === 1 ? "" : "n"}`] : []),
      "Persönlicher Support per WhatsApp und Telefon",
      "Alle Updates und neuen Funktionen inklusive",
    ];

    // Willkommens-Teile: nur bei der ersten Zahlung (kombinierte Mail)
    const designSection = isFirst ? `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.7;">
          Zu deinem Paket gehört ein <strong>individuelles Design</strong> deiner
          Stempelkarte. Wir melden uns <strong>innerhalb der nächsten 24 Stunden</strong>
          persönlich bei dir, damit deine Karte genauso aussieht, wie du es dir vorstellst.
        </p>
      </td>
    </tr>` : "";

    const legalSection = isFirst ? `
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">
              Bitte halte diese Angaben bereit
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Impressum (Firmenname, Inhaber, Anschrift, Kontakt)
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Umsatzsteuer-ID bzw. Steuernummer
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Handelsregisternummer &amp; Registergericht (falls eingetragen)
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; AGB deines Shops (falls vorhanden)
            </p>
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">&bull;</span>&nbsp; Datenschutzerkl&auml;rung bzw. Datenschutz-Kontakt
            </p>
            <p style="margin:12px 0 0 0;color:#8a8577;font-size:13px;line-height:1.6;">
              Diese Angaben brauchen wir für das Impressum, damit deine Stempelkarte
              rechtlich sauber online gehen kann. Kein Stress, wir gehen alles
              gemeinsam mit dir durch.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>` : "";

    const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0c0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0"
    style="background:#17150f;border-radius:20px;overflow:hidden;max-width:540px;width:100%;">

    <!-- Header -->
    <tr>
      <td style="background:#0d0c0a;padding:28px 32px;text-align:center;">
        <p style="margin:0;color:#c9a227;font-size:24px;font-weight:900;letter-spacing:6px;">LOYALTYCARD</p>
        <p style="margin:6px 0 0 0;color:rgba(242,237,228,0.45);font-size:12px;letter-spacing:2px;">${isFirst ? "WILLKOMMEN &amp; ZAHLUNGSBEST&Auml;TIGUNG" : "ZAHLUNGSBEST&Auml;TIGUNG"}</p>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:36px 32px 20px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#f2ede4;font-weight:800;">
          ${isFirst ? `Herzlich willkommen, ${escapeHtml(args.ownerName)}!` : `Zahlung erhalten, danke ${escapeHtml(args.ownerName)}!`}
        </h1>
        <p style="margin:0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          ${isFirst
            ? `Schön, dass du dabei bist! Deine Zahlung für <strong style="color:#f2ede4;">${escapeHtml(args.shopName)}</strong> ist eingegangen
               und wir kümmern uns ab sofort darum, dass deine digitale Stempelkarte schnell und reibungslos an den Start geht.
               Hier deine Übersicht:`
            : `Deine Zahlung für <strong style="color:#f2ede4;">${escapeHtml(args.shopName)}</strong> ist eingegangen.
          Hier deine Übersicht:`}
        </p>
      </td>
    </tr>

    <!-- Abrechnung -->
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows}
              <tr><td colspan="2" style="border-top:1px solid #2a2620;padding:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:10px 12px 2px 0;color:#f2ede4;font-size:15px;font-weight:700;">Gezahlt</td>
                <td style="padding:10px 0 2px 0;text-align:right;color:#e8c96a;font-size:18px;font-weight:800;white-space:nowrap;">${eur(args.totalPaid)}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>

    ${discountBox}

    <!-- Das ist alles enthalten -->
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1a13;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f2ede4;text-transform:uppercase;letter-spacing:1px;">
              Das alles ist für dich enthalten
            </p>
            ${included.map(e => `
            <p style="margin:6px 0;color:#cfc9bd;font-size:14px;">
              <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; ${e}
            </p>`).join("")}
          </td></tr>
        </table>
      </td>
    </tr>

    ${designSection}
    ${legalSection}

    <!-- Contact -->
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

    <!-- Closing -->
    <tr>
      <td style="padding:0 32px 32px 32px;border-top:1px solid #2a2620;">
        ${isFirst ? `<p style="margin:24px 0 0 0;color:#cfc9bd;font-size:15px;line-height:1.75;">
          Wir freuen uns darauf, gemeinsam mit dir mehr Stammkunden zu gewinnen.
          Danke für dein Vertrauen!
        </p>` : ""}
        <p style="margin:16px 0 0 0;color:#f2ede4;font-size:15px;font-weight:600;">
          Dein LoyaltyCard-Team
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#1c1a13;padding:18px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b6558;">
          LoyaltyCard &middot; Digitale Stempelkarten für lokale Shops
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

    const textLine = (label: string, list: number, paid: number) =>
      hasDiscount && paid < list ? `- ${label}: ${eur(paid)} (statt ${eur(list)})` : `- ${label}: ${eur(paid)}`;

    const text = [
      isFirst ? `Herzlich willkommen, ${args.ownerName}!` : `Zahlung erhalten, danke ${args.ownerName}!`,
      ``,
      isFirst
        ? `Schön, dass du dabei bist! Deine Zahlung für "${args.shopName}" ist eingegangen und wir kümmern uns ab sofort darum, dass deine digitale Stempelkarte schnell und reibungslos an den Start geht. Deine Übersicht:`
        : `Deine Zahlung für "${args.shopName}" ist eingegangen. Deine Übersicht:`,
      ``,
      textLine(`LoyaltyCard ${planLabel}`, args.aboList, args.aboPaid),
      ...(args.rewardCount > 0 ? [textLine(`Bonusprogramm (${args.rewardCount})`, args.rewardsList, args.rewardsPaid)] : []),
      ...(args.setupList > 0 ? [textLine("Einrichtung & individuelles Design (einmalig)", args.setupList, args.setupPaid)] : []),
      `Gezahlt: ${eur(args.totalPaid)}`,
      ``,
      ...(hasDiscount ? [
        `Dein Angebot ${args.discountCode}: Der Aktionspreis gilt nur für die erste Rechnung.`,
        `Danach läuft dein Abo zum Normalpreis von ${eur(renewal)} pro ${periodTxt} weiter.`,
        ``,
      ] : []),
      `Das alles ist enthalten:`,
      ...included.map(e => `- ${e}`),
      ``,
      ...(isFirst ? [
        `Zu deinem Paket gehört ein individuelles Design deiner Stempelkarte.`,
        `Wir melden uns innerhalb der nächsten 24 Stunden persönlich bei dir.`,
        ``,
        `Bitte halte diese Angaben bereit (für das Impressum):`,
        `- Impressum (Firmenname, Inhaber, Anschrift, Kontakt)`,
        `- Umsatzsteuer-ID bzw. Steuernummer`,
        `- Handelsregisternummer & Registergericht (falls eingetragen)`,
        `- AGB deines Shops (falls vorhanden)`,
        `- Datenschutzerklärung bzw. Datenschutz-Kontakt`,
        ``,
      ] : []),
      `Fragen? WhatsApp oder Anruf: ${WHATSAPP_NR}`,
      ``,
      `Dein LoyaltyCard-Team`,
      `LoyaltyCard · Digitale Stempelkarten für lokale Shops`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [args.ownerEmail],
        subject: isFirst
          ? `Willkommen bei LoyaltyCard! Zahlung erhalten für ${args.shopName} (${eur(args.totalPaid)})`
          : `Zahlung erhalten: ${args.shopName} (${eur(args.totalPaid)})`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error(`Resend-Fehler ${res.status}: ${await res.text()}`);
    }
  },
});
