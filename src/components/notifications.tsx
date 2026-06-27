"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageCircle, Package, Calendar, AlertTriangle } from "lucide-react";

interface Notification {
  id: string;
  userId: string;
  type: "chat" | "piece" | "rdv" | "sav";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  projectId?: string;
}

async function fetchNotifications(): Promise<Notification[]> {
  try {
    const res = await fetch("/api/notifications");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function patchNotifications(body: { id?: string; markAllRead?: boolean }) {
  try {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* silent */
  }
}

/** Create an in-app notification for a specific user via the API. */
export async function addNotification(
  type: Notification["type"],
  title: string,
  message: string,
  userId?: string,
  projectId?: string,
) {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId || "", type, title, message, projectId }),
    });
  } catch {
    /* silent */
  }
}

export function PushNotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    const stored = localStorage.getItem("tm-push-subscribed");
    if (stored) setSubscribed(true);
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      // Abonnement Web Push via le Service Worker
      const registration = await navigator.serviceWorker?.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (registration?.pushManager && vapidKey) {
        try {
          // Convertit la clé VAPID publique (base64url → Uint8Array)
          const urlB64 = vapidKey.replace(/-/g, "+").replace(/_/g, "/");
          const raw = atob(urlB64);
          const key = new Uint8Array(new ArrayBuffer(raw.length));
          for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });

          // Envoie la subscription au serveur (liée au cookie auth)
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: subscription.toJSON(),
              deviceId: navigator.userAgent.slice(0, 50),
            }),
          });

          localStorage.setItem("tm-push-subscribed", "1");
          setSubscribed(true);
        } catch {
          // Fallback : juste les notifs locales
          localStorage.setItem("tm-push-subscribed", "local");
          setSubscribed(true);
        }
      } else {
        localStorage.setItem("tm-push-subscribed", "local");
        setSubscribed(true);
      }

      // Notification de confirmation
      new Notification("TM Rapport ✓", {
        body: "Notifications activées — vous serez prévenu 30 min avant chaque RDV.",
        icon: "/icons/icon-192.png",
      });
    } catch {
      /* silent */
    }
  };

  if (permission === "unsupported") return null;

  const statusLabel =
    permission === "granted"
      ? "Notifications activees"
      : permission === "denied"
        ? "Notifications bloquees"
        : "Notifications desactivees";

  const statusColor =
    permission === "granted"
      ? "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400"
      : permission === "denied"
        ? "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400"
        : "text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
        <Bell className="w-3 h-3 inline-block mr-1" />
        {statusLabel}
      </span>
      {permission !== "granted" && permission !== "denied" && (
        <button
          onClick={requestPermission}
          className="text-xs px-3 py-1.5 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          Activer les notifications
        </button>
      )}
    </div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  // Fermeture au tap/clic en dehors du panneau (iOS-compatible via pointerdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const refresh = useCallback(async () => {
    const data = await fetchNotifications();
    setNotifs(data);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await patchNotifications({ markAllRead: true });
  };

  const clearAll = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await patchNotifications({ markAllRead: true });
  };

  /** Click sur une notif : marque-la lue, ferme le panneau, et navigue
   *  vers la page du projet concerné si projectId est présent. */
  const handleNotifClick = (notif: Notification) => {
    setNotifs((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
    patchNotifications({ id: notif.id }).catch(() => {});
    setOpen(false);
    if (notif.projectId) {
      router.push(`/projet/${notif.projectId}`);
    }
  };

  const iconMap = {
    chat: MessageCircle,
    piece: Package,
    rdv: Calendar,
    sav: AlertTriangle,
  };

  const colorMap = {
    chat: "text-blue-500",
    piece: "text-orange-500",
    rdv: "text-green-500",
    sav: "text-red-500",
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "A l'instant";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(ts).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" });
  };

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        aria-label="Notifications"
        title="Notifications"
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
          <div className="fixed left-2 right-2 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-72 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
              {notifs.length > 0 && (
                <button onClick={clearAll} className="text-[10px] text-gray-400 hover:text-red-500">
                  Tout effacer
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">Aucune notification</p>
              ) : (
                notifs.slice(0, 20).map((n) => {
                  const Icon = iconMap[n.type];
                  const hasProject = !!n.projectId;
                  return (
                    // Toujours cliquable — si un projet est lié, le clic
                    // navigue dessus ; sinon il referme simplement le
                    // panneau et marque la notification comme lue. Le
                    // disabled d'avant empêchait les vieilles
                    // notifications sans projectId d'être touchées, ce
                    // qui donnait l'impression que le clic "ne marchait
                    // pas" sur toutes les notifs.
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left flex gap-2 px-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors ${!n.read ? "bg-blue-50/50 dark:bg-blue-900/20" : ""}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${colorMap[n.type]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{n.message}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(n.timestamp)}</span>
                        {hasProject && (
                          <span className="text-[9px] text-blue-500 dark:text-cyan-400 font-medium">Voir →</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
      )}
    </div>
  );
}
