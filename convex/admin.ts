import { sanitizeAffiliate } from "./affiliateAuth";
import { ADMIN_SESSION_MS, isValidAdminPin, newSessionToken, requireAdmin } from "./adminAuth";
import { assertNotLocked, recordFailure, clearFailures } from "./rateLimit";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { recordPaymentCore, activateContractCore } from "./payments";
import { derivePasswordHash, newSalt } from "./passwords";
import { isValidEmail } from "./validation";
import { planPrice, contractTier, tierForCardCount, tierInfo, ANNUAL_OFFERED, type Tier } from "./pricing";
import { isCommissionPayable, commissionPayableAt } from "./commissionEngine";

// ── Admin-Login (PIN → Sitzungs-Schlüssel) ──────────────────────────────────
// Fehler werden ZURÜCKGEGEBEN statt geworfen: ein throw rollt in Convex alle
// Schreibvorgänge zurück, dann würde der Fehlversuch nie gezählt.

async function checkAdminPinThrottled(ctx: MutationCtx, pin: string) {
  if (!process.env.ADMIN_SECRET) throw new ConvexError("ADMIN_SECRET nicht gesetzt");
  let throttle;
  try {
    throttle = await assertNotLocked(ctx, "admin-pin");
  } catch (err) {
    return { ok: false as const, error: err instanceof ConvexError ? String(err.data) : "Gesperrt" };
  }
  if (!isValidAdminPin(pin)) {
    await recordFailure(ctx, "admin-pin", throttle);
    return { ok: false as const, error: "Falscher PIN" };
  }
  await clearFailures(ctx, throttle);
  return { ok: true as const };
}

// Für die Test-Zahlung (Action ohne DB-Zugriff): PIN mit derselben Sperre prüfen
export const verifyAdminPin = internalMutation({
  args: { pin: v.string() },
  handler: async (ctx, args) => checkAdminPinThrottled(ctx, args.pin),
});

export const adminLogin = mutation({
  args: { pin: v.string() },
  handler: async (ctx, args) => {
    const check = await checkAdminPinThrottled(ctx, args.pin);
    if (!check.ok) return check;

    // Abgelaufene Sitzungen nebenbei aufräumen (begrenzt)
    const now = Date.now();
    const expired = await ctx.db.query("adminSessions")
      .withIndex("by_expiresAt", q => q.lt("expiresAt", now))
      .take(50);
    for (const s of expired) await ctx.db.delete(s._id);

    const token = newSessionToken();
    await ctx.db.insert("adminSessions", { token, createdAt: now, expiresAt: now + ADMIN_SESSION_MS });
    return { ok: true as const, token };
  },
});

// Für den Stempelkarten-Admin: ist der gemerkte Partner-App-Schlüssel noch gültig?
export const isAdminSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) return false;
    const session = await ctx.db.query("adminSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    return !!session && session.expiresAt > Date.now();
  },
});

