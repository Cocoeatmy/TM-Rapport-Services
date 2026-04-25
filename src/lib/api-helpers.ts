/**
 * Fetch wrapper with automatic retry on network failures and 5xx errors.
 * Uses exponential backoff (1s, 2s, …).
 */

export type RetryFailureCallback = (
  message: string,
  retry: () => Promise<Response>,
) => void;

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 2,
  onFailure?: RetryFailureCallback,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 5xx server errors (but not on the last attempt)
      if (response.status >= 500 && attempt < maxRetries) {
        await delay(getBackoffMs(attempt));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await delay(getBackoffMs(attempt));
        continue;
      }
    }
  }

  // All retries exhausted – invoke failure callback if provided
  if (onFailure) {
    onFailure(
      "Erreur réseau. Veuillez réessayer.",
      () => fetchWithRetry(url, options, maxRetries, onFailure),
    );
  }

  throw lastError;
}

function getBackoffMs(attempt: number): number {
  // 1000ms, 2000ms, 4000ms, …
  return 1000 * Math.pow(2, attempt);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demande au service worker de purger son cache API.
 * À appeler après toute mutation côté client (POST/PATCH/DELETE) pour que la
 * prochaine lecture récupère les données fraîches au lieu d'une version mise
 * en cache par le SW.
 */
export function invalidateApiCache(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "INVALIDATE_API_CACHE" });
    })
    .catch(() => {
      /* pas de SW actif : rien à purger */
    });
}

/**
 * Pré-télécharge un projet en arrière-plan pour que la page détail
 * soit "instantanée" au tap. Le SW met la réponse en cache, donc le
 * prochain `fetch(/api/projects/[id])` la sert immédiatement.
 *
 * Dédup : on ne préfetch un même id qu'une seule fois par minute,
 * pour ne pas spammer le serveur si l'utilisateur survole 50 cartes
 * en scrollant.
 */
const prefetchedProjects: Map<string, number> = new Map();
const PREFETCH_COOLDOWN_MS = 60_000;

export function prefetchProject(id: string): void {
  if (typeof window === "undefined" || !id) return;
  const last = prefetchedProjects.get(id) || 0;
  const now = Date.now();
  if (now - last < PREFETCH_COOLDOWN_MS) return;
  prefetchedProjects.set(id, now);
  // priority "low" pour ne pas voler de la bande passante au fetch
  // principal en cours. Cast pour compat TS (priority est encore
  // récent dans la spec fetch, pas tous les types l'ont).
  fetch(`/api/projects/${id}`, { priority: "low" } as RequestInit & { priority: string })
    .catch(() => {});
}
