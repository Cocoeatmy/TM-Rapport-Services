import { NextRequest, NextResponse } from "next/server";
import { notionWrite } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { redisEnabled, redisLockAcquire, redisLockRelease } from "@/lib/redis-cache";

/**
 * Rattache une ou plusieurs URLs Cloudinary (déjà uploadées) à un champ "Files"
 * Notion. Appelé après l'upload DIRECT vers Cloudinary (/api/photos/sign).
 *
 * Avantages vs l'ancienne /api/upload (qui faisait Cloudinary + Notion en une
 * requête lourde) :
 *  - Aucun octet de photo ne transite ici : payload = petit JSON → rapide, et
 *    réessayable indéfiniment SANS renvoyer les images (elles sont déjà sûres).
 *  - Utilise le client Notion d'ÉCRITURE (bucket séparé) → jamais affamé par
 *    les pics de lecture (chargements de projets).
 */
export const maxDuration = 30;

// Verrou EN MÉMOIRE par champ : sérialise les écritures concurrentes DANS UN
// MÊME conteneur. Insuffisant seul en serverless (plusieurs conteneurs Vercel),
// d'où le verrou distribué Redis ci-dessous. Conservé comme 2ᵉ barrière + repli
// quand Redis n'est pas configuré (dev local).
const writeLocks = new Map<string, Promise<unknown>>();
function withFieldLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  writeLocks.set(key, next);
  next.finally(() => { if (writeLocks.get(key) === next) writeLocks.delete(key); });
  return next;
}

/** Signale une contention de verrou → 429 pour que le client remette en file (jamais de perte). */
class LockBusyError extends Error {
  status = 429;
  constructor() { super("Écriture concurrente en cours, réessayez"); }
}

/**
 * Sérialise le read-modify-write sur `${projectId}:${notionField}` à travers
 * TOUS les conteneurs via un verrou distribué Redis. Attend jusqu'à ~15 s pour
 * l'acquérir (les écritures Notion durent < 1 s → la file se vide vite). Si
 * impossible, lève LockBusyError → le client met la photo en file et réessaie
 * automatiquement : AUCUNE photo n'est perdue. Repli sur le verrou mémoire seul
 * si Redis n'est pas configuré.
 */
async function withDistributedFieldLock<T>(projectId: string, notionField: string, fn: () => Promise<T>): Promise<T> {
  const memKey = `${projectId}:${notionField}`;
  if (!redisEnabled) {
    return withFieldLock(memKey, fn);
  }
  const lockKey = `lock:attach:${memKey}`;
  const TTL_MS = 20_000;      // expiration auto (anti-deadlock)
  const DEADLINE = Date.now() + 15_000;
  let token: string | null = null;
  while (Date.now() < DEADLINE) {
    token = await redisLockAcquire(lockKey, TTL_MS);
    if (token) break;
    await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 200)));
  }
  if (!token) throw new LockBusyError();
  try {
    // 2ᵉ barrière mémoire : ordonne les écritures intra-conteneur.
    return await withFieldLock(memKey, fn);
  } finally {
    await redisLockRelease(lockKey, token);
  }
}

export async function POST(request: NextRequest) {
  let notionField = "";
  try {
    const body = await request.json();
    const { projectId, photos } = body;
    notionField = body.notionField;
    if (!projectId || !notionField || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: "projectId, notionField et photos requis" }, { status: 400 });
    }

    await withDistributedFieldLock(projectId, notionField, async () => {
      const page = await notionWrite.pages.retrieve({ page_id: projectId }) as any;
      const existingFiles = page.properties[notionField]?.files || [];

      const LIMIT = 100;
      let overflowExisting: { name: string; url: string }[] = [];
      if (existingFiles.length >= LIMIT) {
        try {
          const { getOverflow } = await import("@/lib/photo-overflow");
          overflowExisting = await getOverflow(projectId, notionField);
        } catch {}
      }

      // Dédup par URL ET par nom (les noms incluent un timestamp unique) → un
      // re-essai du rattachement ne crée jamais de doublon.
      const seenUrls = new Set<string>();
      const seenNames = new Set<string>();
      const allFiles: { type: "external"; name: string; external: { url: string } }[] = [];
      const pushUnique = (name: string, url: string | undefined | null) => {
        if (!url || seenUrls.has(url)) return;
        if (name && seenNames.has(name)) return;
        seenUrls.add(url);
        if (name) seenNames.add(name);
        allFiles.push({ type: "external", name: name || "photo", external: { url } });
      };
      for (const f of existingFiles) {
        const url = f.type === "external" ? f.external?.url : f.file?.url;
        pushUnique(f.name, url);
      }
      for (const f of overflowExisting) pushUnique(f.name, f.url);
      for (const p of photos) pushUnique(p.name, p.url);

      const notionSlice = allFiles.slice(0, LIMIT);
      const overflowSlice = allFiles.slice(LIMIT).map((f) => ({ name: f.name, url: f.external.url }));

      await notionWrite.pages.update({
        page_id: projectId,
        properties: { [notionField]: { files: notionSlice } },
      });

      if (overflowSlice.length > 0 || overflowExisting.length > 0) {
        try {
          const { setOverflow } = await import("@/lib/photo-overflow");
          await setOverflow(projectId, notionField, overflowSlice);
        } catch {}
      }
    });

    invalidateCache(`project-${projectId}`);
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    invalidateCache("projects-services");
    invalidateCache("projects-sav");
    invalidateCache("projects-all-active");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Classification de l'erreur pour que le client sache s'il doit RÉESSAYER
    // ou ARRÊTER (fini le « moulinage sans fin ») :
    //  • 429 (contention verrou / rate-limit Notion) → TRANSITOIRE (réessai auto).
    //  • 400/404 ou validation Notion (champ inexistant, MAUVAIS TYPE, propriété
    //    supprimée…) → PERMANENT : inutile de réessayer, on renvoie 400 pour que
    //    le client affiche une erreur claire au lieu de boucler indéfiniment.
    //  • Autres (5xx, réseau) → TRANSITOIRE.
    const notionStatus = typeof error?.status === "number" ? error.status : 0;
    const code = String(error?.code || "");
    const permanent =
      notionStatus === 400 || notionStatus === 404 ||
      code === "validation_error" || code === "object_not_found";
    const status = notionStatus === 429 ? 429 : permanent ? 400 : 500;
    if (status !== 429) console.error("Photo attach error:", notionField, code, error?.message);
    return NextResponse.json(
      {
        error: error?.message || "Erreur rattachement",
        field: notionField,
        permanent,
      },
      { status },
    );
  }
}
