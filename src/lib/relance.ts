/**
 * La relance d'un dossier resté sans réponse.
 *
 * Un relevé de mesures a été fait, une offre a été envoyée, et depuis, rien.
 * L'écran « Mesures non commandées » les compte — quatre-vingt-onze au
 * moment où ceci s'écrit — mais compter n'est pas relancer : il fallait
 * rouvrir chaque fiche, retrouver la date de l'offre, chercher le bon
 * interlocuteur parmi sept familles de contacts, et rédiger.
 *
 * Ce module fait les trois : il choisit le destinataire, rassemble les dates
 * et écrit le message. Il n'envoie rien — le courrier s'ouvre dans le logiciel
 * de messagerie, et c'est une personne qui appuie sur « Envoyer ».
 */

/** Les familles de contacts d'un projet, telles que Notion les range. */
export interface ContactsDuProjet {
  grossiste?: Contact[];
  clientsFinaux?: Contact[];
  sanitaire?: Contact[];
  dt?: Contact[];
  architecte?: Contact[];
  locataires?: Contact[];
  autres?: Contact[];
}

export interface Contact {
  name: string;
  email: string;
}

export type FamilleContact = keyof ContactsDuProjet;

/** Le nom de la famille tel qu'il s'affiche dans Notion — pour le dire à l'écran. */
export const LIBELLE_FAMILLE: Record<FamilleContact, string> = {
  grossiste: "Contact Grossiste",
  clientsFinaux: "Contacts Clients finaux",
  sanitaire: "Contacts Sanitaire",
  dt: "Contacts DT",
  architecte: "Contacts Architecte",
  locataires: "Contacts Locataires",
  autres: "Contacts Autres",
};

/**
 * À qui l'on écrit, selon le type de client.
 *
 * Le premier de la liste est celui que le type DÉSIGNE ; les suivants sont un
 * repli, et l'écran dit lequel a servi. Sans repli, un tiers des dossiers
 * n'aurait pas de destinataire : sur les vingt-huit dossiers « Sanitaires »,
 * quinze seulement portent un contact sanitaire, alors que vingt-quatre
 * portent un contact grossiste.
 */
const CHAINE: Record<string, FamilleContact[]> = {
  "Grossistes":           ["grossiste", "sanitaire", "clientsFinaux", "autres"],
  "Sanitaires":           ["sanitaire", "grossiste", "clientsFinaux", "autres"],
  "Client finaux":        ["clientsFinaux", "locataires", "autres", "grossiste"],
  "Architecte":           ["architecte", "dt", "autres", "grossiste"],
  "Entreprise générales": ["dt", "autres", "architecte", "grossiste"],
  "Gérances Immo":        ["autres", "locataires", "clientsFinaux", "grossiste"],
  "Promoteur":            ["autres", "dt", "clientsFinaux", "grossiste"],
  "Carreleur":            ["autres", "dt", "sanitaire", "grossiste"],
  "Menuiserie":           ["autres", "dt", "sanitaire", "grossiste"],
};

/** Ordre de dernier recours, quand le type de client est vide ou inconnu. */
const CHAINE_PAR_DEFAUT: FamilleContact[] = [
  "grossiste", "sanitaire", "clientsFinaux", "dt", "architecte", "locataires", "autres",
];

/**
 * Un client de type « Fournisseurs » ne se relance pas.
 *
 * C'est nous qui commandons chez lui, pas l'inverse : il n'y a pas d'offre en
 * attente de sa réponse. Vingt-quatre dossiers sur quatre-vingt-onze sont dans
 * ce cas, et leur envoyer une relance n'aurait aucun sens.
 */
export const TYPE_SANS_RELANCE = "Fournisseurs";

export function relanceApplicable(typeClient: string | null | undefined): boolean {
  return String(typeClient || "").trim() !== TYPE_SANS_RELANCE;
}

export interface Destinataire {
  contacts: Contact[];
  /** La famille d'où ils viennent. */
  famille: FamilleContact | null;
  /** Vrai si le type de client en désignait une autre, restée vide. */
  repli: boolean;
}

const avecMail = (l?: Contact[]) =>
  (l || []).filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c?.email || "").trim()));

