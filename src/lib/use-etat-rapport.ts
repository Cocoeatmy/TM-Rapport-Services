"use client";

/**
 * L'état d'un rapport, tenu à jour pendant qu'on travaille.
 *
 * Trois sources, toutes locales : ce que le monteur a clos (localStorage),
 * les photos encore dans la file (IndexedDB) et les écritures en attente de
 * réseau (file hors ligne). Elles se relisent sur les mêmes événements que
 * le reste de l'app — ajout ou départ d'une photo, mise en file d'une
 * requête, retour du réseau — pour qu'aucun écran n'affiche « synchronisé »
 * une seconde de trop.
 */

import { useEffect, useState } from "react";
import { getPendingUploads } from "@/lib/idb-uploads";
import { getQueue } from "@/lib/offline";
import {
  etatRapport,
  lireFinalisation,
  type EtatRapport,
  type Finalisation,
} from "@/lib/rapport-finalise";

export interface SuiviRapport {
  etat: EtatRapport;
  finalise: Finalisation | null;
  photosEnAttente: number;
  requetesEnAttente: number;
}

/** Les écritures en attente qui concernent CE chantier. */
function compterRequetes(projectId: string): number {
  try {
    return getQueue().filter((i) => String(i.url || "").includes(projectId)).length;
  } catch {
    return 0;
  }
}

export function useEtatRapport(projectId: string | undefined): SuiviRapport {
  const [suivi, setSuivi] = useState<SuiviRapport>({
    etat: "aucun", finalise: null, photosEnAttente: 0, requetesEnAttente: 0,
  });

  useEffect(() => {
    let vivant = true;

    const relire = async () => {
      if (!projectId) return;
      let photos = 0;
      try {
        const items = await getPendingUploads({ projectId, status: "all" });
        photos = items.reduce((n, i) => n + i.files.length, 0);
      } catch {
        /* IndexedDB indisponible : on ne peut pas prouver que tout est
           parti, donc on ne l'affirmera pas — zéro, et c'est la
           finalisation qui décidera. */
      }
      if (!vivant) return;
      const finalise = lireFinalisation(projectId);
      const requetes = compterRequetes(projectId);
      setSuivi({
        etat: etatRapport({ finalise, photosEnAttente: photos, requetesEnAttente: requetes }),
        finalise,
        photosEnAttente: photos,
        requetesEnAttente: requetes,
      });
    };

    relire();
    const evenements = [
      "tm-pending-upload-added",
      "tm-pending-upload-removed",
      "tm-upload-attached",
      "tm-offline-queued",
      "tm-rapport-finalise",
      "online",
      "offline",
    ];
    evenements.forEach((e) => window.addEventListener(e, relire));
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      relire();
    }, 10000);

    return () => {
      vivant = false;
      evenements.forEach((e) => window.removeEventListener(e, relire));
      clearInterval(poll);
    };
  }, [projectId]);

  return suivi;
}
