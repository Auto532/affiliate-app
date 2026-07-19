import { ConvexError } from "convex/values";

// Liefert eine anzeigbare Fehlermeldung. ConvexError-Texte kommen auch in
// Produktion beim Client an; alle anderen Fehler (rohe Convex-Meldungen wie
// "Server Error ...") werden durch den Fallback ersetzt, damit nie
// technischer Fehlertext in der UI landet.
export function errMsg(err: unknown, fallback = "Etwas ist schiefgelaufen. Bitte versuch es erneut."): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  if (err instanceof Error && err.message
      && !/\[CONVEX|Server Error|Uncaught|Request ID/i.test(err.message)) {
    return err.message;
  }
  return fallback;
}
