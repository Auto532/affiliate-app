import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { derivePasswordHash, newSalt, timingSafeEqual } from "./passwords";
import { assertNotLocked, recordFailure, clearFailures } from "./rateLimit";
import { requireValidEmail, requireFilled } from "./validation";

// Verifiziert das (client-seitig SHA-256-gehashte) Passwort gegen den gespeicherten
// gesalzenen Hash. Legacy-Accounts (ohne Salt) werden bei korrektem Passwort
// transparent auf das gesalzene Schema hochgezogen.
async function verifyPassword(
  ctx: MutationCtx,
  affiliate: Doc<"affiliates">,
  clientHash: string,
): Promise<boolean> {
  if (affiliate.passwordSalt) {
    const expected = await derivePasswordHash(clientHash, affiliate.passwordSalt);
    return timingSafeEqual(expected, affiliate.passwordHash);
  }
  // Legacy: unsaltetes SHA-256 direkt vergleichen …
  if (!timingSafeEqual(affiliate.passwordHash, clientHash)) return false;
  // … und bei Erfolg auf gesalzenen PBKDF2-Hash migrieren.
  const salt = newSalt();
  await ctx.db.patch(affiliate._id, {
    passwordSalt: salt,
    passwordHash: await derivePasswordHash(clientHash, salt),
  });
  return true;
}

// ── Registrierung ─────────────────────────────────────────────────────────────

export const register = mutation({
  args: {
    name:         v.string(),
    email:        v.string(),
    passwordHash: v.string(),
    businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
    phone:        v.optional(v.string()),
    company:      v.optional(v.string()),
    dateOfBirth:  v.optional(v.string()),
    taxId:        v.optional(v.string()),
    vatId:        v.optional(v.string()),
    address:      v.optional(v.string()),
    zip:          v.optional(v.string()),
    city:         v.optional(v.string()),
    country:      v.optional(v.string()),
    bankIban:     v.optional(v.string()),
    bankBic:      v.optional(v.string()),
    bankName:     v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Pflichtangaben serverseitig erzwingen: der Client prüft dieselben Regeln,
    // verbindlich ist der Server (Provisionsabrechnung braucht vollständige Daten).
    const email       = requireValidEmail(args.email);
    const name        = requireFilled(args.name, "Name");
    const phone       = requireFilled(args.phone, "Telefon");
    const dateOfBirth = requireFilled(args.dateOfBirth, "Geburtsdatum");
    const address     = requireFilled(args.address, "Adresse");
    const zip         = requireFilled(args.zip, "PLZ");
    const city        = requireFilled(args.city, "Stadt");
    const bankIban    = requireFilled(args.bankIban, "IBAN");
    const bankName    = requireFilled(args.bankName, "Bankname");
    if (args.businessType === "business") {
      requireFilled(args.company, "Firmenname");
      requireFilled(args.taxId, "Steuernummer");
    }

    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", email))
      .unique();
    if (existing) throw new ConvexError("E-Mail bereits registriert");

    // Referral-Code generieren: 2 Buchstaben aus Name + 4 Ziffern
    const initials = args.name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "AF";
    let code: string;
    let tries = 0;
    do {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `${initials}-${num}`;
      tries++;
      if (tries > 20) throw new ConvexError("Code-Generierung fehlgeschlagen");
    } while (
      await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", code)).unique()
    );

    const salt = newSalt();
    const affiliateId = await ctx.db.insert("affiliates", {
      name,
      email,
      passwordHash: await derivePasswordHash(args.passwordHash, salt),
      passwordSalt: salt,
      referralCode: code,
      status:       "pending",
      businessType: args.businessType,
      phone,
      company:      args.company,
      dateOfBirth,
      taxId:        args.taxId,
      vatId:        args.vatId,
      address,
      zip,
      city,
      country:      args.country ?? "Deutschland",
      bankIban,
      bankBic:      args.bankBic,
      bankName,
    });

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   affiliateId,
      action:     "registered",
      actorType:  "affiliate",
      actorId:    affiliateId,
    });

    // Eingangs-Mail: Anfrage wird geprüft. Die Willkommens-Mail kommt erst
    // mit der Freigabe durch den Admin (admin.approveAffiliate).
    await ctx.scheduler.runAfter(0, internal.emails.sendPartnerRequestReceivedEmail, { name, email });

    return { affiliateId, referralCode: code };
  },
});

// ── Login ─────────────────────────────────────────────────────────────────────

