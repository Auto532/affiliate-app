import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { isValidBridgeSecret } from "./adminAuth";
import { isValidEmail } from "./validation";

const http = httpRouter();

http.route({
  path:    "/webhooks/stripe",
  method:  "POST",
  handler: httpAction(async (ctx, req) => {
    const payload   = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    try {
      await ctx.runAction(api.payments.handleStripeWebhook, { payload, signature });
      return new Response("ok", { status: 200 });
    } catch (e: any) {
      return new Response(e.message, { status: 400 });
    }
  }),
});

// Abrechnungs-Sync aus der Stempelkarten-App: meldet die Anzahl der
// Kunden eines Shops (verschiedene E-Mail-Adressen), daraus folgt die Preisstufe
// (siehe admin.syncCardCountForShop).
http.route({
  path:    "/sync-card-count",
  method:  "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    const { secret, loatycardShopId, cardCount } = body;

    // Eigener Brücken-Schlüssel statt Admin-PIN (BRIDGE_SECRET in beiden Apps)
    if (!isValidBridgeSecret(secret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const count = Number(cardCount);
    if (!Number.isFinite(count) || count < 0) {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runMutation(internal.admin.syncCardCountForShop, {
      loatycardShopId: String(loatycardShopId ?? ""),
      cardCount:       Math.floor(count),
    });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Willkommens-Mail für Shops ohne Abrechnung (Stempelkarten-App kann selbst
// keine Mails senden). Nur mit Brücken-Schlüssel; Links nur auf unsere Domain.
http.route({
  path:    "/send-shop-welcome",
  method:  "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json().catch(() => null);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (!body || !isValidBridgeSecret(body.secret)) return json({ error: "Unauthorized" }, 401);

    const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
    const ownerEmail = str(body.ownerEmail, 200);
    const ownerName  = str(body.ownerName, 100) || "Inhaber";
    const shopName   = str(body.shopName, 100);
    const loginUrl   = str(body.loginUrl, 500);
    const joinUrl    = str(body.joinUrl, 500);
    // Nur unsere App-Domain und genau die erwarteten Pfade (kein Einschleusen fremder Links)
    const allowed = (u: string, path: RegExp) => {
      try {
        const url = new URL(u);
        const hostOk = (url.protocol === "https:" && url.hostname === "app.loyaltycard.info")
          || (url.protocol === "http:" && url.hostname === "localhost");
        return hostOk && path.test(url.pathname) && !url.search && !url.hash;
      } catch { return false; }
    };
    if (!isValidEmail(ownerEmail) || !shopName
      || !allowed(loginUrl, /^\/betrieb\/login\/[A-Za-z0-9-]{10,80}$/)
      || !allowed(joinUrl, /^\/join\/[a-z0-9-]{1,80}$/)) return json({ error: "Bad request" }, 400);

    try {
      await ctx.runAction(internal.emails.sendShopWelcomeEmail, { ownerEmail, ownerName, shopName, loginUrl, joinUrl });
    } catch {
      return json({ error: "Mail failed" }, 502);
    }
    return json({ sent: true });
  }),
});

// Hinweis: Der frühere GET /admin/earnings (Secret im URL-Query + Wildcard-CORS)
// wurde entfernt. Die Einnahmen werden jetzt über die reguläre, secret-geschützte
// Query api.admin.getEarningsSummary via Convex /api/query abgerufen — mit dem
// zur Laufzeit eingegebenen Admin-PIN, nicht mit einem ins Client-Bundle
// gebackenen NEXT_PUBLIC_-Secret.

export default http;
