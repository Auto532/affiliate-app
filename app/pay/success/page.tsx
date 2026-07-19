"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const method = params.get("method");

  // Test-Zahlung (Admin): nach 1 Sekunde zurück zur Admin-Übersicht, sonst
  // hängt man auf dieser Seite fest. Echte Zahlungen (Stripe) bleiben
  // hier — Shop-Inhaber sollen nicht im Admin-Panel landen.
  useEffect(() => {
    if (method !== "test") return;
    const base = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "";
    if (!base) return;
    const t = setTimeout(() => { window.location.href = `${base}/zk7-verwaltung-9x2`; }, 1000);
    return () => clearTimeout(t);
  }, [method]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f2ede4]">Zahlung erfolgreich</h2>
          <p className="text-sm text-[rgba(242,237,228,.5)] mt-2">
            {method === "test"
              ? "Test-Zahlung erfasst. Du wirst zur Übersicht weitergeleitet…"
              : "Deine Zahlung wurde bestätigt. Deine Loatycard-Stempelkarte wird in Kürze eingerichtet."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
