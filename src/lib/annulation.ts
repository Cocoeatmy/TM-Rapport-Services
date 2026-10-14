/**
 * Annuler un projet depuis la liste des devis en attente.
 *
 * Un devis sans réponse finit parfois par ne jamais se faire. Le classer
 * demandait d'ouvrir Notion, de trouver la fiche et de changer deux colonnes
 * — assez pour qu'on ne le fasse pas, et c'est ainsi que la liste s'encombre
 * de dossiers morts.
 *
 * Le bouton change « État - CMD » en « Annulé ». Reste la question des
 * MESURES, et elle n'est pas automatique : si l'on s'est déplacé, le relevé
 * se facture, et clore le dossier en silence ferait perdre cette facture.
 */

/**
 * Les états de mesure où PERSONNE ne s'est déplacé.
 *
 * Ceux-là suivent l'annulation sans rien demander : il n'y a eu ni rendez-
 * vous, ni relevé, donc rien à facturer. Ce sont les trois états du groupe
 * « À faire » de Notion, plus « Projet sans mesures » — un dossier qui
 * n'appelait pas de relevé du tout.
 */
export const MESURES_SANS_DEPLACEMENT = [
  "Pas contacté",
  "Contact sans réponse",
  "OFR envoyée sans mesures",
  "Projet sans mesures",
];

/** Déjà classés : il n'y a rien à y changer. */
export const MESURES_DEJA_CLOSES = ["Annulé"];

export interface DecisionAnnulation {
  /** Nouvel état des mesures, ou `null` pour ne pas y toucher. */
  mesuresVers: string | null;
  /**
   * Ce qu'il faut dire à l'écran quand les mesures NE suivent PAS.
   *
   * Jamais silencieux : c'est précisément le cas où une facture est
   * peut-être à établir avant de clore.
   */
  avertissement: string | null;
}

/**
 * Que faire de « État - Mesures » quand on annule un projet.
 *
 * Trois issues :
 * - l'état dit que personne ne s'est déplacé → il passe à « Annulé » ;
 * - l'état est vide ou déjà « Annulé » → on n'y touche pas, et on se tait ;
 * - tout le reste → on n'y touche pas, et on le DIT. Un rendez-vous fixé,
 *   un relevé partiel, des mesures relevées : il y a eu du travail, et il se
 *   facture peut-être avant la clôture.
 */
export function decisionAnnulation(etatMesures: string | null | undefined): DecisionAnnulation {
  const e = String(etatMesures || "").trim();

  if (!e || MESURES_DEJA_CLOSES.includes(e)) {
    return { mesuresVers: null, avertissement: null };
  }
  if (MESURES_SANS_DEPLACEMENT.includes(e)) {
    return { mesuresVers: "Annulé", avertissement: null };
  }
  return {
    mesuresVers: null,
    avertissement:
      `L'état des mesures reste « ${e} » : un relevé a été engagé. ` +
      `Vérifiez s'il y a un service à facturer avant de clore le dossier.`,
  };
}
