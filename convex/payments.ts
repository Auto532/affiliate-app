import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveCommissionRule } from "./commissionEngine";
import { planPrice, contractTier, tierInfo, tierRangeLabel } from "./pricing";
import { escapeHtml } from "./htmlEscape";

// Provisions-Basis: "paid" = Provision auf tatsächlich gezahlten Betrag (Default),
// "full" = auf den vollen Listenpreis. Serverseitiger Flag, nie aus dem Client.
function commissionBase(): "paid" | "full" {
  return process.env.COMMISSION_BASE === "full" ? "full" : "paid";
}

const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY  ?? "";
const STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;
const APP_URL        = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL ?? "http://localhost:3000";
const TG_TOKEN       = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TG_CHAT_ID     = process.env.TELEGRAM_CHAT_ID   ?? "";

async function sendTelegram(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

// ── Öffentliche Query: Contract-Info für Zahlungsseite ────────────────────────

export const getByPaymentToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_paymentToken", q => q.eq("paymentToken", args.token))
      .unique();
    if (!contract) return null;
    const lead = await ctx.db.get(contract.shopLeadId);

    // Preis = aktuelle Stufe (nach Kundenzahl). Neue Shops starten mit 0 Kunden,
    // also Free (0 €): Der Inhaber hinterlegt nur IBAN/Karte, abgebucht wird
    // erst, wenn er in eine bezahlte Stufe wächst.
    const tier  = contractTier(contract);
    const price = planPrice(contract.planType, tier);

    return {
      contractId:   contract._id,
      planType:     contract.planType,
      shopName:     lead?.shopName ?? "LoyaltyCard Shop",
      ownerName:    lead?.ownerName ?? "",
      tier,
      tierName:     tierInfo(tier).name,
      tierRange:    tierRangeLabel(tier),
      cardCount:    contract.cardCount ?? 0,
      amount:       price,
      paymentCount: contract.paymentCount,
      // Bezahldaten schon hinterlegt / Shop freigeschaltet → kein zweiter Checkout
      activated:    !!contract.activatedAt || !!contract.stripeSubscriptionId,
      payLaterAt:   contract.payLaterAt ?? null,
      // "Später zahlen" gibt es nur bei Admin-Direkt-Shops
      canPayLater:  contract.isDirect === true && !contract.activatedAt,
    };
  },
});

// ── "Später zahlen": Shop-Inhaber merkt die Zahlung zum späteren Abschluss vor ─
// Der Link bleibt gültig; der Vertrag landet in der Admin-Shop-Übersicht
// (Kategorie "Zahlung offen") und der Admin bekommt eine Telegram-Nachricht.
// Es geht dabei bewusst KEINE Mail an den Inhaber raus, die Willkommens-Mail
// kommt erst mit der Freischaltung.

export const requestPayLater = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const contract = await ctx.db
      .query("shopContracts")
      .withIndex("by_paymentToken", q => q.eq("paymentToken", args.token))
      .unique();
    if (!contract)                    throw new ConvexError("Ungültiger Zahlungslink");
    if (contract.status !== "active") throw new ConvexError("Vertrag ist nicht aktiv");
    if (contract.activatedAt)         throw new ConvexError("Bereits freigeschaltet");
    // Nur bei Admin-Direkt-Shops: Partner-Shops hinterlegen direkt beim Abschluss.
    if (!contract.isDirect)           throw new ConvexError("Nicht verfügbar");
    if (contract.payLaterAt) return { alreadySet: true };

    await ctx.db.patch(contract._id, { payLaterAt: Date.now() });

    const lead   = await ctx.db.get(contract.shopLeadId);
    const amount = planPrice(contract.planType, contractTier(contract));

    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   contract._id,
      action:     "pay_later_requested",
      actorType:  "system",
      note:       `Vom Shop-Inhaber gewählt · ${lead?.shopName ?? "—"} · €${amount}`,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.notifyPayLater, {
      shopName:  lead?.shopName ?? "—",
      ownerName: lead?.ownerName ?? "—",
      amount,
      planType:  contract.planType,
    });

    return { alreadySet: false };
  },
});

