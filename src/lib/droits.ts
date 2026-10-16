/**
 * Les autorisations, dites dans la langue du métier.
 *
 * L'inventaire technique (154 routes, middleware, signatures) continue
 * d'exister et reste généré depuis le code : voir `droits-generes.json`. Mais
 * il répond à « qu'est-ce qui protège ce fichier ? », pas à « qu'est-ce que
 * Jacobo a le droit de faire ? ». Ce fichier-ci répond à la seconde question,
 * et c'est la seule qu'un administrateur se pose.
 *
 * Un principe gouverne tout le reste : les valeurs par défaut reproduisent
 * EXACTEMENT ce que l'application autorisait avant l'existence de ce système.
 * Le jour où il est mis en service, personne ne perd ni ne gagne un droit ;
 * c'est ensuite, et seulement si l'administrateur le décide, que les
 * restrictions apparaissent. Un système d'autorisations qui casse le travail
 * de l'équipe le jour de sa livraison ne sera jamais rallumé.
 */

/** Ce qu'une autorisation vaut pour quelqu'un. */
export type Niveau = "oui" | "lecture" | "non";

/** Le profil d'un compte : trois réponses couvrent la quasi-totalité des cas. */
export type Profil = "administrateur" | "responsable" | "collaborateur";

/** Jusqu'où porte le regard sur les projets. */
export type Perimetre = "siens" | "tous";

/** D'où vient le droit qu'on lit : du profil, ou d'un réglage personnel. */
export type Source = "profil" | "personnalise" | "administrateur";

export interface Droit {
  id: string;
  libelle: string;
  /** Une phrase, sans jargon : ce que la personne pourra faire. */
  description: string;
  /** « Lecture seule » n'est proposé que là où il veut dire quelque chose.
   *  Aucune entrée ne l'emploie aujourd'hui : consulter et modifier sont déjà
   *  deux autorisations distinctes partout, ce qui rend le troisième niveau
   *  inutile — et un interrupteur à trois positions est plus difficile à lire
   *  qu'un interrupteur simple. Le niveau reste géré de bout en bout, pour le
   *  jour où une fonctionnalité en aura vraiment besoin. */
  lectureSeule?: boolean;
}

export interface Categorie {
  id: string;
  titre: string;
  emoji: string;
  /** Ce que couvre la catégorie, en une ligne. */
  resume: string;
  droits: Droit[];
}

/* ───────────────────────────────────────────────────────────────────────────
   Le catalogue.

   Chaque entrée correspond à une chose que quelqu'un fait réellement dans
   l'application — pas à une route, pas à un fichier. Quand une même action
   passe par cinq adresses différentes, elle reste UNE autorisation.
   ─────────────────────────────────────────────────────────────────────────── */

