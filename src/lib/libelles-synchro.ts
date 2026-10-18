"use client";

/**
 * Des intitulés lisibles pour ce qui attend d'être synchronisé.
 *
 * La liste affichait « Mise à jour interventionsMontageCabines · 3f91895b… » :
 * l'identifiant Notion du projet et le nom technique du champ. Un monteur ne
 * sait pas à quel chantier cela correspond.
 *
 * Tout ce qui est affiché ici vient des DONNÉES RÉELLES de l'opération :
 *  - le numéro TM du projet, lu dans les fiches gardées sur l'appareil (le
 *    projet a forcément été ouvert pour y travailler) ;
 *  - pour une photo, sa planche et son numéro dans la planche, inscrits dans
 *    le nom du fichier au moment de la prise (« Montage gauche.2.… ») ;
 *  - le lot, quand la photo vient d'un lot précis ;
 *  - pour une saisie, le champ réellement modifié.
 * Rien n'est inventé : sans numéro TM connu, on montre le nom du chantier,
 * ou à défaut le début de l'identifiant.
 */

export interface InfoProjet { numero: string; nom: string }

/** Le premier numéro TM d'un champ « OFR TM » (« TM-2600825, TM-2600826 »). */
export function premierNumeroTM(ofr: string | undefined | null): string {
  const t = String(ofr || "");
  const chiffres = t.match(/TM-?\s?(\d{5,})/i);
  if (chiffres) return `TM-${chiffres[1]}`;
  // Un numéro d'essai ou provisoire (« TM-TEST ») : tel qu'il est écrit.
  const autre = t.match(/\bTM-([A-Z0-9]{2,})\b/i);
  return autre ? `TM-${autre[1].toUpperCase()}` : "";
}

type ProjetBrut = { id?: string; ofrTM?: string; projet?: string; nomChantier?: string };

function ajouter(index: Map<string, InfoProjet>, p: ProjetBrut | null | undefined) {
  if (!p || typeof p !== "object" || !p.id || index.has(p.id)) return;
  const numero = premierNumeroTM(p.ofrTM);
  const nom = String(p.projet || p.nomChantier || "").trim();
  if (numero || nom) index.set(p.id, { numero, nom });
}

function parcourir(index: Map<string, InfoProjet>, v: unknown, profondeur = 0) {
  if (profondeur > 3 || !v) return;
  if (Array.isArray(v)) { for (const x of v) ajouter(index, x as ProjetBrut); return; }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string") { ajouter(index, o as ProjetBrut); return; }
    for (const x of Object.values(o)) parcourir(index, x, profondeur + 1);
  }
}

/**
 * Les projets connus de l'appareil : listes du tableau de bord, cache hors
 * ligne, fiches préparées. Lu à la demande, sans réseau.
 */
let memoProjets: { index: Map<string, InfoProjet>; jusqua: number } | null = null;

export function projetsConnus(): Map<string, InfoProjet> {
  /* Les listes gardées peuvent peser plusieurs mégaoctets : relues au plus
     toutes les trente secondes. */
  if (memoProjets && memoProjets.jusqua > Date.now()) return memoProjets.index;
  const index = new Map<string, InfoProjet>();
  memoProjets = { index, jusqua: Date.now() + 30_000 };
  if (typeof localStorage === "undefined") return index;
  for (const cle of ["tm-projects-cache", "tm-rapport-cache"]) {
    try { parcourir(index, JSON.parse(localStorage.getItem(cle) || "null")); } catch { /* illisible */ }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle?.startsWith("tm-project-")) {
        try { ajouter(index, JSON.parse(localStorage.getItem(cle) || "null")); } catch { /* illisible */ }
      }
    }
  } catch { /* stockage illisible */ }
  return index;
}

/** « TM-2600825 », ou le nom du chantier, ou le début de l'identifiant. */
/** Pour les tests. */
export function _oublierProjets(): void { memoProjets = null; }

export function referenceProjet(projectId: string | undefined, projets: Map<string, InfoProjet>): string {
  if (!projectId) return "";
  const p = projets.get(projectId);
  if (p?.numero) return p.numero;
  if (p?.nom) return p.nom.length > 28 ? `${p.nom.slice(0, 27)}…` : p.nom;
  return `projet ${projectId.slice(0, 8)}`;
}

/* ── Photos ──────────────────────────────────────────────────────────── */

/**
 * Ce que dit le nom d'un fichier photo : « Montage gauche.2.1792346187038
 * .p1792346180000.jpg » → planche « Montage gauche », numéro 2.
 */