// ── Freischaltung (gemeinsamer Kern) ──────────────────────────────────────────
// Ein Vertrag wird freigeschaltet, sobald der Inhaber seine Bezahldaten bei
// Stripe hinterlegt hat (Checkout abgeschlossen), bzw. wenn der Admin ihn
// manuell aktiviert (Überweisung, Test-Freischaltung). Ab dann ist der Shop
// live und der Inhaber bekommt die Willkommens-Mail. Geld fließt erst mit den
// monatlichen Stripe-Rechnungen (recordPaymentCore); Provision gibt es nur
// für echte Zahlungen > 0 €. Idempotent: zweiter Aufruf tut nichts.

export async function activateContractCore(
  ctx: MutationCtx,
  args: {
    shopContractId: Id<"shopContracts">;
    method: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
  },
): Promise<{ activated: boolean; duplicateSubscription?: boolean; orphanSubscription?: boolean }> {
  const contract = await ctx.db.get(args.shopContractId);
  // Vertrag inzwischen gelöscht oder gekündigt → das neue Abo gehört zu nichts
  if (!contract || contract.status !== "active") {
    return { activated: false, orphanSubscription: !!args.stripeSubscriptionId };
  }

  // Hat der Vertrag schon ein ANDERES Abo, ist das neue ein Doppel (z. B. zwei
  // Checkout-Tabs). Nicht überschreiben, der Webhook kündigt das neue Abo.
  if (args.stripeSubscriptionId && contract.stripeSubscriptionId
      && contract.stripeSubscriptionId !== args.stripeSubscriptionId) {
    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   contract._id,
      action:     "duplicate_subscription",
      actorType:  "system",
      note:       `Zweites Stripe-Abo ${args.stripeSubscriptionId} erkannt und gekündigt (bestehend: ${contract.stripeSubscriptionId})`,
    });
    return { activated: false, duplicateSubscription: true };
  }

  if (args.stripeSubscriptionId && args.stripeCustomerId) {
    await ctx.db.patch(contract._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId:     args.stripeCustomerId,
    });
  }
  if (contract.activatedAt) return { activated: false };

  await ctx.db.patch(contract._id, { activatedAt: Date.now() });
  await ctx.db.insert("auditLog", {
    entityType: "shopContract",
    entityId:   contract._id,
    action:     "contract_activated",
    actorType:  "system",
    note:       `Freigeschaltet via ${args.method}`,
  });

  const lead = await ctx.db.get(contract.shopLeadId);
  const tier = contractTier(contract);
  if (lead?.ownerEmail) {
    await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
      ownerEmail: lead.ownerEmail,
      ownerName:  lead.ownerName || "Inhaber",
      shopName:   lead.shopName || "Dein Shop",
      tier,
    });
  }
  // Shop in der Stempelkarten-App anlegen (+ Telegram "Neuer Shop ist live")
  await ctx.scheduler.runAfter(0, internal.payments.provisionShop, { shopContractId: contract._id });
  return { activated: true };
}

export const activateContract = internalMutation({
  args: {
    shopContractId:       v.id("shopContracts"),
    method:               v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripeCustomerId:     v.optional(v.string()),
  },
  handler: async (ctx, args) => activateContractCore(ctx, args),
});

// ── Zahlung erfassen (gemeinsamer Kern) ───────────────────────────────────────
// EINZIGER Pfad für alle Zahlungseingänge: Stripe-Webhook (invoice.paid),
// Test-Zahlung und manuelle Erfassung im Admin (admin.recordPayment) laufen
// alle hier durch. Damit gelten Idempotenz, Direktvertrieb-0%, Deckelung,
// Mail und Telegram überall identisch.

export type RecordPaymentResult = {
  paymentNumber: number;
  amount:        number;   // Provision
  rate:          number;
  phase:         string;
  paidAmount:    number;   // tatsächlich eingenommener Betrag
} | null;

