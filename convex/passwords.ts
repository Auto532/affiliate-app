// Serverseitiges, gesalzenes Passwort-Hashing (C3).
//
// Der Client sendet weiterhin SHA-256(passwort) als `clientHash` (unverändertes
// Frontend-Kontrakt). Serverseitig wird darüber ein gesalzener PBKDF2-Hash gelegt
// und NUR dieser gespeichert. Damit:
//   - ist der in der DB liegende Wert nicht mehr identisch mit dem über die
//     Leitung gesendeten Geheimnis  → kein Pass-the-Hash aus einem DB-Leak,
//   - ist er pro Nutzer gesalzen     → keine Rainbow-Tables.
//
// Läuft in der Convex-Mutation-Runtime (Web Crypto / crypto.subtle, deterministisch).
// Salt wird aus crypto.randomUUID() abgeleitet (in Mutationen erlaubt).

const PBKDF2_ITERATIONS = 100_000;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function newSalt(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function derivePasswordHash(clientHash: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientHash),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

// Konstant-Zeit-Vergleich, um Timing-Leaks beim Hash-Vergleich zu vermeiden.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
