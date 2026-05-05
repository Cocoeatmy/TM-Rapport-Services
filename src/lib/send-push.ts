import webpush from "web-push";
import { getData, setData } from "@/lib/kv-store";
import type { StoredSubscription } from "@/app/api/push/subscribe/route";

const SUBS_KEY = "push-subscriptions";

// Configure une seule fois avec les clés VAPID
function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@tm-rapport.ch";

  if (!publicKey || !privateKey) {
    throw new Error("Clés VAPID manquantes (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(email, publicKey, privateKey);
}

export interface PushPayload {
  title: string;
  message: string;
  /** URL à ouvrir au clic — ex: `/projet/abc123` */
  url?: string;
  /** Icône optionnelle */
  icon?: string;
  /** Badge urgence */
  urgent?: boolean;
}

/**
 * Envoie une notification push à tous les appareils d'un utilisateur (email).
 * Supprime automatiquement les subscriptions expirées (410 Gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  configureWebPush();

  const all = await getData<StoredSubscription>(SUBS_KEY);
  const targets = all.filter((s) => s.userId === userId);

  if (targets.length === 0) return; // Pas d'appareils enregistrés

  const body = JSON.stringify({
    title: payload.title,
    message: payload.message,
    url: payload.url || "/",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    urgent: payload.urgent || false,
  });

  const expired: string[] = [];

  await Promise.allSettled(
    targets.map(async (stored) => {
      try {
        await webpush.sendNotification(
          stored.subscription as webpush.PushSubscription,
          body,
          { urgency: payload.urgent ? "high" : "normal" }
        );
      } catch (err: any) {
        // 410 = subscription expirée/révoquée → à supprimer
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expired.push(stored.subscription.endpoint as string);
        } else {
          console.error(`[send-push] Erreur pour ${userId}:`, err?.message);
        }
      }
    })
  );

  // Purge des subscriptions expirées
  if (expired.length > 0) {
    const cleaned = all.filter((s) => !expired.includes(s.subscription.endpoint as string));
    await setData(SUBS_KEY, cleaned);
  }
}
