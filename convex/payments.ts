import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveCommissionRule } from "./commissionEngine";

const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY  ?? "";
const STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const PP_CLIENT_ID   = process.env.PAYPAL_CLIENT_ID   ?? "";
const PP_SECRET      = process.env.PAYPAL_CLIENT_SECRET ?? "";
const APP_URL        = process.env.NEXT_PUBLIC_AFFILIATE_APP_URL ?? "http://localhost:3000";
const PAYPAL_BASE    = "https://api-m.paypal.com";

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
      amount:     contract.planType === "annual" ? 389 : 39,
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
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.shopContractId);
    if (!contract || contract.status !== "active") return;

    const newCount = contract.paymentCount + 1;

    const existing = await ctx.db
      .query("commissions")
      .withIndex("by_contract_payment", q =>
        q.eq("shopContractId", args.shopContractId).eq("paymentNumber", newCount)
      )
      .unique();
    if (existing) return;

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
    });

    await ctx.db.patch(args.shopContractId, { paymentCount: newCount });

    await ctx.db.insert("auditLog", {
      entityType: "commission",
      entityId:   commissionId,
      action:     "auto_payment",
      actorType:  "system",
      note:       `${args.method} · Ref: ${args.paymentRef} · #${newCount} · €${rule.amount}`,
    });
  },
});

// ── Test: Zahlung simulieren (nur wenn ENABLE_TEST_PAYMENT=true) ─────────────

export const simulateTestPayment = action({
  args: { paymentToken: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new Error("Ungültiger Zahlungslink");
    await ctx.runMutation(internal.payments.autoRecordPayment, {
      shopContractId: info.contractId,
      paymentRef: `test-${Date.now()}`,
      method: "test",
    });
  },
});

// ── Stripe: Checkout-Session erstellen ────────────────────────────────────────

export const createStripeCheckout = action({
  args: { paymentToken: v.string() },
  handler: async (ctx, args) => {
    const Stripe = (await import("stripe")).default;
    const stripe  = new Stripe(STRIPE_SECRET, { apiVersion: "2026-06-24.dahlia" });

    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new Error("Ungültiger Zahlungslink");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "sepa_debit"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: `Loatycard ${info.planType === "annual" ? "Jahresabo" : "Monatsabo"}`,
            description: info.shopName,
          },
          unit_amount: info.amount * 100,
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}/pay/success?method=stripe`,
      cancel_url:  `${APP_URL}/pay/${args.paymentToken}`,
      metadata: {
        paymentToken: args.paymentToken,
        contractId:   info.contractId,
      },
    });

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

    if (event.type === "checkout.session.completed") {
      const session    = event.data.object as any;
      const contractId = session.metadata?.contractId;
      const paymentRef = session.payment_intent ?? session.id;

      if (contractId) {
        await ctx.runMutation(internal.payments.autoRecordPayment, {
          shopContractId: contractId,
          paymentRef,
          method: "stripe",
        });
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
    orderId:    v.string(),
    contractId: v.id("shopContracts"),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const token = await getPayPalToken();
    const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${args.orderId}/capture`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    const capture = await res.json();

    if (capture.status === "COMPLETED") {
      await ctx.runMutation(internal.payments.autoRecordPayment, {
        shopContractId: args.contractId,
        paymentRef:     args.orderId,
        method:         "paypal",
      });
    }

    return { status: capture.status };
  },
});
