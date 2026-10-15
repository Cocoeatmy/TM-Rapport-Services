/**
 * Où va chaque propriété à l'écran — décidé ici, pas dans Notion.
 *
 * Notion dit QUELLES propriétés existent et comment elles fonctionnent.
 * Ce fichier dit COMMENT on les présente. La séparation est volontaire :
 * on veut pouvoir réorganiser l'écran sans toucher à la base, et ajouter
 * une colonne dans la base sans toucher à l'écran.
 *
 * Le classement se fait sur des RÈGLES, pas sur une liste de cent
 * quarante-deux noms. Une colonne ajoutée demain dans Notion tombe donc
 * d'elle-même dans la bonne section si son nom ressemble aux autres, et
 * dans « Autres informations » sinon — jamais dans le vide.
 *
 * ── CE QUI APPARTIENT AUX RAPPORTS ──────────────────────────────────────
 *
 * Une partie des colonnes n'est pas de la saisie : c'est le système de
 * rapports qui les écrit, dans un format qu'il est seul à comprendre. Les
 * colonnes « par cabine » encodent « Cab1:valeur | Cab2:valeur » ; les
 * heures d'arrivée, la signature, le rapport du monteur sont posés par
 * l'assistant de saisie.
 *
 * Les corriger à la main depuis un formulaire générique casserait les
 * rapports en silence. Elles sont donc EN LECTURE SEULE ici, et rangées à
 * part. On les voit, on ne les touche pas — c'est l'écran du rapport qui
 * s'en charge, et lui seul.
 */

export interface Section {
  id: string;
  titre: string;
  /** Repliée à l'ouverture ? Les sections de fond le sont. */
  repliee: boolean;
}

/** Les sections, dans l'ordre d'affichage. */
export const SECTIONS: Section[] = [
  { id: "projet",        titre: "Projet",                     repliee: false },
  { id: "chantier",      titre: "Chantier",                   repliee: false },
  { id: "contacts",      titre: "Clients et contacts",        repliee: false },
  { id: "fournisseurs",  titre: "Fournisseurs et grossistes", repliee: true  },
  { id: "commande",      titre: "Commande et livraison",      repliee: true  },
  { id: "mesures",       titre: "Mesures",                    repliee: true  },
  { id: "montage",       titre: "Montage",                    repliee: true  },
  { id: "sav",           titre: "SAV",                        repliee: true  },
  { id: "soucis",        titre: "Soucis de montage",          repliee: true  },
  { id: "administratif", titre: "Suivi administratif",        repliee: true  },
  { id: "documents",     titre: "Documents et photos",        repliee: true  },
  { id: "rapport",       titre: "Rapports (lecture seule)",   repliee: true  },
  { id: "autres",        titre: "Autres informations",        repliee: true  },
];

export const SECTION_PAR_DEFAUT = "autres";

