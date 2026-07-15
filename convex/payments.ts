import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveCommissionRule } from "./commissionEngine";
import { planPrice } from "./pricing";

const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY  ?? "";
const STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const PP_CLIENT_ID   = process.env.PAYPAL_CLIENT_ID   ?? "";
const PP_SECRET      = process.env.PAYPAL_CLIENT_SECRET ?? "";
const APP_URL        = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL ?? "http://localhost:3000";
const PAYPAL_BASE    = "https://api-m.paypal.com";
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
    return {
      contractId: contract._id,
      planType:   contract.planType,
      shopName:   lead?.shopName ?? "Loatycard Shop",
      ownerName:  lead?.ownerName ?? "",
      amount:     planPrice(contract.planType),
      paymentCount: contract.paymentCount,
    };
  },
});

// ── Interne Mutation: Zahlung automatisch erfassen ────────────────────────────

export const autoRecordPayment = internalMutation({
  args: {
    shopContractId: v.id("shopContracts"),
    paymentRef:     v.string(),
    method:         v.string(),
  },
  handler: async (ctx, args): Promise<{ paymentNumber: number } | null> => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract || contract.status !== "active") return null;

    // Idempotenz auf der Zahlungs-Referenz: Stripe liefert Webhook-Events
    // garantiert mindestens einmal (oft doppelt). Ohne diesen Check würde eine
    // zweite Zustellung derselben Zahlung eine zweite Provision erzeugen, weil
    // paymentCount bereits erhöht wurde und der (contract,paymentNumber)-Check
    // dann nicht mehr greift.
    const alreadyProcessed = await ctx.db
      .query("commissions")
      .withIndex("by_paymentRef", q => q.eq("paymentRef", args.paymentRef))
      .first();
    if (alreadyProcessed) return null;

    const newCount = contract.paymentCount + 1;

    const existing = await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q =>
        q.eq("shopContractId", args.shopContractId).eq("paymentNumber", newCount)
      )
      .unique();
    if (existing) return null;

    const rule = resolveCommissionRule(contract.planType, newCount);

    const commissionId = await ctx.db.insert("commissions", {
      affiliateId:    contract.affiliateId,
      shopContractId: args.shopContractId,
      paymentNumber:  newCount,
      phase:          rule.phase,
      planType:       contract.planType,
      rate:           rule.rate,
      baseAmount:     rule.baseAmount,
      amount:         rule.amount,
      status:         "pending",
      triggeredAt:    Date.now(),
      paymentRef:     args.paymentRef,
    });

    await ctx.db.patch(args.shopContractId, { paymentCount: newCount });

    await ctx.db.insert("auditLog", {
      entityType: "commission",
      entityId:   commissionId,
      action:     "auto_payment",
      actorType:  "system",
      note:       `${args.method} · Ref: ${args.paymentRef} · #${newCount} · €${rule.amount}`,
    });

    return { paymentNumber: newCount };
  },
});

export const cancelContractByStripe = internalMutation({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shopContractId, { status: "canceled", canceledAt: Date.now() });
  },
});

export const patchContractStripeIds = internalMutation({
  args: {
    shopContractId:       v.id("shopContracts"),
    stripeSubscriptionId: v.string(),
    stripeCustomerId:     v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shopContractId, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId:     args.stripeCustomerId,
    });
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
    const adminPin = process.env.ADMIN_SECRET ?? "";
    if (!siteUrl) return;

    const res = await fetch(`${siteUrl}/provision-shop`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ adminPin, shopName: lead.shopName, affiliateLeadId: lead.leadId }),
    });
    if (!res.ok) return;

    const { shopId, slug, adminLoginToken } = await res.json();
    await ctx.runMutation(internal.payments.patchLeadAfterProvision, {
      leadId:              lead.leadId,
      loatycardShopId:     shopId,
      loatycardShopSlug:   slug,
      loatycardAdminToken: adminLoginToken,
    });

    const planLabel  = lead.planType === "annual" ? `Jahresabo (€${planPrice("annual")})` : `Monatsabo (€${planPrice("monthly")})`;
    const phoneLine  = lead.ownerPhone  ? `\n📞 <b>Telefon:</b> ${lead.ownerPhone}`   : "";
    const cityLine   = lead.city        ? `\n📍 <b>Stadt:</b> ${lead.city}`            : "";
    const branchLine = lead.businessType ? `\n🏷 <b>Branche:</b> ${lead.businessType}` : "";

    await sendTelegram(
      `🏪 <b>Neuer Shop ist live!</b>\n\n` +
      `<b>Shop:</b> ${lead.shopName}\n` +
      `<b>Slug:</b> ${slug}\n` +
      `<b>Shop-ID:</b> <code>${shopId}</code>\n\n` +
      `<b>Modell:</b> ${planLabel}\n\n` +
      `👤 <b>Inhaber:</b> ${lead.ownerName}\n` +
      `✉️ <b>E-Mail:</b> ${lead.ownerEmail}` +
      phoneLine + cityLine + branchLine +
      `\n\n⚙️ Design &amp; Bonusprogramm einrichten nicht vergessen!`
    );
  },
});

