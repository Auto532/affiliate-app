import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { timingSafeEqual } from "./passwords";

export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000; // 12 Stunden

// Admin-Zugriff nur mit gültigem Sitzungs-Schlüssel aus admin.adminLogin (nicht
// mit dem PIN selbst). Der PIN wird ausschließlich dort geprüft, mit Sperre.
export async function requireAdmin(ctx: QueryCtx | MutationCtx, secret: string) {
  if (!secret) throw new ConvexError("Kein Zugriff");
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", q => q.eq("token", secret))
    .unique();
  if (!session || session.expiresAt <= Date.now()) throw new ConvexError("Kein Zugriff");
}

// Zufälliger Schlüssel mit 244 Bit Zufall (zwei UUIDs ohne Bindestriche)
export function newSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function isValidAdminPin(pin: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  return !!expected && timingSafeEqual(pin, expected);
}

// Schlüssel für die Verbindung zwischen Stempelkarten- und Partner-App
// (Env BRIDGE_SECRET, in beiden Convex-Projekten derselbe Wert).
export function isValidBridgeSecret(secret: unknown): boolean {
  const expected = process.env.BRIDGE_SECRET;
  if (!expected || typeof secret !== "string") return false;
  return timingSafeEqual(secret, expected);
}
