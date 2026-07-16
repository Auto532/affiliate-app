import { mutation, query, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function requireAdmin(secret: string) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) throw new Error("ADMIN_SECRET nicht gesetzt");
  if (secret !== expected) throw new Error("Kein Zugriff");
}

// Support-Anfrage vom Partner (auth via Session-Token). Wird gespeichert +
// per Telegram an den Admin geschickt (derselbe Bot wie bei Shop-Leads;
// SUPPORT_TELEGRAM_* kann später als Override gesetzt werden).

export const submitTicket = mutation({
  args: {
    token:   v.string(),
    message: v.string(),
    contact: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) throw new Error("Nicht eingeloggt");
    const affiliate = await ctx.db.get(session.affiliateId);
    if (!affiliate) throw new Error("Account nicht gefunden");

    const message = args.message.trim();
    if (!message) throw new Error("Bitte beschreibe dein Anliegen");
    if (message.length > 2000) throw new Error("Nachricht zu lang (max. 2000 Zeichen)");

    await ctx.db.insert("supportTickets", {
      affiliateId: affiliate._id, message,
      contact: args.contact?.trim() || undefined,
      status: "open", createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.support.notifySupportTelegram, {
      from:    `Partner: ${affiliate.name} (${affiliate.email}${affiliate.phone ? ` · ${affiliate.phone}` : ""})`,
      message,
      contact: args.contact?.trim() || undefined,
    });
  },
});

// Eigene Anfragen des Partners (inkl. Status + Admin-Antwort)
export const listMyTickets = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_affiliate", q => q.eq("affiliateId", session.affiliateId))
      .collect();
    return tickets
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(t => ({ _id: t._id, message: t.message, status: t.status, reply: t.reply ?? null, repliedAt: t.repliedAt ?? null, createdAt: t.createdAt }));
  },
});

// ── Admin: Tickets verwalten ──────────────────────────────────────────────────

export const adminListTickets = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    requireAdmin(adminSecret);
    const tickets = await ctx.db.query("supportTickets").order("desc").collect();
    return Promise.all(tickets.map(async t => {
      const a = await ctx.db.get(t.affiliateId);
      return { ...t, partnerName: a?.name ?? "(gelöschter Partner)", partnerEmail: a?.email ?? null };
    }));
  },
});

export const adminAnswerTicket = mutation({
  args: {
    adminSecret: v.string(),
    ticketId:    v.id("supportTickets"),
    reply:       v.optional(v.string()),
    status:      v.union(v.literal("open"), v.literal("done")),
  },
  handler: async (ctx, { adminSecret, ticketId, reply, status }) => {
    requireAdmin(adminSecret);
    const patch: Record<string, unknown> = { status };
    const trimmed = reply?.trim();
    if (trimmed) { patch.reply = trimmed; patch.repliedAt = Date.now(); }
    await ctx.db.patch(ticketId, patch);
  },
});

export const notifySupportTelegram = internalAction({
  args: { from: v.string(), message: v.string(), contact: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const token  = process.env.SUPPORT_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
    const chatId = process.env.SUPPORT_TELEGRAM_CHAT_ID  ?? process.env.TELEGRAM_CHAT_ID  ?? "";
    if (!token || !chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, parse_mode: "HTML",
        text: `🆘 <b>Support-Anfrage</b>\n\n👤 <b>Von:</b> ${args.from}` +
          (args.contact ? `\n📞 <b>Kontakt:</b> ${args.contact}` : "") +
          `\n\n💬 ${args.message}`,
      }),
    }).catch(() => {});
  },
});
