/**
 * Lightweight error tracking utility.
 * Logs errors to /api/logs and optionally to an external webhook in production.
 */
export async function trackError(error: Error, context?: string): Promise<void> {
  const payload = {
    action: "ERROR",
    details: `${context ? `[${context}] ` : ""}${error.message}`,
    stack: error.stack?.slice(0, 500),
    timestamp: Date.now(),
  };

  // Log to console in all environments
  console.error("[ErrorTracking]", payload.details, error);

  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ERROR",
        details: `${context ? `[${context}] ` : ""}${error.message}`,
        projectId: "",
        projectName: "",
      }),
    });
  } catch {
    // Silently fail - we don't want error tracking to cause more errors
  }

  // In production, could POST to an external webhook (Slack, Discord, etc.)
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "production" &&
    process.env?.ERROR_WEBHOOK_URL
  ) {
    try {
      await fetch(process.env.ERROR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silently fail
    }
  }
}
