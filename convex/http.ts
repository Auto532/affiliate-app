import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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

// Hinweis: Der frühere GET /admin/earnings (Secret im URL-Query + Wildcard-CORS)
// wurde entfernt. Die Einnahmen werden jetzt über die reguläre, secret-geschützte
// Query api.admin.getEarningsSummary via Convex /api/query abgerufen — mit dem
// zur Laufzeit eingegebenen Admin-PIN, nicht mit einem ins Client-Bundle
// gebackenen NEXT_PUBLIC_-Secret.

export default http;
