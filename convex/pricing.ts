// Einzige Quelle der Wahrheit für alle Preise (in EUR).
// Preise nur HIER ändern — alle Rechen-Stellen (Provision, Zahlbetrag,
// Umsatz-Summary, Checkout) greifen darauf zu.

export const PLAN_PRICES = { annual: 240, monthly: 20 } as const;

// Einmalige Einrichtungsgebühr inkl. individuellem Design — Pflicht für jeden
// Shop, wird nur auf der ERSTEN Rechnung berechnet. Rabattcodes (1. Jahr) gelten
// auch hierauf.
export const SETUP_FEE = 99;

// Bonusprogramm: Preis pro Belohnung pro MONAT. Beim Jahresabo stehen 12 Monate
// auf der Rechnung (5 € × 12 = 60 €/Jahr pro Belohnung).
export const REWARD_PRICE_PER_MONTH = 5;

export function planPrice(planType: "annual" | "monthly"): number {
  return PLAN_PRICES[planType];
}

// Preis pro Belohnung pro Abrechnungsperiode (Monat bzw. Jahr).
export function rewardPrice(planType: "annual" | "monthly"): number {
  return planType === "annual" ? REWARD_PRICE_PER_MONTH * 12 : REWARD_PRICE_PER_MONTH;
}

// Wiederkehrender Rechnungsbetrag: Abo + Bonusprogramm.
export function recurringPrice(planType: "annual" | "monthly", rewardCount: number): number {
  return planPrice(planType) + rewardPrice(planType) * Math.max(0, rewardCount);
}

// Listenbetrag einer Rechnung: Erstrechnung enthält zusätzlich die Einrichtungsgebühr.
export function invoiceTotal(planType: "annual" | "monthly", rewardCount: number, isFirst: boolean): number {
  return recurringPrice(planType, rewardCount) + (isFirst ? SETUP_FEE : 0);
}

export function applyDiscount(amount: number, discount: number | undefined | null): number {
  if (!discount) return amount;
  return Math.round(amount * (1 - discount) * 100) / 100;
}
