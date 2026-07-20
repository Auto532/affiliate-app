import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { resolveCommissionRule } from "./commissionEngine";
import { derivePasswordHash, newSalt } from "./passwords";
import { isValidEmail } from "./validation";
import { recurringPrice, rewardPrice, invoiceTotal, setupFee, discountedFirstInvoice, applyDiscount, SETUP_FEE, REWARD_PRICE_PER_MONTH } from "./pricing";

function requireAdmin(secret: string) {
  const expected = process.env.ADMIN_SECRET;
  // Kein unsicherer Default: ist das Secret nicht gesetzt, wird jeder Zugriff
  // verweigert (statt auf ein rate-bares "changeme" zurückzufallen).
  if (!expected) throw new ConvexError("ADMIN_SECRET nicht gesetzt");
  if (secret !== expected) throw new ConvexError("Kein Zugriff");
}

// ── Alle Daten löschen (Test-Reset) ──────────────────────────────────────────

export const clearAllData = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const tables = [
      "commissions", "payouts", "shopContracts", "shopLeads",
      "affiliateSessions", "adminSessions", "affiliateInvites",
      "auditLog", "affiliates",
    ] as const;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
    return "Affiliate-Daten gelöscht";
  },
});

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
    if (existing) throw new ConvexError("E-Mail bereits registriert");

    // Referral-Code generieren: Initialen + 4 Ziffern
    const initials = args.name.split(" ").map(w => w[0]?.toUpperCase() ?? "X").join("").slice(0, 2);
    let referralCode = "";
    for (let i = 0; i < 10; i++) {
      const candidate = `${initials}-${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", candidate)).unique();
      if (!taken) { referralCode = candidate; break; }
    }
    if (!referralCode) throw new ConvexError("Referral-Code konnte nicht generiert werden");

    const salt = newSalt();
    const affiliateId = await ctx.db.insert("affiliates", {
      name:         args.name,
      email:        args.email,
      passwordHash: await derivePasswordHash(args.passwordHash, salt),
      passwordSalt: salt,
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
    // System-Partner "Direktvertrieb" (Admin-Shops) nicht in der Partner-Liste zeigen
    const all = await ctx.db.query("affiliates").collect();
    return all.filter(a => a.referralCode !== "DIRECT");
  },
});

// ── Direktvertrieb: Admin legt Shop ohne Partner an ───────────────────────────
// Registriert einen bereits in der Stempelkarten-App erstellten Shop im
// Partnerprogramm (Lead + Vertrag), damit Zahlungen normal über /pay/[token]
// laufen und der Umsatz in den Finanzen auftaucht. Provision: 0% (isDirect).
// Alle Direkt-Shops hängen am System-Partner mit referralCode "DIRECT".

async function getOrCreateDirectAffiliate(ctx: any) {
  const existing = await ctx.db
    .query("affiliates")
    .withIndex("by_referralCode", (q: any) => q.eq("referralCode", "DIRECT"))
    .unique();
  if (existing) return existing;

  const salt = newSalt();
  const id = await ctx.db.insert("affiliates", {
    name:         "Direktvertrieb (Admin)",
    email:        "direkt@loyaltycard.info",
    // Zufälliger Hash — mit diesem Konto kann sich niemand einloggen.
    passwordHash: await derivePasswordHash(crypto.randomUUID(), salt),
    passwordSalt: salt,
    referralCode: "DIRECT",
    status:       "active" as const,
    // Rabattcodes (z.B. LOYAL50) sollen für Admin-Shops immer eingebbar sein
    discountEligible: true,
  });
  return ctx.db.get(id);
}

export const createDirectShopContract = mutation({
  args: {
    adminSecret:         v.string(),
    shopName:            v.string(),
    ownerName:           v.optional(v.string()),
    ownerEmail:          v.optional(v.string()),
    ownerPhone:          v.optional(v.string()),
    city:                v.optional(v.string()),
    businessType:        v.optional(v.string()),
    planType:            v.union(v.literal("annual"), v.literal("monthly")),
    rewardCount:         v.optional(v.number()),
    loatycardShopId:     v.string(),
    loatycardShopSlug:   v.string(),
    loatycardAdminToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    // Gleiche Inhaber-E-Mail für mehrere Shops ist erlaubt (ein Inhaber kann
    // mehrere Läden haben) — eindeutig sein müssen nur Endkunden pro Shop.
    if (args.ownerEmail && !isValidEmail(args.ownerEmail)) {
      throw new ConvexError("Inhaber E-Mail: bitte eine gültige E-Mail-Adresse angeben");
    }

    const affiliate = await getOrCreateDirectAffiliate(ctx);
    const now = Date.now();

    const leadId = await ctx.db.insert("shopLeads", {
      affiliateId:  affiliate._id,
      shopName:     args.shopName,
      ownerName:    args.ownerName ?? "",
      ownerEmail:   args.ownerEmail ?? "",
      ownerPhone:   args.ownerPhone,
      businessType: args.businessType,
      city:         args.city,
      source:       "admin_direct",
      // Shop existiert bereits in der Stempelkarten-App → direkt aktiv,
      // provisionShop überspringt ihn (loatycardShopId gesetzt).
      status:              "active",
      approvedAt:          now,
      approvedBy:          "admin",
      loatycardShopId:     args.loatycardShopId,
      loatycardShopSlug:   args.loatycardShopSlug,
      loatycardAdminToken: args.loatycardAdminToken,
      rewardCount:         Math.max(0, Math.min(20, Math.round(args.rewardCount ?? 0))),
    });

    const paymentToken = crypto.randomUUID();
    const rewardCount  = Math.max(0, Math.min(20, Math.round(args.rewardCount ?? 0)));
    await ctx.db.insert("shopContracts", {
      shopLeadId:    leadId,
      affiliateId:   affiliate._id,
      planType:      args.planType,
      contractStart: now,
      status:        "active",
      paymentCount:  0,
      paymentToken,
      isDirect:      true,
      rewardCount,
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   leadId,
      action:     "admin_direct_created",
      actorType:  "admin",
      note:       `${args.shopName} · Plan: ${args.planType} · Shop-ID: ${args.loatycardShopId}`,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.notifyNewShopLead, {
      shopName:      args.shopName,
      ownerName:     args.ownerName ?? "—",
      ownerEmail:    args.ownerEmail,
      ownerPhone:    args.ownerPhone,
      city:          args.city,
      businessType:  args.businessType,
      planType:      args.planType,
      affiliateName: "Admin (Direktvertrieb)",
      viaInvite:     false,
      direct:        true,
    });

    return { paymentToken };
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
    // Admin-Direkt-Shops sind keine Partner-Leads → nicht im Partner-Bereich zeigen
    const partnerLeads = leads.filter(l => l.source !== "admin_direct");
    return Promise.all(partnerLeads.map(async lead => {
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
    rewardCount:     v.optional(v.number()),
    loatycardShopId: v.optional(v.string()),
    adminName:       v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new ConvexError("Lead nicht gefunden");
    if (lead.status === "active") throw new ConvexError("Shop ist bereits aktiv");

    // ShopContract anlegen
    await ctx.db.insert("shopContracts", {
      shopLeadId:    args.leadId,
      affiliateId:   lead.affiliateId,
      planType:      args.planType,
      contractStart: Date.now(),
      status:        "active",
      paymentCount:  0,
      paymentToken:  crypto.randomUUID(),
      rewardCount:   Math.max(0, Math.min(20, Math.round(args.rewardCount ?? lead.rewardCount ?? 0))),
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
    if (!contract)                        throw new ConvexError("Vertrag nicht gefunden");
    if (contract.status !== "active")     throw new ConvexError("Vertrag ist nicht aktiv, keine Provision");

    const newPaymentCount = contract.paymentCount + 1;

    // Duplikat-Schutz
    const existing = await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q =>
        q.eq("shopContractId", args.shopContractId).eq("paymentNumber", newPaymentCount)
      )
      .unique();
    if (existing) throw new ConvexError("Provision für diese Zahlung bereits erfasst");

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
      if (!c || c.status !== "confirmed") throw new ConvexError(`Commission ${cId} ist nicht bestätigt`);
      if (c.affiliateId !== args.affiliateId) throw new ConvexError("Commission gehört nicht zu diesem Affiliate");
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

// ── Einnahmen-Übersicht (für Admin) ──────────────────────────────────────────

export const getEarningsSummary = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const [contracts, commissions] = await Promise.all([
      ctx.db.query("shopContracts").collect(),
      ctx.db.query("commissions").collect(),
    ]);

    // Umsatz = tatsächlich eingenommene Beträge (nach Rabatt). Jede Zahlung erzeugt
    // genau eine Commission mit paidAmount; ältere ohne paidAmount → baseAmount (Listenpreis).
    const revenueTotal = commissions.reduce((s, c) => s + ((c as any).paidAmount ?? c.baseAmount), 0);

    // Einrichtungsgebühren-Anteil: steckt in jeder ERSTEN Zahlung
    // (99 € normal, 45 € Aktionspreis mit Rabattcode).
    const contractById = new Map(contracts.map(c => [c._id, c]));
    let setupFeesTotal = 0;
    for (const c of commissions) {
      if (c.paymentNumber !== 1) continue;
      const contract = contractById.get(c.shopContractId);
      if (!contract) continue;
      setupFeesTotal += setupFee(!!contract.firstYearDiscount);
    }

    // Provisionen nach Status
    const commPending   = commissions.filter(c => c.status === "pending")  .reduce((s, c) => s + c.amount, 0);
    const commConfirmed = commissions.filter(c => c.status === "confirmed").reduce((s, c) => s + c.amount, 0);
    const commPaid      = commissions.filter(c => c.status === "paid")     .reduce((s, c) => s + c.amount, 0);
    const commTotal     = commPending + commConfirmed + commPaid;

    // Vertrags-Aufschlüsselung: „wirklich aktiv" heißt mindestens eine Zahlung.
    // Aktive Verträge ohne Zahlung warten noch auf den Bezahllink.
    const active  = contracts.filter(c => c.status === "active");
    const paying  = active.filter(c => c.paymentCount > 0);
    const payingMonthly = paying.filter(c => c.planType === "monthly");
    const payingAnnual  = paying.filter(c => c.planType === "annual");

    // Laufender Abo-Umsatz aus zahlenden Verträgen (Listenpreise inkl.
    // Bonusprogramm, ohne Erstjahr-Rabatt): Jahresabos anteilig mit 1/12.
    const monthlyRunRate =
      payingMonthly.reduce((s, c) => s + recurringPrice("monthly", c.rewardCount ?? 0), 0) +
      payingAnnual .reduce((s, c) => s + recurringPrice("annual",  c.rewardCount ?? 0) / 12, 0);

    return {
      revenueTotal:   Math.round(revenueTotal   * 100) / 100,
      setupFeesTotal: Math.round(setupFeesTotal  * 100) / 100,
      aboRevenue:     Math.round((revenueTotal - setupFeesTotal) * 100) / 100,
      commTotal:      Math.round(commTotal       * 100) / 100,
      commPending:    Math.round(commPending     * 100) / 100,
      commConfirmed:  Math.round(commConfirmed   * 100) / 100,
      commPaid:       Math.round(commPaid        * 100) / 100,
      netEarnings:    Math.round((revenueTotal - commTotal) * 100) / 100,
      activeContracts: active.length,
      payingContracts: paying.length,
      payingMonthly:   payingMonthly.length,
      payingAnnual:    payingAnnual.length,
      awaitingPayment: active.length - paying.length,
      canceledContracts: contracts.filter(c => c.status === "canceled").length,
      monthlyRunRate:  Math.round(monthlyRunRate * 100) / 100,
      yearlyRunRate:   Math.round(monthlyRunRate * 12 * 100) / 100,
    };
  },
});

// ── Finanz-Detail: alle Zahlungen einzeln (für Finanzen-Detailansicht + PDF) ──
// Jede Zahlung = genau eine Commission-Row. Liefert die flache Liste mit
// Shop-Name, Plan, gezahltem Betrag und Provision; Gruppierung (Monat/Jahr)
// macht der Client.

export const getEarningsDetail = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const commissions = await ctx.db.query("commissions").collect();

    const payments = await Promise.all(commissions.map(async c => {
      const contract = await ctx.db.get(c.shopContractId);
      const lead     = contract ? await ctx.db.get(contract.shopLeadId) : null;
      const paid     = (c as any).paidAmount ?? c.baseAmount;

      // Einrichtungsanteil nur in Zahlung #1: 99 € normal, 45 € mit Rabattcode
      let setupFeePaid = 0;
      let setupFeeList = 0;
      if (c.paymentNumber === 1 && contract) {
        setupFeeList = SETUP_FEE;
        setupFeePaid = setupFee(!!contract.firstYearDiscount);
      }

      return {
        date:             c.triggeredAt,
        shopName:         lead?.shopName ?? "—",
        planType:         c.planType,
        paymentNumber:    c.paymentNumber,
        paidAmount:       Math.round(paid * 100) / 100,
        setupFeePaid:     Math.round(setupFeePaid * 100) / 100,
        setupFeeList,
        commission:       c.amount,
        commissionStatus: c.status,
        direct:           contract?.isDirect === true,
        discountCode:     (c.paymentNumber === 1 && contract?.discountCode) ? contract.discountCode : null,
      };
    }));

    payments.sort((a, b) => b.date - a.date);
    return payments;
  },
});

// ── Lead zu gelöschtem Shop entfernen (Sync mit Stempelkarten-Admin) ──────────
// Wird vom Stempelkarten-Admin nach adminDeleteShop aufgerufen: löscht den
// zugehörigen Lead + Vertrag + Provisionen, damit der Shop auch beim Partner
// und in den Finanzen verschwindet.

export const deleteLeadForShop = mutation({
  args: { adminSecret: v.string(), loatycardShopId: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const lead = (await ctx.db.query("shopLeads").collect())
      .find(l => l.loatycardShopId === args.loatycardShopId);
    if (!lead) return { deleted: false };

    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
      .unique();

    if (contract) {
      const commissions = await ctx.db
        .query("commissions")
        .withIndex("by_contract", q => q.eq("shopContractId", contract._id))
        .collect();
      for (const c of commissions) await ctx.db.delete(c._id);
      await ctx.db.delete(contract._id);
    }
    await ctx.db.delete(lead._id);

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   lead._id,
      action:     "deleted_with_shop",
      actorType:  "admin",
      note:       `${lead.shopName} · Shop-ID: ${args.loatycardShopId} · Vertrag + Provisionen mitgelöscht`,
    });

    return { deleted: true };
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

// ── Vertrag für Stempelkarten-Shop (Bonusprogramm nachträglich einstellen) ────

export const getContractForShop = query({
  args: { adminSecret: v.string(), loatycardShopId: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const lead = (await ctx.db.query("shopLeads").collect())
      .find(l => l.loatycardShopId === args.loatycardShopId);
    if (!lead) return null;

    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
      .unique();
    if (!contract) return null;

    const rewardCount = contract.rewardCount ?? 0;

    // Zahlungshistorie für die Vertragskarte im Admin: Abschluss = Zahlung #1,
    // Verlängerung = letzte Zahlung + Abrechnungsperiode. Jede Zahlung legt
    // eine commissions-Row an (auch Direktvertrieb mit Rate 0).
    const payments = (await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q => q.eq("shopContractId", contract._id))
      .collect()).sort((a, b) => a.paymentNumber - b.paymentNumber);
    const firstPaidAt = payments[0]?.triggeredAt ?? null;
    const lastPaid    = payments[payments.length - 1] ?? null;
    let nextRenewalAt: number | null = null;
    if (lastPaid) {
      const d = new Date(lastPaid.triggeredAt);
      if (contract.planType === "annual") d.setFullYear(d.getFullYear() + 1);
      else                                d.setMonth(d.getMonth() + 1);
      nextRenewalAt = d.getTime();
    }

    const amountDue = contract.paymentCount === 0
      ? (contract.firstYearDiscount
          ? discountedFirstInvoice(contract.planType, rewardCount, contract.firstYearDiscount)
          : invoiceTotal(contract.planType, rewardCount, true))
      : 0;

    return {
      contractId:        contract._id,
      leadId:            lead._id,
      planType:          contract.planType,
      rewardCount,
      paymentCount:      contract.paymentCount,
      status:            contract.status,
      recurringPrice:    recurringPrice(contract.planType, rewardCount),
      rewardUnitPrice:   rewardPrice(contract.planType),
      rewardPricePerMonth: REWARD_PRICE_PER_MONTH,
      setupFee:          setupFee(!!contract.discountCode),
      discountCode:      contract.discountCode ?? null,
      firstYearDiscount: contract.firstYearDiscount ?? null,
      // Zahlungsstatus + Historie für die Vertragskarte
      paymentToken:      contract.paymentToken ?? "",
      payLaterAt:        contract.payLaterAt ?? null,
      contractStart:     contract.contractStart,
      amountDue,
      firstPaidAt,
      lastPaidAt:        lastPaid?.triggeredAt ?? null,
      nextRenewalAt,
    };
  },
});

// Bonusprogramm (Anzahl Belohnungen) nachträglich ändern. Fließt sofort in alle
// künftigen Abrechnungen ein (Abo-Betrag wird aus contract.rewardCount berechnet).
// Steht noch die ERSTE Zahlung aus und ist ein Rabattcode hinterlegt, werden
// Listen- und Rabattpreis der Erstrechnung neu berechnet (Rabatt gilt weiter).
export const updateContractRewardCount = mutation({
  args: {
    adminSecret: v.string(),
    contractId:  v.id("shopContracts"),
    rewardCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new ConvexError("Vertrag nicht gefunden");

    const rewardCount = Math.max(0, Math.min(20, Math.round(args.rewardCount)));
    const oldCount    = contract.rewardCount ?? 0;

    await ctx.db.patch(args.contractId, { rewardCount });
    const lead = await ctx.db.get(contract.shopLeadId);
    if (lead) await ctx.db.patch(lead._id, { rewardCount });

    // Erste Zahlung noch offen + Rabatt hinterlegt → Erstrechnung neu berechnen,
    // damit Zahlungsseite und Stripe-Checkout den korrekten Betrag zeigen.
    if (contract.paymentCount === 0 && contract.firstYearDiscount) {
      const normalPrice = invoiceTotal(contract.planType, rewardCount, true);
      await ctx.db.patch(args.contractId, {
        normalPrice,
        discountedPrice: discountedFirstInvoice(contract.planType, rewardCount, contract.firstYearDiscount),
      });
    }

    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   args.contractId,
      action:     "reward_count_changed",
      actorType:  "admin",
      note:       `Bonusprogramm: ${oldCount} → ${rewardCount} Belohnung(en)${lead ? ` · ${lead.shopName}` : ""}`,
    });

    return { rewardCount };
  },
});

// ── "Später zahlen"-Liste (Admin-Direkt-Shops, Zahlung vorgemerkt) ────────────

export const getPayLaterList = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const contracts = (await ctx.db.query("shopContracts").collect())
      .filter(c => c.payLaterAt && c.paymentCount === 0 && c.status === "active");

    const rows = await Promise.all(contracts.map(async c => {
      const lead        = await ctx.db.get(c.shopLeadId);
      const rewardCount = c.rewardCount ?? 0;
      const listTotal   = invoiceTotal(c.planType, rewardCount, true);
      const amount      = c.firstYearDiscount
        ? (c.discountedPrice ?? applyDiscount(listTotal, c.firstYearDiscount))
        : listTotal;
      return {
        contractId:   c._id,
        shopName:     lead?.shopName ?? "—",
        ownerName:    lead?.ownerName ?? "—",
        ownerEmail:   lead?.ownerEmail ?? "",
        ownerPhone:   lead?.ownerPhone ?? "",
        planType:     c.planType,
        rewardCount,
        amount,
        payLaterAt:   c.payLaterAt!,
        paymentToken: c.paymentToken ?? "",
      };
    }));

    return rows.sort((a, b) => b.payLaterAt - a.payLaterAt);
  },
});

// ── Zahlungsstatus je Stempelkarten-Shop (für die Shop-Übersicht im Admin) ────
// Liefert für jeden verknüpften Shop, ob die erste Zahlung noch offen ist,
// inkl. fälligem Betrag (Rabatt eingerechnet) und "Später zahlen"-Vormerkung.

export const getPayStatusForShops = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);

    const leads = (await ctx.db.query("shopLeads").collect())
      .filter(l => l.loatycardShopId);

    const rows = await Promise.all(leads.map(async lead => {
      const contract = await ctx.db
        .query("shopContracts")
        .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
        .unique();
      if (!contract || contract.status !== "active") return null;

      const rewardCount = contract.rewardCount ?? 0;
      const amountDue   = contract.firstYearDiscount
        ? discountedFirstInvoice(contract.planType, rewardCount, contract.firstYearDiscount)
        : invoiceTotal(contract.planType, rewardCount, true);

      return {
        loatycardShopId: lead.loatycardShopId!,
        paid:            contract.paymentCount > 0,
        payLater:        !!contract.payLaterAt,
        amountDue:       contract.paymentCount > 0 ? 0 : amountDue,
        paymentToken:    contract.paymentToken ?? "",
      };
    }));

    return rows.filter(r => r !== null);
  },
});

// Vormerkung entfernen (z.B. geklärt oder hinfällig). Nach Zahlungseingang
// verschwindet der Eintrag automatisch (paymentCount > 0).
export const clearPayLater = mutation({
  args: { adminSecret: v.string(), contractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new ConvexError("Vertrag nicht gefunden");
    await ctx.db.patch(args.contractId, { payLaterAt: undefined });
    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   args.contractId,
      action:     "pay_later_cleared",
      actorType:  "admin",
    });
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

    const [allLeads, allAffiliates, commissions] = await Promise.all([
      ctx.db.query("shopLeads").collect(),
      ctx.db.query("affiliates").collect(),
      ctx.db.query("commissions").collect(),
    ]);

    // Direktvertrieb (Admin) zählt nicht als Partner-Aktivität
    const leads      = allLeads.filter(l => l.source !== "admin_direct");
    const affiliates = allAffiliates.filter(a => a.referralCode !== "DIRECT");

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

// ── Profiländerungen freigeben / ablehnen ────────────────────────────────────

export const approveProfileChange = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a?.pendingProfile) throw new ConvexError("Keine ausstehende Änderung");
    const { submittedAt: _s, ...fields } = a.pendingProfile;
    await ctx.db.patch(args.affiliateId, { ...fields, pendingProfile: undefined });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "profile_change_approved",
      actorType:  "admin",
      note:       Object.keys(fields).join(", "),
    });
  },
});

export const rejectProfileChange = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a?.pendingProfile) throw new ConvexError("Keine ausstehende Änderung");
    await ctx.db.patch(args.affiliateId, { pendingProfile: undefined });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "profile_change_rejected",
      actorType:  "admin",
    });
  },
});

// ── Rabatt-Berechtigung pro Partner (Admin-Toggle) ───────────────────────────

export const setDiscountEligible = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates"), eligible: v.boolean() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.affiliateId, { discountEligible: args.eligible });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     args.eligible ? "discount_enabled" : "discount_disabled",
      actorType:  "admin",
    });
  },
});

// ── Partner-Detail (Admin-Popup) ─────────────────────────────────────────────

export const getAffiliateDetail = query({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a) return null;
    const { passwordHash: _p, passwordSalt: _s, ...affiliate } = a;

    const [leads, commissions, payouts] = await Promise.all([
      ctx.db.query("shopLeads").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).order("desc").collect(),
      ctx.db.query("commissions").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect(),
      ctx.db.query("payouts").withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).order("desc").collect(),
    ]);

    const sum = (st: string) =>
      Math.round(commissions.filter(c => c.status === st).reduce((s, c) => s + c.amount, 0) * 100) / 100;

    return {
      affiliate,
      pendingProfile: a.pendingProfile ?? null,
      leads: leads.map(l => ({
        _id: l._id, shopName: l.shopName, ownerName: l.ownerName,
        city: l.city ?? null, status: l.status, createdAt: l._creationTime,
      })),
      stats: {
        leadsTotal:    leads.length,
        leadsActive:   leads.filter(l => l.status === "active").length,
        leadsInReview: leads.filter(l => ["submitted", "under_review", "pending_payment"].includes(l.status)).length,
        leadsRejected: leads.filter(l => l.status === "rejected").length,
      },
      commissions: {
        pending:   sum("pending"),
        confirmed: sum("confirmed"),
        paid:      sum("paid"),
        count:     commissions.length,
      },
      payouts: payouts.map(p => ({
        _id: p._id, amountTotal: p.amountTotal, status: p.status, paidAt: p.paidAt ?? null,
      })),
    };
  },
});
