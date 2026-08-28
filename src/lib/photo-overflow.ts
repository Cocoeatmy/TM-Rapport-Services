// Débordement photo : Notion limite chaque propriété "Files" à 100 fichiers.
// Sur les gros projets (beaucoup de cabines), un champ photo (typiquement
// "Photos montage terminé") atteint 100 → toute photo supplémentaire est
// rejetée par Notion → on la stocke à part et on la refusionne à la lecture.
//
// STOCKAGE : REDIS (Upstash), UNE clé par (projet, champ) →
//   - écriture ATOMIQUE (SET) : aucune course inter-conteneurs (le bug de perte
//     photo venait de l'ancien store qui écrivait un GROS blob global dans une
//     page Notion, avec verrou mémoire par conteneur + limite de taille Notion) ;
//   - pas de limite de taille pratique ;
//   - TTL 10 ans = jamais d'expiration.
// Repli + MIGRATION transparente depuis l'ancien store (kv-store/Notion) tant
// que Redis n'a pas encore la donnée.

import type { FileItem } from "./notion";
import { redisEnabled, redisGetJSON, redisSetJSON, redisDel } from "./redis-cache";

const KEY = "photo-overflow"; // ancien store global (kv-store → Notion) : repli/migration
const TEN_YEARS = 315_360_000; // TTL Redis ≈ « jamais » (les photos ne doivent pas expirer)
const rkey = (projectId: string, field: string) => `overflow:${projectId}:${field}`;

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
  "Documents SAV": "documentsSavDemande",
  "Photos SAV / Retouches cabines": "photosSavRetouches",
};

/** Lecture de l'ANCIEN store (kv-store/Notion) — repli + source de migration. */
async function legacyGet(projectId: string, field: string): Promise<FileItem[]> {
  try {
    const { getData } = await import("@/lib/kv-store");
    const all = await getData<OverflowRecord>(KEY);
    return all.find((r) => r.projectId === projectId && r.field === field)?.files || [];
  } catch {
    return [];
  }
}

/** Lit le débordement d'un champ donné (Redis d'abord, puis ancien store). */
export async function getOverflow(projectId: string, field: string): Promise<FileItem[]> {
  if (redisEnabled) {
    try {
      const fromRedis = await redisGetJSON<FileItem[]>(rkey(projectId, field));
      if (Array.isArray(fromRedis)) return fromRedis;
    } catch { /* repli ci-dessous */ }
    // Rien en Redis → on lit l'ancien store et on MIGRE (write-through).
    const legacy = await legacyGet(projectId, field);
    if (legacy.length) { try { await redisSetJSON(rkey(projectId, field), legacy, TEN_YEARS); } catch {} }
    return legacy;
  }
  return legacyGet(projectId, field);
}

/** Remplace le débordement d'un champ (upsert ; supprime si vide). */
export async function setOverflow(projectId: string, field: string, files: FileItem[]): Promise<void> {
  if (redisEnabled) {
    // Écriture ATOMIQUE par (projet, champ) → aucune course, aucune perte.
    if (files.length > 0) await redisSetJSON(rkey(projectId, field), files, TEN_YEARS);
    else await redisDel(rkey(projectId, field));
    return;
  }
  // Repli sans Redis : ancien store global (kv-store → Notion).
  const { getData, setData } = await import("@/lib/kv-store");
  const all = await getData<OverflowRecord>(KEY);
  const others = all.filter((r) => !(r.projectId === projectId && r.field === field));
  if (files.length > 0) others.push({ projectId, field, files });
  await setData(KEY, others);
}

/**
 * Fusionne le débordement dans les champs photo d'un projet déjà mappé.
 * On lit CHAQUE champ photo connu (Redis + repli legacy via getOverflow). On ne
 * peut pas se fier au seul fait que le champ Notion soit à 100 : après
 * suppression/re-upload, il peut repasser sous 100 alors que des photos restent
 * en débordement → sans cette fusion, elles disparaîtraient.
 */
export async function mergeOverflowIntoProject(project: any): Promise<void> {
  try {
    await Promise.all(
      Object.entries(PHOTO_NOTION_TO_KEY).map(async ([field, projKey]) => {
        if (!Array.isArray(project[projKey])) return;
        const files = await getOverflow(project.id, field);
        if (!files.length) return;
        const seen = new Set<string>(project[projKey].map((f: FileItem) => f.url));
        for (const f of files) {
          if (f.url && !seen.has(f.url)) {
            project[projKey].push(f);
            seen.add(f.url);
          }
        }
      }),
    );
  } catch {
    // Non bloquant : en cas d'échec, on sert au moins les 100 photos Notion.
  }
}