/**
 * Le destinataire de la relance.
 *
 * On ne retient que les contacts qui ont une adresse : un contact sans mail
 * ne sert à rien ici, et le garder ferait croire qu'on a trouvé quelqu'un.
 */
export function destinataireRelance(
  typeClient: string | null | undefined,
  contacts: ContactsDuProjet,
): Destinataire {
  const chaine = CHAINE[String(typeClient || "").trim()] || CHAINE_PAR_DEFAUT;
  for (let i = 0; i < chaine.length; i++) {
    const trouves = avecMail(contacts[chaine[i]]);
    if (trouves.length > 0) return { contacts: trouves, famille: chaine[i], repli: i > 0 };
  }
  return { contacts: [], famille: null, repli: false };
}

/** Une date Notion (2026-09-02 ou 2026-09-02T…) au format suisse. */
export function dateSuisse(iso: string | null | undefined): string {
  const jour = String(iso || "").split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return "";
  const [a, m, j] = jour.split("-");
  return `${j}.${m}.${a}`;
}

/**
 * L'ouverture du message : « Bonjour, », sans nom.
 *
 * On a d'abord essayé le prénom. Les fiches ne tiennent pas le même ordre —
 * « Dylan Emonin » à côté d'« Oppizzi Sylvain », « Ordonez Yanick » — et rien
 * dans la fiche ne dit lequel des deux mots est le prénom. Le premier
 * échantillon réel donnait « Bonjour Dylan et Oppizzi » et « Bonjour
 * Ordonez » : adressé au client, cela fait plus de dégâts qu'un simple
 * « Bonjour » n'en évite. Le civilité par le genre est hors de portée pour la
 * même raison.
 *
 * Le nom reste visible là où il ne peut pas se tromper : dans le champ
 * destinataire. Et le courrier s'ouvre dans la messagerie, où personnaliser
 * l'entrée en matière prend trois secondes.
 */
export function salutation(_contacts: Contact[]): string {
  return "Bonjour,";
}

/**
 * Une adresse lisible dans une phrase.
 *
 * Les adresses viennent d'un champ de localisation : elles traînent le pays,
 * parfois le canton — « Rue des Alpes 9, 1023 Crissier Vaud, Suisse ». Écrit
 * à un client suisse, le pays est de trop, et le canton derrière la localité
 * ne se dit pas.
 */
const CANTONS = [
  "Vaud", "Valais", "Fribourg", "Genève", "Geneve", "Neuchâtel", "Neuchatel",
  "Jura", "Berne", "Bern", "Argovie", "Soleure", "Zurich", "Zürich", "Tessin",
  "Lucerne", "Thurgovie", "Schaffhouse", "Grisons", "Glaris", "Zoug",
  "Schwytz", "Uri", "Obwald", "Nidwald", "Appenzell",
];
const PAYS = ["suisse", "switzerland", "schweiz", "svizzera", "ch"];

export function nettoyerLieu(adresse: string | null | undefined): string {
  const morceaux = String(adresse || "").split(",").map((m) => m.trim()).filter(Boolean);
  while (morceaux.length > 1 && PAYS.includes(morceaux[morceaux.length - 1].toLowerCase())) {
    morceaux.pop();
  }
  const dernier = morceaux[morceaux.length - 1];
  if (dernier) {
    /* Le canton ne se retire que s'il SUIT une localité : « 1023 Crissier
       Vaud » perd « Vaud », « 1700 Fribourg » garde Fribourg, qui est la
       ville. */
    for (const canton of CANTONS) {
      const m = dernier.match(new RegExp(`^(\\d{4}\\s+.+?)\\s+${canton}$`, "i"));
      if (m) { morceaux[morceaux.length - 1] = m[1].trim(); break; }
    }
  }
  return morceaux.join(", ");
}

export interface ProjetARelancer {
  id: string;
  projet: string;
  ofrTM?: string | null;
  /** « N° OFR Grossiste » — la référence du dossier CHEZ le grossiste. */
  ofrGrossiste?: string | null;
  nomChantier?: string | null;
  adresseChantier?: string | null;
  dateOffre?: string | null;
  dateMesures?: string | null;
  nbCabines?: number | null;
  typeClient?: string | null;
}

