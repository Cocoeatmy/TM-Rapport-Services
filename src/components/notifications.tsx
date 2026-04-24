"use client";

import { useState, useEffect, useCallback } from "react";
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
    // Check if already subscribed
    const stored = localStorage.getItem("tm-push-subscription");
    if (stored) setSubscribed(true);
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        // Try to subscribe via service worker push manager
        const registration = await navigator.serviceWorker?.ready;
        if (registration?.pushManager) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (vapidKey) {
            try {
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidKey,
              });
              localStorage.setItem("tm-push-subscription", JSON.stringify(subscription));
              setSubscribed(true);
            } catch {
              // Push subscription failed, use local notifications as fallback
              localStorage.setItem("tm-push-subscription", "local-fallback");
              setSubscribed(true);
            }
          } else {
            // No VAPID key configured, use local notifications as fallback
            localStorage.setItem("tm-push-subscription", "local-fallback");
            setSubscribed(true);
          }
        }
        // Show a test notification
        new Notification("TM Rapport", {
          body: "Les notifications sont activees !",
          icon: "/icons/icon-192.png",
        });
      }
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
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
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
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
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
                  const clickable = !!n.projectId;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      disabled={!clickable}
                      className={`w-full text-left flex gap-2 px-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 ${!n.read ? "bg-blue-50/50 dark:bg-blue-900/20" : ""} ${clickable ? "hover:bg-gray-50 dark:hover:bg-slate-700/60 cursor-pointer" : "cursor-default"}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${colorMap[n.type]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{n.message}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{formatTime(n.timestamp)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