export const CATALOGUE: Categorie[] = [
  {
    id: "tableau",
    titre: "Tableau de bord",
    emoji: "📊",
    resume: "L'écran d'accueil, l'agenda et le suivi de l'équipe.",
    droits: [
      {
        id: "tableau.voir",
        libelle: "Ouvrir le tableau de bord",
        description: "Voir l'écran d'accueil avec les chantiers du moment.",
      },
      {
        id: "tableau.calendrier",
        libelle: "Consulter le calendrier",
        description: "Voir les rendez-vous de montage, de mesures et de service.",
      },
      {
        id: "tableau.activite",
        libelle: "Suivre l'activité de l'équipe",
        description: "Voir qui a travaillé sur quoi, et les heures de chacun.",
      },
    ],
  },
  {
    id: "projets",
    titre: "Projets",
    emoji: "📁",
    resume: "Les dossiers de chantier, de la demande à la pose.",
    droits: [
      {
        id: "projets.voir",
        libelle: "Consulter les projets",
        description: "Ouvrir un dossier et lire ses informations.",
      },
      {
        id: "projets.creer",
        libelle: "Créer un projet",
        description: "Ajouter un nouveau dossier de chantier.",
      },
      {
        id: "projets.modifier",
        libelle: "Modifier un projet",
        description: "Changer les informations d'un dossier existant.",
      },
      {
        id: "projets.supprimer",
        libelle: "Supprimer un projet",
        description: "Effacer définitivement un dossier et tout ce qu'il contient.",
      },
      {
        id: "projets.termines",
        libelle: "Consulter les dossiers terminés",
        description: "Accéder aux chantiers clos et aux archives.",
      },
    ],
  },
  {
    id: "kanban",
    titre: "Tableau Kanban",
    emoji: "🗂️",
    resume: "Le pilotage des projets par colonnes, et le déplacement des cartes.",
    droits: [
      {
        id: "kanban.voir",
        libelle: "Ouvrir le Kanban",
        description: "Voir les projets rangés en colonnes par avancement.",
      },
      {
        id: "kanban.mesures",
        libelle: "Changer l'avancement des mesures",
        description: "Déplacer une carte dans la vue des mesures, ce qui change son état.",
      },
      {
        id: "kanban.cmd",
        libelle: "Changer l'avancement des commandes",
        description: "Déplacer une carte dans la vue des commandes, ce qui change son état.",
      },
    ],
  },
  {
    id: "documents",
    titre: "Photos et documents",
    emoji: "📸",
    resume: "Les photos de chantier, les plans et les fichiers joints.",
    droits: [
      {
        id: "documents.ajouter",
        libelle: "Ajouter des photos et des documents",
        description: "Déposer des photos de chantier ou des fichiers dans un dossier.",
      },
      {
        id: "documents.supprimer",
        libelle: "Supprimer des photos et des documents",
        description: "Retirer définitivement une photo ou un fichier d'un dossier.",
      },
    ],
  },
  {
    id: "rapports",
    titre: "Heures et rapports",
    emoji: "📝",
    resume: "Les heures de travail et les rapports envoyés au client.",
    droits: [
      {
        id: "rapports.heures",
        libelle: "Saisir ses heures",
        description: "Indiquer l'heure d'arrivée et de départ sur un chantier.",
      },
      {
        id: "rapports.rediger",
        libelle: "Rédiger un rapport",
        description: "Écrire le compte rendu d'une intervention.",
      },
      {
        id: "rapports.envoyer",
        libelle: "Envoyer un rapport au client",
        description: "Transmettre la fiche de travail ou le rapport au client.",
      },
    ],
  },
  {
    id: "mesures",
    titre: "Relevés de mesures",
    emoji: "📏",
    resume: "La prise de mesures chez le client.",
    droits: [
      {
        id: "mesures.voir",
        libelle: "Consulter les relevés",
        description: "Lire les mesures prises et les documents associés.",
      },
      {
        id: "mesures.saisir",
        libelle: "Enregistrer un relevé",
        description: "Saisir ou corriger les mesures d'une cabine.",
      },
    ],
  },
  {
    id: "signalements",
    titre: "Signalements",
    emoji: "⚠️",
    resume: "Les défauts constatés et les pièces à commander.",
    droits: [
      {
        id: "signalements.voir",
        libelle: "Consulter les signalements",
        description: "Voir les défauts signalés et les pièces demandées.",
      },
      {
        id: "signalements.creer",
        libelle: "Signaler un défaut",
        description: "Déclarer un problème constaté sur un chantier.",
      },
      {
        id: "signalements.modifier",
        libelle: "Modifier un signalement",
        description: "Corriger un signalement ou changer son avancement.",
      },
      {
        id: "signalements.supprimer",
        libelle: "Supprimer un signalement",
        description: "Effacer définitivement un signalement.",
      },
    ],
  },
  {
    id: "stock",
    titre: "Stock des cabines",
    emoji: "📦",
    resume: "Les cabines en dépôt et leur sortie.",
    droits: [
      {
        id: "stock.voir",
        libelle: "Consulter le stock",
        description: "Voir les cabines disponibles au dépôt.",
      },
      {
        id: "stock.modifier",
        libelle: "Modifier le stock",
        description: "Ajouter, corriger ou retirer une cabine de l'inventaire.",
      },
      {
        id: "stock.destocker",
        libelle: "Déstocker une cabine",
        description: "Sortir une cabine du dépôt pour un chantier.",
      },
    ],
  },
  {
    id: "carnet",
    titre: "Clients et fournisseurs",
    emoji: "👤",
    resume: "Le carnet d'adresses : clients, entreprises, fournisseurs, grossistes.",
    droits: [
      {
        id: "carnet.voir",
        libelle: "Consulter le carnet d'adresses",
        description: "Voir les coordonnées des clients et des fournisseurs.",
      },
      {
        id: "carnet.modifier",
        libelle: "Modifier le carnet d'adresses",
        description: "Ajouter ou corriger une fiche client ou fournisseur.",
      },
      {
        id: "carnet.supprimer",
        libelle: "Supprimer une fiche",
        description: "Effacer définitivement un client ou un fournisseur.",
      },
    ],
  },
  {
    id: "stats",
    titre: "Statistiques",
    emoji: "📈",
    resume: "Les chiffres de l'activité : volumes, délais, tendances.",
    droits: [
      {
        id: "stats.voir",
        libelle: "Consulter les statistiques",
        description: "Voir les graphiques d'activité de l'entreprise.",
      },
    ],
  },
  {
    id: "argent",
    titre: "Argent",
    emoji: "💰",
    resume: "La facturation, les devis et le chiffre d'affaires.",
    droits: [
      {
        id: "argent.voir",
        libelle: "Consulter la facturation",
        description: "Voir les montants, les devis et les factures.",
      },
      {
        id: "argent.relances",
        libelle: "Relancer les clients",
        description: "Préparer les relances de devis et de dossiers en attente.",
      },
    ],
  },
  {
    id: "administration",
    titre: "Administration",
    emoji: "⚙️",
    resume: "Les comptes et les autorisations.",
    droits: [
      {
        id: "administration.comptes",
        libelle: "Gérer les comptes",
        description: "Créer, modifier ou supprimer les comptes des collaborateurs.",
      },
      {
        id: "administration.droits",
        libelle: "Gérer les autorisations",
        description: "Décider ce que chaque collaborateur a le droit de faire.",
      },
    ],
  },
];

