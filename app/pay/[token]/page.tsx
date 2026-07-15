"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const token  = params.token as string;

  const info                  = useQuery(api.payments.getByPaymentToken, { token });
  const createStripe          = useAction(api.payments.createStripeCheckout);
  const createPayPalOrder     = useAction(api.payments.createPayPalOrder);
  const capturePayPalOrder    = useAction(api.payments.capturePayPalOrder);
  const simulatePayment       = useAction(api.payments.simulateTestPayment);

  const [stripeLoading, setStripeLoading] = useState(false);
  const [testLoading, setTestLoading]     = useState(false);
  const [error, setError]                 = useState("");

  const handleTestPayment = async () => {
    setTestLoading(true); setError("");
    try {
      await simulatePayment({ paymentToken: token });
      router.push("/pay/success?method=test");
    } catch (e: any) {
      setError(e.message ?? "Fehler");
      setTestLoading(false);
    }
  };

  if (info === undefined) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[rgba(242,237,228,.4)] text-sm animate-pulse">Laden...</p>
    </div>
  );

  if (info === null) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <p className="text-xl font-bold text-[#f2ede4]">Ungültiger Zahlungslink</p>
        <p className="text-sm text-[rgba(242,237,228,.4)]">Dieser Link ist nicht gültig oder abgelaufen.</p>
      </div>
    </div>
  );

  const handleStripe = async () => {
    setStripeLoading(true); setError("");
    try {
      const { url } = await createStripe({ paymentToken: token });
      if (url) window.location.href = url;
    } catch (e: any) {
      setError(e.message ?? "Fehler");
      setStripeLoading(false);
    }
  };

  const planLabel = info.planType === "annual" ? "Jahresabo" : "Monatsabo";

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-10 space-y-6 flex flex-col justify-center">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-xs font-bold tracking-[.3em] text-[#c9a227] uppercase">Loatycard</div>
        <h1 className="text-2xl font-bold text-[#f2ede4]">Zahlung abschließen</h1>
      </div>

      {/* Bestellübersicht */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: "#17150f", border: "1px solid rgba(201,162,39,.25)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#f2ede4]">{info.shopName}</p>
            <p className="text-xs text-[rgba(242,237,228,.4)]">Loatycard {planLabel}</p>
          </div>
          <p className="text-2xl font-bold text-[#c9a227]">€{info.amount}</p>
        </div>
        {info.planType === "annual" && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Einmalige Jahreszahlung · automatisch verlängerbar</p>
        )}
        {info.planType === "monthly" && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Monatliche Zahlung · jederzeit kündbar</p>
        )}
        {info.paymentCount > 0 && (
          <p className="text-[10px] text-[rgba(242,237,228,.3)]">Zahlung #{info.paymentCount + 1}</p>
        )}
      </div>

      {/* Stripe */}
      <div className="space-y-3">
        <button onClick={handleStripe} disabled={stripeLoading}
          className="w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-3 disabled:opacity-50 transition-opacity"
          style={{ background: "#635BFF" }}>
          {stripeLoading ? (
            <span className="animate-pulse">Weiterleitung...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Mit Karte / SEPA zahlen
            </>
          )}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[rgba(255,255,255,.06)]" />
          <span className="text-[10px] text-[rgba(242,237,228,.25)]">oder</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,.06)]" />
        </div>

        {/* PayPal */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "#ffc439" }}>
          <PayPalScriptProvider options={{
            clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "sb",
            currency:  "EUR",
          }}>
            <div className="px-3 py-2">
              <PayPalButtons
                style={{ layout: "horizontal", color: "gold", shape: "rect", label: "pay", height: 48 }}
                createOrder={async () => {
                  const { orderId } = await createPayPalOrder({ paymentToken: token });
                  return orderId;
                }}
                onApprove={async (data) => {
                  const { contractId } = await createPayPalOrder({ paymentToken: token });
                  await capturePayPalOrder({ orderId: data.orderID, contractId });
                  router.push("/pay/success?method=paypal");
                }}
                onError={() => setError("PayPal-Zahlung fehlgeschlagen")}
              />
            </div>
          </PayPalScriptProvider>
        </div>
      </div>

      {error && (
        <p className="text-center text-red-400 text-sm">{error}</p>
      )}

      {/* !! VOR LAUNCH LÖSCHEN: Test-Button + handleTestPayment + simulatePayment !! */}
      <button onClick={handleTestPayment} disabled={testLoading}
          className="w-full py-3 rounded-2xl font-semibold text-sm disabled:opacity-50 transition-opacity"
          style={{ background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", color: "rgba(242,237,228,.4)" }}>
          {testLoading ? "Simuliere..." : "🧪 Test-Zahlung simulieren"}
        </button>

      <p className="text-center text-[10px] text-[rgba(242,237,228,.2)]">
        Sichere Zahlung · SSL-verschlüsselt · Loatycard GmbH
      </p>
    </div>
  );
}
