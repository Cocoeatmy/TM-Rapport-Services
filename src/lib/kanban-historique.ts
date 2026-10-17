/**
 * Le journal des changements d'avancement.
 *
 * Notion ne garde pas l'historique de ses propriétés d'état : une fois le
 * statut changé, l'ancien a disparu. C'est pourquoi ce journal existe — et
 * c'est aussi pourquoi il ne commence qu'au jour de sa mise en service. Les
 * écrans qui s'en servent le disent, plutôt que de combler le vide avec la
 * date de création du projet : un « 240 jours sans évolution » sur un dossier
 * suivi de près discréditerait toute l'alerte.
 *
 * Seuls les déplacements faits depuis le Kanban y entrent. Un statut changé
 * directement dans Notion, ou depuis un autre écran, n'y laisse pas de trace.
 */
import { getData, getDataFresh, setData } from "./kv-store";
import { redisGetJSON, redisSetJSON } from "./redis-cache";
import type { LigneHistorique } from "./kanban-indicateurs";

const CLE = "kanban-historique";
const CLE_REDIS = "kanban:historique";
const TTL_REDIS_SEC = 300;

/**
 * Le journal est borné.
 *
 * Il sert à répondre « depuis quand ce dossier n'a-t-il pas bougé » et « qui
 * l'a déplacé » : quelques milliers de lignes suffisent largement, et une
 * liste qui grandit sans fin finit par rendre chaque écriture plus lente que
 * la précédente.
 */
export const MAX_LIGNES = 4000;

interface Ligne extends LigneHistorique {
  id: string;
}

export async function lireHistorique(frais = false): Promise<LigneHistorique[]> {
  if (!frais) {
    try {
      const partage = await redisGetJSON<LigneHistorique[]>(CLE_REDIS);
      if (Array.isArray(partage)) return partage;
    } catch { /* Redis muet : on va voir au magasin */ }
  }
  try {
    const lignes = frais ? await getDataFresh<Ligne>(CLE) : await getData<Ligne>(CLE);
    const propres = (lignes || []).filter((l) => l?.projetId && l?.quand);
    try { await redisSetJSON(CLE_REDIS, propres, TTL_REDIS_SEC); } catch { /* sans gravité */ }
    return propres;
  } catch {
    /* Journal illisible : on rend une liste vide plutôt que d'empêcher le
       déplacement. L'écran dira simplement qu'il ne sait pas. */
    return [];
  }
}

export async function ajouterLigne(l: LigneHistorique): Promise<void> {
  /* Relecture sans cache avant d'écrire : la liste entière est réécrite, et
     deux déplacements simultanés depuis deux serveurs s'effaceraient l'un
     l'autre si l'un partait d'une copie en cache. */
  const actuelles = await getDataFresh<Ligne>(CLE).catch(() => [] as Ligne[]);
  const suite: Ligne[] = [
    ...(actuelles || []).filter((x) => x?.projetId),
    { id: `${l.projetId}-${Date.parse(l.quand) || Date.now()}`, ...l },
  ].slice(-MAX_LIGNES);
  await setData<Ligne>(CLE, suite);
  try { await redisSetJSON(CLE_REDIS, suite, TTL_REDIS_SEC); } catch { /* sans gravité */ }
}
