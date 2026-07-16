// Admin-Benachrichtigungen via Telegram.
// Wird aus Mutationen per ctx.scheduler.runAfter(0, ...) angestoßen
// (Mutationen dürfen selbst kein fetch machen).

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { planPrice } from "./pricing";
import { escapeHtml } from "./htmlEscape";

const TG_TOKEN   = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID   ?? "";

async function sendTelegram(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

export const notifyNewShopLead = internalAction({
  args: {
    shopName:      v.string(),
    ownerName:     v.string(),
    ownerEmail:    v.optional(v.string()),
    ownerPhone:    v.optional(v.string()),
    city:          v.optional(v.string()),
    businessType:  v.optional(v.string()),
    planType:      v.union(v.literal("annual"), v.literal("monthly")),
    affiliateName: v.string(),
    affiliateCode: v.optional(v.string()),
    viaInvite:     v.boolean(),
    direct:        v.optional(v.boolean()),   // Admin hat den Shop direkt angelegt
  },
  handler: async (_ctx, args): Promise<void> => {
    const planLabel = args.planType === "annual"
      ? `Jahresabo (€${planPrice("annual")})`
      : `Monatsabo (€${planPrice("monthly")})`;

    const line = (emoji: string, label: string, val?: string) =>
      val ? `\n${emoji} <b>${label}:</b> ${escapeHtml(val)}` : "";

    const partnerBlock = args.direct
      ? `🏢 <b>Weg:</b> Admin direkt (ohne Partner, keine Provision)`
      : `🤝 <b>Partner:</b> ${escapeHtml(args.affiliateName)}` +
        (args.affiliateCode ? ` (${escapeHtml(args.affiliateCode)})` : "") +
        `\n📥 <b>Weg:</b> ${args.viaInvite ? "Einladungslink" : "Partner-Formular"}`;

    await sendTelegram(
      `🆕 <b>${args.direct ? "Neuer Shop (Admin direkt)" : "Neuer Shop-Lead"}</b>\n\n` +
      `🏪 <b>Shop:</b> ${escapeHtml(args.shopName)}\n` +
      `👤 <b>Inhaber:</b> ${escapeHtml(args.ownerName)}` +
      line("✉️", "E-Mail", args.ownerEmail) +
      line("📞", "Telefon", args.ownerPhone) +
      line("📍", "Stadt", args.city) +
      line("🏷", "Branche", args.businessType) +
      `\n💳 <b>Modell:</b> ${planLabel}\n\n` +
      partnerBlock +
      `\n\n⏳ Wartet auf Zahlung.`
    );
  },
});
