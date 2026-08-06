"use client";

import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, RefreshCw, AlertTriangle, ChevronDown, X } from "lucide-react";
import { isOnline, getQueue, removeFromQueue, warmOfflineCache, getLastCacheWarmTs } from "@/lib/offline";
import type { QueueItem } from "@/lib/offline";
import {
  countPendingUploads,
  countPermanentlyFailed,
  retryAllFailedUploads,
  processPendingUploads,
  getPendingUploads,
} from "@/lib/idb-uploads";
import type { PendingUpload } from "@/lib/idb-uploads";

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
 * Au survol du bandeau → tooltip avec le détail de chaque opération.
 *
 * Rendu en `position: sticky` au-dessus du contenu, sous le header.
 * Réagit aux événements `online`/`offline` du navigateur et à
 * l'événement custom `tm-offline-queued` envoyé par offlineFetch.
 */

/** Génère un libellé lisible depuis un QueueItem. */
function describeQueueItem(item: QueueItem): string {
  const body = typeof item.body === "string" ? (() => { try { return JSON.parse(item.body); } catch { return {}; } })() : (item.body || {});
  const projectId = item.url.match(/\/api\/projects\/([^/?]+)/)?.[1] ?? "";
  const ref = projectId ? ` · ${projectId}` : ` · ${item.url.replace("/api/", "")}`;

  if (item.url.includes("cabine-attribution")) return `Attribution monteurs${ref}`;
  if (body.rapportMonteur !== undefined && body.heureArrivee !== undefined) return `Rapport + heures${ref}`;
  if (body.rapportMonteur !== undefined) return `Rapport monteur${ref}`;
  if (body.heureArrivee !== undefined && body.heureDepart !== undefined) return `Heures d'intervention${ref}`;
  if (body.heureArrivee !== undefined) return `Heure d'arrivée${ref}`;
  if (body.heureDepart !== undefined) return `Heure de départ${ref}`;
  if (body.commentairesMontages !== undefined) return `Commentaires${ref}`;
  if (body.dateMontage !== undefined || body.dateMesures !== undefined) return `Mise à jour date${ref}`;
  if (item.url.includes("pdf")) return `Génération PDF${ref}`;
  if (item.url.includes("logs")) return `Historique${ref}`;
  if (item.url.includes("notify")) return `Notification${ref}`;
  if (item.type === "upload") return `Upload photo${ref}`;
  const keys = Object.keys(body);
  if (keys.length > 0) return `Mise à jour ${keys.slice(0, 2).join(", ")}${ref}`;
  return `Mise à jour${ref}`;
}

/** Génère un libellé lisible depuis un PendingUpload (IDB). */
function describePendingUpload(up: PendingUpload): string {
  const nbFiles = up.files?.length ?? 0;
  const label = up.notionField || up.category || "photo";
  const suffix = up.retryCount > 0 ? ` (essai ${up.retryCount})` : "";
  const why = up.reason ? ` ⚠ ${up.reason}` : "";
  return `${nbFiles} photo${nbFiles > 1 ? "s" : ""} — ${label} · ${up.projectId}${suffix}${why}`;
}

