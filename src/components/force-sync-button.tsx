"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { resetBackoffForAll } from "@/lib/idb-uploads";
import { toast } from "sonner";

/**
 * Bouton rond orange « Forcer la synchro » (admin uniquement).
 * Envoie le signal force-sync à toutes les applis des monteurs, puis
 * déclenche une synchro locale (via l'event écouté par SyncButton).
 * Même forme/icône que le bouton Rafraîchir, en orange, placé juste à sa droite.
 */
export function ForceSyncButton() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [forceSyncing, setForceSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => { if (d.user?.role) setUserRole(d.user.role); })
      .catch(() => {});
  }, []);

  const handleForceSync = useCallback(async () => {
    setForceSyncing(true);
    try {
      const res = await fetch("/api/force-sync", { method: "POST" });
      if (res.ok) {
        toast.success("Signal envoyé — les applis des monteurs vont se synchroniser dans ~30 s");
        await resetBackoffForAll();
        // Déclenche la synchro locale : SyncButton écoute cet event.
        try { window.dispatchEvent(new Event("tm-offline-queued")); } catch {}
      } else {
        toast.error("Erreur lors de l'envoi du signal");
      }
    } catch {
      toast.error("Impossible d'envoyer le signal");
    } finally {
      setForceSyncing(false);
    }
  }, []);

  if (userRole !== "admin") return null;

  return (
    <button
      onClick={handleForceSync}
      disabled={forceSyncing}
      aria-label="Forcer la synchronisation de tous les monteurs"
      title="Forcer la synchronisation de tous les monteurs"
      className="w-9 h-9 shrink-0 rounded-full bg-orange-500 hover:bg-orange-600 border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all disabled:opacity-60"
    >
      {forceSyncing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4" />
      )}
    </button>
  );
}