export async function recordPaymentCore(
  ctx: MutationCtx,
  args: {
    shopContractId: Id<"shopContracts">;
    paymentRef: string;
    method: string;
    // Echter Betrag laut Stripe-Rechnung. Fehlt (manuell/Test) = Listenpreis der Stufe.
    paidAmount?: number;
  },
): Promise<RecordPaymentResult> {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract || contract.status !== "active") return null;

    // Idempotenz auf der Zahlungs-Referenz: Stripe liefert Webhook-Events
    // garantiert mindestens einmal (oft doppelt). Ohne diesen Check würde eine
    // zweite Zustellung derselben Zahlung eine zweite Provision erzeugen.
    const alreadyProcessed = await ctx.db
      .query("commissions")
      .withIndex("by_paymentRef", q => q.eq("paymentRef", args.paymentRef))
      .first();
    if (alreadyProcessed) return null;

    const tier      = contractTier(contract);
    const listPrice = planPrice(contract.planType, tier);
    const paidAmount = Math.round((args.paidAmount ?? listPrice) * 100) / 100;
    // Free-Rechnungen (0 €) sind keine Zahlung: keine Provision, kein Zähler.
    if (paidAmount <= 0) return null;

    const newCount = contract.paymentCount + 1;

    const existing = await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q =>
        q.eq("shopContractId", args.shopContractId).eq("paymentNumber", newCount)
      )
      .unique();
    if (existing) return null;

    const rule = resolveCommissionRule(contract.planType, newCount); // liefert phase + rate

    // Direktvertrieb (Admin-Shop ohne Partner): immer Rate 0 — die
    // Commission-Row dient nur der Umsatz-Erfassung.
    const rate = contract.isDirect ? 0 : rule.rate;

    // Provisions-Basis per Flag: "paid" (Default) = gezahlter Betrag,
    // "full" = Listenpreis der Stufe. Immer aus Server-Werten, nie aus Client-Input.
    const base = commissionBase() === "full" ? listPrice : paidAmount;
    let amount = Math.round(base * rate * 100) / 100;

    // Sicherung: Provision darf nie höher sein als der tatsächlich eingenommene Betrag
    // (kein Minusgeschäft pro Sale). Falls doch → deckeln + loggen.
    let capped = false;
    if (amount > paidAmount) {
      capped = true;
      amount = paidAmount;
    }

    const commissionId = await ctx.db.insert("commissions", {
      affiliateId:    contract.affiliateId,
      shopContractId: args.shopContractId,
      paymentNumber:  newCount,
      phase:          rule.phase,
      planType:       contract.planType,
      rate,
      baseAmount:     base,
      amount,
      status:         "pending",
      triggeredAt:    Date.now(),
      paymentRef:     args.paymentRef,
      paidAmount,
      commissionBase: commissionBase(),
    });

    await ctx.db.patch(args.shopContractId, { paymentCount: newCount });

    await ctx.db.insert("auditLog", {
      entityType: "commission",
      entityId:   commissionId,
      action:     "auto_payment",
      actorType:  "system",
      note:       `${args.method} · Ref: ${args.paymentRef} · #${newCount} · ${tierInfo(tier).name} · gezahlt €${paidAmount} · Provision €${amount} (${commissionBase()})`,
    });

    if (capped) {
      console.warn(`[commission-cap] Provision auf €${amount} gedeckelt (paidAmount €${paidAmount}), contract ${args.shopContractId} #${newCount}`);
      await ctx.db.insert("auditLog", {
        entityType: "commission",
        entityId:   commissionId,
        action:     "commission_capped",
        actorType:  "system",
        note:       `Provision auf gezahlten Betrag €${paidAmount} gedeckelt (kein Minusgeschäft)`,
      });
    }

    // Zahlungsbestätigung an den Inhaber
    const lead = await ctx.db.get(contract.shopLeadId);
    if (lead?.ownerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendPaymentConfirmationEmail, {
        ownerEmail: lead.ownerEmail,
        ownerName:  lead.ownerName || "Inhaber",
        shopName:   lead.shopName || "Dein Shop",
        planType:   contract.planType,
        tier,
        totalPaid:  paidAmount,
      });
    }

    await ctx.scheduler.runAfter(0, internal.notifications.notifyPaymentReceived, {
      shopName:         lead?.shopName ?? "—",
      ownerName:        lead?.ownerName ?? "—",
      amount:           paidAmount,
      paymentNumber:    newCount,
      planType:         contract.planType,
      isDirect:         contract.isDirect === true,
      commissionAmount: amount,
      commissionRate:   rate,
      wasPayLater:      newCount === 1 && !!contract.payLaterAt,
    });

    return { paymentNumber: newCount, amount, rate, phase: rule.phase, paidAmount };
}

export const autoRecordPayment = internalMutation({
  args: {
    shopContractId: v.id("shopContracts"),
    paymentRef:     v.string(),
    method:         v.string(),
    paidAmount:     v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RecordPaymentResult> => recordPaymentCore(ctx, args),
});

export const cancelContractByStripe = internalMutation({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shopContractId, { status: "canceled", canceledAt: Date.now() });
  },
});