/** Tous les identifiants, à plat. */
export const TOUS_LES_DROITS: string[] = CATALOGUE.flatMap((c) => c.droits.map((d) => d.id));

/** Le droit, retrouvé par son identifiant. */
const PAR_ID = new Map<string, Droit>(CATALOGUE.flatMap((c) => c.droits.map((d) => [d.id, d])));
export function droitParId(id: string): Droit | undefined {
  return PAR_ID.get(id);
}

/** La catégorie d'un droit. */
export function categorieDe(id: string): Categorie | undefined {
  return CATALOGUE.find((c) => c.droits.some((d) => d.id === id));
}

/* ───────────────────────────────────────────────────────────────────────────
   Les trois profils.

   « collaborateur » n'est pas une invention : il décrit, droit par droit, ce
   que l'application autorisait déjà à un compte monteur avant ce système.
   Créer un projet, ouvrir la facturation ou toucher aux comptes lui étaient
   déjà refusés côté serveur ; tout le reste lui était ouvert.
   ─────────────────────────────────────────────────────────────────────────── */

function tous(niveau: Niveau): Record<string, Niveau> {
  return Object.fromEntries(TOUS_LES_DROITS.map((id) => [id, niveau]));
}

export interface DefinitionProfil {
  libelle: string;
  description: string;
  droits: Record<string, Niveau>;
  perimetre: Perimetre;
}

export const PROFILS: Record<Profil, DefinitionProfil> = {
  administrateur: {
    libelle: "Administrateur",
    description: "Accès complet : projets, comptes, réglages et données financières.",
    droits: tous("oui"),
    perimetre: "tous",
  },
  responsable: {
    libelle: "Responsable",
    description: "Pilote les chantiers, les rapports et le stock, sans toucher à l'argent ni aux comptes.",
    droits: {
      ...tous("oui"),
      "argent.voir": "non",
      "argent.relances": "non",
      "administration.comptes": "non",
      "administration.droits": "non",
    },
    perimetre: "tous",
  },
  collaborateur: {
    libelle: "Collaborateur",
    description: "Travaille sur les chantiers : projets, photos, heures, mesures et signalements.",
    droits: {
      ...tous("oui"),
      /* Déjà refusés côté serveur avant ce système — la création et la
         suppression de projets passent par des routes réservées à
         l'administrateur. */
      "projets.creer": "non",
      "projets.supprimer": "non",
      /* ATTENTION — « stock.modifier » et « carnet.modifier » restent
         AUTORISÉS parce qu'ils le sont réellement aujourd'hui : seules les
         suppressions étaient réservées à l'administrateur, et l'écran se
         contentait de cacher le bouton « Nouvelle entrée ». Les couper ici
         aurait retiré en silence un droit que l'équipe exerce peut-être. Le
         choix revient à l'administrateur, et il tient en un interrupteur. */
      "carnet.supprimer": "non",
      "tableau.activite": "non",
      "stats.voir": "non",
      "argent.voir": "non",
      "argent.relances": "non",
      "administration.comptes": "non",
      "administration.droits": "non",
    },
    perimetre: "tous",
  },
};

export const ORDRE_PROFILS: Profil[] = ["administrateur", "responsable", "collaborateur"];

