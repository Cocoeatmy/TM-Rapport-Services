/**
 * Qui commande l'aperçu au survol.
 *
 * Le problème que ce fichier résout : en glissant le curseur d'un numéro de
 * projet au suivant, un numéro sur deux n'ouvrait rien. Le départ du premier
 * annulait aveuglément l'ouverture en attente — y compris celle du second,
 * déjà programmée — puis refermait la fiche. Le défaut n'apparaissait qu'en
 * déplacement rapide, quand départ et arrivée tombent dans le même instant et
 * que l'ordre dans lequel le navigateur les annonce cesse d'être garanti.
 *
 * La règle tient en une phrase : SEULE la cible encore survolée a le droit de
 * fermer. Un départ qui ne porte pas la clé de la cible en cours ne touche à
 * rien. L'ordre des événements n'a plus d'importance.
 *
 * Deuxième règle : une fiche déjà ouverte au survol bascule SANS DÉLAI sur le
 * numéro suivant. Le délai n'existe que pour ne pas clignoter quand le
 * curseur traverse une liste sans s'arrêter ; une fois la fiche à l'écran, il
 * ne protège plus rien et donne l'impression que l'app ne suit pas.
 */

export interface ArbitreSurvol {
  /** Le curseur arrive sur `cle`. `ouvre` sera appelé, tout de suite ou après le délai. */
  entrer(cle: string, ouvre: () => void): void;
  /** Le curseur quitte `cle`. Sans effet si une autre cible a déjà pris la main. */
  sortir(cle: string, delai?: number): void;
  /** Le curseur quitte la zone sans clé (la fiche, un conteneur). */
  sortirSansCle(delai?: number): void;
  /** Un clic a épinglé la fiche : le survol ne la commande plus. */
  oublier(): void;
  /** La cible survolée — pour les tests et le débogage. */
  cible(): string | null;
}

export interface ReglagesSurvol {
  /** Une fiche est-elle ouverte ET encore sous le commandement du survol ? */
  survolEnCours: () => boolean;
  /** Fermer la fiche. */
  ferme: () => void;
  /** Attente avant d'ouvrir, quand rien n'est encore affiché. */
  delaiOuverture?: number;
  /** Attente avant de fermer : on passe par du vide pour atteindre la fiche. */
  delaiFermeture?: number;
}

export function creerArbitreSurvol(r: ReglagesSurvol): ArbitreSurvol {
  const delaiOuverture = r.delaiOuverture ?? 150;
  const delaiFermeture = r.delaiFermeture ?? 220;

  let cible: string | null = null;
  let ouverture: ReturnType<typeof setTimeout> | null = null;
  let fermeture: ReturnType<typeof setTimeout> | null = null;

  const annulerOuverture = () => {
    if (ouverture) { clearTimeout(ouverture); ouverture = null; }
  };
  const annulerFermeture = () => {
    if (fermeture) { clearTimeout(fermeture); fermeture = null; }
  };

  const programmerFermeture = (delai: number) => {
    if (!r.survolEnCours()) return;
    annulerFermeture();
    fermeture = setTimeout(() => {
      fermeture = null;
      /* Le curseur est reparti sur une cible pendant l'attente : fermer
         maintenant effacerait la fiche qu'on vient de demander. */
      if (cible !== null) return;
      r.ferme();
    }, delai);
  };

  return {
    entrer(cle, ouvre) {
      cible = cle;
      annulerFermeture();
      annulerOuverture();
      const faire = () => {
        ouverture = null;
        if (cible !== cle) return;
        ouvre();
      };
      if (r.survolEnCours()) faire();
      else ouverture = setTimeout(faire, delaiOuverture);
    },
    sortir(cle, delai = delaiFermeture) {
      if (cible !== cle) return;
      cible = null;
      annulerOuverture();
      programmerFermeture(delai);
    },
    sortirSansCle(delai = delaiFermeture) {
      cible = null;
      annulerOuverture();
      programmerFermeture(delai);
    },
    oublier() {
      cible = null;
      annulerOuverture();
      annulerFermeture();
    },
    cible: () => cible,
  };
}
