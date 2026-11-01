import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ConvexError } from "convex/values";

// Nur aktive Partner mit einer gültigen Session dürfen auf Partnerdaten zugreifen.
export async function affiliateSessionOrNull(ctx: Pick<QueryCtx, "db">, token: string) {
  const session = await ctx.db.query("affiliateSessions")
    .withIndex("by_token", q => q.eq("token", token)).unique();
  if (!session || session.expiresAt <= Date.now()) return null;
  const affiliate = await ctx.db.get(session.affiliateId);
  return affiliate?.status === "active" ? affiliate : null;
}

export async function requireAffiliateSession(ctx: Pick<QueryCtx, "db">, token: string) {
  const affiliate = await affiliateSessionOrNull(ctx, token);
  if (!affiliate) throw new ConvexError("Nicht eingeloggt oder Account nicht freigeschaltet");
  return affiliate;
}

export function sanitizeAffiliate(affiliate: Doc<"affiliates">) {
  const { passwordHash: _p, passwordSalt: _s, ...profile } = affiliate;
  return profile;
}
