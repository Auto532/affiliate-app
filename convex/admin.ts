import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveCommissionRule } from "./commissionEngine";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "changeme";


function requireAdmin(secret: string) {
  if (secret !== ADMIN_SECRET) throw new Error("Kein Zugriff");
}

// ── Partner-Einladungslink generieren ─────────────────────────────────────────

export const generateAffiliateInvite = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const token     = crypto.randomUUID();
    const now       = Date.now();
    await ctx.db.insert("affiliateInvites", {
      token,
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 Tage
    });
    return { token };
  },
});

// ── Partner erstellen (durch Admin) ──────────────────────────────────────────

export const createAffiliate = mutation({
  args: {
    adminSecret:  v.string(),
    name:         v.string(),
    email:        v.string(),
    passwordHash: v.string(),
    phone:        v.optional(v.string()),
    address:      v.optional(v.string()),
    zip:          v.optional(v.string()),
    city:         v.optional(v.string()),
    country:      v.optional(v.string()),
    company:      v.optional(v.string()),
    dateOfBirth:  v.optional(v.string()),
    taxId:        v.optional(v.string()),
    vatId:        v.optional(v.string()),
    bankIban:     v.optional(v.string()),
    bankBic:      v.optional(v.string()),
    bankName:     v.optional(v.string()),
    notes:        v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const existing = await ctx.db.query("affiliates").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (existing) throw new Error("E-Mail bereits registriert");

    // Referral-Code generieren: Initialen + 4 Ziffern
    const initials = args.name.split(" ").map(w => w[0]?.toUpperCase() ?? "X").join("").slice(0, 2);
    let referralCode = "";
    for (let i = 0; i < 10; i++) {
      const candidate = `${initials}-${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", candidate)).unique();
      if (!taken) { referralCode = candidate; break; }
    }
    if (!referralCode) throw new Error("Referral-Code konnte nicht generiert werden");

    const affiliateId = await ctx.db.insert("affiliates", {
      name:         args.name,
      email:        args.email,
      passwordHash: args.passwordHash,
      referralCode,
      status:       "active",
      phone:        args.phone,
      address:      args.address,
      zip:          args.zip,
      city:         args.city,
      country:      args.country ?? "Deutschland",
      company:      args.company,
      dateOfBirth:  args.dateOfBirth,
      taxId:        args.taxId,
      vatId:        args.vatId,
      bankIban:     args.bankIban,
      bankBic:      args.bankBic,
      bankName:     args.bankName,
      notes:        args.notes,
    });

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   affiliateId,
      action:     "created_by_admin",
      actorType:  "admin",
      note:       `Partner angelegt: ${args.name} (${referralCode})`,
    });

    return { affiliateId, referralCode };
  },
});

// ── Alle Affiliates ───────────────────────────────────────────────────────────

export const listAffiliates = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db.query("affiliates").collect();
  },
});

export const approveAffiliate = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.affiliateId, { status: "active" });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "approved",
      actorType:  "admin",
      note:       "Durch Admin freigeschaltet",
    });
  },
});

export const suspendAffiliate = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.affiliateId, { status: "suspended" });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "suspended",
      actorType:  "admin",
      note:       args.note,
    });
  },
});

export const deleteAffiliate = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    // Alles löschen was zu diesem Partner gehört
    const [leads, contracts, commissions, payouts, sessions] = await Promise.all([
      ctx.db.query("shopLeads").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
      ctx.db.query("shopContracts").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
      ctx.db.query("commissions").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
      ctx.db.query("payouts").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
      ctx.db.query("affiliateSessions").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
    ]);

    for (const doc of [...leads, ...contracts, ...commissions, ...payouts, ...sessions]) {
      await ctx.db.delete(doc._id);
    }

    await ctx.db.delete(args.affiliateId);
  },
});

// ── Shop-Queue ────────────────────────────────────────────────────────────────

export const getPendingLeads = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const leads = await ctx.db
      .query("shopLeads")
      .withIndex("by_status", q => q.eq("status", "submitted"))
      .order("asc")
      .collect();

    return Promise.all(leads.map(async lead => {
      const affiliate = await ctx.db.get(lead.affiliateId);
      return { ...lead, affiliateName: affiliate?.name ?? "—", affiliateCode: affiliate?.referralCode ?? "—" };
    }));
  },
});

export const getAllLeads = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const leads = await ctx.db.query("shopLeads").order("desc").collect();
    return Promise.all(leads.map(async lead => {
      const affiliate = await ctx.db.get(lead.affiliateId);
      return { ...lead, affiliateName: affiliate?.name ?? "—" };
    }));
  },
});

// ── Shop genehmigen ───────────────────────────────────────────────────────────

export const approveLead = mutation({
  args: {
    adminSecret:     v.string(),
    leadId:          v.id("shopLeads"),
    planType:        v.union(v.literal("annual"), v.literal("monthly")),
    loatycardShopId: v.optional(v.string()),
    adminName:       v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Lead nicht gefunden");
    if (lead.status === "active") throw new Error("Shop ist bereits aktiv");

    // ShopContract anlegen
    await ctx.db.insert("shopContracts", {
      shopLeadId:    args.leadId,
      affiliateId:   lead.affiliateId,
      planType:      args.planType,
      contractStart: Date.now(),
      status:        "active",
      paymentCount:  0,
      paymentToken:  crypto.randomUUID(),
    });

    await ctx.db.patch(args.leadId, {
      status:          "active",
      loatycardShopId: args.loatycardShopId,
      approvedAt:      Date.now(),
      approvedBy:      args.adminName ?? "Admin",
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   args.leadId,
      action:     "approved",
      actorType:  "admin",
      note:       `Plan: ${args.planType}, genehmigt von ${args.adminName ?? "Admin"}`,
    });
  },
});

// ── Shop ablehnen ─────────────────────────────────────────────────────────────

export const rejectLead = mutation({
  args: {
    adminSecret: v.string(),
    leadId:      v.id("shopLeads"),
    reason:      v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    await ctx.db.patch(args.leadId, {
      status:          "rejected",
      rejectionReason: args.reason,
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   args.leadId,
      action:     "rejected",
      actorType:  "admin",
      note:       args.reason,
    });
  },
});

// ── Zahlung erfassen → Provision erzeugen ─────────────────────────────────────

export const recordPayment = mutation({
  args: {
    adminSecret:    v.string(),
    shopContractId: v.id("shopContracts"),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const contract = await ctx.db.get(args.shopContractId);
    if (!contract)                        throw new Error("Vertrag nicht gefunden");
    if (contract.status !== "active")     throw new Error("Vertrag ist nicht aktiv — keine Provision");

    const newPaymentCount = contract.paymentCount + 1;

    // Duplikat-Schutz
    const existing = await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q =>
        q.eq("shopContractId", args.shopContractId).eq("paymentNumber", newPaymentCount)
      )
      .unique();
    if (existing) throw new Error("Provision für diese Zahlung bereits erfasst");

    // Provisions-Regel berechnen
    const rule = resolveCommissionRule(contract.planType, newPaymentCount);

    // Provision erstellen
    const commissionId = await ctx.db.insert("commissions", {
      affiliateId:    contract.affiliateId,
      shopContractId: args.shopContractId,
      paymentNumber:  newPaymentCount,
      phase:          rule.phase,
      planType:       contract.planType,
      rate:           rule.rate,
      baseAmount:     rule.baseAmount,
      amount:         rule.amount,
      status:         "pending",
      triggeredAt:    Date.now(),
    });

    // Zähler erhöhen
    await ctx.db.patch(args.shopContractId, { paymentCount: newPaymentCount });

    await ctx.db.insert("auditLog", {
      entityType: "commission",
      entityId:   commissionId,
      action:     "created",
      actorType:  "admin",
      note:       `Zahlung #${newPaymentCount} — ${rule.amount}€ (${rule.phase}, ${rule.rate * 100}%)`,
    });

    return { commissionId, amount: rule.amount, phase: rule.phase, rate: rule.rate };
  },
});

