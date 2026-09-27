/**
 * Chantiers PPE / locatif — regroupement des offres d'un même immeuble.
 *
 * Un gros chantier se présente de deux façons dans Notion :
 *
 *   1. UNE offre qui porte beaucoup de cabines (immeuble commandé en bloc).
 *      Les lots sont alors dans « Lot (nom de cabine) » — « Cab1:App. 202 | … ».
 *
 *   2. PLUSIEURS offres d'une ou deux cabines, une par lot vendu. Le titre est
 *      le même d'une offre à l'autre ; seul le lot change (« Bât. S » / « Bât. T »,
 *      « App. 202 » / « App. 203 », ou le nom du propriétaire).
 *
 * Le seul point commun fiable dans le second cas est l'ADRESSE : le titre varie,
 * le grossiste peut changer, les dates n'ont rien à voir, mais l'immeuble reste
 * à la même rue. La signature d'un chantier est donc « NPA + rue sans numéro » :
 * deux bâtiments d'un même lotissement se retrouvent ensemble, et la graphie
 * (« Rte. » / « Route ») est normalisée pour ne pas couper un groupe en deux.
 *
 * Conséquence assumée : deux chantiers distincts dans la même rue et le même
 * NPA se rejoignent. C'est rare, visible d'un coup d'œil dans la liste des
 * offres, et préférable à un chantier éclaté en morceaux.
 */

export interface ProjetChantier {
  id: string;
  projet: string;
  ofrTM: string;
  adresseChantier: string;
  nbCabines: number | null;
  nbCabinesInstallees: number | null;
  nomsCabines: string;
  etatMontage: string;
  etatCMD: string;
  etatMesures: string;
  fournisseurs: string[];
  seriesCabines: string[];
  grossistesNames: string[];
  sanitaireNames: string[];
  ofrGrossiste: string;
  cmdTM: string;
  cmdTMUsine: string;
  cmdGrossiste: string;
  dateMesuresRecue: string | null;
  dateOffre: string | null;
  dateCMDRecue: string | null;
  dateCMDUsine: string | null;
  arrivageTM: string | null;
  arrivageGrossiste: string | null;
  dateMontage: string | null;
  diversInfosChantier: string;
  emplacementCabine: string;
  typeServices: string[];
  lastEditedTime: string;
}

/** Une ligne du tableau de suivi : un lot, c'est-à-dire une cabine vendue. */
export interface Lot {
  projectId: string;
  ofrTM: string;
  /** Rang de la cabine dans l'offre (1-based) ; null si l'offre n'en a qu'une. */
  cab: number | null;
  /** Libellé du lot : « Lot K », « App. 202 », « Bât. S », « Barras Ignace »… */
  nom: string;
  /** Pièce équipée, quand la cabine en porte le nom : « SDD parentale ». */
  piece: string;
  batiment: string;
  etage: string;
  sanitaire: string;
  grossiste: string;
  ofrGrossiste: string;
  marque: string;
  serie: string;
  emplacement: string;
  mesure: boolean;
  dateMesures: string | null;
  dateOffre: string | null;
  cmd: string;
  dateCMD: string | null;
  livraison: string | null;
  pose: boolean;
  datePose: string | null;
  statut: string;
  infos: string;
}

export interface Chantier {
  /** Signature d'adresse — sert de clé d'URL et de React key. */
  id: string;
  nom: string;
  rue: string;
  localite: string;
  offres: ProjetChantier[];
  lots: Lot[];
  nbLots: number;
  nbMesurees: number;
  nbCommandees: number;
  nbLivrees: number;
  nbPosees: number;
  fournisseurs: string[];
  grossistes: string[];
  /**
   * Chantier soldé : TOUTES ses offres sont au statut « Terminé ». On ne se
   * fie pas au pourcentage posé, qui dépend des photos remontées du chantier
   * et peut rester à 90 % sur une affaire pourtant close.
   */
  termine: boolean;
  /** Dernière modification d'une des offres — sert au tri « récents d'abord ». */
  dernierMouvement: string;
}

/* ── Normalisation ──────────────────────────────────────────────────────── */

