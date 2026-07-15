// Einzige Quelle der Wahrheit für die Plan-Preise (in EUR).
// Preis nur HIER ändern — alle Rechen-Stellen (Provision, Zahlbetrag,
// Umsatz-Summary) greifen darauf zu.

export const PLAN_PRICES = { annual: 389, monthly: 39 } as const;

export function planPrice(planType: "annual" | "monthly"): number {
  return PLAN_PRICES[planType];
}
