// Admin-Benachrichtigungen via Telegram.
// Wird aus Mutationen per ctx.scheduler.runAfter(0, ...) angestoßen
// (Mutationen dürfen selbst kein fetch machen).

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
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

// Shop-Inhaber hat auf der Zahlungsseite "Später zahlen" gewählt.
export const notifyPayLater = internalAction({
  args: {
    shopName:  v.string(),
    ownerName: v.string(),
    amount:    v.number(),
    planType:  v.union(v.literal("annual"), v.literal("monthly")),
  },
  handler: async (_ctx, args): Promise<void> => {
    await sendTelegram(
      `⏳ <b>Später zahlen gewählt</b>\n\n` +
      `<b>Shop:</b> ${escapeHtml(args.shopName)}\n` +
      `<b>Inhaber:</b> ${escapeHtml(args.ownerName)}\n` +
      `<b>Betrag:</b> €${args.amount} (${args.planType === "annual" ? "Jahresabo" : "Monatsabo"})\n\n` +
      `Der Bezahllink bleibt gültig. Liste: Admin → Analytics → Finanzen.`
    );
  },
});

// Zahlung eingegangen. Feuert bei Direktvertriebs-Zahlungen und Verlängerungen;
// die erste Partner-Zahlung meldet stattdessen provisionShop ("Shop ist live").
// Beim bloßen Anlegen/Einreichen eines Shops geht bewusst KEIN Telegram raus.
export const notifyPaymentReceived = internalAction({
  args: {
    shopName:       v.string(),
    ownerName:      v.string(),
    amount:         v.number(),
    paymentNumber:  v.number(),
    planType:       v.union(v.literal("annual"), v.literal("monthly")),
    isDirect:       v.boolean(),
    commissionAmount: v.number(),
    commissionRate:   v.number(),
    wasPayLater:    v.boolean(),
  },
  handler: async (_ctx, args): Promise<void> => {
    const planLabel = args.planType === "annual" ? "Jahresabo" : "Monatsabo";
    const kind      = args.paymentNumber === 1 ? "Erste Zahlung" : `Verlängerung (Zahlung #${args.paymentNumber})`;
    const provLine  = args.isDirect
      ? `🏢 Direktvertrieb, keine Provision`
      : `🤝 Provision: €${args.commissionAmount} (${Math.round(args.commissionRate * 100)}%)`;

    await sendTelegram(
      `💰 <b>Zahlung eingegangen</b>\n\n` +
      `🏪 <b>Shop:</b> ${escapeHtml(args.shopName)}\n` +
      `👤 <b>Inhaber:</b> ${escapeHtml(args.ownerName)}\n` +
      `💳 <b>Betrag:</b> €${args.amount} (${planLabel}, ${kind})\n` +
      provLine +
      (args.wasPayLater ? `\n\n⏳→✔️ Der Shop hatte "Später zahlen" gewählt, jetzt erledigt.` : "")
    );
  },
});
