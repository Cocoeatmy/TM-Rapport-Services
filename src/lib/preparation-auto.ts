/**
 * Faut-il préparer la journée tout seul, maintenant ?
 *
 * ── Pourquoi une fonction à part ─────────────────────────────────────────
 *
 * La décision tient à plusieurs conditions dont une horloge et un jour de
 * la semaine. Enfouie dans un `useEffect`, elle serait impossible à
 * éprouver autrement qu'en déplaçant l'heure de la machine. Ici, l'heure
 * est un paramètre : les tests jouent un vendredi 6 h 31 et un samedi
 * 6 h 31 sans rien toucher.
 *
 * ── Ce qu'elle a remplacé ───────────────────────────────────────────────
 *
 * La préparation automatique EXISTAIT DÉJÀ : `page.tsx` l'appelait à
 * chaque affichage du tableau de bord, plafonnée à une fois par heure —
 * donc à n'importe quelle heure et n'importe quel jour. Un monteur qui
 * ouvrait l'application à 10 h en chantier déclenchait une rafale de
 * téléchargements sur un réseau mobile en mouvement : la pire façon de
 * les faire échouer à moitié.
 *
 * Cette fonction ne l'a donc pas ajoutée, elle l'a ENCADRÉE.
 *
 * ── La fenêtre, et pourquoi elle est étroite ────────────────────────────
 *
 * Du lundi au vendredi, entre 6 h 30 et 7 h 30 — l'heure de l'appareil,
 * donc celle du monteur. C'est le moment du dépôt : le réseau est bon, la
 * journée est connue, et le téléphone a le temps de télécharger avant le
 * départ.
 *
 * Pas avant : à 5 h du matin la tournée peut encore changer. Pas après :
 * à 8 h on est déjà en route, et déclencher une rafale de téléchargements
 * sur un réseau mobile en mouvement est la meilleure façon de la faire
 * échouer à moitié.
 *
 * ── Ce qu'elle ne fait jamais ───────────────────────────────────────────
 *
 * Elle ne touche pas à la file d'ENVOI. Photos, heures et signatures
 * partent de leur côté dès que le réseau revient ; cette préparation ne
 * concerne que ce qui DESCEND sur l'appareil.
 */

/** Du lundi (1) au vendredi (5). */
const JOURS_OUVRES = [1, 2, 3, 4, 5];
/** 6 h 30 inclus. */
const DEBUT_MIN = 6 * 60 + 30;
/** 7 h 30 exclu : à 7 h 30 pile, on ne lance plus. */
const FIN_MIN = 7 * 60 + 30;
/** Au-delà, ce qui est sur l'appareil ne vaut plus la journée. */
export const PEREMPTION_MS = 12 * 3600_000;

export interface ContexteAuto {
  maintenant: Date;
  enLigne: boolean;
  /** Quand la dernière préparation a eu lieu (0 = jamais). */
  quandPrepare: number;
  /** Le jour où la préparation automatique a déjà tourné (AAAA-MM-JJ). */
  dejaFaitLe: string | null;
  /** Combien de projets l'application connaît : sans liste, rien à préparer. */
  projetsConnus: number;
}

export type VerdictAuto =
  | { preparer: true }
  | { preparer: false; motif: string };

/** Le jour, au format qui sert de clé de mémoire. */
export function jourDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function doitPreparerAutomatiquement(c: ContexteAuto): VerdictAuto {
  if (!c.enLigne) {
    return { preparer: false, motif: "hors réseau — il n'y a rien à télécharger" };
  }

  const jour = c.maintenant.getDay();
  if (!JOURS_OUVRES.includes(jour)) {
    return { preparer: false, motif: "ni samedi ni dimanche" };
  }

  const minutes = c.maintenant.getHours() * 60 + c.maintenant.getMinutes();
  if (minutes < DEBUT_MIN) return { preparer: false, motif: "avant 6 h 30" };
  if (minutes >= FIN_MIN) return { preparer: false, motif: "après 7 h 30" };

  if (c.dejaFaitLe === jourDe(c.maintenant)) {
    return { preparer: false, motif: "déjà fait automatiquement aujourd'hui" };
  }

  /* Rien à préparer tant que l'application ne connaît aucun chantier : on
     attendra que la liste arrive plutôt que de marquer la journée faite
     avec une préparation vide. */
  if (c.projetsConnus === 0) {
    return { preparer: false, motif: "la liste des chantiers n'est pas encore là" };
  }

  /* Déjà frais ? On ne refait pas. Quelqu'un qui a appuyé sur le bouton à
     6 h 25 n'a pas besoin qu'on recommence à 6 h 31. */
  const age = c.maintenant.getTime() - c.quandPrepare;
  if (c.quandPrepare > 0 && age < PEREMPTION_MS) {
    return { preparer: false, motif: "déjà préparé il y a moins de douze heures" };
  }

  return { preparer: true };
}
