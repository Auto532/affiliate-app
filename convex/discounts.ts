// ── Rabattcodes (TESTMODUS, ohne Stripe) ─────────────────────────────────────
//
// Zentrale, isolierte Definition aller Rabattcodes. Die Validierung läuft
// ausschließlich serverseitig (siehe payments.applyDiscountCode). Der Client
// schickt nur den eingetippten String — Betrag/Rabatt entscheidet der Server.
//
// Modell: firstYearDiscount koppelt den Rabatt an die ERSTE Abrechnungsperiode
// (paymentNumber === 1). Ab der Verlängerung gilt automatisch der normale Preis.
// Das bildet 1:1 einen Stripe-Coupon mit duration:"once" ab.
//
// ── Spätere Umstellung auf echtes Stripe (Coupon + Promotion Code) ───────────
// 1. Coupon anlegen (einmalig, Dashboard oder API):
//      stripe.coupons.create({ percent_off: 50, duration: "once", id: "LOYAL50" })
//    -> duration:"once" = Rabatt gilt nur für die erste Rechnung (= erstes Jahr).
// 2. Promotion Code anlegen, damit Kunden "LOYAL50" eintippen können:
//      stripe.promotionCodes.create({ coupon: "LOYAL50", code: "LOYAL50" })
// 3. Eligibility (pro Partner) bleibt SERVERSEITIG: bevor die Checkout-Session
//    erstellt wird, prüfen ob affiliate.discountEligible === true. Nur dann den
//    Coupon anhängen:
//      stripe.checkout.sessions.create({ ..., discounts: [{ coupon: "LOYAL50" }] })
//    (oder allow_promotion_codes:true, aber dann kann JEDER den Code nutzen —
//     deshalb lieber serverseitig gated den Coupon direkt setzen).
// 4. firstYearDiscount / discountedPrice / normalPrice bleiben auf dem Contract
//    als Audit/Anzeige; die eigentliche Rabattlogik übernimmt dann Stripe.
// 5. commissionBase ("paid" | "full") bleibt serverseitig, unverändert — die
//    Provision wird weiter aus dem tatsächlich eingenommenen Betrag berechnet
//    (bei Stripe: aus invoice.amount_paid statt aus dem Listenpreis).

export interface DiscountDef {
  firstYearDiscount: number; // Anteil, z.B. 0.5 = 50%
  label:             string;
  // Optional: überschreibt die Provisions-Rate der ERSTEN Zahlung (einmalig) für
  // Verträge mit diesem Code. Nur gesetzt = greift. Ab Zahlung #2 gelten wieder
  // die normalen Provisions-Regeln (commissionEngine).
  firstPaymentCommissionRate?: number;
}

export const DISCOUNT_CODES: Record<string, DiscountDef> = {
  LOYAL50: { firstYearDiscount: 0.5, label: "50 % auf das erste Jahr" },
};

export function lookupDiscount(code: string): DiscountDef | null {
  return DISCOUNT_CODES[code.trim().toUpperCase()] ?? null;
}