export interface MailRelance {
  objet: string;
  corps: string;
  destinataires: string[];
  famille: FamilleContact | null;
  repli: boolean;
  sansDestinataire: boolean;
}

/** Un courrier préparé, rattaché à son projet — ce que rend /api/relance. */
export interface RelancePreparee extends MailRelance {
  id: string;
  projet: string;
  ofrTM: string;
  /** Renseigné quand aucun courrier n'est proposé, et pourquoi. */
  ecarte?: string;
}

/* Pas de signature ici : le logiciel de messagerie ajoute la sienne, et deux
   signatures l'une sous l'autre font plus négligé qu'aucune. */

/**
 * La référence du dossier chez le grossiste.
 *
 * Demandée pour les grossistes seulement : c'est par ce numéro-là qu'ils
 * retrouvent l'affaire dans leur propre système, notre numéro à nous ne leur
 * disant rien. Les autres types de clients n'ont pas ce champ renseigné.
 */
function refGrossiste(p: ProjetARelancer): string {
  if (String(p.typeClient || "").trim() !== "Grossistes") return "";
  return String(p.ofrGrossiste || "").trim();
}

/**
 * La question qui débloque le dossier — formulée selon à qui l'on parle.
 *
 * Un relevé de mesures est une prestation facturable en soi. Tant qu'on ne
 * sait pas si la cabine se fera, le dossier reste ouvert et le déplacement
 * n'est jamais payé : c'est la situation de la moitié de cette liste.
 *
 * AU GROSSISTE, on demande directement le numéro de commande du seul relevé :
 * il émet des commandes, c'est son métier, et il peut le faire dans la foulée
 * sans rien décider d'autre.
 *
 * AUX AUTRES, on ne réclame pas de numéro — beaucoup n'en émettent pas. On
 * demande seulement si la cabine se fera, ce qui suffit à trancher entre
 * patienter et clore le dossier en facturant le relevé.
 */
function phraseReleveSeul(p: ProjetARelancer): string {
  const nb = p.nbCabines || 0;
  const estGrossiste = String(p.typeClient || "").trim() === "Grossistes";

  if (estGrossiste) {
    const sujet = nb <= 0
      ? "les cabines n'ont finalement pas été commandées"
      : nb === 1
        ? "cette cabine n'a finalement pas été commandée"
        : `ces ${nb} cabines n'ont finalement pas été commandées`;
    return `Si ${sujet} par votre client, nous vous remercions de bien vouloir nous transmettre un numéro de commande couvrant uniquement le service de relevé de mesures.`;
  }

  const sujet = nb <= 0
    ? "les cabines ont été ou seront commandées"
    : nb === 1
      ? "cette cabine a été ou sera commandée"
      : `ces ${nb} cabines ont été ou seront commandées`;
  return `Pourriez-vous nous indiquer si ${sujet} ? Cela nous permettra de savoir si nous devons patienter, ou clore le dossier et vous adresser notre facture pour le service de relevé de mesures.`;
}

/** Le premier numéro d'offre, celui qui sert de référence au client. */
function referenceOffre(p: ProjetARelancer): string {
  const premier = String(p.ofrTM || "").split(/[,;\n]/)[0].trim();
  return premier;
}

/** Le chantier sans le nom du client, qui ouvre tous les noms de projet. */
function sansLeClient(projet: string): string {
  const nom = String(projet || "").trim();
  /* « Duka - Lot 1, … » : écrire « Duka » à Duka ne lui apprend rien. */
  const apres = nom.split(" - ").slice(1).join(" - ").trim();
  return apres || nom;
}

/** Ce qu'on nomme dans le CORPS, pour que le client reconnaisse le chantier. */
function designationChantier(p: ProjetARelancer): string {
  const parts = [p.nomChantier, nettoyerLieu(p.adresseChantier)]
    .map((x) => String(x || "").trim()).filter(Boolean);
  if (parts.length === 0) return sansLeClient(p.projet);
  return [...new Set(parts)].join(", ");
}

