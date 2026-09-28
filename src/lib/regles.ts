/**
 * Règles de contrôle — anomalies Notion et relances.
 *
 * Deux pages en vivent, pour deux questions différentes :
 *
 *   • ANOMALIES — « cette fiche est-elle exploitable ? ». Une adresse vide, un
 *     nombre de cabines absent ou des lots nommés « Cabine 1 » ne gênent
 *     personne le jour même, mais ils cassent en silence la tournée, la page
 *     Chantiers, la carte et les statistiques. On les montre pour qu'ils soient
 *     corrigés à la source plutôt que rattrapés à l'affichage.
 *
 *   • RELANCES — « qu'est-ce qui traîne ? ». Des cabines livrées depuis trois
 *     semaines sans rendez-vous, une offre sans commande depuis deux mois : rien
 *     n'est faux, mais personne ne l'a relancé.
 *
 * Tout est pur et testable : une règle reçoit un projet et une date, elle
 * répond par null ou par la phrase à afficher.
 */

import type { Project } from "@/lib/notion";

export type Gravite = "bloquant" | "important" | "mineur";

export interface Regle {
  id: string;
  titre: string;
  /** Ce que l'anomalie casse, ou ce que la relance débloque. */
  pourquoi: string;
  gravite: Gravite;
  /** null si la fiche est saine ; sinon le détail affiché sur la ligne. */
  verifier(p: Project, maintenant: Date): string | null;
}

export interface Trouvaille {
  regle: Regle;
  projets: { projet: Project; detail: string; priorite: Priorite }[];
}

/* ── Petits outils ──────────────────────────────────────────────────────── */

const MORTS = new Set(["Annulé"]);

function vide(v: string | null | undefined): boolean {
  return !(v || "").trim();
}

/** Horodatage d'une date ISO, midi par défaut ; null si elle est illisible. */
function jourDe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(t) ? null : t;
}

/** Jours écoulés depuis une date ISO ; null si la date est absente ou future. */
export function joursDepuis(iso: string | null | undefined, maintenant: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(t)) return null;
  const j = Math.floor((maintenant.getTime() - t) / 86400000);
  return j >= 0 ? j : null;
}

