/**
 * L'argent, côté assistant IA : jamais lu, jamais transmis, jamais répondu.
 *
 *  - `estQuestionArgent` refuse la question AVANT le modèle ;
 *  - `colonneArgent` écarte une colonne Notion d'après son nom, à la lecture ;
 *  - `sansMontants` efface les montants écrits dans un texte libre.
 *
 * (Le nom du fichier est historique : l'annuaire lui-même vit désormais dans
 * src/lib/recherche-ia/.)
 */

/* ── Questions d'argent ───────────────────────────────────────────────── */

/**
 * Une question sur l'argent : chiffre d'affaires, prix, montants, factures,
 * paiements, marge, salaires… L'assistant n'y répond JAMAIS — même à
 * l'administrateur : c'est la consigne. Le refus est décidé ici, avant
 * l'appel au modèle, pour ne pas dépendre de sa bonne volonté.
 *
 * « OFR » (le numéro de dossier) et « offre » ne déclenchent rien : on parle
 * tous les jours du dossier TM-OFR sans parler d'argent.
 */
export function estQuestionArgent(question: string): boolean {
  const brut = String(question || "");
  if (/\bCA\b/.test(brut)) return true; // « le CA de 2025 » (majuscules : « ça » n'est pas visé)
  if (/[€$£]|\bCHF\b|\bFr\.\s*\d/i.test(brut)) return true;
  const q = brut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(chiffre[s]? d.affaire|\bargent\b|\bprix\b|\btarif|\bmontant|\bfactur|\bpaiement|\bpaye[rsz]?\b|\bpayee?s?\b|\bimpaye|\bencaiss|\bmarge[s]?\b|\bbenefice|\brentab|\bsalaire|\bcout(e|ent|s)?\b|\bcoute\b|\bbudget|\bbexio\b|\bfrancs?\b|\brabais|\bacompte|\bpaie\b|\bfinanc|\btresorerie|\bcombien (ca|cela) (coute|fait|vaut)|\bvaleur (du|des|de la) (projet|dossier|commande|chantier)|\bdepense)/.test(q);
}

export const REFUS_ARGENT =
  "Je ne réponds pas aux questions d'argent : chiffre d'affaires, prix, montants, factures ou paiements. "
  + "Je peux en revanche tout te dire sur un dossier — client, adresse, contacts et numéros, états, dates, collaborateurs, commandes, livraisons, SAV.";

/**
 * Retire les montants d'un texte libre (commentaire, journal) avant de le
 * donner au modèle : « 1'250.– CHF », « Fr. 300 », « 45 € »… Le reste du
 * texte garde son sens ; seul le chiffre de l'argent disparaît.
 */
export function sansMontants(texte: string): string {
  return String(texte || "")
    .replace(/(?:\bCHF|\bFrs?\.?|€)\s*-?\d[\d'’ .,]*(?:[.,]-+|\.–)?/gi, "[montant retiré]")
    .replace(/-?\d[\d'’ .,]*(?:[.,]-+|\.–)?\s*(?:CHF|Frs?\b\.?|francs?\b|€|EUR\b)/gi, "[montant retiré]");
}

/**
 * Une colonne d'ARGENT, d'après son nom : elle n'est jamais lue. « Rabais
 * cabines », « Escompte », « Mail de facturations », « Montant OFR »… Le
 * nom suffit : dans ces bases, une colonne d'argent dit ce qu'elle est.
 */
export function colonneArgent(nom: string): boolean {
  return /prix|montant|tarif|factur|chiffre|rabais|remise|marge|escompte|co[uû]t|paiement|\bchf\b|\bca\b|budget|valeur|b[ée]n[ée]fice|salaire|acompte|cr[ée]dit|bexio|iban|bancaire|banque|revenu|tr[ée]sorerie|\bofr\b.*montant|encaiss|impay/i.test(nom);
}