// ── Provision bestätigen (nach Rückbuchungsfrist) ─────────────────────────────

export const confirmCommission = mutation({
  args: { adminSecret: v.string(), commissionId: v.id("commissions") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.commissionId, {
      status:      "confirmed",
      confirmedAt: Date.now(),
    });
  },
});

// ── Shop kündigen ─────────────────────────────────────────────────────────────

export const cancelContract = mutation({
  args: { adminSecret: v.string(), shopContractId: v.id("shopContracts"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.shopContractId, {
      status:     "canceled",
      canceledAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      entityType: "contract",
      entityId:   args.shopContractId,
      action:     "canceled",
      actorType:  "admin",
      note:       args.note ?? "Shop hat gekündigt",
    });
  },
});

// ── Auszahlung erstellen ──────────────────────────────────────────────────────

export const createPayout = mutation({
  args: {
    adminSecret:   v.string(),
    affiliateId:   v.id("affiliates"),
    commissionIds: v.array(v.id("commissions")),
    paymentRef:    v.optional(v.string()),
    notes:         v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    let total = 0;
    for (const cId of args.commissionIds) {
      const c = await ctx.db.get(cId);
      if (!c || c.status !== "confirmed") throw new Error(`Commission ${cId} ist nicht bestätigt`);
      if (c.affiliateId !== args.affiliateId) throw new Error("Commission gehört nicht zu diesem Affiliate");
      total += c.amount;
    }

    const payoutId = await ctx.db.insert("payouts", {
      affiliateId:  args.affiliateId,
      amountTotal:  Math.round(total * 100) / 100,
      status:       "paid",
      paidAt:       Date.now(),
      paymentRef:   args.paymentRef,
      notes:        args.notes,
    });

    for (const cId of args.commissionIds) {
      await ctx.db.patch(cId, { status: "paid", payoutId });
    }

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "payout_created",
      actorType:  "admin",
      note:       `${total.toFixed(2)}€ ausgezahlt`,
    });

    return { payoutId, amountTotal: total };
  },
});

