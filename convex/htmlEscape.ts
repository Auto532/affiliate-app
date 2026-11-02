// HTML-Escaping für Telegram-Nachrichten (parse_mode: "HTML").
// User-Input (Namen, Nachrichten, Shop-Namen) muss escaped werden — sonst kann
// eingeschleustes HTML die Nachricht fälschen oder den Versand komplett
// scheitern lassen (Telegram lehnt ungültiges HTML ab → Benachrichtigung weg).
// Auch Anführungszeichen, damit Werte in HTML-Attributen (href="…") sicher sind.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
