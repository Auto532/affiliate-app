"use client";
// ⚠️ TEST-ONLY — siehe convex/testPayments.ts. Vor Live-Schaltung diese Datei
// löschen und Import + <TestPaymentButton/> aus page.tsx entfernen.
// Der Button ist sichtbar, die eigentliche Absicherung liegt serverseitig:
// die Simulation läuft nur mit gültigem Admin-PIN UND gesetztem Convex-Env-Flag
// TEST_PAYMENTS_ENABLED. Ohne beides passiert nichts.

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TestPaymentButton({ token }: { token: string }) {
  const router   = useRouter();
  const simulate = useAction(api.testPayments.simulateTestPayment);
  const [pin, setPin]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const run = async () => {
    setLoading(true); setError("");
    try {
      await simulate({ paymentToken: token, adminSecret: pin });
      router.replace("/pay/success?method=test");
    } catch (e: any) {
      setError(e.message ?? "Fehler");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 pt-2">
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Admin-PIN"
        className="w-full py-2 px-3 rounded-xl text-sm text-center"
        style={{ background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", color: "#f2ede4" }}
      />
      <button onClick={run} disabled={loading || !pin}
        className="w-full py-3 rounded-2xl font-semibold text-sm disabled:opacity-40 transition-opacity"
        style={{ background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", color: "rgba(242,237,228,.4)" }}>
        {loading ? "Simuliere..." : "🧪 Test-Zahlung simulieren"}
      </button>
      {error && <p className="text-center text-red-400 text-xs">{error}</p>}
    </div>
  );
}
