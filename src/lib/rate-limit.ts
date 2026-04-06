const rateLimit = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple in-memory rate limiter.
 * Tracks requests by identifier (IP, token, etc.).
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 30,
  windowMs = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimit.get(identifier);

  // Clean up expired entries periodically
  if (rateLimit.size > 10000) {
    for (const [key, value] of rateLimit) {
      if (now > value.resetTime) {
        rateLimit.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetTime) {
    rateLimit.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}
