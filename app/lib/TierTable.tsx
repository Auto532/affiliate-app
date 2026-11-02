// Preisstufen-Übersicht (Free / Starter / Business / Premium) für Formulare,
// Shop-Details und Unterlagen. Preise kommen aus convex/pricing.ts.
import { TIERS, tierRangeLabel, type Tier } from "@/convex/pricing";

const COMMISSION_YEAR1 = 0.35;
const eur = (n: number) => `€${n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default function TierTable({ current, showCommission = false }: { current?: Tier; showCommission?: boolean }) {
  return (
    <div className="rounded-xl p-3 space-y-1.5"
      style={{ background: "#17150f", border: "1px solid rgba(255,255,255,.08)" }}>
      {TIERS.map(t => {
        const active = t.id === current;
        return (
          <div key={t.id} className="flex items-center justify-between gap-3 text-xs">
            <span className={active ? "text-[#e8c96a] font-semibold" : "text-[rgba(242,237,228,.6)]"}>
              <span className="font-semibold text-[#f2ede4]">{t.name}</span> · {tierRangeLabel(t.id)}
            </span>
            <span className="text-right whitespace-nowrap">
              <span className={active ? "text-[#e8c96a] font-semibold" : "text-[rgba(242,237,228,.8)]"}>
                {t.monthly === 0 ? "kostenlos" : `${eur(t.monthly)}/Monat`}
              </span>
              {showCommission && (
                <span className="block text-[10px] text-[#c9a227]">
                  {t.monthly === 0 ? "keine Provision" : `Provision ${eur(Math.round(t.monthly * COMMISSION_YEAR1 * 100) / 100)}/Monat`}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
