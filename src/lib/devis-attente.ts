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

/* ── Les dossiers clos : un devis en attente qui n'en est plus un ───────── */

/**
 * Un devis dont le dossier Notion est annulé ou terminé ne se relance pas.
 *
 * bexio ne le sait pas : l'offre y reste « en attente » tant que personne ne
 * la décline à la main, et personne ne le fait. Relever ce désaccord est tout
 * l'intérêt du rapprochement — et c'est aussi ce qui empêche d'écrire à un
 * client dont le chantier est annulé depuis six mois.
 */
export const ETATS_CLOS = ["Annulé", "Terminé"];

export function dossierClos(l: LigneDevis): boolean {
  return !!l.etatCMD && ETATS_CLOS.includes(l.etatCMD);
}
