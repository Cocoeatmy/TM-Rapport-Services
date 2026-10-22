/**
 * Les écritures en cours sur une fiche projet, vues depuis l'appareil
 * (22.10.2026).
 *
 * Une saisie enregistrée « disparaissait » quelques secondes puis revenait :
 * la relecture automatique de la fiche (toutes les 20 s, et au retour sur
 * l'app) pouvait PARTIR avant l'enregistrement et REVENIR après, avec la
 * fiche d'avant. Toute écriture vers /api/projects/<id> passe par
 * `offlineFetch`, qui la signale ici ; une relecture qui a croisé une
 * écriture est simplement ignorée — la suivante apportera la bonne fiche.
 */

const enCours = new Map<string, number>();
const derniere = new Map<string, number>();

/** L'identifiant du projet visé par une écriture, sinon null. */
export function projetEcrit(url: string, methode: string): string | null {
  if (methode === "GET" || methode === "HEAD") return null;
  const m = /\/api\/projects\/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?:[/?#]|$)/i.exec(url);
  return m ? m[1] : null;
}

export function debutEcriture(id: string): void {
  enCours.set(id, (enCours.get(id) || 0) + 1);
  derniere.set(id, Date.now());
}

export function finEcriture(id: string): void {
  enCours.set(id, Math.max(0, (enCours.get(id) || 0) - 1));
  derniere.set(id, Date.now());
}

/** Une lecture partie à `debut` est-elle sûre ? Non si une écriture de la
    fiche est en cours, ou a commencé / fini depuis. */
export function lectureFiable(id: string, debut: number): boolean {
  if ((enCours.get(id) || 0) > 0) return false;
  return (derniere.get(id) || 0) < debut;
}
