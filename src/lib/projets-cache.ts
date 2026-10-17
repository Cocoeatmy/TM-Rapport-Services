/**
 * Ce qu'il faut faire quand l'état d'un projet change.
 *
 * Extrait de la route PATCH pour que le Kanban, qui écrit les mêmes
 * propriétés par un autre chemin, rafraîchisse exactement les mêmes caches.
 * Deux chemins d'écriture qui n'invalident pas la même chose, c'est un projet
 * qui disparaît d'une liste sur un appareil et pas sur l'autre.
 */
import { invalidateCache, publierSnapshot } from "./server-cache";
import { redisGetJSON } from "./redis-cache";

/**
 * Réagit INSTANTANÉMENT à un changement d'état d'un projet (fermeture, passage
 * en "RDV à fixer", etc.) pour supprimer toute latence app ↔ Notion :
 *  1) Patch OPTIMISTE dans Redis : on applique le nouvel état au projet dans les
 *     listes en cache → dès le prochain rafraîchissement, tous les appareils
 *     voient le changement (le projet clôturé disparaît de "RDV à fixer").
 *  2) Invalidation du cache mémoire des listes concernées → la prochaine requête
 *     naturelle revalide depuis Notion (pas de force-fetch → évite le rate-limit).
 * Le patch optimiste (1) suffit au cas courant (clôture) ; le cron réconcilie
 * l'appartenance exacte aux listes filtrées en filet de sécurité.
 */
export async function onStatusChange(id: string, updates: Record<string, unknown>): Promise<void> {
  // Quelles listes sont impactées par les champs d'état modifiés.
  const keys = new Set<string>();
  if ("etatCMD" in updates) { keys.add("projects"); keys.add("projects-services"); }
  if ("etatMesures" in updates) keys.add("projects-mesures");
  if ("etatSAV" in updates) keys.add("projects-sav");
  if (keys.size === 0) return;

  // 1) Patch optimiste immédiat dans Redis.
  await Promise.all([...keys].map(async (key) => {
    try {
      const list = await redisGetJSON<Array<{ id?: string }>>(`sc:${key}`);
      if (!Array.isArray(list)) return;
      let changed = false;
      const next = list.map((p) => (p && p.id === id ? (changed = true, { ...p, ...updates }) : p));
      // Passe par publierSnapshot : l'empreinte doit suivre le contenu.
      if (changed) publierSnapshot(key, next);
    } catch { /* silencieux */ }
  }));

  // 2) Réconciliation : on invalide simplement le cache mémoire des listes
  //    concernées. Le patch optimiste ci-dessus garde Redis correct pour tous ;
  //    la prochaine requête naturelle (foreground/refresh d'un client) revalide
  //    depuis Notion et met à jour mémoire + Redis. On ÉVITE un force-fetch
  //    Notion à chaque changement d'état (source majeure de rate-limit).
  keys.forEach((key) => invalidateCache(key));
}
