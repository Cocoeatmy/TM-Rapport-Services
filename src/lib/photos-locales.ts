"use client";

/**
 * Les photos qui sont sur le téléphone mais pas encore chez nous.
 *
 * Le 15 octobre 2026, deux monteurs se sont retrouvés bloqués sur un
 * chantier sans réseau : ils avaient pris les photos demandées, l'app les
 * affichait avec la pastille « Sync », et le bouton « Suivant » restait gris.
 * Cause : le compte des photos obligatoires se faisait sur la liste du
 * PROJET — celle que Notion renvoie — donc une photo n'existait, pour la
 * règle, qu'une fois arrivée sur le serveur. Sans réseau, jamais.
 *
 * Une photo prise est une photo prise. Ce qui compte, c'est qu'elle soit
 * écrite dans un stockage qui survit à la fermeture de l'app (IndexedDB) et
 * rattachée au bon lot et à la bonne planche. Son voyage vers le serveur ne
 * regarde plus le monteur.
 *
 * Ce module donne donc à l'écran la même vue que la file d'attente : ce qui
 * est sur le téléphone, par planche et par lot. Les envois « définitivement
 * en échec » comptent aussi — les octets sont toujours là, et rien n'est
 * jamais supprimé sans confirmation du serveur.
 */

import { useEffect, useState } from "react";
import { getPendingUploads } from "@/lib/idb-uploads";
import { type PhotoLocale } from "@/lib/photo-buckets";

/* Le compte lui-même vit dans photo-buckets, avec les règles de planches :
   le contrôle qui BLOQUE l'envoi en a besoin aussi, et deux implémentations
   finiraient par diverger — c'est exactement ce qui a laissé passer le bug
   du 16 octobre. */
export { compteLocalesGroupe, type PhotoLocale } from "@/lib/photo-buckets";

/**
 * Les photos locales d'un chantier, tenues à jour.
 *
 * Se recale sur les mêmes événements que la grille de photos, pour que le
 * compteur d'une planche et les vignettes ne se contredisent jamais.
 */
export function usePhotosLocales(projectId: string | undefined): PhotoLocale[] {
  const [locales, setLocales] = useState<PhotoLocale[]>([]);

  useEffect(() => {
    let vivant = true;

    const relire = async () => {
      try {
        if (!projectId) { if (vivant) setLocales([]); return; }
        const items = await getPendingUploads({ projectId, status: "all" });
        if (!vivant) return;
        const suite: PhotoLocale[] = [];
        for (const item of items) {
          for (const f of item.files) {
            suite.push({
              name: f.name,
              notionField: item.notionField,
              statut: item.status === "permanently-failed" ? "permanently-failed" : "pending",
            });
          }
        }
        setLocales(suite);
      } catch {
        /* IndexedDB indisponible (navigation privée…) : on n'invente rien,
           le compte retombe sur les seules photos déjà chez Notion. */
        if (vivant) setLocales([]);
      }
    };

    relire();
    window.addEventListener("tm-pending-upload-added", relire);
    window.addEventListener("tm-pending-upload-removed", relire);
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      relire();
    }, 20000);

    return () => {
      vivant = false;
      window.removeEventListener("tm-pending-upload-added", relire);
      window.removeEventListener("tm-pending-upload-removed", relire);
      clearInterval(poll);
    };
  }, [projectId]);

  return locales;
}