export const login = mutation({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const throttleKey = `login:${args.email.trim().toLowerCase()}`;
    const throttle = await assertNotLocked(ctx, throttleKey);

    // Registrierung speichert E-Mails kleingeschrieben; Legacy-Accounts können
    // noch Großbuchstaben enthalten, deshalb zweiter Lookup mit der Roh-Eingabe.
    const emailNorm = args.email.trim().toLowerCase();
    let affiliate = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", emailNorm))
      .unique();
    if (!affiliate && emailNorm !== args.email) {
      affiliate = await ctx.db
        .query("affiliates")
        .withIndex("by_email", q => q.eq("email", args.email))
        .unique();
    }

    const ok = affiliate !== null && await verifyPassword(ctx, affiliate, args.passwordHash);
    if (!ok) {
      await recordFailure(ctx, throttleKey, throttle);
      throw new ConvexError("Ungültige Zugangsdaten");
    }
    await clearFailures(ctx, throttle);

    const aff = affiliate!;
    if (aff.status === "pending")
      throw new ConvexError("Dein Account wartet noch auf Freigabe");
    if (aff.status === "suspended")
      throw new ConvexError("Dein Account wurde gesperrt");

    const token = crypto.randomUUID();
    const now   = Date.now();
    await ctx.db.insert("affiliateSessions", {
      affiliateId: aff._id,
      token,
      createdAt:   now,
      expiresAt:   now + 30 * 24 * 60 * 60 * 1000, // 30 Tage
    });

    return { token, affiliate: aff };
  },
});

// ── Session validieren ────────────────────────────────────────────────────────

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    return ctx.db.get(session.affiliateId);
  },
});

// ── Bankdaten speichern ───────────────────────────────────────────────────────

export const updateBankDetails = mutation({
  args: {
    token:    v.string(),
    bankIban: v.string(),
    bankName: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) throw new ConvexError("Nicht eingeloggt");

    await ctx.db.patch(session.affiliateId, {
      bankIban: args.bankIban,
      bankName: args.bankName,
    });
  },
});

// ── Eigenes Profil (Partner-Bereich) ─────────────────────────────────────────

// Sensible Felder brauchen Admin-Freigabe; die restlichen werden sofort übernommen.
const SENSITIVE_PROFILE_FIELDS = [
  "name", "company", "taxId", "vatId", "dateOfBirth", "bankIban", "bankBic", "bankName",
] as const;
const IMMEDIATE_PROFILE_FIELDS = ["phone", "address", "zip", "city", "country"] as const;

async function affiliateFromToken(ctx: MutationCtx, token: string): Promise<Doc<"affiliates">> {
  const session = await ctx.db
    .query("affiliateSessions")
    .withIndex("by_token", q => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) throw new ConvexError("Nicht eingeloggt");
  const affiliate = await ctx.db.get(session.affiliateId);
  if (!affiliate) throw new ConvexError("Account nicht gefunden");
  return affiliate;
}

export const getMyProfile = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const a = await ctx.db.get(session.affiliateId);
    if (!a) return null;
    const { passwordHash: _p, passwordSalt: _s, ...profile } = a;
    return profile;
  },
});

export const updateOwnProfile = mutation({
  args: {
    token:       v.string(),
    // sofort übernommen
    phone:       v.optional(v.string()),
    address:     v.optional(v.string()),
    zip:         v.optional(v.string()),
    city:        v.optional(v.string()),
    country:     v.optional(v.string()),
    // freigabepflichtig
    name:        v.optional(v.string()),
    company:     v.optional(v.string()),
    taxId:       v.optional(v.string()),
    vatId:       v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    bankIban:    v.optional(v.string()),
    bankBic:     v.optional(v.string()),
    bankName:    v.optional(v.string()),
    businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
  },
  handler: async (ctx, args) => {
    const affiliate = await affiliateFromToken(ctx, args.token);

    const patch: Record<string, unknown> = {};
    for (const k of IMMEDIATE_PROFILE_FIELDS) {
      if (args[k] !== undefined) patch[k] = args[k];
    }

    // Nur sensible Felder, die sich ggü. dem freigegebenen Stand ändern → in pendingProfile.
    const pending: Record<string, unknown> = {};
    let hasPending = false;
    for (const k of SENSITIVE_PROFILE_FIELDS) {
      const val = args[k];
      if (val !== undefined && val !== (affiliate as any)[k]) {
        pending[k] = val;
        hasPending = true;
      }
    }

    // Kontotyp (privat/geschäftlich): freigabepflichtig. Zusätzlich automatische
    // Erkennung — trägt ein Privat-Partner Firmenname oder USt-IdNr. ein, ist das
    // faktisch ein Wechsel zu "geschäftlich" (nur Hochstufung, nie automatisch zurück).
    const currentType = affiliate.businessType ?? "private";
    let requestedType = args.businessType;
    if (requestedType === undefined && currentType === "private") {
      const businessSignal = (["company", "vatId"] as const).some(k => {
        const val = args[k];
        return typeof val === "string" && val.trim() !== "" && val !== (affiliate as any)[k];
      });
      if (businessSignal) requestedType = "business";
    }
    if (requestedType !== undefined && requestedType !== currentType) {
      pending.businessType = requestedType;
      hasPending = true;
    }

    if (hasPending) patch.pendingProfile = { ...pending, submittedAt: Date.now() };

    await ctx.db.patch(affiliate._id, patch);

    if (hasPending) {
      await ctx.db.insert("auditLog", {
        entityType: "affiliate",
        entityId:   affiliate._id,
        action:     "profile_change_requested",
        actorType:  "affiliate",
        actorId:    affiliate._id,
        note:       Object.keys(pending).join(", "),
      });
    }

    return { pending: hasPending, pendingFields: Object.keys(pending) };
  },
});