// ── Interne Query: erwarteter Zahlungsbetrag für einen Vertrag ────────────────

export const getExpectedAmount = internalQuery({
  args: { shopContractId: v.id("shopContracts") },
  handler: async (ctx, args): Promise<{ amount: number } | null> => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract) return null;
    return { amount: planPrice(contract.planType) };
  },
});

// ── Stripe: Checkout-Session erstellen ────────────────────────────────────────
// STRIPE_SUBSCRIPTION_MODE=true  → Abo (automatische Verlängerung)
// (nicht gesetzt)                → Einmalzahlung (aktueller Pilot-Modus)

export const createStripeCheckout = action({
  args: { paymentToken: v.string() },
  handler: async (ctx, args) => {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(STRIPE_SECRET, { apiVersion: "2026-06-24.dahlia" });

    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new Error("Ungültiger Zahlungslink");

    const subscriptionMode = process.env.STRIPE_SUBSCRIPTION_MODE === "true";
    const planLabel = info.planType === "annual" ? "Jahresabo" : "Monatsabo";

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = subscriptionMode
      ? {
          mode: "subscription",
          payment_method_types: ["card", "sepa_debit"],
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: { name: `Loatycard ${planLabel}`, description: info.shopName },
              unit_amount: info.amount * 100,
              recurring: { interval: info.planType === "annual" ? "year" : "month" },
            },
            quantity: 1,
          }],
          success_url: `${APP_URL}/pay/success?method=stripe`,
          cancel_url:  `${APP_URL}/pay/${args.paymentToken}`,
          metadata: { paymentToken: args.paymentToken, contractId: info.contractId },
        }
      : {
          mode: "payment",
          payment_method_types: ["card", "sepa_debit"],
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: { name: `Loatycard ${planLabel}`, description: info.shopName },
              unit_amount: info.amount * 100,
            },
            quantity: 1,
          }],
          success_url: `${APP_URL}/pay/success?method=stripe`,
          cancel_url:  `${APP_URL}/pay/${args.paymentToken}`,
          metadata: { paymentToken: args.paymentToken, contractId: info.contractId },
        };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { url: session.url };
  },
});

// ── Stripe: Webhook (in http.ts eingebunden) ──────────────────────────────────

