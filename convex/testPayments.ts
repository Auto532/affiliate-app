// ⚠️ TEST-ONLY ────────────────────────────────────────────────────────────────
// Simuliert Freischaltung bzw. Zahlung, um den Provisions-/Provisioning-Flow
// ohne echtes Geld zu testen.
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
    // PIN mit Fehlversuch-Sperre prüfen (wie beim Admin-Login)
    const check = await ctx.runMutation(internal.admin.verifyAdminPin, { pin: args.adminSecret });
    if (!check.ok) throw new ConvexError(check.error);

    const info = await ctx.runQuery(api.payments.getByPaymentToken, { token: args.paymentToken });
    if (!info) throw new ConvexError("Ungültiger Zahlungslink");

    // Noch nicht freigeschaltet → Freischaltung simulieren (wie abgeschlossener
    // Stripe-Checkout). Schon live → eine Monatszahlung zum Stufenpreis buchen
    // (bei Free passiert nichts, weil 0 € keine Zahlung ist).
    if (!info.activated) {
      await ctx.runMutation(internal.payments.activateContract, {
        shopContractId: info.contractId,
        method:         "test",
      });
      return;
    }
    await ctx.runMutation(internal.payments.autoRecordPayment, {
      shopContractId: info.contractId,
      paymentRef:     `test-${Date.now()}`,
      method:         "test",
    });
  },
});