// ── Einladungslink annehmen (Partner-Registrierung via Link) ──────────────────

export const acceptAffiliateInvite = mutation({
  args: {
    inviteToken:  v.string(),
    name:         v.string(),
    email:        v.string(),
    passwordHash: v.string(),
    phone:        v.optional(v.string()),
    company:      v.optional(v.string()),
    dateOfBirth:  v.optional(v.string()),
    taxId:        v.optional(v.string()),
    vatId:        v.optional(v.string()),
    address:      v.optional(v.string()),
    zip:          v.optional(v.string()),
    city:         v.optional(v.string()),
    country:      v.optional(v.string()),
    bankIban:     v.optional(v.string()),
    bankBic:      v.optional(v.string()),
    bankName:     v.optional(v.string()),
    businessType: v.optional(v.union(v.literal("private"), v.literal("business"))),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("affiliateInvites")
      .withIndex("by_token", q => q.eq("token", args.inviteToken))
      .unique();

    if (!invite)                       throw new ConvexError("Ungültiger Einladungslink");
    if (invite.usedAt)                 throw new ConvexError("Dieser Link wurde bereits verwendet");
    if (invite.expiresAt < Date.now()) throw new ConvexError("Einladungslink ist abgelaufen");

    // Gleiche Pflichtangaben wie bei der offenen Registrierung
    const email       = requireValidEmail(args.email);
    const name        = requireFilled(args.name, "Name");
    const phone       = requireFilled(args.phone, "Telefon");
    const dateOfBirth = requireFilled(args.dateOfBirth, "Geburtsdatum");
    const address     = requireFilled(args.address, "Adresse");
    const zip         = requireFilled(args.zip, "PLZ");
    const city        = requireFilled(args.city, "Stadt");
    const bankIban    = requireFilled(args.bankIban, "IBAN");
    const bankName    = requireFilled(args.bankName, "Bankname");
    if (args.businessType === "business") {
      requireFilled(args.company, "Firmenname");
      requireFilled(args.taxId, "Steuernummer");
    }

    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_email", q => q.eq("email", email))
      .unique();
    if (existing) throw new ConvexError("E-Mail bereits registriert");

    const initials = args.name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "AF";
    let code = "";
    for (let i = 0; i < 20; i++) {
      const candidate = `${initials}-${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await ctx.db.query("affiliates").withIndex("by_referralCode", q => q.eq("referralCode", candidate)).unique();
      if (!taken) { code = candidate; break; }
    }
    if (!code) throw new ConvexError("Code-Generierung fehlgeschlagen");

    const salt = newSalt();
    const affiliateId = await ctx.db.insert("affiliates", {
      name,
      email,
      passwordHash: await derivePasswordHash(args.passwordHash, salt),
      passwordSalt: salt,
      referralCode: code,
      status:       "pending",
      phone,
      company:      args.company,
      dateOfBirth,
      taxId:        args.taxId,
      vatId:        args.vatId,
      address,
      zip,
      city,
      country:      args.country ?? "Deutschland",
      bankIban,
      bankBic:      args.bankBic,
      bankName,
      businessType: args.businessType,
    });

    await ctx.db.patch(invite._id, { usedAt: Date.now(), affiliateId });

    await ctx.db.insert("auditLog", {
      entityType: "affiliate",
      entityId:   affiliateId,
      action:     "registered_via_invite",
      actorType:  "affiliate",
      actorId:    affiliateId,
    });

    // Gleiche Eingangs-Mail wie bei der offenen Registrierung.
    await ctx.scheduler.runAfter(0, internal.emails.sendPartnerRequestReceivedEmail, { name, email });

    return { affiliateId, referralCode: code };
  },
});

// ── Dashboard-Daten ───────────────────────────────────────────────────────────

export const getDashboard = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("affiliateSessions")
      .withIndex("by_token", q => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    const affiliateId = session.affiliateId;

    const leads = await ctx.db
      .query("shopLeads")
      .withIndex("by_affiliate", q => q.eq("affiliateId", affiliateId))
      .collect();

    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_affiliate", q => q.eq("affiliateId", affiliateId))
      .collect();

    const totalPending   = commissions.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const totalConfirmed = commissions.filter(c => c.status === "confirmed").reduce((s, c) => s + c.amount, 0);
    const totalPaid      = commissions.filter(c => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    return {
      leads: {
        total:      leads.length,
        active:     leads.filter(l => l.status === "active").length,
        inReview:   leads.filter(l => ["submitted", "under_review"].includes(l.status)).length,
        rejected:   leads.filter(l => l.status === "rejected").length,
      },
      commission: { totalPending, totalConfirmed, totalPaid },
    };
  },
});