/** Accents et casse n'ont pas à décider du classement. */
function net(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Colonnes écrites par le système de rapports, et donc intouchables ici.
 *
 * Deux familles : l'encodage par cabine (« Cab1:… »), reconnaissable à son
 * suffixe, et les traces de l'intervention elle-même.
 */
const PROTEGEES: RegExp[] = [
  /* L'encodage par lot : le nom décrit ce qu'on stocke POUR chaque cabine
     — « Dates RDV SAV cabines », « Cause SAV cabines ». Deux colonnes
     finissent pourtant par « Cabines » sans rien encoder du tout, et les
     verrouiller reviendrait à redemander d'ouvrir Notion : le compte
     (« Nb. Cabines ») et la relation (« Séries Cabines »). */
  /(?<!^nb\.? |^series |^séries )\bcabines$/i,
  /* Relevé du 16 octobre 2026 sur 600 chantiers : ces deux-là portent
     « Cab1:… » sans que leur nom le laisse deviner. Les ouvrir à la saisie
     libre aurait effacé le suivi SAV par douche. */
  /^commentaires sav$/i,
  /^dates? - .*sav/i,
  /^sav \/ retouches/i,
  /^interventions montage/i,
  /^heure (arrivee|depart)/i,
  /^rapport monteur$/i,
  /^signature clients$/i,
  /^etat du montage$/i,
  /^explications travaux/i,
  /^lot \(nom de cabine\)$/i,
  /^monteur responsable$/i,
  /^monteurs sous-traitance$/i,
  /^infos - (defauts|pieces)/i,
  /^rapport de montage$/i,
  /^rapport pdf$/i,
];

/** Colonnes de plomberie interne : aucune valeur à l'écran. */
const TECHNIQUES: RegExp[] = [/^n8n/i];

/**
 * Les règles de classement, dans l'ordre. La PREMIÈRE qui correspond gagne,
 * donc les cas particuliers passent avant les familles générales.
 */
const REGLES: { section: string; quand: RegExp }[] = [
  // Cas particuliers d'abord.
  { section: "chantier",      quand: /^(nom chantier|adresse chantier|divers infos chantier|emplacement de cabine|photos (localite|situations|qr code))/ },
  { section: "projet",        quand: /^(projet|n° ofr tm|n° cmd tm|date offre|montant ofr|priorite|type de (client|services)|demande projet|offre tm|eclate produit)/ },
  { section: "contacts",      quand: /^(contacts?|architecte|dt|sanitaire)\b/ },
  { section: "fournisseurs",  quand: /(fournisseur|grossiste|series cabines)/ },

  // Familles métier.
  { section: "soucis",        quand: /soucis/ },
  { section: "sav",           quand: /(^sav\b|sav|garantie|retouche)/ },
  { section: "mesures",       quand: /mesure/ },
  { section: "commande",      quand: /(cmd|arrivage|livraison|carton|bon de livraison)/ },
  { section: "montage",       quand: /(montage|demontage|cabine|collaborateur)/ },
  { section: "administratif", quand: /(facturation|relance|interne|journal|personne assignee|cout)/ },
];

export interface PlaceChamp {
  section: string;
  /** Le formulaire doit-il interdire la saisie ? */
  lectureSeule: boolean;
  /** Pourquoi, le cas échéant. */
  motif?: string;
  /** Hors de l'écran habituel (mais la donnée reste dans Notion). */
  masque: boolean;
}

/**
 * Où ranger une propriété, et avec quels droits.
 *
 * `modifiableApi` vient du schéma Notion : certains types ne s'écrivent
 * pas, quoi qu'on veuille. La lecture seule décidée ici s'y ajoute, elle
 * ne la remplace pas.
 */
export function placerChamp(
  nom: string,
  type: string,
  modifiableApi: boolean,
): PlaceChamp {
  const n = net(nom);

  if (TECHNIQUES.some((r) => r.test(n))) {
    return { section: "autres", lectureSeule: true, motif: "Colonne technique", masque: true };
  }

  if (PROTEGEES.some((r) => r.test(n))) {
    return {
      section: "rapport",
      lectureSeule: true,
      motif: "Renseignée par le rapport d'intervention — modifiable depuis le rapport, pas ici",
      masque: false,
    };
  }

  if (!modifiableApi) {
    /* Formules et boutons : rangés dans leur section métier, consultables,
       jamais saisissables. */
    return { section: sectionDe(n, type), lectureSeule: true, masque: false };
  }

  return { section: sectionDe(n, type), lectureSeule: false, masque: false };
}

function sectionDe(n: string, type: string): string {
  for (const r of REGLES) if (r.quand.test(n)) return r.section;
  /* Rien n'a mordu : une pièce jointe va aux documents, le reste attend
     d'être rangé dans « Autres informations ». */
  if (type === "files") return "documents";
  return SECTION_PAR_DEFAUT;
}

/**
 * Ordre d'affichage à l'intérieur d'une section.
 *
 * Ce qu'on remplit en premier vient en premier : le titre, puis les
 * références, puis les dates, puis les textes longs — qui prennent de la
 * place et qu'on relit rarement. Les pièces jointes ferment la marche.
 */
const POIDS_TYPE: Record<string, number> = {
  title: 0, select: 2, status: 2, multi_select: 3, relation: 3,
  number: 4, date: 5, checkbox: 6, url: 7, email: 7, phone_number: 7,
  people: 7, place: 7, rich_text: 8, formula: 9, button: 9, files: 10,
};

export function poidsChamp(nom: string, type: string, lectureSeule: boolean): number {
  const n = net(nom);
  if (/^projet$/.test(n)) return -100;
  if (/^(n° ofr|n° cmd|n° serv)/.test(n)) return -50;
  /* Les champs qu'on ne peut pas remplir descendent, sans quitter leur
     section : ils informent, ils n'appellent pas d'action. */
  return (POIDS_TYPE[type] ?? 8) + (lectureSeule ? 20 : 0);
}
