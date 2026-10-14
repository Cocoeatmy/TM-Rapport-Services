/**
 * Comment s'appelle un lot.
 *
 * Sur un chantier de quinze appartements, « Cabine 7 » ne dit rien à
 * personne : ni au monteur qui cherche la bonne porte, ni au client qui lit
 * le rapport. Les monteurs nomment donc les pièces, et toujours avec les
 * mêmes mots — SDD, SDB, sous-sol, 1er étage, comble. Autant les proposer.
 *
 * Ces mots se cumulent : « SDD » et « 1er étage » désignent ensemble la même
 * pièce. Ce sont donc des cases à cocher, pas un choix unique, et le nom
 * reste librement modifiable — la liste fait gagner du temps, elle n'impose
 * rien.
 */

/** Les noms qui reviennent, dans l'ordre où on les propose. */
export const SUGGESTIONS_NOM_CABINE = ["SDD", "SDB", "Sous-sol", "1er étage", "Comble"];

/**
 * « Cabine 3 » : le nom que personne n'a encore choisi.
 *
 * Il sert de repère à l'assistant — un lot encore anonyme s'ouvre sur
 * l'étape qui le nomme — et il ne doit jamais se retrouver collé devant le
 * vrai nom (« Cabine 3 SDD »).
 */
export function nomDeLotParDefaut(nom: string): boolean {
  return !nom.trim() || /^cabine\s*\d+$/i.test(nom.trim());
}

function motEntier(mot: string): RegExp {
  return new RegExp(`(^|\\s)${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`, "i");
}

/** Ce mot figure-t-il déjà dans le nom ? (mot entier, accents et casse compris) */
export function nomContientMot(nom: string, mot: string): boolean {
  return motEntier(mot).test(nom || "");
}

/**
 * Ajoute le mot au nom, ou l'en retire s'il y était.
 *
 * Un nom resté par défaut est remplacé, pas complété : on veut « SDD », pas
 * « Cabine 3 SDD ».
 */
export function basculerMotDuNom(nom: string, mot: string): string {
  const base = nomDeLotParDefaut(nom) ? "" : (nom || "").trim();
  if (nomContientMot(base, mot)) {
    return base.replace(motEntier(mot), " ").replace(/\s{2,}/g, " ").trim();
  }
  return base ? `${base} ${mot}` : mot;
}
