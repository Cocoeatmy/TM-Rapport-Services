/**
 * Quels projets une personne a le droit de voir.
 *
 * Le réglage existe depuis la refonte des droits : « uniquement les siens »
 * ou « tous ». Il était enregistré et n'était appliqué nulle part (audit A6
 * du 17.10.2026) — un interrupteur qui ne commandait rien.
 *
 * ── Ce que « les siens » veut dire ici, et pourquoi ────────────────────────
 *
 * Relevé du 17 octobre 2026 sur les 235 chantiers en cours : **216 n'ont
 * aucun collaborateur attribué**. Le nom ne se remplit qu'au moment de poser
 * la date de montage ; avant cela, un dossier appartient à tout le monde et à
 * personne.
 *
 * Prendre « les siens » au pied de la lettre aurait donc montré six projets à
 * Jacobo et caché les deux cent seize autres — c'est-à-dire la quasi-totalité
 * du travail en préparation. Personne n'aurait pris cette restriction pour
 * une décision ; tout le monde l'aurait prise pour une panne.
 *
 * La règle retenue par défaut est donc : **un projet est « sien » s'il lui est
 * attribué, OU s'il n'est attribué à personne.** Ce qui se cache, ce sont les
 * chantiers d'un COLLÈGUE — jamais ceux que personne n'a encore pris.
 *
 * Mais l'absence d'attribution ne DOIT PAS valoir autorisation par principe :
 * c'est une décision, pas une évidence. Elle est donc explicite, et le
 * troisième périmètre — « siens-stricts » — permet de trancher dans l'autre
 * sens quand on le veut : seuls les chantiers nommément confiés.
 */

/** Minuscules, sans accents : « Loïc » et « loic » sont la même personne. */
function net(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Les prénoms portés par un projet.
 *
 * Le champ Notion contient « Claudio & Jacobo », parfois « Claudio & Jacobo &
 * Jean-Marc & Miguel ». On découpe sur les séparateurs usuels en gardant les
 * prénoms composés — « Jean-Marc » ne doit pas devenir « Jean » et « Marc ».
 */
export interface PorteurDeCollaborateurs {
  collaborateurs?: unknown;
}

export function prenomsDuProjet(p: PorteurDeCollaborateurs): string[] {
  return (typeof p.collaborateurs === "string" ? p.collaborateurs : "")
    .split(/[&,/]|\bet\b/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Le prénom d'un compte, tel qu'il apparaît dans les projets. */
export function prenomDe(nomComplet: string): string {
  return (nomComplet || "").trim().split(/\s+/)[0] || "";
}

/** Les prénoms d'un champ Notion quelconque — « Claudio & Jacobo », « Team TM ». */
export function prenomsDuChamp(champ: unknown): string[] {
  return (typeof champ === "string" ? champ : "")
    .split(/[&,/]|\bet\b/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Ce champ nomme-t-il cette personne ?
 *
 * Notion écrit « Jean-Marc & Miguel » ; le compte s'appelle « Jean-Marc
 * Nelzi ». Comparer le champ au nom COMPLET ne trouvait donc jamais rien —
 * c'est ainsi que la préparation hors ligne a chargé zéro chantier pour
 * tout le monde pendant des semaines sans qu'aucune erreur ne paraisse
 * (découvert le 18 octobre 2026). On compare prénom contre prénom, accents
 * et casse neutralisés, et « Team… » désigne chacun.
 *
 * Sert aux trois champs d'attribution : montages, mesures, SAV. `estSien`
 * reste la règle de périmètre (avec sa politique souple/stricte) ; celle-ci
 * est la brique de comparaison qu'elle partage désormais.
 */
export function champNomme(champ: unknown, nomComplet: string): boolean {
  const moi = net(prenomDe(nomComplet));
  if (!moi) return false;
  return prenomsDuChamp(champ).some((x) => {
    const n = net(x);
    /* Le PREMIER MOT du segment : Notion écrit des prénoms, mais une saisie
       « Jacobo Fontan » doit nommer Jacobo aussi. « Jean-Marc » reste un
       seul mot — le trait d'union n'est pas un séparateur. */
    return n.startsWith("team") || net(prenomDe(x)) === moi;
  });
}

/**
 * Ce projet est-il le sien ?
 *
 * « Team », « Team TM » et consorts désignent l'équipe entière : un chantier
 * confié à l'équipe est celui de chacun de ses membres.
 */
export function estSien(
  p: PorteurDeCollaborateurs,
  nomComplet: string,
  strict = false,
): boolean {
  const prenoms = prenomsDuProjet(p);
  /* Personne dessus. En politique souple, le dossier n'est à personne donc
     pas « à un autre » ; en politique stricte, il n'est pas à lui non plus. */
  if (prenoms.length === 0) return !strict;
  const moi = net(prenomDe(nomComplet));
  if (!moi) return false;
  return prenoms.some((x) => {
    const n = net(x);
    /* Une équipe entière inclut chacun de ses membres — y compris en
       politique stricte : c'est une attribution, pas une absence. */
    return n === moi || n.startsWith("team");
  });
}

/**
 * Les trois politiques possibles, nommées pour qu'on choisisse en connaissance.
 *
 * — « tous »          : aucun filtre.
 * — « siens »         : les siens, plus ceux que personne n'a pris.
 * — « siens-stricts » : uniquement ceux qui lui sont nommément confiés.
 *                       Aujourd'hui, cela représenterait six chantiers sur
 *                       235 pour un monteur : à n'employer qu'en connaissance
 *                       de cause.
 */
export type Perimetre = "siens" | "siens-stricts" | "tous";

export const PERIMETRES: { id: Perimetre; libelle: string; explication: string }[] = [
  { id: "tous", libelle: "Tous les projets", explication: "Tous les chantiers de l'entreprise." },
  { id: "siens", libelle: "Les siens et les non attribués", explication: "Cache les chantiers confiés à un collègue. Les dossiers que personne n'a pris restent visibles." },
  { id: "siens-stricts", libelle: "Uniquement ceux qui lui sont confiés", explication: "Ne montre que les chantiers portant son nom. Très restrictif : la plupart des dossiers en préparation n'ont pas encore de collaborateur." },
];

/** Ne garde que ce que cette personne a le droit de voir. */
export function filtrerPerimetre<T extends PorteurDeCollaborateurs>(
  projets: T[],
  nomComplet: string,
  perimetre: Perimetre,
): T[] {
  if (perimetre === "tous") return projets;
  const strict = perimetre === "siens-stricts";
  return projets.filter((p) => estSien(p, nomComplet, strict));
}

/** Combien de projets une restriction retirerait — pour le dire, pas pour le taire. */
export function compterMasques<T extends PorteurDeCollaborateurs>(
  projets: T[],
  nomComplet: string,
  perimetre: Perimetre,
): number {
  if (perimetre === "tous") return 0;
  return projets.length - filtrerPerimetre(projets, nomComplet, perimetre).length;
}
