import { NextRequest, NextResponse } from "next/server";
import { notionWrite } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

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

// Verrou par champ pour sérialiser les écritures concurrentes sur la même
// propriété (read-modify-write) → évite qu'un upload en écrase un autre.
const writeLocks = new Map<string, Promise<unknown>>();
function withFieldLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  writeLocks.set(key, next);
  next.finally(() => { if (writeLocks.get(key) === next) writeLocks.delete(key); });
  return next;
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, notionField, photos } = await request.json();
    if (!projectId || !notionField || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: "projectId, notionField et photos requis" }, { status: 400 });
    }

    await withFieldLock(`${projectId}:${notionField}`, async () => {
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
    console.error("Photo attach error:", error);
    return NextResponse.json({ error: error.message || "Erreur rattachement" }, { status: 500 });
  }
}
