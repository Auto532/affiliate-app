import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireValidEmail, requireFilled } from "./validation";

async function requireAffiliate(ctx: any, token: string) {
  const session = await ctx.db
    .query("affiliateSessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) throw new Error("Nicht eingeloggt");
  const affiliate = await ctx.db.get(session.affiliateId);
  if (!affiliate || affiliate.status !== "active") throw new Error("Kein Zugriff");
  return affiliate;
}

// ── Shop einreichen (Direktformular) ─────────────────────────────────────────

export const submitLead = mutation({
  args: {
    token:            v.string(),
    shopName:         v.string(),
    ownerName:        v.string(),
    ownerEmail:       v.string(),
    ownerPhone:       v.optional(v.string()),
    businessType:     v.optional(v.string()),
    city:             v.optional(v.string()),
    planType:         v.union(v.literal("annual"), v.literal("monthly")),
    rewardCount:      v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const affiliate = await requireAffiliate(ctx, args.token);

    const shopName   = requireFilled(args.shopName, "Shop-Name");
    const ownerName  = requireFilled(args.ownerName, "Inhaber-Name");
    const ownerEmail = requireValidEmail(args.ownerEmail, "Inhaber E-Mail");

    const existing = await ctx.db
      .query("shopLeads")
      .withIndex("by_ownerEmail", q => q.eq("ownerEmail", ownerEmail))
      .unique();
    if (existing) throw new Error("Ein Shop mit dieser E-Mail wurde bereits eingereicht");

    const now         = Date.now();
    const rewardCount = Math.max(0, Math.min(20, Math.round(args.rewardCount ?? 0)));

    const leadId = await ctx.db.insert("shopLeads", {
      affiliateId:      affiliate._id,
      shopName,
      ownerName,
      ownerEmail,
      ownerPhone:       args.ownerPhone,
      businessType:     args.businessType,
      city:             args.city,
      source:           "direct_form",
      status:           "pending_payment",
      rewardCount,
    });

    await ctx.db.insert("shopContracts", {
      shopLeadId:    leadId,
      affiliateId:   affiliate._id,
      planType:      args.planType,
      contractStart: now,
      status:        "active",
      paymentCount:  0,
      paymentToken:  crypto.randomUUID(),
      rewardCount,
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   leadId,
      action:     "submitted_and_activated",
      actorType:  "affiliate",
      actorId:    affiliate._id,
      note:       `${affiliate.name} · Plan: ${args.planType}`,
    });

    await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
      ownerEmail,
      ownerName,
      shopName,
      planType:    args.planType,
      rewardCount,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.notifyNewShopLead, {
      shopName,
      ownerName,
      ownerEmail,
      ownerPhone:    args.ownerPhone,
      city:          args.city,
      businessType:  args.businessType,
      planType:      args.planType,
      rewardCount,
      affiliateName: affiliate.name,
      affiliateCode: affiliate.referralCode,
      viaInvite:     false,
    });

    return leadId;
  },
});

// ── Einladungslink generieren ─────────────────────────────────────────────────

export const generateInviteLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const affiliate = await requireAffiliate(ctx, args.token);

    const inviteToken = crypto.randomUUID();
    const expiresAt   = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 Tage

    const leadId = await ctx.db.insert("shopLeads", {
      affiliateId:  affiliate._id,
      shopName:     "",
      ownerName:    "",
      ownerEmail:   "",
      source:       "invite_link",
      status:       "draft",
      inviteToken,
      inviteExpiresAt: expiresAt,
    });

    return { inviteToken, leadId, expiresAt };
  },
});

// ── Shop-Inhaber füllt Einladungslink aus ─────────────────────────────────────

