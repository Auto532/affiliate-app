import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ── Affiliates ──────────────────────────────────────────────────────────────
  affiliates: defineTable({
    name:          v.string(),
    email:         v.string(),
    passwordHash:  v.string(),
    passwordSalt:  v.optional(v.string()),  // gesetzt = gesalzener PBKDF2-Hash (C3); fehlt = Legacy-SHA-256
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
    // Rabatt: nur wenn der Admin diesen Partner freigeschaltet hat, greifen Rabattcodes
    // für seine Shops (bewusst NICHT automatisch — siehe convex/discounts.ts).
    discountEligible: v.optional(v.boolean()),
    // Freigabepflichtige Profiländerung (sensible Felder), wartet auf Admin-Freigabe.
    pendingProfile: v.optional(v.object({
      name:        v.optional(v.string()),
      company:     v.optional(v.string()),
      businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
      taxId:       v.optional(v.string()),
      vatId:       v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      bankIban:    v.optional(v.string()),
      bankBic:     v.optional(v.string()),
      bankName:    v.optional(v.string()),
      submittedAt: v.number(),
    })),
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
      v.literal("admin_direct"),        // Admin hat den Shop direkt angelegt (ohne Partner)
    ),

    status:        v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("pending_payment"),
      v.literal("active"),
    ),

    // Einladungslink-Token (Weg 2)
    inviteToken:       v.optional(v.string()),
    inviteExpiresAt:   v.optional(v.number()),   // Unix timestamp
    inviteAcceptedAt:  v.optional(v.number()),

    wantsDesign:       v.optional(v.boolean()),   // Legacy — Design ist jetzt immer inklusive (99 € Einrichtung)
    wantsBonusStamps:  v.optional(v.boolean()),   // Legacy — abgelöst durch rewardCount
    // Anzahl Bonus-Belohnungen (5 €/Monat pro Belohnung), bei Vertragsanlage gewählt
    rewardCount:       v.optional(v.number()),

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
    paymentToken:  v.optional(v.string()),

    // Anzahl Bonus-Belohnungen: 5 €/Monat pro Belohnung auf jeder Rechnung
    // (Jahresabo: 60 €/Jahr pro Belohnung). Fehlt = 0.
    rewardCount:   v.optional(v.number()),

    // Direktvertrieb: Vertrag wurde vom Admin ohne Partner angelegt.
    // Zahlungen erzeugen weiterhin Commission-Rows (für den Umsatz in den
    // Finanzen), aber mit Rate 0 — es gibt keinen Partner, der Provision bekommt.
    isDirect:      v.optional(v.boolean()),

    // Rabatt auf das erste Jahr (Testmodus). An die ERSTE Abrechnungsperiode
    // gekoppelt (paymentNumber === 1) → bildet später Stripe coupon duration:"once" ab.
    // Ab Zahlung 2 (Verlängerung) gilt automatisch normalPrice.
    discountCode:      v.optional(v.string()),
    firstYearDiscount: v.optional(v.number()),  // z.B. 0.5
    normalPrice:       v.optional(v.number()),  // Listenpreis
    discountedPrice:   v.optional(v.number()),  // tatsächlich zu zahlen (Jahr 1)

    // Stripe Subscription (wird gesetzt sobald STRIPE_SUBSCRIPTION_MODE aktiv)
    stripeSubscriptionId: v.optional(v.string()),
    stripeCustomerId:     v.optional(v.string()),
  })
    .index("by_affiliate",            ["affiliateId"])
    .index("by_shopLead",             ["shopLeadId"])
    .index("by_paymentToken",         ["paymentToken"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

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
    baseAmount:      v.number(),         // Abo-Anteil als Provisions-Basis, z.B. 360.00
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
    // Referenz der auslösenden Zahlung (Stripe invoice/payment_intent, PayPal capture)
    // — Grundlage für Replay-/Doppelverarbeitungs-Schutz
    paymentRef:      v.optional(v.string()),
    // Tatsächlich eingenommener Betrag dieser Zahlung (nach Rabatt) + Basis der
    // Provisionsberechnung. Provision ist auf paidAmount gedeckelt (kein Minusgeschäft).
    paidAmount:      v.optional(v.number()),
    commissionBase:  v.optional(v.union(v.literal("paid"), v.literal("full"))),
  })
    .index("by_affiliate",    ["affiliateId"])
    .index("by_contract",     ["shopContractId"])
    .index("by_status",       ["status"])
    // Duplikat-Schutz: contract + paymentNumber muss unique sein
    .index("by_contract_payment", ["shopContractId", "paymentNumber"])
    // Idempotenz-Schutz gegen doppelte Webhook-/Capture-Zustellungen
    .index("by_paymentRef",   ["paymentRef"]),

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

  // ── Support-Anfragen (Partner → Admin, Telegram-Benachrichtigung) ───────────
  // Admin kann antworten (reply) — der Partner sieht Antwort + Status in der App.
  supportTickets: defineTable({
    affiliateId: v.id("affiliates"),
    message:     v.string(),
    contact:     v.optional(v.string()),
    status:      v.union(v.literal("open"), v.literal("done")),
    // Legacy-Einzelantwort (vor Thread-Umbau) — wird beim Anzeigen in den Thread gemerged
    reply:       v.optional(v.string()),
    repliedAt:   v.optional(v.number()),
    // Konversation: alle Nachrichten NACH der Erstnachricht (message-Feld)
    thread:      v.optional(v.array(v.object({
      from: v.union(v.literal("user"), v.literal("admin")),
      text: v.string(),
      at:   v.number(),
    }))),
    createdAt:   v.number(),
  }).index("by_status", ["status"]).index("by_affiliate", ["affiliateId"]),

  // ── Auth-Throttle (Brute-Force-Schutz, C2) ───────────────────────────────────
  authThrottle: defineTable({
    key:         v.string(),           // z.B. "login:mail@x.de"
    count:       v.number(),           // Fehlversuche im aktuellen Fenster
    windowStart: v.number(),
    lockedUntil: v.optional(v.number()),
  })
    .index("by_key", ["key"]),
});
