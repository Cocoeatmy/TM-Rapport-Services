"use client";

import { useEffect, useState } from "react";
import { WifiOff, CloudUpload } from "lucide-react";
import { isOnline, getQueue } from "@/lib/offline";
import { countPendingUploads } from "@/lib/idb-uploads";

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
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const upCount = await countPendingUploads();
      if (cancelled) return;
      setOnline(isOnline());
      // Compteur total = mutations JSON en queue + uploads photo
      // pendants en IDB. C'est ce que l'utilisateur perçoit comme
      // "opérations en attente".
      setQueueCount(getQueue().length + upCount);
    };
    refresh();

    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("tm-offline-queued", refresh);
    window.addEventListener("tm-pending-upload-added", refresh);
    window.addEventListener("tm-pending-upload-removed", refresh);

    const interval = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tm-offline-queued", refresh);
      window.removeEventListener("tm-pending-upload-added", refresh);
      window.removeEventListener("tm-pending-upload-removed", refresh);
      clearInterval(interval);
    };
  }, []);

  // En ligne et queue vide : rien à afficher.
  if (online && queueCount === 0) return null;

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