function sansAccents(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Abréviations postales suisses ramenées à une forme unique. */
const VOIES: [RegExp, string][] = [
  [/\b(rte|route)\b/g, "route"],
  [/\b(ch|chem|chemin)\b/g, "chemin"],
  [/\b(av|ave|avenue)\b/g, "avenue"],
  [/\b(all|allee)\b/g, "allee"],
  [/\b(bd|blvd|boulevard)\b/g, "boulevard"],
  [/\b(pl|place)\b/g, "place"],
  [/\b(imp|impasse)\b/g, "impasse"],
  [/\b(sent|sentier)\b/g, "sentier"],
  [/\b(quart|quartier)\b/g, "quartier"],
  [/\b(prom|promenade)\b/g, "promenade"],
  [/\b(st|saint)\b/g, "saint"],
  [/\b(ste|sainte)\b/g, "sainte"],
];

function normaliserVoie(s: string): string {
  let v = sansAccents(s).toLowerCase()
    .replace(/[.,;:'’"()]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  VOIES.forEach(([re, rep]) => { v = v.replace(re, rep); });
  // Numéro de police retiré : « Prairie 5 bât. S » et « Prairie 5 bât. T »
  // partagent la rue ; « Rte de Vandoeuvres 77 » et « Rte de Vandoeuvres »
  // aussi. Les chiffres collés à un mot (« V77 ») sont conservés.
  return v.replace(/\b\d+[a-z]?\b/g, " ").replace(/\s+/g, " ").trim();
}

/** Le pays en queue d'adresse — « …, 1008 Prilly, Suisse » — n'est pas une rue. */
const RE_PAYS = /[,;]?\s*(suisse|switzerland|schweiz|svizzera|ch)\s*$/i;

/**
 * Sépare « rue » et « NPA + localité ».
 *
 * Le NPA est cherché À TRAVERS le texte, pas seulement à la fin : la colonne
 * Notion est souvent écrite à la façon de Google Maps, avec le pays derrière la
 * localité. Ancrer la recherche à la fin faisait échouer la lecture, et le
 * dernier morceau — « Suisse » — devenait la rue : tous les chantiers d'une
 * même commune se retrouvaient alors dans un seul groupe.
 */
function detacherLocalite(brut: string): { npa: string; ville: string; avant: string } {
  const txt = (brut || "").replace(/\s+/g, " ").trim().replace(RE_PAYS, "").trim();
  // Dernier NPA du texte : un numéro de rue à quatre chiffres est improbable,
  // et le titre peut en contenir un plus tôt (nom de résidence).
  const re = /\b(\d{4})\b/g;
  let m: RegExpExecArray | null = null, x: RegExpExecArray | null;
  while ((x = re.exec(txt))) m = x;
  if (!m) return { npa: "", ville: "", avant: txt };
  const ville = txt.slice(m.index + 4).split(/[,;]/)[0].trim();
  const avant = txt.slice(0, m.index)
    .replace(/[,;\-–]\s*$/, "")
    .replace(/\s+(?:à|a)\s*$/i, "")
    .replace(/[,;\-–]\s*$/, "")
    .trim();
  return { npa: m[1], ville, avant };
}

/**
 * La rue est le DERNIER morceau avant la localité.
 *
 * C'est le point clé du regroupement : un titre est fait de segments séparés
 * par « - » ou « , », dont les premiers désignent la marque puis le lot — ce
 * qui change d'une offre à l'autre — et le dernier la rue, qui ne change pas.
 * Prendre le titre entier ferait de « Bât. S » et « Bât. T » deux chantiers.
 */
function derniereVoie(avant: string): string {
  const morceaux = avant.split(/\s+-\s+|,/).map((x) => x.trim()).filter(Boolean);
  return morceaux.length > 0 ? morceaux[morceaux.length - 1] : avant;
}

function decouperAdresse(brut: string): { npa: string; ville: string; rue: string } {
  const { npa, ville, avant } = detacherLocalite(brut);
  return { npa, ville, rue: derniereVoie(avant) };
}

/**
 * Adresse d'un projet : la colonne Notion quand elle est remplie, sinon la fin
 * du titre, qui la contient presque toujours (« … à 1950 Sion »).
 */
export function adresseDe(p: ProjetChantier): { npa: string; ville: string; rue: string } {
  const a = decouperAdresse(p.adresseChantier || "");
  if (a.npa && a.rue) return a;
  const t = decouperAdresse(p.projet || "");
  // Une source est prise EN BLOC : mélanger le NPA du titre avec la « rue »
  // d'une adresse illisible produit des groupes qui n'existent pas.
  if (t.npa && t.rue) return t;
  return {
    npa: a.npa || t.npa,
    ville: a.ville || t.ville,
    rue: a.rue || t.rue,
  };
}

/** Clé de regroupement : NPA + rue normalisée. Vide si l'adresse est inconnue. */
export function signatureChantier(p: ProjetChantier): string {
  const { npa, ville, rue } = adresseDe(p);
  const voie = normaliserVoie(rue);
  // Sans rue exploitable, le NPA seul regrouperait toute une commune : on
  // préfère ne pas regrouper du tout. Même chose si la « rue » n'est que la
  // localité répétée, ou un mot trop court pour désigner une adresse.
  if (!voie || voie.length < 4) return "";
  if (voie === normaliserVoie(ville)) return "";
  return `${npa || sansAccents(ville).toLowerCase()}|${voie}`;
}

/* ── Lots ───────────────────────────────────────────────────────────────── */

/** « Cab1:App. 202 | Cab2:App. 203 » → { 1: "App. 202", 2: "App. 203" }. */
export function parseNomsCabines(raw: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:\s*([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) {
    const v = m[2].trim();
    if (v) map[parseInt(m[1], 10)] = v;
  }
  return map;
}

/** « Cab1:Montage terminé | Cab3:Montage partiel » → { 1: "Montage terminé", … }. */
function parseEtatMontage(raw: string): Record<number, string> {
  return parseNomsCabines(raw);
}

const RE_BATIMENT = /\b(?:b[âa]t(?:iment)?\.?)\s*([A-Za-z0-9.\-]{1,6})/i;
const RE_APPART = /\b(?:app(?:t|artement)?\.?|apt\.?)\s*([A-Za-z0-9.\-]{1,8})/i;
const RE_LOT = /\blot\s*(?:n[°o]\s*)?([A-Za-z0-9.\-]{1,10})/i;
const RE_ETAGE = /\b(rez(?:-de-chauss[ée]e)?|sous-sol|attique|combles|\d{1,2}\s*(?:er|ère|e|ème|éme))\b(?:\s*[ée]tage)?/i;

/** Extrait bâtiment / étage / lot d'un libellé libre (titre ou nom de cabine). */
export function analyserLibelle(txt: string): { batiment: string; etage: string; lot: string } {
  const s = txt || "";
  const bat = s.match(RE_BATIMENT);
  const app = s.match(RE_APPART);
  const lot = s.match(RE_LOT);
  const eta = s.match(RE_ETAGE);
  return {
    batiment: bat ? bat[1].replace(/[.\-]$/, "") : "",
    etage: eta ? eta[0].replace(/\s+/g, " ").trim() : "",
    lot: (app ? `App. ${app[1]}` : lot ? `Lot ${lot[1]}` : "").replace(/[.\-]$/, ""),
  };
}

/**
 * Ce libellé désigne-t-il un LOT, ou seulement une pièce de l'appartement ?
 *
 * « Lot K », « App. 202 », « Bât. S », « 3.03C » identifient un lot. « SDD »,
 * « SDD parentale », « Cabine 2 » décrivent la pièce équipée : les afficher en
 * colonne « Lot » ne dit rien de l'appartement concerné.
 */
function ressembleAUnLot(txt: string): boolean {
  const v = (txt || "").trim();
  if (!v) return false;
  if (/^cabine\s*\d*$/i.test(v)) return false;
  if (RE_APPART.test(v) || RE_LOT.test(v) || RE_BATIMENT.test(v)) return true;
  // Code court d'un plan d'architecte : « 3.03C », « 28F », « A12 », « K ».
  return /^[A-Za-z]?\d[\w.\-]{0,6}$/.test(v) || /^[A-Z]\d?$/.test(v);
}

/**
 * Libellé du lot pour une offre à cabine unique : ce qui distingue cette offre
 * des autres du même chantier. On retire la partie adresse (identique partout)
 * et le préfixe fournisseur/grossiste, il ne reste que le lot ou le client.
 */
function libelleOffre(p: ProjetChantier): string {
  const t = detacherLocalite(p.projet || "").avant;
  // Le dernier morceau est la rue, commune à tout le chantier : elle ne
  // distingue rien. On garde ce qu'il y a entre la marque et la rue.
  const morceaux = t.split(/\s+-\s+|,/).map((s) => s.trim()).filter(Boolean);
  if (morceaux.length > 2) morceaux.pop();
  // Le premier morceau est la marque ou le grossiste dans la quasi-totalité
  // des titres (« Ronal - … », « Duka ch AG - … ») : inutile ici.
  if (morceaux.length > 1) morceaux.shift();
  const reste = morceaux.join(" - ");
  const info = analyserLibelle(reste);
  if (info.lot) return info.lot;
  if (info.batiment) return `Bât. ${info.batiment}`;
  return reste || t;
}

function aDate(...v: (string | null | undefined)[]): string | null {
  for (const x of v) if (x) return x;
  return null;
}

/** Les lots d'une offre : un par cabine si l'offre en porte plusieurs. */
export function lotsDeLOffre(p: ProjetChantier): Lot[] {
  const noms = parseNomsCabines(p.nomsCabines);
  const etats = parseEtatMontage(p.etatMontage);
  const total = Math.max(1, p.nbCabines || 0);
  const installees = p.nbCabinesInstallees || 0;
  const termine = p.etatCMD === "Terminé";

  const base = {
    projectId: p.id,
    ofrTM: p.ofrTM || "",
    sanitaire: (p.sanitaireNames || []).join(", "),
    grossiste: (p.grossistesNames || []).join(", "),
    ofrGrossiste: p.ofrGrossiste || "",
    marque: (p.fournisseurs || []).join(", "),
    serie: (p.seriesCabines || []).join(", "),
    emplacement: p.emplacementCabine || "",
    mesure: !!p.dateMesuresRecue || p.etatMesures === "Terminé",
    dateMesures: p.dateMesuresRecue,
    dateOffre: p.dateOffre,
    cmd: p.cmdTMUsine || p.cmdTM || p.cmdGrossiste || "",
    dateCMD: aDate(p.dateCMDUsine, p.dateCMDRecue),
    livraison: aDate(p.arrivageTM, p.arrivageGrossiste),
    datePose: p.dateMontage,
    statut: p.etatCMD || "",
    infos: p.diversInfosChantier || "",
  };

  /* Le lot se lit d'abord dans le TITRE de l'offre : c'est là qu'il est écrit
     de façon fiable (« … - Lot K, … »). Le nom de cabine ne sert de lot que
     s'il en est vraiment un — sur un immeuble commandé en bloc, chaque cabine
     porte alors son appartement (« App. 1.01 »). Quand il décrit seulement la
     pièce (« SDD parentale »), il passe en information secondaire plutôt que
     de remplir la colonne « Lot » avec « Cabine 2 », qui ne dit rien. */
  const lotDuTitre = libelleOffre(p);
  const commun = analyserLibelle(p.projet || "");

  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const brut = (noms[n] || "").trim();
    const cabEstLot = ressembleAUnLot(brut);
    const nom = cabEstLot ? brut : (lotDuTitre || brut || `Cabine ${n}`);
    // « Cabine 1 SDD parentale » → on ne garde que la pièce.
    const piece = cabEstLot || !brut
      ? ""
      : brut.replace(/^cabine\s*\d+\s*/i, "").trim();
    const info = analyserLibelle(cabEstLot ? brut : `${lotDuTitre} ${p.projet}`);
    return {
      ...base,
      cab: total > 1 ? n : null,
      nom,
      piece: piece && piece.toLowerCase() !== nom.toLowerCase() ? piece : "",
      batiment: info.batiment || commun.batiment,
      etage: info.etage || commun.etage,
      // Une cabine est posée si son état le dit ; à défaut, le compteur
      // « Nb. cabines installées » remplit les premières dans l'ordre.
      pose: etats[n] === "Montage terminé" || (!etats[n] && (termine || n <= installees)),
    };
  });
}

/* ── Regroupement ───────────────────────────────────────────────────────── */

/**
 * Une offre compte-t-elle comme un ou plusieurs lots du chantier ?
 *
 * Non pour une offre annulée — le lot n'existe pas — ni pour une intervention
 * de service pure : un dépannage à l'immeuble n'est pas une cabine vendue, et
 * la compter gonflerait l'avancement du chantier avec des lignes fantômes.
 */
function estUnLot(p: ProjetChantier): boolean {
  if (p.etatCMD === "Annulé") return false;
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  if (t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "")) return false;
  return true;
}

export interface OptionsChantiers {
  /** Nombre de cabines à partir duquel un chantier mérite un suivi. */
  seuilCabines?: number;
  /** Nombre d'offres à partir duquel un chantier mérite un suivi. */
  seuilOffres?: number;
}

/**
 * Nom lisible du chantier.
 *
 * La partie commune aux titres est à la FIN (« …, Panatier, Ch. du Vieux-Canal
 * 7 à 1950 Sion ») : c'est le début qui porte le lot. On cherche donc d'abord
 * le suffixe commun, coupé sur un séparateur pour ne pas commencer au milieu
 * d'un mot ; le préfixe ne sert que de repli.
 */
function nommerChantier(offres: ProjetChantier[], rue: string): string {
  const titres = offres.map((o) => (o.projet || "").trim()).filter(Boolean);
  if (titres.length === 0) return rue;
  const propre = (v: string) =>
    detacherLocalite(v).avant.replace(/^[\s,\-–]+/, "").replace(/[\s,\-–]+$/, "").trim();

  if (titres.length === 1) return propre(titres[0]) || rue;

  // Suffixe commun.
  let j = 0;
  const court = titres.reduce((m, t) => Math.min(m, t.length), Infinity);
  while (j < court && titres.every((t) => t[t.length - 1 - j] === titres[0][titres[0].length - 1 - j])) j++;
  let suffixe = titres[0].slice(titres[0].length - j);
  const debut = Math.max(suffixe.indexOf(" - "), suffixe.indexOf(", "));
  if (debut >= 0) suffixe = suffixe.slice(debut + 2);
  suffixe = propre(suffixe);
  if (suffixe.length >= 6) return suffixe;

  // Repli : préfixe commun, coupé lui aussi sur un séparateur.
  let i = 0;
  while (i < court && titres.every((t) => t[i] === titres[0][i])) i++;
  let prefixe = titres[0].slice(0, i);
  const coupe = Math.max(prefixe.lastIndexOf(" - "), prefixe.lastIndexOf(", "));
  if (coupe > 8) prefixe = prefixe.slice(0, coupe);
  prefixe = propre(prefixe);
  return prefixe.length >= 6 ? prefixe : rue;
}

/**
 * Construit les chantiers à suivre. Un chantier est retenu s'il porte au moins
 * `seuilCabines` cabines OU s'il rassemble au moins `seuilOffres` offres — la
 * seconde règle attrape les immeubles vendus lot par lot, où chaque offre ne
 * compte qu'une cabine.
 */
export function construireChantiers(
  projets: ProjetChantier[],
  { seuilCabines = 10, seuilOffres = 3 }: OptionsChantiers = {},
): Chantier[] {
  const groupes = new Map<string, ProjetChantier[]>();
  projets.filter(estUnLot).forEach((p) => {
    const sig = signatureChantier(p);
    // Sans adresse exploitable, une offre ne peut être regroupée qu'avec
    // elle-même : elle reste un chantier si elle porte assez de cabines.
    const cle = sig || `seul|${p.id}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(p);
  });

  const chantiers: Chantier[] = [];
  groupes.forEach((offres, cle) => {
    const lots = offres.flatMap(lotsDeLOffre);
    if (lots.length < seuilCabines && offres.length < seuilOffres) return;

    const { npa, ville, rue } = adresseDe(offres[0]);
    chantiers.push({
      id: cle,
      nom: nommerChantier(offres, rue || ville),
      rue,
      localite: [npa, ville].filter(Boolean).join(" "),
      offres: [...offres].sort((a, b) => (a.ofrTM || "").localeCompare(b.ofrTM || "")),
      lots,
      nbLots: lots.length,
      nbMesurees: lots.filter((l) => l.mesure).length,
      nbCommandees: lots.filter((l) => !!l.cmd || !!l.dateCMD).length,
      nbLivrees: lots.filter((l) => !!l.livraison).length,
      nbPosees: lots.filter((l) => l.pose).length,
      fournisseurs: [...new Set(offres.flatMap((o) => o.fournisseurs || []))],
      grossistes: [...new Set(offres.flatMap((o) => o.grossistesNames || []))],
      termine: offres.every((o) => o.etatCMD === "Terminé"),
      dernierMouvement: offres.reduce((max, o) => (o.lastEditedTime > max ? o.lastEditedTime : max), ""),
    });
  });

  return chantiers.sort((a, b) => b.dernierMouvement.localeCompare(a.dernierMouvement));
}

/** Pourcentage entier, sans division par zéro. */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
