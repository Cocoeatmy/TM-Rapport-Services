import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

/**
 * Timeout Vercel étendu à 60 s (plan Pro).
 *
 * Sans cette directive la fonction expire après 10 s (défaut).
 * Un upload de 5 photos : Cloudinary ×5 en parallèle (~2-4 s) +
 * lecture/écriture/vérification Notion (~1-3 s) = 3-7 s en temps
 * normal, mais jusqu'à 12-15 s si Cloudinary ou Notion est lent.
 * → Timeout → 504 → photo mise en IDB "failed" même avec 5G.
 */
export const maxDuration = 60;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * File-scoped write-lock keyed by `projectId:notionField`.
 *
 * Why this exists
 * ---------------
 * The Notion update below uses a classic read-modify-write pattern:
 *   1. retrieve the page, read the current files
 *   2. append the newly-uploaded file(s)
 *   3. write the merged array back
 *
 * If two uploads target the same field concurrently (user taps quickly,
 * multiple browser tabs, retry after flaky network…), both requests
 * can read the same pre-image, each append their file locally, and then
 * overwrite one another — the later write wins and the earlier upload
 * is silently dropped from Notion. The file stays on Cloudinary but the
 * project never references it, hence the "la photo a disparu" symptom.
 *
 * We serialize writes with an in-memory promise chain per key. Requests
 * queue behind the previous one, so the read always reflects the
 * latest write. This is a best-effort single-instance lock — good
 * enough for a Vercel serverless function that keeps warm containers,
 * and the impact of a rare miss across instances is re-uploading.
 */
const writeLocks = new Map<string, Promise<unknown>>();

function withFieldLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  writeLocks.set(key, next);
  // Clean up the map once this task settles, but only if we're still
  // the tail (another request may have queued behind us).
  next.finally(() => {
    if (writeLocks.get(key) === next) writeLocks.delete(key);
  });
  return next;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const category = formData.get("category") as string;
    const projectId = formData.get("projectId") as string;
    const notionField = formData.get("notionField") as string;
    console.log("Upload request:", { category, projectId, notionField, fileCount: files.length });

    if (!files.length) {
      return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    }

    // Uploads Cloudinary en parallèle (gain ~Nx sur N photos simultanées)
    const uploaded: { name: string; url: string }[] = await Promise.all(
      files.map(async (file) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const result = await cloudinary.uploader.upload(base64, {
          folder: `tm-rapport/${projectId}/${category}`,
          resource_type: "image",
          transformation: [
            { width: 1200, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "jpg" },
          ],
        });

        return { name: file.name, url: result.secure_url };
      })
    );

    // Sauvegarder les URLs dans Notion si un champ est spécifié
    console.log("Upload done, saving to Notion:", { notionField, uploadedCount: uploaded.length });
    if (notionField && projectId) {
      await withFieldLock(`${projectId}:${notionField}`, async () => {
        // UN SEUL retrieve + UN SEUL update (avant : jusqu'à 5 appels Notion via
        // une boucle retrieve+update+vérification ×3). Sur les gros projets,
        // cette boucle rendait l'écriture trop lente → dépassement du timeout →
        // photos bloquées en boucle de re-essais. Le verrou in-memory sérialise
        // déjà les écritures du même champ, et le dédup par nom ci-dessous
        // élimine tout doublon au prochain upload : la vérification était superflue.
        const page = await notion.pages.retrieve({ page_id: projectId }) as any;
        const existingFiles = page.properties[notionField]?.files || [];

        const LIMIT = 100;
        // Photos déjà débordées (au-delà de 100) stockées dans le KV — on les
        // réinclut pour ne pas les perdre. Inutile de lire le KV si le champ
        // Notion n'est pas plein (pas de débordement possible).
        let overflowExisting: { name: string; url: string }[] = [];
        if (existingFiles.length >= LIMIT) {
          try {
            const { getOverflow } = await import("@/lib/photo-overflow");
            overflowExisting = await getOverflow(projectId, notionField);
          } catch {}
        }

        // Dédup par URL ET par nom (le nom inclut un timestamp unique). En cas
        // de retry réseau, le même nom revient → on ignore le doublon.
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
        // Ordre : Notion (100 existants) d'abord → ils restent dans Notion ;
        // débordement existant ensuite ; nouvelles photos en dernier.
        for (const f of existingFiles) {
          const url = f.type === "external" ? f.external?.url : f.file?.url;
          pushUnique(f.name, url);
        }
        for (const f of overflowExisting) pushUnique(f.name, f.url);
        for (const f of uploaded) pushUnique(f.name, f.url);

        // Notion plafonne CHAQUE propriété "Files" à 100. Au-delà → débordement
        // KV (refusionné à la lecture via getProject). L'upload ne peut donc
        // jamais échouer pour cause de champ plein.
        const notionSlice = allFiles.slice(0, LIMIT);
        const overflowSlice = allFiles.slice(LIMIT).map((f) => ({ name: f.name, url: f.external.url }));

        await notion.pages.update({
          page_id: projectId,
          properties: {
            [notionField]: { files: notionSlice },
          },
        });

        // N'écrit le KV que s'il y a un débordement (ou qu'il faut le mettre à
        // jour) — les projets normaux ne touchent jamais ce store.
        if (overflowSlice.length > 0 || overflowExisting.length > 0) {
          try {
            const { setOverflow } = await import("@/lib/photo-overflow");
            await setOverflow(projectId, notionField, overflowSlice);
          } catch {}
        }
      });

      // Invalider les caches côté serveur pour que le prochain fetch
      // du projet voie bien les nouvelles photos (sinon la version
      // pré-upload reste servie jusqu'à 5 min).
      invalidateCache(`project-${projectId}`);
      invalidateCache("projects");
      invalidateCache("projects-mesures");
      invalidateCache("projects-services");
      invalidateCache("projects-sav");
      invalidateCache("projects-all-active");
    }

    return NextResponse.json({ files: uploaded });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur upload" },
      { status: 500 }
    );
  }
}
