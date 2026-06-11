// Débordement photo : Notion limite chaque propriété "Files" à 100 fichiers.
// Sur les gros projets (beaucoup de cabines), un champ photo (typiquement
// "Photos montage terminé") atteint 100 → toute photo supplémentaire est
// rejetée par Notion (validation 400/500) → upload bloqué en boucle.
//
// Solution : les photos au-delà de 100 sont stockées dans le store annexe
// (kv-store, clé "photo-overflow") et refusionnées à la lecture (getProject),
// de façon transparente pour le PDF, le portail client et l'app.

import type { FileItem } from "./notion";

const KEY = "photo-overflow";

interface OverflowRecord {
  projectId: string;
  /** Nom EXACT du champ Notion (ex. "Photos montage terminé"). */
  field: string;
  files: FileItem[];
}

/** Mapping nom de champ Notion → clé de propriété Project (champs photo). */
export const PHOTO_NOTION_TO_KEY: Record<string, string> = {
  "Photos avant montage": "photosAvant",
  "Photos démontage": "photosDemontage",
  "Photos montage terminé": "photosMontage",
  "Photos QR Code": "photosQRCode",
  "Photos garanties": "photosGaranties",
};

/** Lit le débordement d'un champ donné. */
export async function getOverflow(projectId: string, field: string): Promise<FileItem[]> {
  try {
    const { getData } = await import("@/lib/kv-store");
    const all = await getData<OverflowRecord>(KEY);
    return all.find((r) => r.projectId === projectId && r.field === field)?.files || [];
  } catch {
    return [];
  }
}

/** Remplace le débordement d'un champ (upsert ; supprime si vide). */
export async function setOverflow(projectId: string, field: string, files: FileItem[]): Promise<void> {
  const { getData, setData } = await import("@/lib/kv-store");
  const all = await getData<OverflowRecord>(KEY);
  const others = all.filter((r) => !(r.projectId === projectId && r.field === field));
  if (files.length > 0) others.push({ projectId, field, files });
  await setData(KEY, others);
}

/**
 * Fusionne le débordement KV dans les champs photo d'un projet déjà mappé.
 *
 * On lit TOUJOURS les enregistrements de débordement (lecture KV mise en
 * cache 60 s) : on ne peut PAS se fier au seul fait que le champ Notion soit
 * à 100. Exemple vécu : après suppression/re-upload de photos, le compteur
 * Notion repasse SOUS 100 alors que des photos restent en débordement → si on
 * ne fusionnait que quand le champ est plein, ces photos disparaîtraient
 * (cabines repassées en "orange" à tort).
 */
export async function mergeOverflowIntoProject(project: any): Promise<void> {
  try {
    const { getData } = await import("@/lib/kv-store");
    const all = await getData<OverflowRecord>(KEY);
    const recs = all.filter((r) => r.projectId === project.id);
    if (recs.length === 0) return;

    for (const rec of recs) {
      const key = PHOTO_NOTION_TO_KEY[rec.field];
      if (!key || !Array.isArray(project[key])) continue;
      const seen = new Set<string>(project[key].map((f: FileItem) => f.url));
      for (const f of rec.files) {
        if (f.url && !seen.has(f.url)) {
          project[key].push(f);
          seen.add(f.url);
        }
      }
    }
  } catch {
    // Lecture du débordement non bloquante : en cas d'échec, on sert au moins
    // les 100 photos présentes dans Notion.
  }
}