export function formatJour(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Intervention de service pure : ni marque, ni série, ni cabine à compter. */
export function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

/** Une commande a-t-elle été passée, sous une forme ou une autre ? */
function aCommande(p: Project): boolean {
  return !vide(p.cmdTM) || !vide(p.cmdTMUsine) || !vide(p.cmdGrossiste)
    || !!p.dateCMDRecue || !!p.dateCMDUsine;
}

function arrivage(p: Project): string | null {
  return p.arrivageTM || p.arrivageGrossiste || null;
}

/** Les lots d'un projet multi-cabines sont-ils nommés ? */
function lotsNommes(p: Project): boolean {
  const noms = (p.nomsCabines || "").match(/Cab(\d+)\s*:\s*([^|]*)/g) || [];
  return noms.some((bloc) => {
    const v = bloc.replace(/^Cab\d+\s*:\s*/, "").trim();
    return !!v && !/^cabine\s*\d*$/i.test(v);
  });
}

/** Statuts où le nombre de cabines DOIT être connu. */
const STATUTS_CHIFFRES = new Set([
  "Cabines mesurées", "Cabines en CMD", "Cabines à recevoir", "Livraison partielle",
  "Cabine à aller chercher", "Récéptionné - RDV à fixer", "RDV - fixé",
  "RDV - Attendre news", "Montage partiel", "Soucis montage", "Terminé",
]);

/* ── Anomalies de saisie ────────────────────────────────────────────────── */

export const REGLES_ANOMALIES: Regle[] = [
  {
    id: "adresse-vide",
    titre: "Adresse de chantier vide",
    pourquoi: "Sans adresse, le projet sort de l'assistant de tournée, n'entre dans aucun chantier PPE et n'apparaît sur aucune carte.",
    gravite: "bloquant",
    verifier: (p) => (MORTS.has(p.etatCMD) || !vide(p.adresseChantier)) ? null : "Champ « Adresse chantier » vide",
  },
  {
    id: "npa-absent",
    titre: "Code postal introuvable",
    pourquoi: "Le NPA sert à regrouper par région, par canton et à estimer les trajets. Sans lui, le projet est isolé.",
    gravite: "important",
    verifier: (p) => {
      if (MORTS.has(p.etatCMD)) return null;
      const texte = `${p.adresseChantier || ""} ${p.projet || ""}`;
      if (/\b\d{4}\b/.test(texte)) return null;
      return p.adresseChantier ? `Adresse sans NPA : « ${p.adresseChantier} »` : null;
    },
  },
  {
    id: "cabines-absentes",
    titre: "Nombre de cabines non renseigné",
    pourquoi: "C'est l'unité de compte de toute l'application : statistiques, seuil des chantiers, durée estimée d'un montage.",
    gravite: "important",
    verifier: (p) => {
      if (MORTS.has(p.etatCMD) || estServicePur(p)) return null;
      if (!STATUTS_CHIFFRES.has(p.etatCMD)) return null;
      return p.nbCabines && p.nbCabines > 0 ? null : `Statut « ${p.etatCMD} » sans nombre de cabines`;
    },
  },
  {
    id: "lots-non-nommes",
    titre: "Lots non nommés sur un projet multi-cabines",
    pourquoi: "Le champ « Lot (nom de cabine) » est la seule source du numéro d'appartement. Vide, la page Chantiers affiche « Cabine 1 », qui ne désigne rien.",
    gravite: "important",
    verifier: (p) => {
      if (MORTS.has(p.etatCMD) || !p.nbCabines || p.nbCabines < 2) return null;
      return lotsNommes(p) ? null : `${p.nbCabines} cabines sans nom de lot`;
    },
  },
  {
    id: "marque-absente",
    titre: "Marque absente sur un montage terminé",
    pourquoi: "Les statistiques par fournisseur et le taux de SAV par marque comptent ce projet comme « sans marque ».",
    gravite: "important",
    verifier: (p) => {
      if (p.etatCMD !== "Terminé" || estServicePur(p)) return null;
      return (p.fournisseurs || []).length > 0 ? null : "Aucun fournisseur renseigné";
    },
  },
  {
    id: "serie-absente",
    titre: "Série absente sur un montage terminé",
    pourquoi: "Sans série, impossible de rattacher un défaut récurrent à un modèle de cabine.",
    gravite: "mineur",
    verifier: (p) => {
      if (p.etatCMD !== "Terminé" || estServicePur(p)) return null;
      if ((p.fournisseurs || []).length === 0) return null;
      return (p.seriesCabines || []).length > 0 ? null : "Aucune série renseignée";
    },
  },
  {
    id: "heures-absentes",
    titre: "Heures non pointées sur un montage terminé",
    pourquoi: "Les heures nourrissent la rentabilité par chantier et le barème de durée de l'assistant de tournée. Sans elles, les deux se dégradent.",
    gravite: "important",
    verifier: (p) => {
      if (p.etatCMD !== "Terminé" || estServicePur(p)) return null;
      // Une cabine sous-traitée n'est, par définition, pas pointée par TM.
      if (!vide(p.monteursSousTraitance)) return null;
      const a = /\d{1,2}:\d{2}/.test(p.heureArrivee || "");
      const b = /\d{1,2}:\d{2}/.test(p.heureDepart || "");
      return a && b ? null : "Heure d'arrivée ou de départ manquante";
    },
  },
  {
    id: "montage-sans-date",
    titre: "Montage terminé sans date",
    pourquoi: "Le projet disparaît des statistiques mensuelles et du plan de charge, alors qu'il a bien été réalisé.",
    gravite: "important",
    verifier: (p) => (p.etatCMD === "Terminé" && !p.dateMontage) ? "Statut « Terminé » sans date de montage" : null,
  },
  {
    id: "date-passee-active",
    titre: "Date de montage passée, statut non clôturé",
    pourquoi: "Le projet reste dans les listes actives et fausse le compte des rendez-vous à venir.",
    gravite: "important",
    verifier: (p, maintenant) => {
      if (MORTS.has(p.etatCMD) || p.etatCMD === "Terminé" || p.etatCMD === "Montage partiel") return null;
      if (p.etatCMD === "Soucis montage") return null;
      const j = joursDepuis(p.dateMontage, maintenant);
      if (j === null || j < 4) return null;
      return `Monté le ${formatJour(p.dateMontage)} — statut resté « ${p.etatCMD} »`;
    },
  },
  {
    id: "collaborateur-absent",
    titre: "Monteur non renseigné sur un montage terminé",
    pourquoi: "Ni la répartition par monteur ni l'attribution d'un SAV ne peuvent être calculées.",
    gravite: "mineur",
    verifier: (p) => {
      if (p.etatCMD !== "Terminé" || estServicePur(p)) return null;
      if (!vide(p.monteursSousTraitance)) return null;
      return (vide(p.collaborateurs) && vide(p.attributionCabines))
        ? "Aucun collaborateur sur le montage" : null;
    },
  },
  {
    id: "livre-statut-cmd",
    titre: "Cabines arrivées, statut resté en commande",
    pourquoi: "Le suivi d'arrivage et le compte des cabines à recevoir restent faux tant que le statut n'avance pas.",
    gravite: "mineur",
    verifier: (p) => {
      const a = arrivage(p);
      if (!a) return null;
      if (p.etatCMD !== "Cabines en CMD" && p.etatCMD !== "Cabines à recevoir") return null;
      return `Arrivage du ${formatJour(a)} — statut « ${p.etatCMD} »`;
    },
  },
];

/* ── Relances ───────────────────────────────────────────────────────────── */

/** Un projet encore vivant : ni terminé, ni annulé. */
function actif(p: Project): boolean {
  return p.etatCMD !== "Terminé" && !MORTS.has(p.etatCMD);
}

function depuis(j: number): string {
  return j >= 60 ? `depuis ${Math.round(j / 30)} mois` : `depuis ${j} jours`;
}

export const REGLES_RELANCES: Regle[] = [
  {
    id: "rdv-sans-cabines",
    titre: "Rendez-vous fixé, cabines pas encore arrivées",
    pourquoi: "Un déplacement pour rien coûte une journée à deux monteurs. L'information existe des deux côtés, personne ne les croise.",
    gravite: "bloquant",
    verifier: (p, maintenant) => {
      if (MORTS.has(p.etatCMD) || p.etatCMD === "Terminé") return null;
      if (arrivage(p)) return null;
      const t = jourDe(p.dateMontage);
      if (t === null) return null;
      // Rendez-vous à venir, dans les dix jours : c'est maintenant qu'on agit.
      const jours = Math.round((t - maintenant.getTime()) / 86400000);
      if (jours < 0 || jours > 10) return null;
      return jours === 0
        ? `Montage AUJOURD'HUI, aucun arrivage enregistré`
        : `Montage le ${formatJour(p.dateMontage)}, dans ${jours} jour${jours > 1 ? "s" : ""} — aucun arrivage enregistré`;
    },
  },
  {
    id: "livre-sans-rdv",
    titre: "Cabines livrées sans rendez-vous fixé",
    pourquoi: "Les cabines occupent le dépôt et le client attend. C'est la relance qui rapporte le plus vite.",
    gravite: "bloquant",
    verifier: (p, maintenant) => {
      if (!actif(p) || p.dateMontage) return null;
      const j = joursDepuis(arrivage(p), maintenant);
      if (j === null || j < 10) return null;
      return `Arrivées le ${formatJour(arrivage(p))}, ${depuis(j)}`;
    },
  },
  {
    id: "mesures-sans-offre",
    titre: "Mesures prises, offre non établie",
    pourquoi: "Le déplacement de mesure est déjà payé ; sans offre, il ne se transforme pas en commande.",
    gravite: "important",
    verifier: (p, maintenant) => {
      if (!actif(p) || p.dateOffre) return null;
      const j = joursDepuis(p.dateMesuresRecue, maintenant);
      if (j === null || j < 15) return null;
      return `Mesures reçues le ${formatJour(p.dateMesuresRecue)}, ${depuis(j)}`;
    },
  },
  {
    id: "offre-sans-commande",
    titre: "Offre envoyée, sans commande",
    pourquoi: "Au-delà d'un mois, une offre sans nouvelle se perd ; un appel la relance ou la clôt.",
    gravite: "important",
    verifier: (p, maintenant) => {
      if (!actif(p) || aCommande(p)) return null;
      const j = joursDepuis(p.dateOffre, maintenant);
      if (j === null || j < 30) return null;
      return `Offre du ${formatJour(p.dateOffre)}, ${depuis(j)}`;
    },
  },
  {
    id: "sav-ouvert",
    titre: "SAV ouvert depuis longtemps",
    pourquoi: "Un SAV qui traîne coûte davantage qu'un SAV traité, et c'est lui que le client raconte.",
    gravite: "bloquant",
    verifier: (p, maintenant) => {
      if (p.savCloture || p.dateSavClotureLe) return null;
      if (p.etatSAV === "Terminé" || p.etatSAV === "Annulé") return null;
      const j = joursDepuis(p.dateSAVRecu, maintenant);
      if (j === null || j < 21) return null;
      return `Reçu le ${formatJour(p.dateSAVRecu)}, ${depuis(j)}`;
    },
  },
  {
    id: "souci-ouvert",
    titre: "Souci de montage non clôturé",
    pourquoi: "Tant qu'il est ouvert, le chantier n'est ni facturable ni terminé.",
    gravite: "important",
    verifier: (p, maintenant) => {
      if (!p.soucisMontage || p.soucisMontageCloture) return null;
      const j = joursDepuis(p.dateSoucisMontage, maintenant);
      if (j === null || j < 14) return null;
      return `Signalé le ${formatJour(p.dateSoucisMontage)}, ${depuis(j)}`;
    },
  },
  {
    id: "rapport-attente",
    titre: "Rapport de montage non clôturé",
    pourquoi: "Sans rapport traité, le montage n'entre pas dans les projets à facturer.",
    gravite: "important",
    verifier: (p, maintenant) => {
      const j = joursDepuis(p.dateMontage, maintenant);
      if (j === null || j < 7) return null;
      if (MORTS.has(p.etatCMD)) return null;
      const r = (p.rapportDeMontage || "").toLowerCase();
      if (r.includes("clôt") || r.includes("clot") || r === "rapport traité") return null;
      return `Monté le ${formatJour(p.dateMontage)}, ${depuis(j)}`;
    },
  },
  {
    id: "a-facturer-ancien",
    titre: "À facturer depuis plus de deux semaines",
    pourquoi: "Le travail est fait, le rapport est traité : c'est de la trésorerie qui dort.",
    gravite: "important",
    verifier: (p, maintenant) => {
      if (p.facturations !== "A facturer" || p.etatCMD !== "Terminé") return null;
      if (p.rapportDeMontage !== "Rapport traité") return null;
      const j = joursDepuis(p.dateMontage, maintenant);
      if (j === null || j < 14) return null;
      return `Monté le ${formatJour(p.dateMontage)}, ${depuis(j)}`;
    },
  },
];

/* ── Priorité ───────────────────────────────────────────────────────────── */

/**
 * Au-delà de ce silence, un dossier ne se relance plus : il se classe.
 *
 * L'application est née en cours de route ; Notion, lui, tourne depuis avril
 * 2024. Des centaines de fiches anciennes n'ont jamais été clôturées — le
 * montage a souvent été fait, parfois par quelqu'un d'autre, et la fiche est
 * restée ouverte. Les règles les signalent à juste titre, mais les compter
 * avec les dossiers vivants produit un millier de lignes que personne
 * n'ouvrira jamais. Six mois sans le MOINDRE mouvement : ce n'est plus une
 * relance en retard, c'est du rangement.
 */
export const DORMANT_JOURS = 180;

/** Toutes les dates qu'un projet peut porter, la plus récente l'emporte. */
export function derniereActivite(p: Project, maintenant: Date): number | null {
  const jours = [
    p.dateMesuresRecue, p.dateMesures, p.dateOffre, p.dateCMDRecue, p.dateCMDUsine,
    arrivage(p), p.dateMontage, p.dateSAVRecu, p.dateSoucisMontage,
  ].map((d) => joursDepuis(d, maintenant)).filter((j): j is number => j !== null);
  return jours.length ? Math.min(...jours) : null;
}

export interface Priorite {
  /** Plus il est haut, plus le dossier mérite d'être traité aujourd'hui. */
  score: number;
  /** Ce qui l'a fait monter, en clair — un classement qu'on ne comprend pas
   *  ne se suit pas. */
  raisons: string[];
  /** Le dossier relève du classement, pas de la relance. */
  dormant: boolean;
}

const POIDS_GRAVITE: Record<Gravite, number> = { bloquant: 100, important: 55, mineur: 25 };

/**
 * Ce qui décide qu'un dossier passe devant un autre.
 *
 * Quatre forces, et elles ne se valent pas : une intervention imminente sans
 * marchandise passe avant tout le reste, parce qu'elle coûtera une journée à
 * deux monteurs si personne n'appelle aujourd'hui. Vient ensuite ce qui est
 * gros, puis ce qui dort depuis longtemps, puis l'argent déjà gagné mais pas
 * encore facturé.
 *
 * Un dossier dormant garde son score, divisé : il reste consultable et
 * classable, sans encombrer la liste de ce qui se traite cette semaine.
 */
export function prioriteDe(regle: Regle, p: Project, maintenant: Date): Priorite {
  const raisons: string[] = [];
  let score = POIDS_GRAVITE[regle.gravite];

  const cabines = Number(p.nbCabines) || 0;
  if (cabines > 1) {
    score += Math.min(cabines, 15) * 4;
    raisons.push(`${cabines} cabines`);
  }

  /* Intervention déjà planifiée, et proche : c'est la seule urgence qui a une
     échéance. Elle pèse plus que tout le reste réuni. */
  const tMontage = jourDe(p.dateMontage);
  if (tMontage !== null) {
    const dans = Math.round((tMontage - maintenant.getTime()) / 86400000);
    if (dans >= 0 && dans <= 14) {
      score += (15 - dans) * 10;
      raisons.push(dans === 0 ? "montage aujourd'hui" : `montage dans ${dans} j`);
    }
  }

  const age = derniereActivite(p, maintenant);
  if (age !== null && age >= 30) {
    score += Math.min(age, 120) * 0.3;
    raisons.push(age >= 60 ? `sans mouvement depuis ${Math.round(age / 30)} mois` : `sans mouvement depuis ${age} j`);
  }

  if (p.facturations === "A facturer") {
    score += 30;
    raisons.push("à facturer");
  }

  const dormant = age !== null && age > DORMANT_JOURS;
  if (dormant) score *= 0.1;

  return { score: Math.round(score), raisons, dormant };
}

/* ── Application ────────────────────────────────────────────────────────── */

const ORDRE: Record<Gravite, number> = { bloquant: 0, important: 1, mineur: 2 };

/**
 * Applique un jeu de règles et renvoie les groupes non vides, les plus graves
 * d'abord puis les plus fournis. Dans chaque groupe, le dossier le plus
 * prioritaire vient en tête : trier par numéro d'offre, comme avant, revenait
 * à ranger par ordre d'arrivée une liste qu'on ne lit jamais jusqu'au bout.
 */
export function appliquer(
  regles: Regle[],
  projets: Project[],
  maintenant: Date = new Date(),
): Trouvaille[] {
  return regles
    .map((regle) => ({
      regle,
      projets: projets
        .map((projet) => {
          const detail = regle.verifier(projet, maintenant);
          return detail
            ? { projet, detail, priorite: prioriteDe(regle, projet, maintenant) }
            : null;
        })
        .filter((x): x is Trouvaille["projets"][number] => x !== null)
        .sort((a, b) => b.priorite.score - a.priorite.score
          || (a.projet.ofrTM || "").localeCompare(b.projet.ofrTM || "")),
    }))
    .filter((g) => g.projets.length > 0)
    .sort((a, b) =>
      ORDRE[a.regle.gravite] - ORDRE[b.regle.gravite]
      || b.projets.length - a.projets.length);
}

/** Nombre total de fiches concernées — une fiche comptée une seule fois. */
export function compterFiches(groupes: Trouvaille[]): number {
  return new Set(groupes.flatMap((g) => g.projets.map((x) => x.projet.id))).size;
}

/**
 * Nombre de fiches vivantes, dormantes écartées.
 *
 * Une fiche est dormante si TOUTES les règles qui la signalent la jugent
 * telle — ce qui est le cas par construction, la dormance ne dépendant que du
 * projet. La distinction reste utile : c'est ce compteur-là qui doit mener
 * la page, l'autre ne mesure qu'un arriéré de classement.
 */
export function compterFichesVives(groupes: Trouvaille[]): number {
  const vus = new Map<string, boolean>();
  groupes.forEach((g) => g.projets.forEach((x) => {
    const dejaVif = vus.get(x.projet.id) === false;
    vus.set(x.projet.id, dejaVif ? false : x.priorite.dormant);
  }));
  return [...vus.values()].filter((dormant) => !dormant).length;
}
