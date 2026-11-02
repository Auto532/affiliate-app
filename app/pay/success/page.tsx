"use client";

// Umgezogen nach app.loyaltycard.info/bezahlen/erfolg
import { useEffect } from "react";

const STEMPEL_URL = process.env.NEXT_PUBLIC_STEMPELKARTEN_APP_URL ?? "https://app.loyaltycard.info";

export default function PaySuccessRedirect() {
  useEffect(() => { window.location.replace(`${STEMPEL_URL}/bezahlen/erfolg`); }, []);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Weiterleitung…</p>
    </div>
  );
}
