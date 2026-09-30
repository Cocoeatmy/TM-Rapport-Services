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
  /** HH:MM, vide si l'heure n'a pas été relevée. */
  arrivee: string;
  depart: string;
}

const SEP_PASSAGE = ";";
const SEP_CHAMP = "~";

/**
 * Liste des passages d'un lot, à partir de la valeur encodée de CE lot.
 *
 * Les champs absents à la fin d'un bloc valent la chaîne vide : un passage
 * écrit avant que les heures n'existent (« date~collaborateurs ») se relit
 * sans rien perdre, et une date seule aussi.
 */
export function parseInterventions(valeur?: string | null): InterventionSav[] {
  return String(valeur || "")
    .split(SEP_PASSAGE)
    .map((bloc) => {
      const champs = bloc.split(SEP_CHAMP).map((x) => x.trim());
      return {
        date: (champs[0] || "").slice(0, 10),
        collaborateurs: champs[1] || "",
        arrivee: champs[2] || "",
        depart: champs[3] || "",
      };
    })
    .filter((x) => x.date || x.collaborateurs || x.arrivee || x.depart);
}

/**
 * Valeur encodée d'un lot. Les passages entièrement vides disparaissent, et
 * les champs vides de fin ne sont pas écrits : un passage sans heures garde
 * la forme courte « date~collaborateurs ».
 */
export function encodeInterventions(liste: InterventionSav[]): string {
  /* La barre verticale séparerait les cabines, le point-virgule les passages
     et le tilde les champs : les laisser passer couperait la valeur. */
  const propre = (v: unknown) => String(v || "").trim().replace(/[|;~]/g, " ").replace(/\s+/g, " ");
  return liste
    .map((x) => [propre(x.date).slice(0, 10), propre(x.collaborateurs), propre(x.arrivee), propre(x.depart)])
    .filter((champs) => champs.some(Boolean))
    .map((champs) => {
      while (champs.length > 1 && !champs[champs.length - 1]) champs.pop();
      return champs.join(SEP_CHAMP);
    })
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
  arriveeHeritee?: string | null,
  departHerite?: string | null,
): InterventionSav[] {
  const parsees = parseInterventions(liste);
  if (parsees.length > 0) return parsees;
  const date = String(dateHeritee || "").trim().slice(0, 10);
  const collaborateurs = String(collabHerite || "").trim();
  const arrivee = String(arriveeHeritee || "").trim();
  const depart = String(departHerite || "").trim();
  return date || collaborateurs || arrivee || depart
    ? [{ date, collaborateurs, arrivee, depart }]
    : [];
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

/** Minutes travaillées sur une liste de passages. Un horaire incomplet compte zéro. */
export function minutesInterventions(liste: InterventionSav[]): number {
  const HEURE = /^(\d{1,2}):(\d{2})$/;
  return liste.reduce((somme, x) => {
    const a = HEURE.exec(x.arrivee || "");
    const d = HEURE.exec(x.depart || "");
    if (!a || !d) return somme;
    const diff = (+d[1] * 60 + +d[2]) - (+a[1] * 60 + +a[2]);
    return diff > 0 ? somme + diff : somme;
  }, 0);
}
