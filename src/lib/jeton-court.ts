/**
 * Jeton COURT d'un projet, pour les liens des notes du calendrier (23.10.2026).
 *
 * L'ancien jeton encodait l'identifiant Notion EN TEXTE (36 caractères →
 * 48 en base64url) : le lien prenait deux lignes dans le rendez-vous. Le
 * jeton court encode les 16 OCTETS de l'identifiant : 22 caractères. Les deux
 * formes restent lisibles — les anciens liens déjà posés continuent de marcher.
 */

const HEX = /^[0-9a-f]{32}$/i;

export function jetonCourt(id: string): string {
  const hex = String(id || "").replace(/-/g, "");
  if (!HEX.test(hex)) return Buffer.from(String(id || "")).toString("base64url");
  return Buffer.from(hex, "hex").toString("base64url");
}

/** L'identifiant Notion (avec tirets) depuis un jeton court ou ancien. */
export function idDepuisJeton(jeton: string): string {
  const t = String(jeton || "");
  if (/^[A-Za-z0-9_-]{22}$/.test(t)) {
    const hex = Buffer.from(t, "base64url").toString("hex");
    if (HEX.test(hex)) return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  try { return Buffer.from(t, "base64url").toString("utf8"); } catch { return ""; }
}
