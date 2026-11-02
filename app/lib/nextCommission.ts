// Vorschau der nächsten Partner-Provision (Anzeige im Partner-Dashboard).
// Verbindlich rechnet der Server (payments.recordPaymentCore); hier nur dieselbe
// Regel: Jahr 1 (die ersten 12 bezahlten Monate) 35 %, danach 15 %, Basis ist
// der Monatsbeitrag der aktuellen Preisstufe. Free = keine Provision.
import { planPrice, type PlanType, type Tier } from "@/convex/pricing";

export function nextCommission(planType: PlanType, tier: Tier, paymentCount: number) {
  const next   = paymentCount + 1;
  const year1  = planType === "annual" ? next === 1 : next <= 12;
  const rate   = year1 ? 0.35 : 0.15;
  const amount = Math.round(planPrice(planType, tier) * rate * 100) / 100;
  return { amount, phase: year1 ? "Jahr 1 (35%)" : "Ab Jahr 2 (15%)" };
}