export function lireNomPhoto(nom: string): { planche: string; numero: string } {
  const sansExt = nom.replace(/\.[a-z0-9]{2,5}$/i, "");
  const m = sansExt.match(/^(.*?)\.(\d{1,4})\.\d{10,}/);
  const brut = m ? m[1] : sansExt.replace(/[-_.]?\d{10,}.*$/, "");
  const planche = brut
    .replace(/^Photos?\s*-\s*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { planche, numero: m ? m[2] : "" };
}

function minusculeDebut(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export interface EntreePhoto {
  projectId: string;
  category?: string;
  notionField?: string;
  champTexte?: string;
  signalement?: Record<string, unknown>;
  files?: { name: string }[];
}

/** « Photo montage gauche 2 », « Signature du client », « Défaut — Joint fendu ». */
export function natureDePhoto(e: EntreePhoto): string {
  if (e.champTexte === "signatureUrl") return "Signature du client";
  if (e.signalement) {
    const s = e.signalement;
    const quoi = String(s.typesLabel || (Array.isArray(s.types) ? s.types.join(", ") : "") || s.description || "").trim();
    const n = e.files?.length ?? 0;
    return `Défaut${quoi ? ` — ${quoi.length > 40 ? `${quoi.slice(0, 39)}…` : quoi}` : ""}${n > 1 ? ` (${n} photos)` : ""}`;
  }
  const noms = (e.files ?? []).map((f) => lireNomPhoto(f.name));
  const premier = noms[0];
  let quoi: string;
  if (premier?.planche) {
    const numeros = noms.map((n) => n.numero).filter(Boolean);
    quoi = `Photo ${minusculeDebut(premier.planche)}${numeros.length ? ` ${numeros.join(", ")}` : ""}`;
  } else if (e.notionField) {
    quoi = e.notionField.replace(/^Photos?\s+/i, "Photo ");
  } else {
    quoi = "Photo";
  }
  const lot = e.category?.match(/-cab(\d+)$/i)?.[1];
  return lot ? `${quoi} · lot ${lot}` : quoi;
}

/* ── Saisies ─────────────────────────────────────────────────────────── */

/** Les champs les plus fréquents, avec leur nom lisible. */
const CHAMPS: Record<string, string> = {
  rapportMonteur: "Rapport de montage",
  heureArrivee: "Heure d'arrivée",
  heureDepart: "Heure de départ",
  commentairesMontages: "Commentaires",
  noteInterneMontage: "Note interne",
  signatureUrl: "Signature du client",
  dateMontage: "Date de montage",
  dateMesures: "Date des mesures",
  interventionsMontageCabines: "Interventions par lot",
  monteursCabines: "Monteurs par lot",
  nomsCabines: "Noms des lots",
};

/** « interventionsMontageCabines » → « Interventions montage cabines ». */
export function nomDuChamp(cle: string): string {
  if (CHAMPS[cle]) return CHAMPS[cle];
  if (/^photos/i.test(cle)) return "Liste des photos";
  const mots = cle.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return mots ? mots.charAt(0).toUpperCase() + mots.slice(1) : cle;
}

export interface EntreeSaisie { url: string; method?: string; body?: unknown; type?: string }

/** « Heures d'intervention », « Rapport de montage + heures », « Envoi du rapport (PDF) »… */
export function natureDeSaisie(e: EntreeSaisie): string {
  const body = (typeof e.body === "string"
    ? (() => { try { return JSON.parse(e.body as string); } catch { return {}; } })()
    : (e.body || {})) as Record<string, unknown>;
  const u = e.url;
  if (u.includes("cabine-attribution")) return "Monteurs par lot";
  if (u.includes("/api/pdf") || u.includes("pdf")) return "Envoi du rapport (PDF)";
  if (u.includes("/api/defauts")) return "Signalement de défaut";
  if (u.includes("/api/pieces")) return "Pièce à commander";
  if (u.includes("logs")) return "Historique";
  if (u.includes("notify")) return "Notification";
  const a = (k: string) => body[k] !== undefined;
  if (a("rapportMonteur") && (a("heureArrivee") || a("heureDepart"))) return "Rapport de montage + heures";
  if (a("heureArrivee") && a("heureDepart")) return "Heures d'intervention";
  const cles = Object.keys(body);
  if (cles.length === 0) return "Mise à jour";
  const noms = [...new Set(cles.map(nomDuChamp))];
  return noms.length <= 2 ? noms.join(" + ") : `${noms.slice(0, 2).join(" + ")} + ${noms.length - 2} autre(s)`;
}

/** Le projet visé par une saisie, d'après son adresse ou son contenu. */
export function projetDeSaisie(e: EntreeSaisie): string | undefined {
  const m = e.url.match(/\/api\/projects\/([^/?]+)/)?.[1] ?? e.url.match(/\/api\/pdf\/([^/?]+)/)?.[1];
  if (m) return m;
  const body = (typeof e.body === "object" && e.body) ? e.body as Record<string, unknown> : {};
  return typeof body.projectId === "string" ? body.projectId : undefined;
}

/* ── L'historique des envois ─────────────────────────────────────────── */

const CLE_HISTORIQUE = "tm-sync-historique";
const TAILLE_HISTORIQUE = 40;

export interface LigneHistorique { libelle: string; quand: number; genre: "photo" | "saisie" }

export function lireHistorique(): LigneHistorique[] {
  try {
    const t = JSON.parse(localStorage.getItem(CLE_HISTORIQUE) || "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/** Une opération est arrivée : elle quitte la liste, mais reste traçable ici. */
export function noterDansHistorique(ligne: LigneHistorique): void {
  try {
    const t = [ligne, ...lireHistorique()].slice(0, TAILLE_HISTORIQUE);
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(t));
  } catch { /* stockage plein : l'historique est un confort, jamais une donnée */ }
}
