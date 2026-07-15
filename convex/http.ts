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

export default http;
