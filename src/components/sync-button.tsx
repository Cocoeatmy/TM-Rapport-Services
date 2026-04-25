"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CloudOff,
  Cloud,
  RefreshCw,
  Check,
  AlertTriangle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { saveToCache, getCacheTimestamp, getQueue, processQueue, isOnline } from "@/lib/offline";
import { processPendingUploads, countPendingUploads } from "@/lib/idb-uploads";
import { toast } from "sonner";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number>(0);
  const [serverSyncTime, setServerSyncTime] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setOnline(isOnline());
    setLastSync(getCacheTimestamp());

    const refreshCount = async () => {
      const upCount = await countPendingUploads();
      if (!cancelled) setQueueCount(getQueue().length + upCount);
    };
    refreshCount();

    fetch("/api/sync-status")
      .then((r) => r.json())
      .then((data) => {
        if (data.timestamp) setServerSyncTime(data.timestamp);
      })
      .catch(() => {});

    const handleOnline = () => {
      setOnline(true);
      autoSync();
    };
    const handleOffline = () => setOnline(false);
    const onPendingChange = () => refreshCount();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("tm-pending-upload-added", onPendingChange);
    window.addEventListener("tm-pending-upload-removed", onPendingChange);
    window.addEventListener("tm-offline-queued", onPendingChange);

    const interval = setInterval(async () => {
      await refreshCount();
      const upCount = await countPendingUploads();
      const totalQueued = getQueue().length + upCount;
      if (isOnline() && totalQueued > 0) {
        autoSync();
      }
    }, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("tm-pending-upload-added", onPendingChange);
      window.removeEventListener("tm-pending-upload-removed", onPendingChange);
      window.removeEventListener("tm-offline-queued", onPendingChange);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoSync = async () => {
    const jsonQueue = getQueue();
    const uploadCount = await countPendingUploads();
    if (jsonQueue.length === 0 && uploadCount === 0) return;

    let totalSuccess = 0;
    if (jsonQueue.length > 0) {
      const result = await processQueue();
      totalSuccess += result.success;
    }
    if (uploadCount > 0) {
      const upRes = await processPendingUploads();
      totalSuccess += upRes.success;
    }
    if (totalSuccess > 0) {
      toast.success(`${totalSuccess} opération(s) synchronisée(s)`);
      setQueueCount(getQueue().length + (await countPendingUploads()));
    }
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      // 1. Télécharger et cacher TOUS les onglets en parallèle
      const endpoints = [
        { key: "cmd", url: "/api/projects" },
        { key: "mesures", url: "/api/projects/mesures" },
        { key: "services", url: "/api/projects/services" },
        { key: "sav", url: "/api/projects/sav" },
        { key: "cmd-termine", url: "/api/projects/cmd-termine" },
        { key: "mesures-termine", url: "/api/projects/mesures-termine" },
        { key: "services-termine", url: "/api/projects/services-termine" },
        { key: "sav-termine", url: "/api/projects/sav-termine" },
      ];

      const results = await Promise.all(
        endpoints.map(({ key, url }) =>
          fetch(url).then((r) => r.json()).then((data) => ({ key, data })).catch(() => ({ key, data: null }))
        )
      );

      const cacheData: Record<string, any> = {};
      const allProjects: any[] = [];
      results.forEach(({ key, data }) => {
        if (Array.isArray(data)) {
          cacheData[key] = data;
          saveToCache(`projects-${key}`, data);
          allProjects.push(...data);
        }
      });

      // Sauvegarder le cache combiné pour la page d'accueil
      try { localStorage.setItem("tm-projects-cache", JSON.stringify(cacheData)); } catch {}

      // 2. Cacher chaque projet individuellement EN PARALLÈLE.
      // Avant : boucle séquentielle → 50 projets × ~100 ms = 5 s.
      // Maintenant : Promise.all par lots de 10 (pour ne pas saturer
      // le serveur et respecter les rate limits Notion en aval).
      const uniqueIds = [...new Set(allProjects.map((p: any) => p.id))];
      let cached = 0;
      const BATCH_SIZE = 10;
      for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((id) =>
            fetch(`/api/projects/${id}`)
              .then((r) => r.json())
              .then((data) => {
                if (data?.id) {
                  saveToCache(`project-${id}`, data);
                  return 1;
                }
                return 0;
              })
              .catch(() => 0),
          ),
        );
        cached += results.reduce((s: number, n: number) => s + n, 0);
      }

      // 3. Traiter la file d'attente
      const queue = getQueue();
      let queueResult = { success: 0, failed: 0 };
      if (queue.length > 0) {
        queueResult = await processQueue();
      }

      setLastSync(Date.now());
      setQueueCount(getQueue().length);

      toast.success(
        `Synchronisation terminée : ${cached} projets cachés` +
        (queueResult.success > 0 ? `, ${queueResult.success} envoi(s)` : "")
      );
    } catch (e) {
      toast.error("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  }, []);

  const formatLastSync = () => {
    // Use the most recent sync: client or server
    const serverTs = serverSyncTime ? new Date(serverSyncTime).getTime() : 0;
    const mostRecent = Math.max(lastSync, serverTs);

    if (!mostRecent) return "Jamais";
    const diff = Date.now() - mostRecent;
    const isServer = serverTs > lastSync;

    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      if (isServer) {
        const d = new Date(serverTs);
        return `Auto ${d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}`;
      }
      return `Il y a ${hours}h`;
    }
    const d = new Date(mostRecent);
    return `${isServer ? "Auto " : ""}${d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="relative shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-all active:scale-95 text-sm"
    >
      {syncing ? (
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      ) : online ? (
        <Cloud className="w-4 h-4 text-green-500" />
      ) : (
        <CloudOff className="w-4 h-4 text-orange-500" />
      )}

      <div className="text-left whitespace-nowrap">
        <p className="text-xs font-medium text-white">
          {syncing ? "Sync..." : online ? "Sync" : "Hors ligne"}
        </p>
        <p className="text-[10px] text-white/60">{formatLastSync()}</p>
      </div>

      {/* Badge file d'attente */}
      {queueCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {queueCount}
        </span>
      )}

      {/* Indicateur réseau mobile */}
      {!online && <WifiOff className="w-3 h-3 text-orange-500 absolute -bottom-0.5 -right-0.5" />}
    </button>
  );
}