export const adminLogout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("adminSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

// ── Alle Daten löschen (Test-Reset) ──────────────────────────────────────────
// Braucht eine gültige Sitzung UND den PIN erneut (Fehlklick-Schutz).

export const clearAllData = mutation({
  args: { adminSecret: v.string(), pin: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    if (!isValidAdminPin(args.pin)) throw new ConvexError("Falscher PIN");
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
    await requireAdmin(ctx, args.adminSecret);
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
    await requireAdmin(ctx, args.adminSecret);

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
    await requireAdmin(ctx, args.adminSecret);
    // System-Partner "Direktvertrieb" (Admin-Shops) nicht in der Partner-Liste zeigen
    const all = await ctx.db.query("affiliates").collect();
    return all.filter(a => a.referralCode !== "DIRECT").map(sanitizeAffiliate);
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
    planType:            v.optional(v.union(v.literal("annual"), v.literal("monthly"))),
    // Bestehender Shop kann schon Kunden haben → Startstufe danach
    cardCount:           v.optional(v.number()),
    // Shop lief bisher ohne Abrechnung, Begrüßung ist schon raus
    welcomeSent:         v.optional(v.boolean()),
    loatycardShopId:     v.string(),
    loatycardShopSlug:   v.string(),
    loatycardAdminToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    // Gleiche Inhaber-E-Mail für mehrere Shops ist erlaubt (ein Inhaber kann
    // mehrere Läden haben) — eindeutig sein müssen nur Endkunden pro Shop.
    if (args.ownerEmail && !isValidEmail(args.ownerEmail)) {
      throw new ConvexError("Inhaber E-Mail: bitte eine gültige E-Mail-Adresse angeben");
    }

    // Hat der Shop schon einen Vertrag (z. B. zweiter Klick / zweiter Tab)?
    // Dann denselben Bezahllink zurückgeben statt einen weiteren anzulegen.
    const existingLead = (await ctx.db.query("shopLeads").collect())
      .find(l => l.loatycardShopId === args.loatycardShopId);
    if (existingLead) {
      const existing = await ctx.db.query("shopContracts")
        .withIndex("by_shopLead", q => q.eq("shopLeadId", existingLead._id)).first();
      if (existing?.paymentToken) return { paymentToken: existing.paymentToken };
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
    });

    const paymentToken = crypto.randomUUID();
    const planType     = ANNUAL_OFFERED ? (args.planType ?? "monthly") : "monthly";
    const cardCount    = Math.max(0, Math.floor(args.cardCount ?? 0));
    await ctx.db.insert("shopContracts", {
      shopLeadId:    leadId,
      affiliateId:   affiliate._id,
      planType,
      contractStart: now,
      status:        "active",
      paymentCount:  0,
      paymentToken,
      isDirect:      true,
      cardCount,
      tier:          tierForCardCount(cardCount),
      welcomeSent:   args.welcomeSent,
    });

    await ctx.db.insert("auditLog", {
      entityType: "shopLead",
      entityId:   leadId,
      action:     "admin_direct_created",
      actorType:  "admin",
      note:       `${args.shopName} · Plan: ${planType} · Shop-ID: ${args.loatycardShopId}`,
    });

    // Kein Telegram beim Anlegen — die Meldung kommt erst mit der
    // Freischaltung bzw. bei "Später zahlen".
    return { paymentToken };
  },
});

export const approveAffiliate = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    const affiliate = await ctx.db.get(args.affiliateId);
    if (!affiliate) throw new ConvexError("Partner nicht gefunden");
    const wasPending = affiliate.status === "pending";

    await ctx.db.patch(args.affiliateId, { status: "active" });
    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   args.affiliateId,
      action:     "approved",
      actorType:  "admin",
      note:       "Durch Admin freigeschaltet",
    });

    // Willkommens-Mail nur bei der ERSTEN Freigabe (nicht wenn z.B. ein
    // gesperrter Partner reaktiviert wird).
    if (wasPending && affiliate.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendPartnerWelcomeEmail, {
        name:         affiliate.name,
        email:        affiliate.email,
        referralCode: affiliate.referralCode,
      });
    }
  },
});

export const suspendAffiliate = mutation({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    await ctx.db.patch(args.affiliateId, { status: "suspended" });
    const sessions = await ctx.db.query("affiliateSessions")
      .withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId)).collect();
    for (const session of sessions) await ctx.db.delete(session._id);
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
    await requireAdmin(ctx, args.adminSecret);

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
    await requireAdmin(ctx, args.adminSecret);

    const leads = await ctx.db
      .query("shopLeads")
      .withIndex("by_status", q => q.eq("status", "submitted"))
      .order("asc")
      .collect();

    return Promise.all(leads.map(async lead => {
      const affiliate = await ctx.db.get(lead.affiliateId);
      const { loatycardAdminToken: _adminToken, ...safeLead } = lead;
      return { ...safeLead, affiliateName: affiliate?.name ?? "—", affiliateCode: affiliate?.referralCode ?? "—" };
    }));
  },
});

export const getAllLeads = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    const leads = await ctx.db.query("shopLeads").order("desc").collect();
    // Admin-Direkt-Shops sind keine Partner-Leads → nicht im Partner-Bereich zeigen
    const partnerLeads = leads.filter(l => l.source !== "admin_direct");
    return Promise.all(partnerLeads.map(async lead => {
      const affiliate = await ctx.db.get(lead.affiliateId);
      const { loatycardAdminToken: _adminToken, ...safeLead } = lead;
      return { ...safeLead, affiliateName: affiliate?.name ?? "—" };
    }));
  },
});

// ── Shop genehmigen ───────────────────────────────────────────────────────────

