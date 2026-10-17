/**
 * Le verrou d'une liste réécrite en entier.
 *
 * Les défauts, les pièces manquantes — et demain d'autres listes — se
 * stockent en un seul bloc : pour ajouter une ligne, on relit tout, on
 * modifie, on réécrit tout. Deux écritures menées en même temps depuis deux
 * serveurs lisent donc la même version et la seconde efface la première. Le
 * 16 octobre 2026, cela se voyait à l'écran : une ligne supprimée revenait,
 * une autre disparaissait.
 *
 * Ce verrou vivait écrit à la main dans la route des défauts. Il est ici pour
 * que les pièces manquantes utilisent EXACTEMENT le même, et non une seconde
 * version qui divergera. Deux implémentations d'un verrou, c'est un verrou et
 * demi.
 */
import { redisEnabled, redisLockAcquire, redisLockRelease } from "./redis-cache";

/** Levée quand le verrou n'a pas pu être pris dans le temps imparti. */
export class VerrouIndisponible extends Error {
  constructor(public nom: string) {
    super(`Verrou « ${nom} » indisponible`);
    this.name = "VerrouIndisponible";
  }
}

/**
 * Le verrou doit survivre à l'écriture qu'il protège.
 *
 * Il a expiré en cours de route une fois — trente secondes pour une écriture
 * de dix-neuf — et les deux serveurs ont réécrit la liste chacun de son côté.
 * Une minute laisse vingt fois la marge d'une écriture actuelle (~3 s), tout
 * en bornant le blocage si un serveur meurt sans relâcher.
 */
export const DUREE_VERROU_MS = 60_000;
/** Strictement inférieur à la durée : on n'attend jamais un verrou expiré. */
export const ATTENTE_VERROU_MS = 25_000;

/**
 * Exécute `faire` en tenant le verrou nommé.
 *
 * Prendre le verrou veut dire ATTENDRE son tour, pas renoncer : une première
 * version demandait une fois et continuait quand même si c'était occupé —
 * elle ne protégeait donc que lorsqu'il n'y avait rien à protéger.
 *
 * Si Redis n'est pas configuré, on travaille sans : mieux vaut un risque de
 * collision qu'un signalement refusé sur un chantier.
 */
export async function avecVerrou<T>(
  nom: string,
  faire: () => Promise<T>,
  options: { duree?: number; attente?: number } = {},
): Promise<T> {
  const duree = options.duree ?? DUREE_VERROU_MS;
  const attente = options.attente ?? ATTENTE_VERROU_MS;
  let jeton: string | null = null;

  if (redisEnabled) {
    const limite = Date.now() + attente;
    for (;;) {
      jeton = await redisLockAcquire(nom, duree);
      if (jeton) break;
      if (Date.now() >= limite) throw new VerrouIndisponible(nom);
      /* Un peu de hasard dans l'attente : sans lui, deux serveurs qui
         réessaient au même rythme se croisent indéfiniment. */
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 150)));
    }
  }

  try {
    return await faire();
  } finally {
    if (jeton) await redisLockRelease(nom, jeton).catch(() => {});
  }
}