export const contractAcceptsSubscription = internalQuery({
  args: { shopContractId: v.string(), stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("shopContracts", args.shopContractId);
    const contract = id ? await ctx.db.get(id) : null;
    if (!contract || contract.status !== "active") return false;
    return !contract.stripeSubscriptionId || contract.stripeSubscriptionId === args.stripeSubscriptionId;
  },
});

export const getContractBySubscriptionId = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("shopContracts")
      .withIndex("by_stripeSubscriptionId", q => q.eq("stripeSubscriptionId", args.stripeSubscriptionId))
      .unique();
  },
});

export const getLeadForContract = internalQuery({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract) return null;
    const lead = await ctx.db.get(contract.shopLeadId);
    if (!lead) return null;
    const affiliate = await ctx.db.get(contract.affiliateId);
    return {
      leadId:           lead._id,
      shopName:         lead.shopName,
      ownerName:        lead.ownerName,
      ownerEmail:       lead.ownerEmail,
      ownerPhone:       lead.ownerPhone,
      city:             lead.city,
      businessType:     lead.businessType,
      loatycardShopId:  lead.loatycardShopId,
      planType:         contract.planType,
      tier:             contractTier(contract),
      isDirect:         contract.isDirect === true,
      affiliateName:    affiliate?.name ?? null,
      affiliateCode:    affiliate?.referralCode ?? null,
    };
  },
});

export const patchLeadAfterProvision = internalMutation({
  args: {
    leadId:              v.id("shopLeads"),
    loatycardShopId:     v.string(),
    loatycardShopSlug:   v.string(),
    loatycardAdminToken: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      status:              "active",
      approvedAt:          Date.now(),
      loatycardShopId:     args.loatycardShopId,
      loatycardShopSlug:   args.loatycardShopSlug,
      loatycardAdminToken: args.loatycardAdminToken,
    });
  },
});

export const provisionShop = internalAction({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args): Promise<void> => {
    const lead = await ctx.runQuery(internal.payments.getLeadForContract, { shopContractId: args.shopContractId });
    if (!lead || lead.loatycardShopId) return; // bereits provisioniert

    const siteUrl = process.env.STEMPELKARTEN_CONVEX_SITE_URL ?? "";
    const secret  = process.env.BRIDGE_SECRET ?? "";
    // Schlägt die Anlage fehl, ist der Vertrag trotzdem freigeschaltet →
    // Admin sofort informieren, damit der Shop von Hand angelegt wird.
    const fail = (why: string) => sendTelegram(
      `❗ <b>Shop-Anlage fehlgeschlagen</b>\n\n<b>Shop:</b> ${escapeHtml(lead.shopName)}\n` +
      `<b>Grund:</b> ${escapeHtml(why)}\n\nVertrag ist freigeschaltet, bitte Shop manuell anlegen.`
    );
    if (!siteUrl || !secret) { await fail("Brücke nicht konfiguriert"); return; }

    const res = await fetch(`${siteUrl}/provision-shop`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ secret, shopName: lead.shopName, affiliateLeadId: lead.leadId }),
    }).catch(() => null);
    if (!res || !res.ok) { await fail(res ? `HTTP ${res.status}` : "nicht erreichbar"); return; }

    const { shopId, slug, adminLoginToken } = await res.json();
    await ctx.runMutation(internal.payments.patchLeadAfterProvision, {
      leadId:              lead.leadId,
      loatycardShopId:     shopId,
      loatycardShopSlug:   slug,
      loatycardAdminToken: adminLoginToken,
    });

    const t = tierInfo(lead.tier);
    const planLabel  = `${t.name} (€${t.monthly}/Monat, ${tierRangeLabel(lead.tier)})`;
    const phoneLine  = lead.ownerPhone  ? `\n📞 <b>Telefon:</b> ${escapeHtml(lead.ownerPhone)}`   : "";
    const cityLine   = lead.city        ? `\n📍 <b>Stadt:</b> ${escapeHtml(lead.city)}`            : "";
    const branchLine = lead.businessType ? `\n🏷 <b>Branche:</b> ${escapeHtml(lead.businessType)}` : "";
    const partnerLine = lead.isDirect
      ? `\n🤝 <b>Verkauft von:</b> Direktvertrieb`
      : `\n🤝 <b>Verkauft von:</b> ${escapeHtml(lead.affiliateName ?? "—")}` +
        (lead.affiliateCode ? ` (${escapeHtml(lead.affiliateCode)})` : "");

    await sendTelegram(
      `🏪 <b>Neuer Shop ist live!</b>\n\n` +
      `<b>Shop:</b> ${escapeHtml(lead.shopName)}\n` +
      `<b>Slug:</b> ${escapeHtml(slug)}\n` +
      `<b>Shop-ID:</b> <code>${shopId}</code>\n\n` +
      `<b>Tarif:</b> ${planLabel}\n\n` +
      `👤 <b>Inhaber:</b> ${escapeHtml(lead.ownerName)}\n` +
      `✉️ <b>E-Mail:</b> ${escapeHtml(lead.ownerEmail)}` +
      phoneLine + cityLine + branchLine + partnerLine +
      `\n\n⚙️ Design &amp; Bonusprogramm einrichten nicht vergessen!`
    );
  },
});

