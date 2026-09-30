/**
 * Interventions SAV d'un lot : plusieurs passages datés, chacun avec son
 * collaborateur.
 *
 * Un SAV se règle rarement en une fois. On vient, il manque la pièce, on
 * revient. Une seule date écrasait la précédente : on ne savait plus quand
 * l'équipe était passée, ni qui y était allé.
 *
 * Le stockage par cabine réserve déjà la barre verticale (« Cab1:… | Cab2:… »)
 * et les pointages de montage la réservent aussi. Il fallait donc deux autres
 * séparateurs, qui n'apparaissent ni dans une date ni dans un nom :
 *
 *   Cab2:2026-06-23~Claudio & Micael ; 2026-09-30~Claudio
 *
 * Les colonnes historiques « Dates RDV SAV cabines » et « Collaborateurs SAV
 * cabines » restent tenues à jour avec le DERNIER passage : le rapport, le
 * tableau de bord et les statistiques continuent de les lire sans rien savoir
 * de cette liste.
 */

export interface InterventionSav {
  /** AAAA-MM-JJ, ou chaîne vide tant que la date n'est pas saisie. */
  date: string;
  /** « Nom » ou « Nom1 & Nom2 ». */
  collaborateurs: string;
}

const SEP_PASSAGE = ";";
const SEP_CHAMP = "~";

/** Liste des passages d'un lot, à partir de la valeur encodée de CE lot. */
export function parseInterventions(valeur?: string | null): InterventionSav[] {
  return String(valeur || "")
    .split(SEP_PASSAGE)
    .map((bloc) => {
      const i = bloc.indexOf(SEP_CHAMP);
      /* Sans séparateur, le bloc est une date seule : c'est la forme qu'avait
         l'ancienne colonne, et une valeur reprise telle quelle doit se lire. */
      const date = (i < 0 ? bloc : bloc.slice(0, i)).trim().slice(0, 10);
      const collaborateurs = i < 0 ? "" : bloc.slice(i + 1).trim();
      return { date, collaborateurs };
    })
    .filter((x) => x.date || x.collaborateurs);
}

/** Valeur encodée d'un lot. Les passages entièrement vides disparaissent. */
export function encodeInterventions(liste: InterventionSav[]): string {
  return liste
    .map((x) => ({
      /* La barre verticale séparerait les cabines et le point-virgule les
         passages : les laisser passer couperait la valeur en deux. */
      date: String(x.date || "").trim().slice(0, 10).replace(/[|;~]/g, ""),
      collaborateurs: String(x.collaborateurs || "").trim().replace(/[|;~]/g, " ").replace(/\s+/g, " "),
    }))
    .filter((x) => x.date || x.collaborateurs)
    .map((x) => (x.collaborateurs ? `${x.date}${SEP_CHAMP}${x.collaborateurs}` : x.date))
    .join(` ${SEP_PASSAGE} `);
}

/**
 * Passages d'un lot, en repliant sur les anciennes colonnes quand la liste
 * n'existe pas encore : un SAV saisi avant cette fonction garde sa date et son
 * collaborateur, et se relit comme un passage unique.
 */
export function interventionsDuLot(
  liste: string | null | undefined,
  dateHeritee: string | null | undefined,
  collabHerite: string | null | undefined,
): InterventionSav[] {
  const parsees = parseInterventions(liste);
  if (parsees.length > 0) return parsees;
  const date = String(dateHeritee || "").trim().slice(0, 10);
  const collaborateurs = String(collabHerite || "").trim();
  return date || collaborateurs ? [{ date, collaborateurs }] : [];
}

/**
 * Le passage le plus récent — celui que les colonnes historiques reflètent.
 *
 * Le tri se fait sur la date, pas sur l'ordre de saisie : un passage ajouté
 * après coup pour une visite oubliée ne doit pas se faire passer pour le
 * dernier. Un passage sans date ne peut pas prétendre l'être.
 */
export function dernierPassage(liste: InterventionSav[]): InterventionSav | null {
  const datees = liste.filter((x) => x.date);
  if (datees.length === 0) return null;
  return datees.reduce((a, b) => (b.date >= a.date ? b : a));
}
