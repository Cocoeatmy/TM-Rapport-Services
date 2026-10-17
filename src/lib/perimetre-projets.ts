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
 * La règle retenue est donc : **un projet est « sien » s'il lui est attribué,
 * OU s'il n'est attribué à personne.** Ce qui se cache, ce sont les chantiers
 * d'un COLLÈGUE — jamais ceux que personne n'a encore pris. C'est le sens
 * qu'on donne à la restriction quand on la demande.
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

/**
 * Ce projet est-il le sien ?
 *
 * « Team », « Team TM » et consorts désignent l'équipe entière : un chantier
 * confié à l'équipe est celui de chacun de ses membres.
 */
export function estSien(p: PorteurDeCollaborateurs, nomComplet: string): boolean {
  const prenoms = prenomsDuProjet(p);
  /* Personne dessus : le dossier n'est à personne, donc pas « à un autre ». */
  if (prenoms.length === 0) return true;
  const moi = net(prenomDe(nomComplet));
  if (!moi) return false;
  return prenoms.some((x) => {
    const n = net(x);
    return n === moi || n.startsWith("team");
  });
}

export type Perimetre = "siens" | "tous";

/** Ne garde que ce que cette personne a le droit de voir. */
export function filtrerPerimetre<T extends PorteurDeCollaborateurs>(
  projets: T[],
  nomComplet: string,
  perimetre: Perimetre,
): T[] {
  if (perimetre === "tous") return projets;
  return projets.filter((p) => estSien(p, nomComplet));
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
