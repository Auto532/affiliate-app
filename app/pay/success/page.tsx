"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const method = params.get("method");

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
            {method === "paypal"
              ? "Deine PayPal-Zahlung wurde bestätigt."
              : "Deine Kartenzahlung wurde bestätigt."}
            {" "}Deine Loatycard-Stempelkarte wird in Kürze eingerichtet.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
