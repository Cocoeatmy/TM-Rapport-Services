/**
 * Canton d'un chantier, déduit de son adresse.
 *
 * Deux sources, dans cet ordre :
 *   1. le nom du canton écrit dans l'adresse (« … à 1008 Prilly Vaud ») —
 *      c'est le cas le plus fréquent dans Notion et c'est la source la plus
 *      sûre ;
 *   2. à défaut, le numéro postal, via les plages officielles.
 *
 * Les plages romandes sont détaillées (VD, GE, FR, VS, NE, JU sont les cantons
 * où TM travaille) ; ailleurs elles restent volontairement grossières. La
 * frontière VD/FR entre 1470 et 1699 est trop imbriquée pour être tranchée au
 * code postal seul : sans canton dans l'adresse, on répond « Indéterminé »
 * plutôt que d'inventer une réponse fausse.
 */

const CANTON_NAMES: Record<string, string> = {
  vaud: "VD", geneve: "GE", fribourg: "FR", valais: "VS",
  neuchatel: "NE", jura: "JU", berne: "BE", bern: "BE",
  soleure: "SO", argovie: "AG", zurich: "ZH", tessin: "TI",
  lucerne: "LU", "bale-ville": "BS", "bale-campagne": "BL",
  schwytz: "SZ", zoug: "ZG", glaris: "GL", uri: "UR",
  grisons: "GR", "saint-gall": "SG", thurgovie: "TG",
  schaffhouse: "SH", appenzell: "AR", nidwald: "NW", obwald: "OW",
};

export const CANTON_LABELS: Record<string, string> = {
  VD: "Vaud", GE: "Genève", FR: "Fribourg", VS: "Valais",
  NE: "Neuchâtel", JU: "Jura", BE: "Berne", SO: "Soleure",
  AG: "Argovie", ZH: "Zurich", TI: "Tessin", LU: "Lucerne",
  BS: "Bâle-Ville", BL: "Bâle-Campagne", SZ: "Schwytz", ZG: "Zoug",
  GL: "Glaris", UR: "Uri", GR: "Grisons", SG: "Saint-Gall",
  TG: "Thurgovie", SH: "Schaffhouse", AR: "Appenzell", NW: "Nidwald",
  OW: "Obwald",
};

/** Plages [début, fin, canton]. Une plage absente = zone ambiguë. */
const NPA_RANGES: [number, number, string][] = [
  [1000, 1199, "VD"],
  [1200, 1259, "GE"],
  [1260, 1279, "VD"],
  [1280, 1290, "GE"],
  [1291, 1291, "VD"],
  [1292, 1294, "GE"],
  [1295, 1297, "VD"],
  [1298, 1298, "GE"],
  [1299, 1469, "VD"],
  // 1470–1699 : VD et FR s'entremêlent — laissé à l'adresse.
  [1700, 1799, "FR"],
  [1800, 1869, "VD"],
  [1870, 1899, "VS"],
  [1900, 1999, "VS"],
  [2000, 2149, "NE"],
  [2300, 2416, "NE"],
  [2500, 2565, "BE"],
  [2600, 2762, "BE"],
  [2800, 2999, "JU"],
  [3900, 3999, "VS"],
  [3000, 3299, "BE"],
  [3400, 3899, "BE"],
  [4000, 4499, "BS"],
  [5000, 5999, "AG"],
  [6500, 6999, "TI"],
  [7000, 7999, "GR"],
  [8000, 8999, "ZH"],
  [9000, 9999, "SG"],
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Code du canton (« VD ») ou null si l'adresse ne permet pas de trancher. */
export function cantonOf(address: string): string | null {
  const a = fold(address || "");
  for (const [name, code] of Object.entries(CANTON_NAMES)) {
    // Mot entier : « berne » ne doit pas être trouvé dans « Bernex ».
    if (new RegExp(`\\b${name}\\b`).test(a)) return code;
  }
  const npa = (address || "").match(/\b(\d{4})\b/);
  if (npa) {
    const n = Number(npa[1]);
    for (const [from, to, code] of NPA_RANGES) {
      if (n >= from && n <= to) return code;
    }
  }
  return null;
}

/** Libellé lisible : « Vaud », ou « Indéterminé » quand on ne sait pas. */
export function cantonLabel(address: string): string {
  const c = cantonOf(address);
  return c ? (CANTON_LABELS[c] || c) : "Indéterminé";
}

/**
 * Régions de travail (districts et bassins usuels), déduites du code postal.
 *
 * C'est une APPROXIMATION assumée : les limites de districts ne suivent pas
 * exactement les plages de codes postaux. Elle reste suffisamment juste pour
 * répondre à « où travaillons-nous le plus », et tout ce qui sort des plages
 * connues tombe dans « Autre région » plutôt que d'être mal rangé.
 */
const REGION_RANGES: [number, number, string][] = [
  [1000, 1019, "Lausanne"],
  [1020, 1033, "Ouest lausannois"],
  [1034, 1059, "Gros-de-Vaud"],
  [1060, 1099, "Lavaux-Oron"],
  [1100, 1199, "Morges"],
  [1200, 1259, "Genève"],
  [1260, 1279, "Nyon"],
  [1280, 1290, "Genève"],
  [1291, 1291, "Nyon"],
  [1292, 1294, "Genève"],
  [1295, 1297, "Nyon"],
  [1298, 1298, "Genève"],
  [1299, 1299, "Nyon"],
  [1300, 1329, "Morges"],
  [1330, 1359, "Jura-Nord vaudois"],
  [1400, 1469, "Jura-Nord vaudois"],
  [1470, 1529, "Broye"],
  [1530, 1599, "Broye"],
  [1600, 1629, "Veveyse / Oron"],
  [1630, 1669, "Gruyère"],
  [1670, 1699, "Glâne"],
  [1700, 1749, "Sarine (Fribourg)"],
  [1750, 1785, "Sarine (Fribourg)"],
  [1786, 1799, "Lac / Broye fribourgeoise"],
  [1800, 1849, "Riviera - Pays-d'Enhaut"],
  [1850, 1899, "Chablais"],
  [1900, 1999, "Valais central"],
  [2000, 2149, "Neuchâtel"],
  [2300, 2416, "Montagnes neuchâteloises"],
  [2500, 2599, "Bienne"],
  [2600, 2762, "Jura bernois"],
  [2800, 2999, "Jura"],
  [3900, 3999, "Haut-Valais"],
];

/** Région d'un chantier, ou « Autre région » hors des plages connues. */
export function regionLabel(address: string): string {
  const npa = (address || "").match(/\b(\d{4})\b/);
  if (!npa) return "Sans adresse";
  const n = Number(npa[1]);
  for (const [from, to, name] of REGION_RANGES) {
    if (n >= from && n <= to) return name;
  }
  return "Autre région";
}
