/**
 * Les devis restés sans réponse, rapprochés des dossiers Notion.
 *
 * Le signal « Devis en attente » comptait des offres bexio, et rien d'autre.
 * Or la question qu'on se pose devant la liste n'est pas « combien » mais
 * « lesquels relancer » — et pour cela il faut savoir si l'on s'est déjà
 * déplacé : un devis dont le relevé de mesures est fait n'est pas le même
 * dossier qu'un devis envoyé sur plan.
 *
 * Les deux mondes se rejoignent par le NUMÉRO D'OFFRE : « TM-2500471 » chez
 * bexio, « N° OFR TM » chez Notion. Le rapprochement se fait ici, à part de
 * l'écran, parce qu'il échoue parfois — une offre sur trois n'a pas de
 * dossier Notion — et qu'un rapprochement qui se trompe en silence vaut
 * moins que pas de rapprochement du tout.
 */

import { etatRelance, type EtatRelance } from "@/lib/relance";

/** Ce qu'on garde d'un dossier Notion pour éclairer un devis. */
export interface DossierLie {
  id: string;
  projet: string;
  ofrTM?: string | null;
  dateMesures?: string | null;
  etatCMD?: string | null;
  typeClient?: string | null;
  nbCabines?: number | null;
}

export interface OffreAttente {
  nr: string;
  titre: string;
  client?: string;
  total: number;
  date: string;
  jours: number;
  contactId?: number | null;
}

export interface LigneDevis extends OffreAttente {
  /** Dossier Notion rapproché, s'il y en a un. */
  projetId?: string;
  projet?: string;
  dateMesures?: string;
  etatCMD?: string;
  typeClient?: string;
  nbCabines?: number;
  /** Relances déjà faites sur CE devis. */
  relance: EtatRelance;
}

/**
 * Les numéros d'offre d'un dossier.
 *
 * Un dossier peut en porter plusieurs — « TM-2600783, TM-2600784 » — séparés
 * par une virgule, un point-virgule, une barre ou un retour à la ligne, selon
 * la main qui l'a saisi.
 */
export function numerosOffre(ofrTM: string | null | undefined): string[] {
  return String(ofrTM || "")
    .split(/[,;\n\/]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Index numéro d'offre → dossier.
 *
 * Quand deux dossiers revendiquent le même numéro, le PREMIER gagne : la
 * liste arrive triée du plus récent au plus ancien, et c'est le dossier
 * vivant qu'on veut, pas son doublon archivé.
 */
export function indexerParOffre(dossiers: readonly DossierLie[]): Map<string, DossierLie> {
  const idx = new Map<string, DossierLie>();
  for (const d of dossiers) {
    for (const n of numerosOffre(d.ofrTM)) if (!idx.has(n)) idx.set(n, d);
  }
  return idx;
}

/** Rapproche chaque devis de son dossier, et y joint ses relances. */
export function enrichirDevis(
  offres: readonly OffreAttente[],
  index: ReadonlyMap<string, DossierLie>,
  historique: Readonly<Record<string, string[]>> = {},
): LigneDevis[] {
  return offres.map((o) => {
    const d = index.get(String(o.nr || "").trim().toUpperCase());
    return {
      ...o,
      projetId: d?.id,
      projet: d?.projet,
      dateMesures: (d?.dateMesures || "").split("T")[0] || undefined,
      etatCMD: d?.etatCMD || undefined,
      typeClient: d?.typeClient || undefined,
      nbCabines: d?.nbCabines ?? undefined,
      /* Pas de date Notion ici : un devis n'est pas un dossier de montage, et
         « Relance dossier » parle des mesures non commandées. Le compte vient
         donc du seul historique, tenu par devis. */
      relance: etatRelance(null, historique[cleRelanceDevis(o.nr)]),
    };
  });
}

/** La clé sous laquelle se rangent les relances d'un devis. */
export function cleRelanceDevis(nr: string): string {
  return `devis:${String(nr || "").trim().toUpperCase()}`;
}

/* ── Filtre : le relevé de mesures a-t-il eu lieu ? ─────────────────────── */

export type FiltreMesures = "" | "avec" | "sans" | "orphelin";

export const FILTRES_MESURES: { valeur: FiltreMesures; label: string }[] = [
  { valeur: "", label: "Tous les devis" },
  { valeur: "avec", label: "Relevé de mesures fait" },
  { valeur: "sans", label: "Pas encore de relevé" },
  { valeur: "orphelin", label: "Sans dossier Notion" },
];

export function correspondMesures(l: LigneDevis, filtre: FiltreMesures): boolean {
  switch (filtre) {
    case "avec": return !!l.dateMesures;
    /* « Pas encore de relevé » ne parle que des devis qu'on PEUT trancher :
       sans dossier Notion, on ne sait pas si le relevé a eu lieu, et les
       compter ici ferait passer de l'ignorance pour une information. */
    case "sans": return !!l.projetId && !l.dateMesures;
    case "orphelin": return !l.projetId;
    default: return true;
  }
}

/* ── Un devis « en attente » qui n'en est plus un ──────────────────────── */

/**
 * bexio ne sait pas ce qu'est devenu le chantier.
 *
 * Une offre y reste « en attente » tant que personne ne va la confirmer ou la
 * décliner à la main — et personne ne le fait. Sur les cent quatre-vingt-dix-
 * sept devis en attente, relevé du 13 octobre 2026 : trente-six portent un
 * chantier ANNULÉ ou TERMINÉ chez nous, et vingt-huit un chantier DÉJÀ
 * COMMANDÉ, livré ou en cours de montage. Soixante-quatre clients à qui il ne
 * faut surtout pas écrire « nous n'avons pas eu de retour à notre devis ».
 *
 * La classification n'est pas devinée : elle reprend les GROUPES que Notion
 * porte sur la colonne « État - CMD » — À faire / En cours / Terminé. C'est
 * le classement de l'entreprise, pas le nôtre.
 */

/** Groupe « En cours » de Notion : la commande existe, le travail a démarré. */
export const ETATS_ENGAGES = [
  "Soucis livraison", "Cabines en CMD", "Cabines à recevoir", "Livraison partielle",
  "Cabine à aller chercher", "Récéptionné - RDV à fixer", "RDV - fixé",
  "RDV - Attendre news", "Montage partiel", "Soucis montage",
];

/** Groupe « Terminé » de Notion. */
export const ETATS_CLOS = ["Annulé", "Terminé"];

export type EtatDossier = "ouvert" | "engage" | "clos" | "inconnu";

/**
 * Où en est le dossier derrière le devis.
 *
 * `inconnu` : aucun dossier Notion ne porte ce numéro d'offre. On ne sait
 * rien, et c'est différent de savoir que c'est ouvert.
 *
 * Un état que Notion aurait ajouté depuis tombe dans `ouvert` : mieux vaut
 * proposer une relance de trop, qu'on écartera d'un coup d'œil, que faire
 * disparaître un dossier sans le dire.
 */
export function etatDuDossier(l: LigneDevis): EtatDossier {
  if (!l.projetId) return "inconnu";
  const e = String(l.etatCMD || "").trim();
  if (ETATS_CLOS.includes(e)) return "clos";
  if (ETATS_ENGAGES.includes(e)) return "engage";
  return "ouvert";
}

/** Le devis attend-il encore une réponse, pour de bon ? */
export function devisRelancable(l: LigneDevis): boolean {
  const e = etatDuDossier(l);
  return e === "ouvert" || e === "inconnu";
}

export function dossierClos(l: LigneDevis): boolean {
  return etatDuDossier(l) === "clos";
}