// ── Stufenwechsel → Stripe-Abo anpassen ───────────────────────────────────────
// Wird von admin.syncCardCountForShop angestoßen, wenn ein Shop über (oder
// unter) eine Kartengrenze rutscht. Neuer Preis gilt ab der NÄCHSTEN Rechnung
// (proration_behavior "none" = keine anteilige Verrechnung im laufenden Monat).

export const getContractForStripeUpdate = internalQuery({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract) return null;
    return {
      status:               contract.status,
      planType:             contract.planType,
      tier:                 contractTier(contract),
      stripeSubscriptionId: contract.stripeSubscriptionId ?? null,
    };
  },
});

export const updateStripeTier = internalAction({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args): Promise<void> => {
    const c = await ctx.runQuery(internal.payments.getContractForStripeUpdate, args);
    if (!c || c.status !== "active" || !c.stripeSubscriptionId || !STRIPE_SECRET) return;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: STRIPE_API_VERSION });

    const sub  = await stripe.subscriptions.retrieve(c.stripeSubscriptionId);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") return;
    const [item, ...extra] = sub.items.data;
    if (!item) return;
    const unitAmount = Math.round(planPrice(c.planType, c.tier) * 100);
    // Schon richtig (und keine Altlast-Positionen wie früherer Bonus-Aufpreis) → nichts tun
    if (item.price.unit_amount === unitAmount && extra.length === 0) return;

    // Wechsel von 0 € auf einen Preis: Stripe würde sonst sofort abrechnen und
    // den Abrechnungstag verschieben. Mit einer Gratisphase bis zum Ende der
    // laufenden Periode gilt der neue Preis erst ab der nächsten Abrechnung.
    const fromFree = (item.price.unit_amount ?? 0) === 0 && unitAmount > 0;
    const periodEnd = item.current_period_end;
    const deferToPeriodEnd = fromFree && periodEnd > Math.floor(Date.now() / 1000) + 60;

    const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
    await stripe.subscriptions.update(c.stripeSubscriptionId, {
      items: [
        {
          id: item.id,
          price_data: {
            currency:    "eur",
            product,
            unit_amount: unitAmount,
            recurring:   { interval: c.planType === "annual" ? "year" : "month" },
          },
        },
        // Weitere Positionen (z. B. alter Bonus-Aufpreis) entfernen
        ...extra.map(x => ({ id: x.id, deleted: true as const })),
      ],
      proration_behavior: "none",
      ...(deferToPeriodEnd ? { trial_end: periodEnd } : {}),
      metadata: { tier: c.tier },
    });
  },
});

// ── Stripe: Checkout-Session erstellen ────────────────────────────────────────
// Immer Abo (monatlich), Zahlart SEPA-Lastschrift oder Karte. Neue Shops
// starten in Free (0 €): Stripe sammelt dann nur IBAN/Karte + SEPA-Mandat ein,
// abgebucht wird erst ab einer bezahlten Stufe.

