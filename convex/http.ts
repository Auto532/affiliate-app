import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

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

http.route({
  path:   "/admin/earnings",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const secret = new URL(req.url).searchParams.get("secret") ?? "";
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const data = await ctx.runQuery(api.admin.getEarningsSummary, { adminSecret: secret });
    return new Response(JSON.stringify(data), {
      status:  200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

export default http;
