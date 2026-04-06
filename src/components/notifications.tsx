"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, MessageCircle, Package, Calendar, AlertTriangle } from "lucide-react";

interface Notification {
  id: string;
  userId: string;
  type: "chat" | "piece" | "rdv" | "sav";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
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
) {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId || "", type, title, message }),
    });
  } catch {
    /* silent */
  }
}

export function NotificationBell() {
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
                  return (
                    <div key={n.id} className={`flex gap-2 px-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 ${!n.read ? "bg-blue-50/50 dark:bg-blue-900/20" : ""}`}>
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${colorMap[n.type]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{n.message}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{formatTime(n.timestamp)}</span>
                    </div>
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
