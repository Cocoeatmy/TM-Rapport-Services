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