/* ───────────────────────────────────────────────────────────────────────────
   Les réglages enregistrés.
   ─────────────────────────────────────────────────────────────────────────── */

export interface ReglagesCompte {
  profil?: Profil;
  /** Seulement ce qui s'écarte du profil. Le reste suit les réglages généraux. */
  droits?: Record<string, Niveau>;
  perimetre?: Perimetre;
}

export interface LigneHistorique {
  quand: string;
  qui: string;
  cible: string;
  /** Résumé lisible : « Modifier un projet : autorisé → interdit ». */
  resume: string;
}

export interface Reglages {
  version: number;
  /** Les réglages généraux : ce qu'un profil accorde dans CETTE entreprise. */
  profils: Partial<Record<Profil, Partial<DefinitionProfil>>>;
  comptes: Record<string, ReglagesCompte>;
  historique: LigneHistorique[];
}

export const REGLAGES_VIDES: Reglages = { version: 1, profils: {}, comptes: {}, historique: [] };

/** Le nombre de lignes d'historique conservées : au-delà, personne ne lit. */
export const MAX_HISTORIQUE = 200;

/* ───────────────────────────────────────────────────────────────────────────
   La résolution.
   ─────────────────────────────────────────────────────────────────────────── */

export interface DroitResolu {
  niveau: Niveau;
  source: Source;
}

export interface DroitsEffectifs {
  profil: Profil;
  perimetre: Perimetre;
  perimetreSource: Source;
  droits: Record<string, DroitResolu>;
}

/** Le profil appliqué par défaut à un compte qui n'en a pas reçu. */
export function profilDeCompte(email: string, role: "admin" | "monteur", r: Reglages): Profil {
  if (role === "admin") return "administrateur";
  const choisi = r.comptes?.[email.toLowerCase()]?.profil;
  return choisi && choisi !== "administrateur" ? choisi : "collaborateur";
}

/** Les réglages généraux d'un profil, tels que l'entreprise les a ajustés. */
export function profilEffectif(profil: Profil, r: Reglages): DefinitionProfil {
  const base = PROFILS[profil];
  const ajuste = r.profils?.[profil];
  if (!ajuste) return base;
  return {
    ...base,
    droits: { ...base.droits, ...(ajuste.droits || {}) },
    perimetre: ajuste.perimetre ?? base.perimetre,
  };
}

/**
 * Ce qu'un compte a réellement le droit de faire.
 *
 * Un administrateur garde tout, quoi qu'on ait enregistré : c'est la garantie
 * qu'une fausse manœuvre dans l'écran des autorisations ne peut pas fermer la
 * porte de l'administration derrière soi.
 */
export function droitsEffectifs(
  email: string,
  role: "admin" | "monteur",
  reglages: Reglages = REGLAGES_VIDES,
): DroitsEffectifs {
  if (role === "admin") {
    return {
      profil: "administrateur",
      perimetre: "tous",
      perimetreSource: "administrateur",
      droits: Object.fromEntries(
        TOUS_LES_DROITS.map((id) => [id, { niveau: "oui" as Niveau, source: "administrateur" as Source }]),
      ),
    };
  }

  const cle = email.toLowerCase();
  const profil = profilDeCompte(cle, role, reglages);
  const general = profilEffectif(profil, reglages);
  const perso = reglages.comptes?.[cle] || {};

  const droits: Record<string, DroitResolu> = {};
  for (const id of TOUS_LES_DROITS) {
    const surMesure = perso.droits?.[id];
    droits[id] = surMesure
      ? { niveau: surMesure, source: "personnalise" }
      : { niveau: general.droits[id] ?? "non", source: "profil" };
  }

  return {
    profil,
    perimetre: perso.perimetre ?? general.perimetre,
    perimetreSource: perso.perimetre ? "personnalise" : "profil",
    droits,
  };
}

/** Le raccourci des contrôles : « a-t-il au moins ce niveau-là ? ». */
export function peut(d: DroitsEffectifs, id: string, mini: "lecture" | "oui" = "oui"): boolean {
  const n = d.droits[id]?.niveau ?? "non";
  if (n === "non") return false;
  if (mini === "lecture") return true;
  return n === "oui";
}

/** Le résumé humain d'un changement, pour l'historique. */
export function resumeChangement(id: string, avant: Niveau, apres: Niveau): string {
  const mots: Record<Niveau, string> = { oui: "autorisé", lecture: "lecture seule", non: "interdit" };
  const d = droitParId(id);
  return `${d?.libelle ?? id} : ${mots[avant]} → ${mots[apres]}`;
}