export const approveLead = mutation({
  args: {
    adminSecret:     v.string(),
    leadId:          v.id("shopLeads"),
    planType:        v.optional(v.union(v.literal("annual"), v.literal("monthly"))),
    loatycardShopId: v.optional(v.string()),
    adminName:       v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new ConvexError("Lead nicht gefunden");
    if (lead.status === "active") throw new ConvexError("Shop ist bereits aktiv");

    // ShopContract anlegen (neuer Shop = 0 Karten = Free)
    const planType = ANNUAL_OFFERED ? (args.planType ?? "monthly") : "monthly";
    await ctx.db.insert("shopContracts", {
      shopLeadId:    args.leadId,
      affiliateId:   lead.affiliateId,
      planType,
      contractStart: Date.now(),
      status:        "active",
      paymentCount:  0,
      paymentToken:  crypto.randomUUID(),
      cardCount:     0,
      tier:          "free",
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
      note:       `Plan: ${planType}, genehmigt von ${args.adminName ?? "Admin"}`,
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
    await requireAdmin(ctx, args.adminSecret);

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

// ── Zahlung manuell erfassen (z.B. Barzahlung/Überweisung) ────────────────────
// Läuft über DENSELBEN Kern wie Stripe-Webhook und Test-Zahlung
// (payments.recordPaymentCore): Direktvertrieb 0%, Deckelung,
// Umsatz-paidAmount, Bestätigungs-Mail und Telegram gelten damit auch hier.
// Noch nicht freigeschaltete Verträge werden dabei freigeschaltet (Shop wird
// angelegt). Gebucht wird ein Monat zum aktuellen Stufenpreis; bei Free
// (0 €) wird nur freigeschaltet.

export const recordPayment = mutation({
  args: {
    adminSecret:    v.string(),
    shopContractId: v.id("shopContracts"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    const activation = await activateContractCore(ctx, {
      shopContractId: args.shopContractId,
      method:         "manuell",
    });
    const result = await recordPaymentCore(ctx, {
      shopContractId: args.shopContractId,
      paymentRef:     `manual-${Date.now()}`,
      method:         "manuell",
    });
    if (!result) {
      if (activation.activated) return { amount: 0, phase: "initial", rate: 0, paidAmount: 0, activatedOnly: true };
      throw new ConvexError("Zahlung konnte nicht erfasst werden (Vertrag inaktiv, Stufe Free oder bereits verbucht)");
    }

    return { amount: result.amount, phase: result.phase, rate: result.rate, paidAmount: result.paidAmount, activatedOnly: false };
  },
});

// ── Provision bestätigen (nach Rückbuchungsfrist) ─────────────────────────────

export const confirmCommission = mutation({
  args: { adminSecret: v.string(), commissionId: v.id("commissions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    const c = await ctx.db.get(args.commissionId);
    if (!c) throw new ConvexError("Provision nicht gefunden");
    // 14 Tage Widerrufsfrist ab Zahlungsbestätigung (triggeredAt) einhalten.
    if (!isCommissionPayable(c.triggeredAt)) {
      const at = commissionPayableAt(c.triggeredAt);
      throw new ConvexError(
        `Provision erst nach der 14-tägigen Widerrufsfrist auszahlbar (frühestens ${new Date(at).toLocaleDateString("de-DE")}).`
      );
    }
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
    await requireAdmin(ctx, args.adminSecret);
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
    await requireAdmin(ctx, args.adminSecret);

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
    await requireAdmin(ctx, args.adminSecret);

    const [contracts, commissions] = await Promise.all([
      ctx.db.query("shopContracts").collect(),
      ctx.db.query("commissions").collect(),
    ]);

    // Umsatz = tatsächlich eingenommene Beträge (nach Rabatt). Jede Zahlung erzeugt
    // genau eine Commission mit paidAmount; ältere ohne paidAmount → baseAmount (Listenpreis).
    const revenueTotal = commissions.reduce((s, c) => s + ((c as any).paidAmount ?? c.baseAmount), 0);

    // Provisionen nach Status
    const commPending   = commissions.filter(c => c.status === "pending")  .reduce((s, c) => s + c.amount, 0);
    const commConfirmed = commissions.filter(c => c.status === "confirmed").reduce((s, c) => s + c.amount, 0);
    const commPaid      = commissions.filter(c => c.status === "paid")     .reduce((s, c) => s + c.amount, 0);
    const commTotal     = commPending + commConfirmed + commPaid;

    // Vertrags-Aufschlüsselung: „live" heißt freigeschaltet (Bezahldaten
    // hinterlegt bzw. vom Admin aktiviert, ältere Verträge: mind. eine Zahlung).
    // Aktive Verträge ohne Freischaltung warten noch auf den Bezahllink.
    const active  = contracts.filter(c => c.status === "active");
    const paying  = active.filter(c => !!c.activatedAt || c.paymentCount > 0);
    const payingMonthly = paying.filter(c => c.planType === "monthly");
    const payingAnnual  = paying.filter(c => c.planType === "annual");

    // Laufender Abo-Umsatz aus den aktuellen Preisstufen: Jahresabos anteilig mit 1/12.
    const monthlyPlanRunRate = payingMonthly.reduce((s, c) => s + planPrice("monthly", contractTier(c)), 0);
    const annualPlanRunRate  = payingAnnual .reduce((s, c) => s + planPrice("annual",  contractTier(c)), 0);
    const monthlyRunRate     = monthlyPlanRunRate + annualPlanRunRate / 12;

    // Anzahl live geschalteter Shops je Preisstufe
    const tierCounts: Record<Tier, number> = { free: 0, starter: 0, business: 0, premium: 0 };
    for (const c of paying) tierCounts[contractTier(c)]++;

    return {
      revenueTotal:   Math.round(revenueTotal   * 100) / 100,
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
      monthlyPlanRunRate: Math.round(monthlyPlanRunRate * 100) / 100,
      annualPlanRunRate:  Math.round(annualPlanRunRate  * 100) / 100,
      tierCounts,
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
    await requireAdmin(ctx, args.adminSecret);

    const commissions = await ctx.db.query("commissions").collect();

    const payments = await Promise.all(commissions.map(async c => {
      const contract = await ctx.db.get(c.shopContractId);
      const lead     = contract ? await ctx.db.get(contract.shopLeadId) : null;
      const paid     = (c as any).paidAmount ?? c.baseAmount;

      return {
        date:             c.triggeredAt,
        shopName:         lead?.shopName ?? "—",
        planType:         c.planType,
        paymentNumber:    c.paymentNumber,
        paidAmount:       Math.round(paid * 100) / 100,
        commission:       c.amount,
        commissionStatus: c.status,
        direct:           contract?.isDirect === true,
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
    await requireAdmin(ctx, args.adminSecret);

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
    await requireAdmin(ctx, args.adminSecret);
    return ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", args.leadId))
      .unique();
  },
});

// ── Vertrag für Stempelkarten-Shop (Vertrag-Tab im Admin) ──────────────────────

export const getContractForShop = query({
  args: { adminSecret: v.string(), loatycardShopId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    const lead = (await ctx.db.query("shopLeads").collect())
      .find(l => l.loatycardShopId === args.loatycardShopId);
    if (!lead) return null;

    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
      .unique();
    if (!contract) return null;

    const tier  = contractTier(contract);
    const price = planPrice(contract.planType, tier);

    // Zahlungshistorie für die Vertragskarte im Admin: nächste Abbuchung =
    // letzte Zahlung + Abrechnungsperiode. Jede Zahlung legt
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

    const activated = !!contract.activatedAt || contract.paymentCount > 0;

    return {
      contractId:        contract._id,
      leadId:            lead._id,
      planType:          contract.planType,
      tier,
      tierName:          tierInfo(tier).name,
      cardCount:         contract.cardCount ?? 0,
      paymentCount:      contract.paymentCount,
      status:            contract.status,
      recurringPrice:    price,
      activated,
      activatedAt:       contract.activatedAt ?? null,
      hasStripe:         !!contract.stripeSubscriptionId,
      // Zahlungsstatus + Historie für die Vertragskarte
      paymentToken:      contract.paymentToken ?? "",
      payLaterAt:        contract.payLaterAt ?? null,
      contractStart:     contract.contractStart,
      firstPaidAt,
      lastPaidAt:        lastPaid?.triggeredAt ?? null,
      nextRenewalAt,
      payments: payments.map(p => ({
        paymentNumber: p.paymentNumber,
        paidAt:        p.triggeredAt,
        amount:        (p as any).paidAmount ?? p.baseAmount,
        isTest:        (p.paymentRef ?? "").startsWith("test-"),
      })),
    };
  },
});

// Automatischer Abrechnungs-Sync aus der Stempelkarten-App (HTTP /sync-card-count):
// Die Anzahl der Kunden (verschiedene E-Mail-Adressen) bestimmt die Preisstufe. Rutscht ein Shop über
// (oder unter) eine Grenze, gilt die neue Stufe ab der nächsten Abrechnung:
// Stripe-Abo wird angepasst, Inhaber bekommt eine Mail, Admin ein Telegram.
export const syncCardCountForShop = internalMutation({
  args: { loatycardShopId: v.string(), cardCount: v.number() },
  handler: async (ctx, args) => {
    const lead = (await ctx.db.query("shopLeads").collect())
      .find(l => l.loatycardShopId === args.loatycardShopId);
    if (!lead) return { synced: false, reason: "kein Lead" };

    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
      .unique();
    if (!contract || contract.status !== "active") return { synced: false, reason: "kein aktiver Vertrag" };

    const cardCount = Math.max(0, Math.floor(args.cardCount));
    const oldTier   = contractTier(contract);
    const newTier   = tierForCardCount(cardCount);

    if (newTier === oldTier) {
      if (cardCount !== contract.cardCount || !contract.tier) {
        await ctx.db.patch(contract._id, { cardCount, tier: newTier });
      }
      // Stripe-Preis trotzdem abgleichen (repariert fehlgeschlagene oder
      // überholte Updates; tut nichts, wenn der Preis schon stimmt).
      if (contract.stripeSubscriptionId) {
        await ctx.scheduler.runAfter(0, internal.payments.updateStripeTier, { shopContractId: contract._id });
      }
      return { synced: true, tier: newTier, unchanged: true };
    }

    await ctx.db.patch(contract._id, { cardCount, tier: newTier, tierChangedAt: Date.now() });
    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   contract._id,
      action:     "tier_changed",
      actorType:  "system",
      note:       `${tierInfo(oldTier).name} → ${tierInfo(newTier).name} · ${cardCount} Kunden · ${lead.shopName}`,
    });

    await ctx.scheduler.runAfter(0, internal.payments.updateStripeTier, { shopContractId: contract._id });
    await ctx.scheduler.runAfter(0, internal.notifications.notifyTierChange, {
      shopName:  lead.shopName,
      oldTier:   tierInfo(oldTier).name,
      newTier:   tierInfo(newTier).name,
      cardCount,
      newPrice:  tierInfo(newTier).monthly,
      hasStripe: !!contract.stripeSubscriptionId,
    });
    if (lead.ownerEmail && (contract.activatedAt || contract.paymentCount > 0)) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTierChangeEmail, {
        ownerEmail: lead.ownerEmail,
        ownerName:  lead.ownerName || "Inhaber",
        shopName:   lead.shopName,
        oldTier,
        newTier,
        cardCount,
      });
    }

    return { synced: true, tier: newTier };
  },
});

// ── "Später zahlen"-Liste (Admin-Direkt-Shops, Zahlung vorgemerkt) ────────────

export const getPayLaterList = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    const contracts = (await ctx.db.query("shopContracts").collect())
      .filter(c => c.payLaterAt && !c.activatedAt && c.paymentCount === 0 && c.status === "active");

    const rows = await Promise.all(contracts.map(async c => {
      const lead   = await ctx.db.get(c.shopLeadId);
      const tier   = contractTier(c);
      const amount = planPrice(c.planType, tier);
      return {
        contractId:   c._id,
        shopName:     lead?.shopName ?? "—",
        ownerName:    lead?.ownerName ?? "—",
        ownerEmail:   lead?.ownerEmail ?? "",
        ownerPhone:   lead?.ownerPhone ?? "",
        planType:     c.planType,
        tierName:     tierInfo(tier).name,
        amount,
        payLaterAt:   c.payLaterAt!,
        paymentToken: c.paymentToken ?? "",
      };
    }));

    return rows.sort((a, b) => b.payLaterAt - a.payLaterAt);
  },
});

// ── Zahlungsstatus je Stempelkarten-Shop (für die Shop-Übersicht im Admin) ────
// Liefert für jeden verknüpften Shop, ob er freigeschaltet ist (Bezahldaten
// hinterlegt), seine Preisstufe und eine evtl. "Später zahlen"-Vormerkung.

export const getPayStatusForShops = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);

    const leads = (await ctx.db.query("shopLeads").collect())
      .filter(l => l.loatycardShopId);

    const rows = await Promise.all(leads.map(async lead => {
      const contract = await ctx.db
        .query("shopContracts")
        .withIndex("by_shopLead", q => q.eq("shopLeadId", lead._id))
        .unique();
      if (!contract || contract.status !== "active") return null;

      const tier      = contractTier(contract);
      const activated = !!contract.activatedAt || contract.paymentCount > 0;

      return {
        loatycardShopId: lead.loatycardShopId!,
        paid:            activated,
        payLater:        !!contract.payLaterAt,
        tier,
        tierName:        tierInfo(tier).name,
        price:           planPrice(contract.planType, tier),
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
    await requireAdmin(ctx, args.adminSecret);
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
    await requireAdmin(ctx, args.adminSecret);
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
    await requireAdmin(ctx, args.adminSecret);

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
    await requireAdmin(ctx, args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a?.pendingProfile) throw new ConvexError("Keine ausstehende Änderung");
    const { submittedAt: _s, ...fields } = a.pendingProfile;
    // Leerer Text im Antrag = Feld entfernen
    const cleaned = Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, val === "" ? undefined : val]));
    await ctx.db.patch(args.affiliateId, { ...cleaned, pendingProfile: undefined });
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
    await requireAdmin(ctx, args.adminSecret);
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

// ── Partner-Detail (Admin-Popup) ─────────────────────────────────────────────

export const getAffiliateDetail = query({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a) return null;
    const affiliate = sanitizeAffiliate(a);

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

// Datengrundlage für die Provisionsabrechnung (PDF im Stempelkarten-Admin).
// Liefert Partner-Stammdaten + itemisierte Provisionen (mit Shop-Name) + Summen.
export const getPartnerCommissionStatement = query({
  args: { adminSecret: v.string(), affiliateId: v.id("affiliates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminSecret);
    const a = await ctx.db.get(args.affiliateId);
    if (!a) return null;

    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_affiliate", q => q.eq("affiliateId", args.affiliateId))
      .collect();

    const rows = await Promise.all(commissions.map(async c => {
      const contract = await ctx.db.get(c.shopContractId);
      const lead     = contract ? await ctx.db.get(contract.shopLeadId) : null;
      return {
        date:          c.triggeredAt,
        shopName:      lead?.shopName ?? "—",
        planType:      c.planType,
        paymentNumber: c.paymentNumber,
        phase:         c.phase,
        baseAmount:    c.baseAmount,
        rate:          c.rate,
        amount:        c.amount,
        status:        c.status,
      };
    }));
    rows.sort((x, y) => y.date - x.date);

    const sum = (st: string) =>
      Math.round(rows.filter(r => r.status === st).reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const pending = sum("pending"), confirmed = sum("confirmed"), paid = sum("paid"), canceled = sum("canceled");

    return {
      partner: {
        name:         a.name,
        company:      a.company ?? null,
        referralCode: a.referralCode,
        businessType: a.businessType ?? null,
        address:      a.address ?? null,
        zip:          a.zip ?? null,
        city:         a.city ?? null,
        country:      a.country ?? null,
        email:        a.email,
        phone:        a.phone ?? null,
        taxId:        a.taxId ?? null,
        vatId:        a.vatId ?? null,
        bankIban:     a.bankIban ?? null,
        bankBic:      a.bankBic ?? null,
        bankName:     a.bankName ?? null,
      },
      rows,
      totals: {
        count:        rows.length,
        pending, confirmed, paid, canceled,
        payableTotal: Math.round((pending + confirmed + paid) * 100) / 100,
      },
    };
  },
});

// ── Einmalige Migration (2026-11-02): Preisstufen statt Bonus-Aufpreis ─────────
// Räumt die alten Felder (Rabattcodes, Bonus-Anzahl) aus allen Datensätzen
// und setzt fehlende Preisstufen. Die echte Kundenzahl liefert danach die
// Stempelkarten-App (billingSync.resyncAllCardCounts).
export const migrateToTierPricing = internalMutation({
  args: {},
  handler: async (ctx) => {
    let contracts = 0, leads = 0, affiliates = 0;
    for (const c of await ctx.db.query("shopContracts").collect()) {
      await ctx.db.patch(c._id, {
        tier:              c.tier ?? tierForCardCount(c.cardCount ?? 0),
        rewardCount:       undefined,
        discountCode:      undefined,
        firstYearDiscount: undefined,
        normalPrice:       undefined,
        discountedPrice:   undefined,
      });
      contracts++;
    }
    for (const l of await ctx.db.query("shopLeads").collect()) {
      if (l.rewardCount === undefined) continue;
      await ctx.db.patch(l._id, { rewardCount: undefined });
      leads++;
    }
    for (const a of await ctx.db.query("affiliates").collect()) {
      if (a.discountEligible === undefined) continue;
      await ctx.db.patch(a._id, { discountEligible: undefined });
      affiliates++;
    }
    return { contracts, leads, affiliates };
  },
});
