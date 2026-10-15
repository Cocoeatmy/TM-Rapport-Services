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
import {
  BUCKET_NOTION_FIELD,
  BUCKET_NOTION_LABEL,
  defaultBucketForField,
  filterByBucket,
  type PhotoBucketKey,
} from "@/lib/photo-buckets";

/** Une photo posée sur le téléphone, en attente d'envoi. */
export interface PhotoLocale {
  name: string;
  notionField?: string;
  /** « pending » : la file réessaie. « permanently-failed » : elle attend un geste. */
  statut: "pending" | "permanently-failed";
}

/**
 * Combien de photos LOCALES appartiennent à ce groupe de planches.
 *
 * Le rattachement se lit dans le nom du fichier — « Montage gauche.Cab3.2… » —
 * exactement comme pour les photos déjà chez Notion, et par le même filtre :
 * une seule façon de décider à quelle planche appartient une photo.
 */
export function compteLocalesGroupe(
  locales: readonly PhotoLocale[],
  buckets: readonly PhotoBucketKey[],
  cabineIdx?: number,
): number {
  let total = 0;
  for (const bucket of buckets) {
    const champ = BUCKET_NOTION_FIELD[bucket];
    /* La file retient le LIBELLÉ de la colonne Notion (« Photos avant
       montage »), là où le projet porte sa clé (`photosAvant`). On accepte
       les deux : sinon le compte ne reconnaîtrait rien de ce que le
       téléphone a enregistré, et le bouton resterait gris — le bug même
       qu'on corrige. */
    const libelle = BUCKET_NOTION_LABEL[champ];
    const liste = locales.filter((l) => l.notionField === champ || l.notionField === libelle);
    total += filterByBucket(liste, bucket, cabineIdx, defaultBucketForField(champ)).length;
  }
  return total;
}

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
