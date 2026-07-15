import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ── Affiliates ──────────────────────────────────────────────────────────────
  affiliates: defineTable({
    name:          v.string(),
    email:         v.string(),
    passwordHash:  v.string(),
    referralCode:  v.string(),          // z.B. "YN-4829", unique
    status:        v.union(
      v.literal("pending"),             // wartet auf Admin-Freigabe
      v.literal("active"),
      v.literal("suspended"),
    ),
    businessType:  v.optional(v.union(v.literal("private"), v.literal("business"))),
    // Kontakt
    phone:         v.optional(v.string()),
    // Adresse
    address:       v.optional(v.string()),  // Straße + Hausnummer
    zip:           v.optional(v.string()),
    city:          v.optional(v.string()),
    country:       v.optional(v.string()),
    // Rechtliches
    company:       v.optional(v.string()),  // Firmenname (falls Gewerbe)
    dateOfBirth:   v.optional(v.string()),  // TT.MM.JJJJ
    taxId:         v.optional(v.string()),  // Steuernummer
    vatId:         v.optional(v.string()),  // USt-IdNr.
    // Bank
    bankIban:      v.optional(v.string()),
    bankBic:       v.optional(v.string()),
    bankName:      v.optional(v.string()),
    notes:         v.optional(v.string()),
  })
    .index("by_email",        ["email"])
    .index("by_referralCode", ["referralCode"]),

  // ── ShopLeads ───────────────────────────────────────────────────────────────
  shopLeads: defineTable({
    affiliateId:   v.id("affiliates"),

    shopName:      v.string(),
    ownerName:     v.string(),
    ownerEmail:    v.string(),
    ownerPhone:    v.optional(v.string()),
    businessType:  v.optional(v.string()),
    city:          v.optional(v.string()),

    // wie kam der Lead rein?
    source:        v.union(
      v.literal("direct_form"),         // Affiliate hat Formular ausgefüllt
      v.literal("invite_link"),         // Inhaber hat Einladungslink genutzt
      v.literal("referral_link"),       // Inhaber hat sich selbst registriert
    ),

    status:        v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("active"),
    ),

    // Einladungslink-Token (Weg 2)
    inviteToken:       v.optional(v.string()),
    inviteExpiresAt:   v.optional(v.number()),   // Unix timestamp
    inviteAcceptedAt:  v.optional(v.number()),

    rejectionReason:   v.optional(v.string()),
    adminNotes:        v.optional(v.string()),

    // gesetzt nach Genehmigung
    loatycardShopId:       v.optional(v.string()),
    approvedAt:            v.optional(v.number()),
    approvedBy:            v.optional(v.string()),
    // gesetzt nach erster Zahlung (Shop wird automatisch angelegt)
    loatycardShopSlug:     v.optional(v.string()),
    loatycardAdminToken:   v.optional(v.string()),
  })
    .index("by_affiliate",   ["affiliateId"])
    .index("by_ownerEmail",  ["ownerEmail"])
    .index("by_status",      ["status"])
    .index("by_inviteToken", ["inviteToken"]),

  // ── ShopContracts ───────────────────────────────────────────────────────────
  shopContracts: defineTable({
    shopLeadId:    v.id("shopLeads"),
    affiliateId:   v.id("affiliates"),

    planType:      v.union(v.literal("annual"), v.literal("monthly")),
    contractStart: v.number(),
    status:        v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("paused"),
    ),

    paymentCount:  v.number(),
    canceledAt:    v.optional(v.number()),
    paymentToken:  v.optional(v.string()),   // für Zahlungslink-URL
  })
    .index("by_affiliate",     ["affiliateId"])
    .index("by_shopLead",      ["shopLeadId"])
    .index("by_paymentToken",  ["paymentToken"]),

  // ── Commissions ─────────────────────────────────────────────────────────────
  commissions: defineTable({
    affiliateId:     v.id("affiliates"),
    shopContractId:  v.id("shopContracts"),

    paymentNumber:   v.number(),         // die wievielte Zahlung (1, 2, 3, ...)
    phase:           v.union(
      v.literal("initial"),
      v.literal("year2"),
      v.literal("year3"),
      v.literal("year4_plus"),
    ),
    planType:        v.union(v.literal("annual"), v.literal("monthly")),

    rate:            v.number(),         // z.B. 0.20
    baseAmount:      v.number(),         // z.B. 389.00
    amount:          v.number(),         // berechnete Provision

    status:          v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("paid"),
      v.literal("canceled"),
    ),

    triggeredAt:     v.number(),         // wann Zahlung des Shops einging
    confirmedAt:     v.optional(v.number()),
    payoutId:        v.optional(v.id("payouts")),
  })
    .index("by_affiliate",    ["affiliateId"])
    .index("by_contract",     ["shopContractId"])
    .index("by_status",       ["status"])
    // Duplikat-Schutz: contract + paymentNumber muss unique sein
    .index("by_contract_payment", ["shopContractId", "paymentNumber"]),

  // ── Payouts ─────────────────────────────────────────────────────────────────
  payouts: defineTable({
    affiliateId:   v.id("affiliates"),
    amountTotal:   v.number(),
    status:        v.union(
      v.literal("processing"),
      v.literal("paid"),
    ),
    paidAt:        v.optional(v.number()),
    paymentRef:    v.optional(v.string()),
    notes:         v.optional(v.string()),
  })
    .index("by_affiliate", ["affiliateId"]),

  // ── AuditLog ────────────────────────────────────────────────────────────────
  auditLog: defineTable({
    entityType:    v.string(),           // "shopLead" | "commission" | "affiliate" | "contract"
    entityId:      v.string(),
    action:        v.string(),           // z.B. "status_changed", "commission_created"
    actorType:     v.union(v.literal("admin"), v.literal("affiliate"), v.literal("system")),
    actorId:       v.optional(v.string()),
    note:          v.optional(v.string()),
    metadata:      v.optional(v.string()), // JSON string für extra Infos
  })
    .index("by_entity", ["entityType", "entityId"]),

  // ── Affiliate-Invites ───────────────────────────────────────────────────────
  affiliateInvites: defineTable({
    token:       v.string(),
    createdAt:   v.number(),
    expiresAt:   v.number(),
    usedAt:      v.optional(v.number()),
    affiliateId: v.optional(v.id("affiliates")),
  })
    .index("by_token", ["token"]),

  // ── Admin-Sessions ──────────────────────────────────────────────────────────
  adminSessions: defineTable({
    token:         v.string(),
    createdAt:     v.number(),
    expiresAt:     v.number(),
  })
    .index("by_token", ["token"]),

  // ── Affiliate-Sessions ──────────────────────────────────────────────────────
  affiliateSessions: defineTable({
    affiliateId:   v.id("affiliates"),
    token:         v.string(),
    createdAt:     v.number(),
    expiresAt:     v.number(),
  })
    .index("by_token",     ["token"])
    .index("by_affiliate", ["affiliateId"]),
});
