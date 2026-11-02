"use client";

// Die Bezahlseite ist in die Stempelkarten-App umgezogen
// (app.loyaltycard.info/bezahlen/…). Alte Links leiten automatisch weiter.
import { useParams } from "next/navigation";
import { useEffect } from "react";

const STEMPEL_URL = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://app.loyaltycard.info";

export default function PayRedirect() {
  const { token } = useParams<{ token: string }>();
  useEffect(() => {
    window.location.replace(`${STEMPEL_URL}/bezahlen/${encodeURIComponent(token)}`);
  }, [token]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Weiterleitung…</p>
    </div>
  );
}
