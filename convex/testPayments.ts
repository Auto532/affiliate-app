// ⚠️ TEST-ONLY ────────────────────────────────────────────────────────────────
// Simuliert eine erfolgreiche Zahlung, um den Provisions-/Provisioning-Flow ohne
// echtes Geld zu testen.
//
// VOR LIVE-SCHALTUNG RESTLOS ENTFERNEN:
//   1. diese Datei löschen
//   2. app/pay/[token]/TestPaymentButton.tsx löschen
//   3. Import + <TestPaymentButton/> in app/pay/[token]/page.tsx entfernen
//   4. Convex-Env  TEST_PAYMENTS_ENABLED  entfernen
//   5. Client-Env  NEXT_PUBLIC_TEST_PAYMENTS  entfernen
// Danach ist keine Spur mehr im Code. Test-Datensätze erkennt man an
// method="test" bzw. paymentRef beginnend mit "test-".
//
// Doppelt abgesichert gegen Missbrauch:
//   (1) läuft nur, wenn TEST_PAYMENTS_ENABLED === "true"
//   (2) nur mit gültigem ADMIN_SECRET aufrufbar — kein öffentlicher Zugriff.
// ──────────────────────────────────────────────────────────────────────────────

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";

export const simulateTestPayment = action({
  args: { paymentToken: v.string(), adminSecret: v.string() },
  handler: async (ctx, args): Promise<void> => {
    if (process.env.TEST_PAYMENTS_ENABLED !== "true") {
      throw new ConvexError("Testzahlungen sind deaktiviert");
    }
    const expected = process.env.ADMIN_SECRET;
    if (!expected || args.adminSecret !== expected) {
      throw new ConvexError("Nicht autorisiert");
    }

    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new ConvexError("Ungültiger Zahlungslink");

    const result = await ctx.runMutation(internal.payments.autoRecordPayment, {
      shopContractId: info.contractId,
      paymentRef:     `test-${Date.now()}`,
      method:         "test",
    });
    if (result?.paymentNumber === 1) {
      await ctx.runAction(internal.payments.provisionShop, { shopContractId: info.contractId });
    }
  },
});