/** Formate un timestamp en heure lisible. */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export function OfflineBanner() {
  const [online, setOnline]               = useState(true);
  const [queueCount, setQueueCount]       = useState(0);
  const [queueItems, setQueueItems]       = useState<QueueItem[]>([]);
  const [pendingUps, setPendingUps]       = useState<PendingUpload[]>([]);
  const [warming, setWarming]             = useState(false);
  const [lastWarm, setLastWarm]           = useState(0);
  const [showWarmOk, setShowWarmOk]       = useState(false);
  const [failedCount, setFailedCount]     = useState(0);
  const [failedReason, setFailedReason]   = useState("");
  const [retrying, setRetrying]           = useState(false);
  const [showDetails, setShowDetails]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const upCount = await countPendingUploads();
      const failCount = await countPermanentlyFailed();
      const uploads = await getPendingUploads({ status: "pending" });
      const items = getQueue();
      if (cancelled) return;
      setOnline(isOnline());
      setQueueCount(items.length + upCount);
      setQueueItems(items);
      setPendingUps(uploads);
      setLastWarm(getLastCacheWarmTs());
      setFailedCount(failCount);
      // Récupère le motif d'échec le plus récent pour diagnostic visible.
      if (failCount > 0) {
        try {
          const failed = await getPendingUploads({ status: "permanently-failed" });
          if (!cancelled) {
            const reasons = failed.map((f) => f.reason).filter(Boolean) as string[];
            setFailedReason(reasons[0] || "");
          }
        } catch {}
      } else if (!cancelled) {
        setFailedReason("");
      }
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

    // Poll de sécurité (l'essentiel passe par les events online/offline/upload
    // ci-dessus) : 20 s au lieu de 5 s, et rien quand l'app est en arrière-plan
    // → économise la batterie.
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, 20000);

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

  /** Abandonne manuellement un item de synchro coincé. */
  const handleRemoveItem = (id: string) => {
    removeFromQueue(id);
    const items = getQueue();
    setQueueItems(items);
    countPendingUploads().then((up) => setQueueCount(items.length + up));
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
        className="w-full px-3 py-2 text-xs flex items-center justify-center gap-2 shadow-md bg-red-600 text-white"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">
          {failedCount} photo{failedCount > 1 ? "s" : ""} n&apos;ont pas pu être envoyées — données conservées localement
          {failedReason && (
            <span className="block text-[10px] font-normal opacity-90">motif&nbsp;: {failedReason}</span>
          )}
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
    // Message explicite ET exact : distinguer photos et mises à jour de données
    // (sinon une simple synchro de données s'affichait à tort comme "photo").
    cls = "bg-blue-500 text-white";
    Icon = CloudUpload;
    const nbPhotos = pendingUps.reduce((s, u) => s + (u.files?.length || 0), 0);
    const nbData = queueItems.length;
    if (nbPhotos > 0 && nbData > 0) {
      label = `Synchronisation… ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} + ${nbData} mise${nbData > 1 ? "s" : ""} à jour — garde l'app ouverte`;
    } else if (nbPhotos > 0) {
      label = `Envoi de ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""}… garde l'app ouverte jusqu'à la fin`;
    } else {
      label = `Synchronisation de ${nbData} mise${nbData > 1 ? "s" : ""} à jour…`;
    }
  }

  const hasDetails = queueItems.length > 0 || pendingUps.length > 0;

  return (
    <div className={`w-full shadow-md ${cls}`}>
      {/* Ligne principale cliquable */}
      <button
        type="button"
        role="status"
        aria-live="polite"
        onClick={() => hasDetails && setShowDetails((v) => !v)}
        className={`w-full px-3 py-1.5 text-xs flex items-center justify-center gap-2 ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">{label}</span>
        {hasDetails && (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>

      {/* Panneau de détail (au clic ou survol) */}
      {showDetails && hasDetails && (
        <div className="bg-white dark:bg-slate-900 border-t border-blue-200 dark:border-slate-700 px-4 py-3 space-y-1.5 max-h-64 overflow-y-auto shadow-lg">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Opérations en attente
          </p>

          {/* Opérations API (localStorage queue) */}
          {queueItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 py-1 border-b border-gray-50 dark:border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                  item.type === "upload"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    : item.type === "pdf"
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                }`}>
                  {item.type === "upload" ? "photo" : item.type === "pdf" ? "pdf" : "sync"}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                  {describeQueueItem(item)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-gray-400">
                  {formatTime(item.timestamp)}
                </span>
                {item.type !== "upload" && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                    title="Abandonner cette opération coincée"
                    className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Photos en attente (IndexedDB) */}
          {pendingUps.map((up) => (
            <div
              key={up.id}
              className="flex items-center justify-between gap-3 py-1 border-b border-gray-50 dark:border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  photo
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                  {describePendingUpload(up)}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {formatTime(up.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
