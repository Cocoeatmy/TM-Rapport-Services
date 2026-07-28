"use client";

import { useState, useEffect, useCallback } from "react";
import { Send, Loader2, CheckCheck } from "lucide-react";
import { getQueue, processQueue, isOnline } from "@/lib/offline";
import {
  processPendingUploads,
  countPendingUploads,
  retryAllFailedUploads,
  resetBackoffForAll,
  countPermanentlyFailed,
} from "@/lib/idb-uploads";
import { toast } from "sonner";

/**
 * Bouton VISIBLE PAR TOUS (surtout les collaborateurs) : « Envoyer les rapports
 * en attente ». Problème récurrent : un collaborateur crée un rapport, pense
 * l'avoir envoyé, mais sans réseau ça reste bloqué localement. Ce bouton :
 *  - affiche un compteur bien visible dès qu'il reste des envois en attente
 *    (photos + rapports), pour qu'il sache que quelque chose n'est PAS parti ;
 *  - au tap, force l'envoi de TOUTE la file locale (photos + mutations texte).
 * Pas d'animation infinie (économie batterie).
 */
export function SendPendingButton() {
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = getQueue().length;
      const up = await countPendingUploads();
      const failed = await countPermanentlyFailed();
      setCount(q + up + failed);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("tm-pending-upload-added", onChange);
    window.addEventListener("tm-pending-upload-removed", onChange);
    window.addEventListener("tm-offline-queued", onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    // Poll léger de sécurité, en pause quand l'app est en arrière-plan.
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, 20000);
    return () => {
      window.removeEventListener("tm-pending-upload-added", onChange);
      window.removeEventListener("tm-pending-upload-removed", onChange);
      window.removeEventListener("tm-offline-queued", onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      clearInterval(interval);
    };
  }, [refresh]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    if (!isOnline()) {
      toast.error(
        "Pas de réseau — vos rapports partiront automatiquement dès que la connexion revient.",
        { duration: 5000 },
      );
      return;
    }
    setSending(true);
    try {
      await resetBackoffForAll();
      await retryAllFailedUploads();
      let success = 0;
      if (getQueue().length > 0) {
        const r = await processQueue();
        success += r.success;
      }
      if ((await countPendingUploads()) > 0) {
        const r = await processPendingUploads();
        success += r.success;
      }
      await refresh();
      const remaining = getQueue().length + (await countPendingUploads());
      if (remaining === 0 && success > 0) {
        toast.success(`✅ Tout est envoyé (${success})`, { duration: 5000 });
      } else if (remaining === 0) {
        toast.success("Tout est déjà synchronisé", { duration: 4000 });
      } else {
        toast.warning(`Encore ${remaining} en attente — réessayez dans un instant`, { duration: 6000 });
      }
    } catch {
      toast.error("Erreur lors de l'envoi — réessayez.");
    } finally {
      setSending(false);
    }
  }, [sending, refresh]);

  const hasPending = count > 0;

  return (
    <button
      onClick={handleSend}
      disabled={sending}
      aria-label="Envoyer les rapports en attente"
      title={
        sending
          ? "Envoi en cours…"
          : hasPending
            ? `${count} rapport(s)/photo(s) en attente — appuyez pour envoyer`
            : "Rapports envoyés — rien en attente"
      }
      className={`relative w-9 h-9 shrink-0 rounded-full border flex items-center justify-center transition-all active:scale-95 disabled:opacity-60 ${
        hasPending
          ? "bg-blue-600 hover:bg-blue-700 border-white/20 text-white"
          : "bg-white/15 border-white/20 text-white/70 hover:bg-white/25"
      }`}
    >
      {sending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : hasPending ? (
        <Send className="w-4 h-4" />
      ) : (
        <CheckCheck className="w-4 h-4" />
      )}
      {hasPending && !sending && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#3b1e6e] shadow">
          {count}
        </span>
      )}
    </button>
  );
}
