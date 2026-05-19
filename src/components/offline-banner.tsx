"use client";

import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { isOnline, getQueue, warmOfflineCache, getLastCacheWarmTs } from "@/lib/offline";
import { countPendingUploads, countPermanentlyFailed, retryAllFailedUploads, processPendingUploads } from "@/lib/idb-uploads";

/**
 * Bannière globale qui prévient l'utilisateur quand l'app est hors
 * ligne ou quand des opérations attendent d'être synchronisées.
 *
 * - Hors ligne avec écritures en attente : bandeau orange "Hors
 *   ligne — N opération(s) en attente, synchro auto au retour".
 * - Hors ligne sans queue : bandeau gris "Hors ligne — vous pouvez
 *   continuer à travailler".
 * - En ligne avec queue (par ex. après un offline → retour réseau) :
 *   bandeau bleu "Synchronisation de N opération(s)…", qui disparaît
 *   automatiquement quand la queue est vide.
 *
 * Rendu en `position: fixed` au-dessus du contenu, sous le header.
 * Réagit aux événements `online`/`offline` du navigateur et à
 * l'événement custom `tm-offline-queued` envoyé par offlineFetch.
 */
function formatWarmAge(ts: number): string {
  if (!ts) return "jamais";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h}h`;
}

export function OfflineBanner() {
  const [online, setOnline]               = useState(true);
  const [queueCount, setQueueCount]       = useState(0);
  const [warming, setWarming]             = useState(false);
  const [lastWarm, setLastWarm]           = useState(0);
  const [showWarmOk, setShowWarmOk]       = useState(false);
  const [failedCount, setFailedCount]     = useState(0);
  const [retrying, setRetrying]           = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const upCount = await countPendingUploads();
      const failCount = await countPermanentlyFailed();
      if (cancelled) return;
      setOnline(isOnline());
      setQueueCount(getQueue().length + upCount);
      setLastWarm(getLastCacheWarmTs());
      setFailedCount(failCount);
    };
    refresh();

    // Préchauffage automatique au chargement (silencieux, cooldown 15 min)
    warmOfflineCache().catch(() => {});

    const handleOnline = () => {
      refresh();
      // Quand le réseau revient, on réchauffe immédiatement
      warmOfflineCache(true).then((n) => {
        if (n > 0 && !cancelled) { setLastWarm(getLastCacheWarmTs()); setShowWarmOk(true); setTimeout(() => setShowWarmOk(false), 4000); }
      }).catch(() => {});
    };

    const handleWarmed = () => { setLastWarm(getLastCacheWarmTs()); };

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("tm-offline-queued",             refresh);
    window.addEventListener("tm-pending-upload-added",       refresh);
    window.addEventListener("tm-pending-upload-removed",     refresh);
    window.addEventListener("tm-cache-warmed",               handleWarmed);
    window.addEventListener("tm-upload-permanently-failed",  refresh);

    const interval = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tm-offline-queued",             refresh);
      window.removeEventListener("tm-pending-upload-added",       refresh);
      window.removeEventListener("tm-pending-upload-removed",     refresh);
      window.removeEventListener("tm-cache-warmed",               handleWarmed);
      window.removeEventListener("tm-upload-permanently-failed",  refresh);
      clearInterval(interval);
    };
  }, []);

  const handleRetryFailed = async () => {
    if (!isOnline()) return;
    setRetrying(true);
    try {
      await retryAllFailedUploads();
      await processPendingUploads();
      setFailedCount(await countPermanentlyFailed());
    } finally {
      setRetrying(false);
    }
  };

  const handleManualWarm = async () => {
    setWarming(true);
    try {
      await warmOfflineCache(true);
      setLastWarm(getLastCacheWarmTs());
      setShowWarmOk(true);
      setTimeout(() => setShowWarmOk(false), 3000);
    } finally {
      setWarming(false);
    }
  };

  // Alerte critique : photos bloquées en échec permanent — affiché en priorité absolue.
  if (failedCount > 0) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="sticky top-0 z-[55] w-full px-3 py-2 text-xs flex items-center justify-center gap-2 shadow-md bg-red-600 text-white"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">
          {failedCount} photo{failedCount > 1 ? "s" : ""} n&apos;ont pas pu être envoyées — données conservées localement
        </span>
        {online && (
          <button
            onClick={handleRetryFailed}
            disabled={retrying}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors font-semibold whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} aria-hidden />
            {retrying ? "Envoi…" : "Renvoyer"}
          </button>
        )}
      </div>
    );
  }

  // En ligne, queue vide, aucun échec : rien à afficher.
  // La barre ne s'affiche que si quelque chose requiert l'attention.
  if (online && queueCount === 0) {
    return null;
  }

  let cls = "";
  let Icon = WifiOff;
  let label = "";

  if (!online && queueCount > 0) {
    cls = "bg-orange-500 text-white";
    Icon = WifiOff;
    label = `Hors ligne — ${queueCount} opération${queueCount > 1 ? "s" : ""} en attente, synchro automatique au retour du réseau`;
  } else if (!online) {
    cls = "bg-slate-700 text-white";
    Icon = WifiOff;
    label = "Hors ligne — vous pouvez continuer à travailler, tout sera synchronisé au retour du réseau";
  } else {
    // online && queueCount > 0 : affiche pendant que la queue se vide.
    cls = "bg-blue-500 text-white";
    Icon = CloudUpload;
    label = `Synchronisation de ${queueCount} opération${queueCount > 1 ? "s" : ""}…`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-[55] w-full px-3 py-1.5 text-xs flex items-center justify-center gap-2 shadow-md ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className="text-center leading-tight">{label}</span>
    </div>
  );
}
