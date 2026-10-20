/**
 * Les numéros de téléphone, sous une forme UNIQUE (E.164 : « +41791234567 »).
 *
 * « 079 123 45 67 », « 0791234567 », « +41 79 123 45 67 », « +41791234567 »,
 * « 0041 79 123 45 67 », « +41 (0)79 123 45 67 » désignent le même numéro :
 * c'est la bibliothèque de référence (libphonenumber, celle d'Android) qui en
 * décide, pas une expression maison. Un numéro suisse sans indicatif est lu
 * comme suisse.
 *
 * Code serveur seulement (les métadonnées pèsent ~150 Ko).
 */
import { parsePhoneNumberFromString, findPhoneNumbersInText } from "libphonenumber-js/max";

/** Le numéro sous forme E.164, ou null s'il ne s'agit pas d'un numéro. */
export function normaliserTelephone(brut: string | null | undefined): string | null {
  const t = String(brut || "").trim();
  if (!t) return null;
  const chiffres = t.replace(/\D/g, "");
  if (chiffres.length < 9 || chiffres.length > 15) return null;
  try {
    const n = parsePhoneNumberFromString(t, "CH");
    if (n && n.isPossible()) return n.number;
  } catch { /* forme inattendue : repli ci-dessous */ }
  // Repli : numéro national suisse à 10 chiffres, ou international en 00.
  if (/^0\d{9}$/.test(chiffres)) return `+41${chiffres.slice(1)}`;
  if (/^00\d{9,13}$/.test(chiffres)) return `+${chiffres.slice(2)}`;
  return null;
}

/** Tous les numéros écrits dans un texte libre, en E.164. */
export function telephonesDans(texte: string | null | undefined): string[] {
  const t = String(texte || "");
  if (!/\d/.test(t)) return [];
  const out = new Set<string>();
  try {
    for (const m of findPhoneNumbersInText(t, "CH")) out.add(m.number.number);
  } catch { /* texte inattendu : le repli suffit */ }
  // Repli : une suite de chiffres, espaces, points, barres ou tirets que la
  // bibliothèque n'a pas reconnue (formes d'écriture « 079/123.45.67 »).
  const re = /(?:\+|00)?\d[\d  .\/()-]{7,}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (/[ .\/-]{2,}/.test(m[0])) continue;
    const n = normaliserTelephone(m[0]);
    if (n) out.add(n);
  }
  return [...out];
}

/** « 078 818 55 56 » pour un numéro suisse, « +33 6 12 34 56 78 » sinon. */
export function afficherTelephone(e164: string): string {
  try {
    const n = parsePhoneNumberFromString(e164);
    if (n) return n.countryCallingCode === "41" ? n.formatNational() : n.formatInternational();
  } catch { /* repli */ }
  return e164;
}

/**
 * Deux numéros qui ne diffèrent que d'UN chiffre — faute de frappe d'un côté
 * ou de l'autre. Jamais une certitude : l'appelant le dit comme tel.
 */
export function telephonesVoisins(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let ecarts = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++ecarts > 1) return false;
  return ecarts === 1;
}
