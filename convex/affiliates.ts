import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Registrierung ─────────────────────────────────────────────────────────────

export const register = mutation({
  args: {
    name:         v.string(),
    email:        v.string(),
    passwordHash: v.string(),
    businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    if (existing) throw new Error("E-Mail bereits registriert");

    // Referral-Code generieren: 2 Buchstaben aus Name + 4 Ziffern
    const initials = args.name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "AF";
    let code: string;
    let tries = 0;
    do {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `${initials}-${num}`;
      tries++;
      if (tries > 20) throw new Error("Code-Generierung fehlgeschlagen");
    } while (
      await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", code)).unique()
    );

    const affiliateId = await ctx.db.insert("affiliates", {
      name:         args.name,
      email:        args.email,
      passwordHash: args.passwordHash,
      referralCode: code,
      status:       "pending",
      businessType: args.businessType,
    });

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   affiliateId,
      action:     "registered",
      actorType:  "affiliate",
      actorId:    affiliateId,
    });

    return { affiliateId, referralCode: code };
  },
});

// ── Login ─────────────────────────────────────────────────────────────────────

export const login = mutation({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const affiliate = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();

    if (!affiliate || affiliate.passwordHash !== args.passwordHash)
      throw new Error("Ungültige Zugangsdaten");
    if (affiliate.status === "pending")
      throw new Error("Dein Account wartet noch auf Freigabe");
    if (affiliate.status === "suspended")
      throw new Error("Dein Account wurde gesperrt");

    const token = crypto.randomUUID();
    const now   = Date.now();
    await ctx.db.insert("affiliateSessions", {
      affiliateId: affiliate._id,
      token,
      createdAt:   now,
      expiresAt:   now + 30 * 24 * 60 * 60 * 1000, // 30 Tage
    });

    return { token, affiliate };
  },
});

// ── Session validieren ────────────────────────────────────────────────────────

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    return ctx.db.get(session.affiliateId);
  },
});

// ── Bankdaten speichern ───────────────────────────────────────────────────────

export const updateBankDetails = mutation({
  args: {
    token:    v.string(),
    bankIban: v.string(),
    bankName: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) throw new Error("Nicht eingeloggt");

    await ctx.db.patch(session.affiliateId, {
      bankIban: args.bankIban,
      bankName: args.bankName,
    });
  },
});

// ── Einladungslink annehmen (Partner-Registrierung via Link) ──────────────────

export const acceptAffiliateInvite = mutation({
  args: {
    inviteToken:  v.string(),
    name:         v.string(),
    email:        v.string(),
    passwordHash: v.string(),
    phone:        v.optional(v.string()),
    company:      v.optional(v.string()),
    dateOfBirth:  v.optional(v.string()),
    taxId:        v.optional(v.string()),
    vatId:        v.optional(v.string()),
    address:      v.optional(v.string()),
    zip:          v.optional(v.string()),
    city:         v.optional(v.string()),
    country:      v.optional(v.string()),
    bankIban:     v.optional(v.string()),
    bankBic:      v.optional(v.string()),
    bankName:     v.optional(v.string()),
    businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("affiliateInvites")
      .withIndex("by_token", q => q.eq("token", args.inviteToken))
      .unique();

    if (!invite)                       throw new Error("Ungültiger Einladungslink");
    if (invite.usedAt)                 throw new Error("Dieser Link wurde bereits verwendet");
    if (invite.expiresAt < Date.now()) throw new Error("Einladungslink ist abgelaufen");

    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    if (existing) throw new Error("E-Mail bereits registriert");

    const initials = args.name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "AF";
    let code = "";
    for (let i = 0; i < 20; i++) {
      const candidate = `${initials}-${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", candidate)).unique();
      if (!taken) { code = candidate; break; }
    }
    if (!code) throw new Error("Code-Generierung fehlgeschlagen");

    const affiliateId = await ctx.db.insert("affiliates", {
      name:         args.name,
      email:        args.email,
      passwordHash: args.passwordHash,
      referralCode: code,
      status:       "pending",
      phone:        args.phone,
      company:      args.company,
      dateOfBirth:  args.dateOfBirth,
      taxId:        args.taxId,
      vatId:        args.vatId,
      address:      args.address,
      zip:          args.zip,
      city:         args.city,
      country:      args.country ?? "Deutschland",
      bankIban:     args.bankIban,
      bankBic:      args.bankBic,
      bankName:     args.bankName,
      businessType: args.businessType,
    });

    await ctx.db.patch(invite._id, { usedAt: Date.now(), affiliateId });

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   affiliateId,
      action:     "registered_via_invite",
      actorType:  "affiliate",
      actorId:    affiliateId,
    });

    return { affiliateId, referralCode: code };
  },
});

// ── Dashboard-Daten ───────────────────────────────────────────────────────────

export const getDashboard = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    const affiliateId = session.affiliateId;

    const leads = await ctx.db
      .query("shopLeads")
      .withIndex("by_affiliate", q => q.eq("affiliateId", affiliateId))
      .collect();

    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_affiliate", q => q.eq("affiliateId", affiliateId))
      .collect();

    const totalPending   = commissions.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const totalConfirmed = commissions.filter(c => c.status === "confirmed").reduce((s, c) => s + c.amount, 0);
    const totalPaid      = commissions.filter(c => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    return {
      leads: {
        total:      leads.length,
        active:     leads.filter(l => l.status === "active").length,
        inReview:   leads.filter(l => ["submitted", "under_review"].includes(l.status)).length,
        rejected:   leads.filter(l => l.status === "rejected").length,
      },
      commission: { totalPending, totalConfirmed, totalPaid },
    };
  },
});