// ── Vertrag für Lead ─────────────────────────────────────────────────────────

export const getContractForLead = query({
  args: { adminSecret: v.string(), leadId: v.id("shopLeads") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", args.leadId))
      .unique();
  },
});

// ── Provisionen für Vertrag ───────────────────────────────────────────────────

export const getCommissionsForContract = query({
  args: { adminSecret: v.string(), contractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db
      .query("commissions")
      .withIndex("by_contract", q => q.eq("shopContractId", args.contractId))
      .order("desc")
      .collect();
  },
});

// ── Admin Dashboard ───────────────────────────────────────────────────────────

export const getAdminDashboard = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const [leads, affiliates, commissions] = await Promise.all([
      ctx.db.query("shopLeads").collect(),
      ctx.db.query("affiliates").collect(),
      ctx.db.query("commissions").collect(),
    ]);

    return {
      leads: {
        total:      leads.length,
        submitted:  leads.filter(l => l.status === "submitted").length,
        active:     leads.filter(l => l.status === "active").length,
        rejected:   leads.filter(l => l.status === "rejected").length,
      },
      affiliates: {
        total:   affiliates.length,
        pending: affiliates.filter(a => a.status === "pending").length,
        active:  affiliates.filter(a => a.status === "active").length,
      },
      commissions: {
        pending:   commissions.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0),
        confirmed: commissions.filter(c => c.status === "confirmed").reduce((s, c) => s + c.amount, 0),
        paid:      commissions.filter(c => c.status === "paid").reduce((s, c) => s + c.amount, 0),
      },
    };
  },
});
