// Einzige Quelle der Wahrheit für alle Preise (in EUR).
// Preise nur HIER ändern — alle Rechen-Stellen (Provision, Zahlbetrag,
// Umsatz-Summary, Checkout, Mails) greifen darauf zu.
//
// Modell seit 2026-11-02: Der Preis richtet sich nach der Anzahl der
// Kunden eines Betriebs. Gezählt werden verschiedene E-Mail-Adressen: wer
// mehrere Karten hat (neues Handy, Browser gelöscht), zählt nur einmal.
// Kein Aufpreis mehr für Bonus-Stufen, keine Einrichtungsgebühr.
// Wird eine Grenze überschritten, gilt die neue Stufe ab der nächsten
// Abrechnung (Stripe-Abo-Update ohne anteilige Verrechnung).

export type Tier = "free" | "starter" | "business" | "premium";
export type PlanType = "annual" | "monthly";

export const TIERS: readonly { id: Tier; name: string; monthly: number; maxCards: number | null }[] = [
  { id: "free",     name: "Free",     monthly: 0,  maxCards: 25  },
  { id: "starter",  name: "Starter",  monthly: 10, maxCards: 75  },
  { id: "business", name: "Business", monthly: 20, maxCards: 200 },
  { id: "premium",  name: "Premium",  monthly: 30, maxCards: null },
] as const;

export const TIER_IDS = TIERS.map(t => t.id) as Tier[];

// Das Jahresabo bleibt technisch erhalten, wird aber erst ab dem 2. Jahr
// angeboten (bis dahin nirgends auswählbar). Platzhalter: 12 × Monatspreis.
export const ANNUAL_OFFERED = false;

export function tierInfo(tier: Tier) {
  return TIERS.find(t => t.id === tier) ?? TIERS[0];
}

export function tierForCardCount(cardCount: number): Tier {
  const n = Math.max(0, Math.floor(cardCount || 0));
  for (const t of TIERS) {
    if (t.maxCards === null || n <= t.maxCards) return t.id;
  }
  return "premium";
}

// Stufe eines Vertrags: gespeicherte Stufe, sonst aus der Kundenzahl, sonst Free.
export function contractTier(contract: { tier?: Tier; cardCount?: number }): Tier {
  return contract.tier ?? tierForCardCount(contract.cardCount ?? 0);
}

// Listenpreis einer Abrechnungsperiode (Monat bzw. Jahr).
export function planPrice(planType: PlanType, tier: Tier): number {
  const m = tierInfo(tier).monthly;
  return planType === "annual" ? m * 12 : m;
}

// "bis 25 Kunden" / "ab 201 Kunden" für Anzeigen.
export function tierRangeLabel(tier: Tier): string {
  const idx = TIERS.findIndex(t => t.id === tier);
  const t   = TIERS[idx];
  if (t.maxCards === null) return `ab ${(TIERS[idx - 1]?.maxCards ?? 0) + 1} Kunden`;
  if (idx === 0) return `bis ${t.maxCards} Kunden`;
  return `${(TIERS[idx - 1].maxCards ?? 0) + 1} bis ${t.maxCards} Kunden`;
}