export const acceptInvite = mutation({
  args: {
    inviteToken:  v.string(),
    shopName:     v.string(),
    ownerName:    v.string(),
    ownerEmail:   v.string(),
    ownerPhone:   v.optional(v.string()),
    businessType: v.optional(v.string()),
    city:         v.optional(v.string()),
    planType:     v.optional(v.union(v.literal("annual"), v.literal("monthly"))),
    rewardCount:  v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("shopLeads")
      .withIndex("by_inviteToken", q => q.eq("inviteToken", args.inviteToken))
      .unique();

    if (!lead)                                    throw new Error("Ungültiger Einladungslink");
    if (lead.status !== "draft")                  throw new Error("Dieser Link wurde bereits genutzt");
    if (lead.inviteExpiresAt && lead.inviteExpiresAt < Date.now())
                                                  throw new Error("Der Einladungslink ist abgelaufen");

    const shopName   = requireFilled(args.shopName, "Name des Geschäfts");
    const ownerName  = requireFilled(args.ownerName, "Name");
    const ownerEmail = requireValidEmail(args.ownerEmail);

    const existing = await ctx.db
      .query("shopLeads")
      .withIndex("by_ownerEmail", q => q.eq("ownerEmail", ownerEmail))
      .unique();
    if (existing && existing._id !== lead._id) throw new Error("Diese E-Mail ist bereits registriert");

    const now         = Date.now();
    const planType    = args.planType ?? "annual";
    const rewardCount = Math.max(0, Math.min(20, Math.round(args.rewardCount ?? 0)));

    await ctx.db.patch(lead._id, {
      shopName,
      ownerName,
      ownerEmail,
      ownerPhone:       args.ownerPhone,
      businessType:     args.businessType,
      city:             args.city,
      status:           "pending_payment",
      inviteAcceptedAt: now,
      rewardCount,
    });

    await ctx.db.insert("shopContracts", {
      shopLeadId:    lead._id,
      affiliateId:   lead.affiliateId,
      planType,
      contractStart: now,
      status:        "active",
      paymentCount:  0,
      paymentToken:  crypto.randomUUID(),
      rewardCount,
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   lead._id,
      action:     "invite_accepted_and_activated",
      actorType:  "affiliate",
      note:       `${args.ownerName} · Plan: ${planType}`,
    });

    const inviteAffiliate = await ctx.db.get(lead.affiliateId);
    await ctx.scheduler.runAfter(0, internal.notifications.notifyNewShopLead, {
      shopName,
      ownerName,
      ownerEmail,
      ownerPhone:    args.ownerPhone,
      city:          args.city,
      businessType:  args.businessType,
      planType,
      rewardCount,
      affiliateName: inviteAffiliate?.name ?? "—",
      affiliateCode: inviteAffiliate?.referralCode,
      viaInvite:     true,
    });

    return lead._id;
  },
});

// ── Ausstehenden Shop löschen (nur pending_payment) ──────────────────────────

export const deletePendingLead = mutation({
  args: { token: v.string(), leadId: v.id("shopLeads") },
  handler: async (ctx, args) => {
    const affiliate = await requireAffiliate(ctx, args.token);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Shop nicht gefunden");
    if (lead.affiliateId !== affiliate._id) throw new Error("Kein Zugriff");
    if (lead.status !== "pending_payment") throw new Error("Nur ausstehende Shops können gelöscht werden");

    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", args.leadId))
      .unique();
    if (contract) await ctx.db.delete(contract._id);
    await ctx.db.delete(args.leadId);
  },
});

// ── Meine Shops abrufen ───────────────────────────────────────────────────────

export const myLeads = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    const leads = await ctx.db
      .query("shopLeads")
      .withIndex("by_affiliate", q => q.eq("affiliateId", session.affiliateId))
      .order("desc")
      .collect();

    const result = await Promise.all(leads.map(async lead => {
      const contract = (lead.status === "active" || lead.status === "pending_payment")
        ? await ctx.db
            .query("shopContracts")
            .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
            .unique()
        : null;
      return { ...lead, contract };
    }));

    return result;
  },
});

// ── Meine Provisionen abrufen ─────────────────────────────────────────────────

export const myCommissions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_affiliate", q => q.eq("affiliateId", session.affiliateId))
      .order("desc")
      .collect();

    const result = await Promise.all(commissions.map(async c => {
      const contract = await ctx.db.get(c.shopContractId);
      const lead     = contract ? await ctx.db.get(contract.shopLeadId) : null;
      return { ...c, shopName: lead?.shopName ?? "—" };
    }));

    return result;
  },
});
