import { ConvexError } from "convex/values";
// Serverseitige Eingabe-Validierung. Der Client prüft dieselben Regeln für
// gutes Feedback, verbindlich ist aber immer der Server.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

export function requireValidEmail(email: string, label = "E-Mail"): string {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) throw new ConvexError(`${label}: bitte eine gültige E-Mail-Adresse angeben`);
  return trimmed;
}

export function requireFilled(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new ConvexError(`${label} ist ein Pflichtfeld`);
  return trimmed;
}
