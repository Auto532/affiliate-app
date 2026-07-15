// Einfacher Brute-Force-Schutz für Auth-Endpunkte (C2).
// Zählt Fehlversuche pro Schlüssel in einem Zeitfenster und sperrt danach kurz.
// Kein IP-Zugriff in Convex-Mutationen → Schlüssel ist z.B. die E-Mail (Login)
// bzw. ein fester Schlüssel (Admin-PIN).

import type { MutationCtx } from "./_generated/server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 15 * 60 * 1000;
const LOCK_MS      = 15 * 60 * 1000;

type Throttle = { _id: any; count: number; windowStart: number; lockedUntil?: number } | null;

export async function assertNotLocked(ctx: MutationCtx, key: string): Promise<Throttle> {
  const rec = await ctx.db
    .query("authThrottle")
    .withIndex("by_key", q => q.eq("key", key))
    .unique();
  if (rec?.lockedUntil && rec.lockedUntil > Date.now()) {
    const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    throw new Error(`Zu viele Fehlversuche. Bitte in ${mins} Minute(n) erneut versuchen.`);
  }
  return rec as Throttle;
}

export async function recordFailure(ctx: MutationCtx, key: string, rec: Throttle): Promise<void> {
  const now = Date.now();
  if (!rec) {
    await ctx.db.insert("authThrottle", { key, count: 1, windowStart: now });
    return;
  }
  if (now - rec.windowStart > WINDOW_MS) {
    await ctx.db.patch(rec._id, { count: 1, windowStart: now, lockedUntil: undefined });
    return;
  }
  const count = rec.count + 1;
  await ctx.db.patch(rec._id, {
    count,
    ...(count >= MAX_ATTEMPTS ? { lockedUntil: now + LOCK_MS } : {}),
  });
}

export async function clearFailures(ctx: MutationCtx, rec: Throttle): Promise<void> {
  if (rec) await ctx.db.delete(rec._id);
}
