// ── Provisions-Regeln ────────────────────────────────────────────────────────

import { planPrice } from "./pricing";

export type CommissionPhase = "initial" | "year2" | "year3" | "year4_plus";

interface CommissionRule {
  phase:      CommissionPhase;
  rate:       number;
  baseAmount: number;
  amount:     number;
}

// Bestimmt Phase + Rate anhand des Plan-Typs und der Zahlungsnummer
export function resolveCommissionRule(
  planType: "annual" | "monthly",
  paymentNumber: number,
): CommissionRule {
  let phase: CommissionPhase;

  if (planType === "annual") {
    // Jede Zahlung = 1 Jahr
    if      (paymentNumber === 1) phase = "initial";
    else if (paymentNumber === 2) phase = "year2";
    else if (paymentNumber === 3) phase = "year3";
    else                          phase = "year4_plus";
  } else {
    // Monatlich: 12 Zahlungen = 1 Jahr
    if      (paymentNumber <= 12) phase = "initial";
    else if (paymentNumber <= 24) phase = "year2";
    else if (paymentNumber <= 36) phase = "year3";
    else                          phase = "year4_plus";
  }

  const rateMap: Record<CommissionPhase, number> = {
    initial:    0.20,
    year2:      0.05,
    year3:      0.10,
    year4_plus: 0.15,
  };

  const baseAmount = planPrice(planType);
  const rate       = rateMap[phase];
  const amount     = Math.round(baseAmount * rate * 100) / 100;

  return { phase, rate, baseAmount, amount };
}

// Lesbare Bezeichnung für UI
export function phaseLabel(phase: CommissionPhase, planType: "annual" | "monthly"): string {
  const labels: Record<CommissionPhase, string> = {
    initial:    planType === "annual" ? "Jahr 1 (20%)" : "Jahr 1, M1–12 (20%)",
    year2:      planType === "annual" ? "Jahr 2 (5%)"  : "Jahr 2, M13–24 (5%)",
    year3:      planType === "annual" ? "Jahr 3 (10%)" : "Jahr 3, M25–36 (10%)",
    year4_plus: "Ab Jahr 4 (15%)",
  };
  return labels[phase];
}