export const createStripeCheckout = action({
  args: { paymentToken: v.string() },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    if (!STRIPE_SECRET) throw new ConvexError("Online-Zahlung ist noch nicht eingerichtet");
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(STRIPE_SECRET, { apiVersion: STRIPE_API_VERSION });

    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new ConvexError("Ungültiger Zahlungslink");
    if (info.activated) throw new ConvexError("Bezahldaten sind bereits hinterlegt");

    // Noch offene Sitzung desselben Vertrags (gleicher Preis) wiederverwenden,
    // statt eine zweite anzulegen → kein Doppel-Abo durch mehrere Tabs/Klicks.
    const previous: string | null = await ctx.runQuery(internal.payments.getCheckoutSessionId, { shopContractId: info.contractId });
    if (previous) {
      const old = await stripe.checkout.sessions.retrieve(previous).catch(() => null);
      if (old && old.status === "open" && old.url && old.amount_total === Math.round(info.amount * 100)) {
        return { url: old.url };
      }
      if (old && old.status === "complete") throw new ConvexError("Bezahldaten sind bereits hinterlegt");
      if (old && old.status === "open") await stripe.checkout.sessions.expire(previous).catch(() => {});
    }

    const lead = await ctx.runQuery(internal.payments.getLeadForContract, { shopContractId: info.contractId });

    // Stabiler Idempotenzschlüssel: parallele Aufrufe mit gleichem Stand
    // bekommen von Stripe dieselbe Sitzung zurück statt zwei neue.
    const idempotencyKey = `checkout-${info.contractId}-${previous ?? "first"}-${Math.round(info.amount * 100)}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card", "sepa_debit"],
      locale: "de",
      ...(lead?.ownerEmail ? { customer_email: lead.ownerEmail } : {}),
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: "LoyaltyCard Abo", description: info.shopName },
          unit_amount: Math.round(info.amount * 100),
          recurring: { interval: info.planType === "annual" ? "year" : "month" },
        },
        quantity: 1,
      }],
      subscription_data: { metadata: { contractId: info.contractId, tier: info.tier } },
      success_url: `${APP_URL}/pay/success?method=stripe`,
      cancel_url:  `${APP_URL}/pay/${args.paymentToken}`,
      metadata: { contractId: info.contractId },
    }, { idempotencyKey });
    if (session.status !== "open") throw new ConvexError("Bitte Seite neu laden und erneut versuchen");
    await ctx.runMutation(internal.payments.setCheckoutSessionId, {
      shopContractId: info.contractId,
      sessionId:      session.id,
    });
    return { url: session.url };
  },
});

export const getCheckoutSessionId = internalQuery({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args) => (await ctx.db.get(args.shopContractId))?.stripeCheckoutSessionId ?? null,
});

export const setCheckoutSessionId = internalMutation({
  args: { shopContractId: v.id("shopContracts"), sessionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shopContractId, { stripeCheckoutSessionId: args.sessionId });
  },
});

// ── Stripe: Webhook (in http.ts eingebunden) ──────────────────────────────────
// Benötigte Events im Stripe-Dashboard: checkout.session.completed,
// invoice.paid, invoice.payment_failed, customer.subscription.deleted.

// Vertrag zu einer Rechnung: über die gespeicherte Abo-ID, sonst über die
// Vertragsnummer in den Abo-Metadaten (beim Checkout gesetzt).
async function resolveContractId(ctx: any, invoice: any, subscriptionId: string): Promise<Id<"shopContracts"> | null> {
  const contract = await ctx.runQuery(internal.payments.getContractBySubscriptionId, { stripeSubscriptionId: subscriptionId });
  if (contract) return contract._id;
  const fromMeta = invoice?.parent?.subscription_details?.metadata?.contractId;
  if (!fromMeta) return null;
  // Nur zuordnen, wenn der Vertrag noch kein (anderes) Abo hat, sonst könnte
  // ein Doppel-Abo eine Provision auslösen.
  const ok = await ctx.runQuery(internal.payments.contractAcceptsSubscription, {
    shopContractId: fromMeta, stripeSubscriptionId: subscriptionId,
  });
  return ok ? fromMeta : null;
}

// Ab API-Version 2025-03 steht die Abo-ID unter parent.subscription_details.
function invoiceSubscriptionId(invoice: any): string | undefined {
  const fromParent = invoice?.parent?.subscription_details?.subscription;
  const id = fromParent ?? invoice?.subscription;
  if (!id) return undefined;
  return typeof id === "string" ? id : id.id;
}

export const handleStripeWebhook = action({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(STRIPE_SECRET, { apiVersion: STRIPE_API_VERSION });

    let event;
    try {
      event = stripe.webhooks.constructEvent(args.payload, args.signature, STRIPE_WEBHOOK);
    } catch {
      throw new ConvexError("Webhook-Signatur ungültig");
    }

    // Checkout fertig = Bezahldaten + SEPA-Mandat hinterlegt → Shop freischalten.
    // Geld wird hier NICHT gebucht (bei Lastschrift kommt es erst Tage später);
    // das passiert ausschließlich über invoice.paid.
    if (event.type === "checkout.session.completed") {
      const session    = event.data.object as any;
      const contractId = session.metadata?.contractId;
      if (session.mode !== "subscription" || !contractId || !session.subscription || session.status !== "complete") return;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const result = await ctx.runMutation(internal.payments.activateContract, {
        shopContractId:       contractId,
        method:               "stripe-checkout",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId:     typeof session.customer === "string" ? session.customer : session.customer?.id,
      });
      if (result.duplicateSubscription || result.orphanSubscription) {
        // Kein catch: schlägt die Kündigung fehl, antwortet der Webhook mit
        // Fehler und Stripe stellt das Ereignis erneut zu (Aktivierung ist idempotent).
        await stripe.subscriptions.cancel(subscriptionId);
        await sendTelegram(
          `⚠️ <b>Stripe-Abo automatisch gekündigt</b>\n\nAbo <code>${escapeHtml(subscriptionId)}</code> ` +
          (result.duplicateSubscription
            ? "war ein zweites Abo für denselben Vertrag."
            : "gehört zu einem gelöschten oder gekündigten Vertrag.") +
          ` Bitte im Stripe-Dashboard prüfen, ob schon etwas abgebucht wurde.`
        );
      }
      return;
    }

    // Rechnung wirklich bezahlt (bei SEPA erst nach Geldeingang) → Zahlung +
    // Provision erfassen. 0-€-Rechnungen (Free) ignoriert recordPaymentCore.
    if (event.type === "invoice.paid") {
      const invoice        = event.data.object as any;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return;

      // Stripe garantiert keine Reihenfolge: kommt invoice.paid vor
      // checkout.session.completed, ist die Abo-ID noch nicht gespeichert.
      // Dann über die Vertragsnummer in den Abo-Metadaten zuordnen.
      const contractId = await resolveContractId(ctx, invoice, subscriptionId);
      if (!contractId) return; // kein LoyaltyCard-Vertrag (z. B. anderes Produkt im selben Stripe-Konto)

      await ctx.runMutation(internal.payments.autoRecordPayment, {
        shopContractId: contractId,
        paymentRef:     invoice.id as string,
        method:         "stripe",
        paidAmount:     Number(invoice.amount_paid ?? 0) / 100,
      });
      return;
    }

    // Abbuchung fehlgeschlagen (z. B. Lastschrift zurückgegeben, Karte abgelehnt).
    // Stripe versucht es automatisch erneut; der Admin wird informiert.
    if (event.type === "invoice.payment_failed") {
      const invoice        = event.data.object as any;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return;
      const contract = await ctx.runQuery(internal.payments.getContractBySubscriptionId, {
        stripeSubscriptionId: subscriptionId,
      });
      if (!contract) return;
      await ctx.runMutation(internal.payments.logPaymentFailed, {
        shopContractId: contract._id,
        invoiceId:      invoice.id as string,
        amount:         Number(invoice.amount_due ?? 0) / 100,
        attempt:        Number(invoice.attempt_count ?? 1),
      });
      return;
    }

    // Abo beendet (gekündigt oder nach allen Fehlversuchen)
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      const contract = await ctx.runQuery(internal.payments.getContractBySubscriptionId, {
        stripeSubscriptionId: sub.id as string,
      });
      if (contract) {
        await ctx.runMutation(internal.payments.cancelContractByStripe, { shopContractId: contract._id });
      }
    }
  },
});

export const logPaymentFailed = internalMutation({
  args: {
    shopContractId: v.id("shopContracts"),
    invoiceId:      v.string(),
    amount:         v.number(),
    attempt:        v.number(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract) return;
    const lead = await ctx.db.get(contract.shopLeadId);
    await ctx.db.insert("auditLog", {
      entityType: "shopContract",
      entityId:   contract._id,
      action:     "payment_failed",
      actorType:  "system",
      note:       `Stripe-Abbuchung fehlgeschlagen · Rechnung ${args.invoiceId} · €${args.amount} · Versuch ${args.attempt}`,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.notifyPaymentFailed, {
      shopName:  lead?.shopName ?? "—",
      ownerName: lead?.ownerName ?? "—",
      amount:    args.amount,
      attempt:   args.attempt,
    });
  },
});