/**
 * Ce qu'on met dans l'OBJET — court.
 *
 * L'objet complet dépassait la centaine de caractères et se faisait couper
 * par la messagerie en plein milieu de l'adresse. Le nom du chantier et la
 * localité suffisent à le reconnaître d'un coup d'œil dans une boîte.
 */
function designationCourte(p: ProjetARelancer): string {
  const nom = String(p.nomChantier || "").trim() || sansLeClient(p.projet);
  const localite = nettoyerLieu(p.adresseChantier).split(",").pop()?.trim() || "";
  const court = nom.length > 45 ? `${nom.slice(0, 44).trimEnd()}…` : nom;
  return [court, localite && !court.includes(localite) ? localite : ""].filter(Boolean).join(", ");
}

/**
 * Le message de relance d'UN dossier.
 *
 * Les deux dates sont le cœur du message : celle de l'offre dit depuis quand
 * on attend, celle du relevé prouve que le travail de notre côté est fait. Une
 * relance sans elles se discute ; avec elles, elle se vérifie.
 */
export function redigerRelance(p: ProjetARelancer, dest: Destinataire): MailRelance {
  const ref = referenceOffre(p);
  const chantier = designationChantier(p);
  const offre = dateSuisse(p.dateOffre);
  const mesures = dateSuisse(p.dateMesures);

  const votreRef = refGrossiste(p);
  const references = [ref && `offre ${ref}`, votreRef && `votre réf. ${votreRef}`].filter(Boolean).join(" · ");
  const objet = ["Relance", references, designationCourte(p)].filter(Boolean).join(" — ");

  const nb = p.nbCabines || 0;
  const lignes: string[] = [salutation(dest.contacts), ""];

  /* La référence du grossiste, c'est par elle qu'il retrouve le dossier dans
     SON système — notre numéro à nous ne lui dit rien. Sept dossiers sur
     trente-quatre la portent ; sans elle, la phrase se passe d'incise. */
  const incise = refGrossiste(p) ? `, référencée chez vous sous ${refGrossiste(p)},` : ",";

  lignes.push(
    offre
      ? `Sauf erreur de notre part, notre offre${ref ? ` ${ref}` : ""} du ${offre}${incise} concernant ${chantier}, est restée sans réponse à ce jour.`
      : `Sauf erreur de notre part, notre offre${ref ? ` ${ref}` : ""}${refGrossiste(p) ? ` (votre référence ${refGrossiste(p)})` : ""} concernant ${chantier} est restée sans réponse à ce jour.`,
  );

  if (mesures) {
    lignes.push(
      "",
      `Le relevé de mesures a été effectué le ${mesures}${nb > 0 ? ` (${nb} cabine${nb > 1 ? "s" : ""})` : ""}.`,
    );
  }

  const repli = phraseReleveSeul(p);
  if (repli) lignes.push("", repli);

  /* Le paragraphe ci-dessus pose déjà la question ; la reposer ici — « quelle
     suite donnez-vous à ce dossier ? » — faisait deux demandes pour une. */
  lignes.push(
    "",
    "Nous restons bien entendu à votre disposition pour toute adaptation ou question.",
    "",
    "En vous remerciant par avance,",
  );

  return {
    objet,
    corps: lignes.join("\n"),
    destinataires: dest.contacts.map((c) => c.email.trim()),
    famille: dest.famille,
    repli: dest.repli,
    sansDestinataire: dest.contacts.length === 0,
  };
}

/**
 * L'adresse `mailto:` qui ouvre le message dans Outlook, Mail ou autre.
 *
 * Tout passe par l'encodage de pourcentage, retours à la ligne compris : un
 * accent ou une apostrophe non encodés coupent le corps du message au premier
 * caractère fautif, sans rien dire.
 */
export function lienMailto(m: MailRelance): string {
  const q = new URLSearchParams({ subject: m.objet, body: m.corps }).toString()
    /* `URLSearchParams` encode l'espace en « + », que les clients de
       messagerie affichent tel quel dans le corps du message. */
    .replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(m.destinataires.join(","))
    .replace(/%40/g, "@").replace(/%2C/g, ",")}?${q}`;
}