export const handleStripeWebhook = action({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(STRIPE_SECRET, { apiVersion: "2026-06-24.dahlia" });

    let event;
    try {
      event = stripe.webhooks.constructEvent(args.payload, args.signature, STRIPE_WEBHOOK);
    } catch {
      throw new Error("Webhook-Signatur ungültig");
    }

    // Einmalzahlung: Zahlung direkt beim Checkout erfassen
    if (event.type === "checkout.session.completed") {
      const session    = event.data.object as any;
      const contractId = session.metadata?.contractId;

      // Subscription-Modus: nur Subscription-ID speichern, Zahlung kommt via invoice-Event
      if (session.mode === "subscription" && contractId && session.subscription) {
        await ctx.runMutation(internal.payments.patchContractStripeIds, {
          shopContractId:       contractId,
          stripeSubscriptionId: session.subscription as string,
          stripeCustomerId:     session.customer as string,
        });
        return; // Zahlung wird durch invoice.payment_succeeded erfasst
      }

      // Einmalzahlung
      const paymentRef = session.payment_intent ?? session.id;
      if (contractId) {
        const result = await ctx.runMutation(internal.payments.autoRecordPayment, {
          shopContractId: contractId,
          paymentRef,
          method: "stripe",
        });
        if (result?.paymentNumber === 1) {
          await ctx.runAction(internal.payments.provisionShop, { shopContractId: contractId });
        }
      }
    }

    // Subscription: jede Zahlung (erste + alle Verlängerungen) automatisch erfassen
    if (event.type === "invoice.payment_succeeded") {
      const invoice        = event.data.object as any;
      const subscriptionId = invoice.subscription as string | undefined;
      if (!subscriptionId) return;

      const contract = await ctx.runQuery(internal.payments.getContractBySubscriptionId, {
        stripeSubscriptionId: subscriptionId,
      });
      if (!contract) return;

      const paymentRef = (invoice.payment_intent as string | null) ?? invoice.id;
      const result = await ctx.runMutation(internal.payments.autoRecordPayment, {
        shopContractId: contract._id,
        paymentRef,
        method: "stripe-subscription",
      });
      if (result?.paymentNumber === 1) {
        await ctx.runAction(internal.payments.provisionShop, { shopContractId: contract._id });
      }
    }

    // Subscription gekündigt
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

// ── PayPal: Hilfsfunktion Access-Token ───────────────────────────────────────

async function getPayPalToken(): Promise<string> {
  const creds = btoa(`${PP_CLIENT_ID}:${PP_SECRET}`);
  const res   = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

// ── PayPal: Order erstellen ───────────────────────────────────────────────────

export const createPayPalOrder = action({
  args: { paymentToken: v.string() },
  handler: async (ctx, args): Promise<{ orderId: string; contractId: Id<"shopContracts"> }> => {
    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new Error("Ungültiger Zahlungslink");

    const token = await getPayPalToken();
    const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount:      { currency_code: "EUR", value: info.amount.toFixed(2) },
          description: `Loatycard ${info.planType === "annual" ? "Jahresabo" : "Monatsabo"} · ${info.shopName}`,
          // Bindet die Order serverseitig an den Vertrag des Zahlungstokens.
          // Beim Capture wird ausschließlich diese custom_id verwendet — der
          // Client kann die Zahlung nicht auf einen fremden/teureren Vertrag umlenken.
          custom_id:   info.contractId,
        }],
      }),
    });

    const order = await res.json();
    return { orderId: order.id, contractId: info.contractId };
  },
});

// ── PayPal: Order capturen ────────────────────────────────────────────────────

export const capturePayPalOrder = action({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const token = await getPayPalToken();
    const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${args.orderId}/capture`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    const capture = await res.json();
    if (capture.status !== "COMPLETED") return { status: capture.status ?? "FAILED" };

    // Vertrag ausschließlich aus der serverseitig gesetzten custom_id ableiten
    // (nicht aus Client-Input) und den tatsächlich gecapturten Betrag prüfen.
    const pu             = capture.purchase_units?.[0];
    const contractId     = pu?.custom_id as string | undefined;
    const capturedAmount = pu?.payments?.captures?.[0]?.amount?.value as string | undefined;
    const captureId      = pu?.payments?.captures?.[0]?.id as string | undefined;
    if (!contractId || !capturedAmount) {
      throw new Error("Zahlung konnte keinem Vertrag zugeordnet werden");
    }

    const expected = await ctx.runQuery(internal.payments.getExpectedAmount, {
      shopContractId: contractId as Id<"shopContracts">,
    });
    if (!expected) throw new Error("Vertrag nicht gefunden");
    if (Number(capturedAmount) + 0.001 < expected.amount) {
      throw new Error("Gezahlter Betrag entspricht nicht dem Vertragspreis");
    }

    const result = await ctx.runMutation(internal.payments.autoRecordPayment, {
      shopContractId: contractId as Id<"shopContracts">,
      paymentRef:     captureId ?? args.orderId,
      method:         "paypal",
    });
    if (result?.paymentNumber === 1) {
      await ctx.runAction(internal.payments.provisionShop, {
        shopContractId: contractId as Id<"shopContracts">,
      });
    }

    return { status: "COMPLETED" };
  },
});
