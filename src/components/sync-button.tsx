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
import { toast } from "sonner";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number>(0);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    setOnline(isOnline());
    setLastSync(getCacheTimestamp());
    setQueueCount(getQueue().length);

    const handleOnline = () => {
      setOnline(true);
      // Auto-process queue quand le réseau revient
      autoSync();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Vérifier la queue toutes les 30s
    const interval = setInterval(() => {
      setQueueCount(getQueue().length);
      if (isOnline() && getQueue().length > 0) {
        autoSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const autoSync = async () => {
    const queue = getQueue();
    if (queue.length === 0) return;
    const result = await processQueue();
    if (result.success > 0) {
      toast.success(`${result.success} opération(s) synchronisée(s)`);
      setQueueCount(getQueue().length);
    }
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      // 1. Télécharger et cacher les projets
      const [cmdRes, mesRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/projects/mesures"),
      ]);
      const [cmd, mes] = await Promise.all([cmdRes.json(), mesRes.json()]);

      if (Array.isArray(cmd)) saveToCache("projects-cmd", cmd);
      if (Array.isArray(mes)) saveToCache("projects-mesures", mes);

      // 2. Cacher chaque projet individuellement
      const allProjects = [...(Array.isArray(cmd) ? cmd : []), ...(Array.isArray(mes) ? mes : [])];
      const uniqueIds = [...new Set(allProjects.map((p: any) => p.id))];

      let cached = 0;
      for (const id of uniqueIds) {
        try {
          const res = await fetch(`/api/projects/${id}`);
          const data = await res.json();
          if (data.id) {
            saveToCache(`project-${id}`, data);
            cached++;
          }
        } catch {
          // skip
        }
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
    if (!lastSync) return "Jamais";
    const diff = Date.now() - lastSync;
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    return new Date(lastSync).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="relative h-9 shrink-0 glass-card flex items-center gap-1.5 px-2.5 rounded-full hover:bg-white/80 transition-all active:scale-95"
    >
      {syncing ? (
        <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
      ) : online ? (
        <Cloud className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <CloudOff className="w-4 h-4 text-orange-500 shrink-0" />
      )}

      <span className="text-[10px] text-gray-500 whitespace-nowrap leading-tight">
        {syncing ? "Sync..." : formatLastSync()}
      </span>

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
