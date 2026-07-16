import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_PRICES } from "./pricing";
import { escapeHtml } from "./htmlEscape";

const RESEND_KEY  = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL ?? "Loatycard <onboarding@resend.dev>";
const WHATSAPP_NR = process.env.SUPPORT_WHATSAPP ?? "+491634848207";

export const sendWelcomeEmail = internalAction({
  args: {
    ownerEmail:       v.string(),
    ownerName:        v.string(),
    shopName:         v.string(),
    planType:         v.union(v.literal("annual"), v.literal("monthly")),
    wantsDesign:      v.optional(v.boolean()),
    wantsBonusStamps: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    if (!RESEND_KEY) return;

    const planLabel = args.planType === "annual"
      ? `Jahresabo (€${PLAN_PRICES.annual} / Jahr)`
      : `Monatsabo (€${PLAN_PRICES.monthly} / Monat)`;

    const extras = [
      args.wantsDesign      && "Custom Design",
      args.wantsBonusStamps && "Bonus-Stempel (mehr als 10)",
    ].filter(Boolean) as string[];

    const extrasSection = extras.length
      ? `
        <tr><td style="padding:0 32px 24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#fffbef;border-radius:10px;border-left:4px solid #c9a227;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#0d0c0a;text-transform:uppercase;letter-spacing:1px;">
                Deine gewählten Extras
              </p>
              ${extras.map(e => `
              <p style="margin:6px 0;color:#444;font-size:14px;">
                <span style="color:#c9a227;font-weight:700;">✓</span>&nbsp; ${e}
              </p>`).join("")}
            </td></tr>
          </table>
        </td></tr>`
      : "";

    const designSection = args.wantsDesign
      ? `
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0;color:#444;font-size:15px;line-height:1.7;">
            Weil du ein <strong>Custom Design</strong> gewünscht hast, melden wir uns
            <strong>innerhalb der nächsten 24 Stunden</strong> persönlich bei dir –
            damit deine Stempelkarte genauso aussieht, wie du es dir vorstellst.
          </p>
        </td></tr>`
      : "";

    const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0"
    style="background:#ffffff;border-radius:20px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="background:#0d0c0a;padding:28px 32px;text-align:center;">
        <p style="margin:0;color:#c9a227;font-size:24px;font-weight:900;letter-spacing:6px;">LOATYCARD</p>
        <p style="margin:6px 0 0 0;color:rgba(242,237,228,0.45);font-size:12px;letter-spacing:2px;">DIGITALE KUNDENKARTE</p>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:36px 32px 20px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#0d0c0a;font-weight:800;">
          Herzlich willkommen, ${escapeHtml(args.ownerName)}!
        </h1>
        <p style="margin:0;color:#555;font-size:15px;line-height:1.75;">
          Schön, dass du dabei bist! Dein Shop <strong style="color:#0d0c0a;">${escapeHtml(args.shopName)}</strong>
          ist bei uns registriert und wir kümmern uns ab sofort darum, dass deine
          digitale Stempelkarte schnell und reibungslos an den Start geht.
        </p>
      </td>
    </tr>

    <!-- Plan Info -->
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f9f7f3;border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Dein Paket</p>
              <p style="margin:0;font-size:16px;font-weight:700;color:#0d0c0a;">${planLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${extrasSection}
    ${designSection}

    <!-- What happens next -->
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <p style="margin:0 0 14px 0;font-size:15px;color:#555;line-height:1.75;">
          In der Zwischenzeit stehen wir dir bei allen Fragen zur Seite –
          einfach per WhatsApp oder Anruf direkt bei uns melden:
        </p>
        <a href="https://wa.me/${WHATSAPP_NR.replace(/\D/g, "")}"
          style="display:inline-block;background:#25d366;color:#ffffff;padding:14px 28px;border-radius:12px;
                 text-decoration:none;font-weight:700;font-size:15px;">
          WhatsApp schreiben &rarr;
        </a>
        <p style="margin:12px 0 0 0;font-size:14px;color:#888;">
          Oder ruf uns einfach an: <strong style="color:#444;">${WHATSAPP_NR}</strong>
        </p>
      </td>
    </tr>

    <!-- Closing -->
    <tr>
      <td style="padding:0 32px 32px 32px;border-top:1px solid #f0ede8;">
        <p style="margin:24px 0 0 0;color:#555;font-size:15px;line-height:1.75;">
          Wir freuen uns darauf, gemeinsam mit dir mehr Stammkunden zu gewinnen –
          danke für dein Vertrauen!
        </p>
        <p style="margin:16px 0 0 0;color:#0d0c0a;font-size:15px;font-weight:600;">
          Dein Loatycard-Team
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f9f7f3;padding:18px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#bbb;">
          Loatycard &middot; Digitale Stempelkarten für lokale Shops
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [args.ownerEmail],
        subject: `Willkommen bei Loatycard – ${args.shopName} ist registriert`,
        html,
      }),
    });
  },
});
