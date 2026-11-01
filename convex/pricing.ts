// Einzige Quelle der Wahrheit für alle Preise (in EUR).
// Preise nur HIER ändern — alle Rechen-Stellen (Provision, Zahlbetrag,
// Umsatz-Summary, Checkout) greifen darauf zu.

export const PLAN_PRICES = { annual: 240, monthly: 20 } as const;

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

// Rechnungsbetrag: Abo + Bonusprogramm. Es gibt KEINE Einrichtungsgebühr
// (seit 2026-11-01 dauerhaft abgeschafft, Design ist im Abo enthalten).
export function recurringPrice(planType: "annual" | "monthly", rewardCount: number): number {
  return planPrice(planType) + rewardPrice(planType) * Math.max(0, rewardCount);
}

// Zahlbetrag einer Rechnung mit Rabattcode: Prozent-Rabatt auf Abo + Bonus.
export function discountedInvoice(planType: "annual" | "monthly", rewardCount: number, discount: number): number {
  return applyDiscount(recurringPrice(planType, rewardCount), discount);
}

export function applyDiscount(amount: number, discount: number | undefined | null): number {
  if (!discount) return amount;
  return Math.round(amount * (1 - discount) * 100) / 100;
}

// Gilt der Erstjahr-Rabatt für diese Zahlung? Rabattcodes gibt es NUR für das
// Jahresabo, und dort nur auf Rechnung #1 (die deckt das ganze erste Jahr ab).
// Das Monatsabo ist grundsätzlich rabattfrei (applyDiscountCode lehnt ab).
export function discountAppliesTo(planType: "annual" | "monthly", paymentNumber: number): boolean {
  return planType === "annual" && paymentNumber === 1;
}
