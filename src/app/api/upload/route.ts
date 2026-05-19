import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

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
        // Retry loop : en cas de race cross-container (deux workers Vercel
        // simultanés qui bypassent le verrou in-memory), on relit l'état
        // Notion après chaque write et on réécrit si des fichiers attendus
        // manquent. Max 3 tentatives.
        const MAX_WRITE_ATTEMPTS = 3;
        const expectedNames = new Set(uploaded.map((f) => f.name));

        for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
          // Re-read inside the lock so concurrent uploads queue up
          // behind each other and each sees the latest state.
          const page = await notion.pages.retrieve({ page_id: projectId }) as any;
          const existingFiles = page.properties[notionField]?.files || [];

          // Dédup par URL ET par nom de fichier.
          //
          // Pourquoi le nom ? En cas de retry (réseau coupé APRÈS que le
          // serveur a traité la 1ère requête mais AVANT que le client reçoive
          // la réponse), le client re-upload le même fichier. Cloudinary génère
          // alors un nouveau public_id → URL différente → `seenUrls` ne détecte
          // pas le doublon → la photo apparaît deux fois dans Notion.
          //
          // Les noms incluent désormais un timestamp (format :
          // `${filePrefix}.${idx}.${Date.now()}.ext`) — le timestamp garantit
          // l'unicité cross-device (deux monteurs sur le même chantier ne
          // produiront pas le même nom), tout en préservant le dédup sur retry
          // (l'IDB conserve le même nom pour les tentatives suivantes).
          // NB : detectBucket et extractCabine analysent le PRÉFIXE et le
          // pattern `.Cab(\d+).` — ils ne sont pas affectés par le suffixe.
          const seenUrls = new Set<string>();
          const seenNames = new Set<string>();
          const allFiles: { type: "external"; name: string; external: { url: string } }[] = [];
          const pushUnique = (name: string, url: string | undefined | null) => {
            if (!url || seenUrls.has(url)) return;
            // Même nom → même photo uploadée deux fois (retry) → on ignore
            if (name && seenNames.has(name)) return;
            seenUrls.add(url);
            if (name) seenNames.add(name);
            allFiles.push({ type: "external", name: name || "photo", external: { url } });
          };
          for (const f of existingFiles) {
            const url = f.type === "external" ? f.external?.url : f.file?.url;
            pushUnique(f.name, url);
          }
          for (const f of uploaded) {
            pushUnique(f.name, f.url);
          }

          await notion.pages.update({
            page_id: projectId,
            properties: {
              [notionField]: { files: allFiles },
            },
          });

          // Vérification post-write : relire Notion pour confirmer que tous
          // les fichiers uploadés sont bien présents. Si un fichier manque
          // (race cross-container), on réitère le write.
          if (attempt < MAX_WRITE_ATTEMPTS) {
            const verify = await notion.pages.retrieve({ page_id: projectId }) as any;
            const writtenNames = new Set(
              (verify.properties[notionField]?.files || []).map((f: any) => f.name)
            );
            const allPresent = [...expectedNames].every((n) => writtenNames.has(n));
            if (allPresent) break; // tout est là, on sort
            console.warn(
              `[upload] Tentative ${attempt}/${MAX_WRITE_ATTEMPTS} — fichiers manquants détectés, retry write Notion`
            );
            await new Promise((r) => setTimeout(r, 200 * attempt)); // petit délai avant retry
          }
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
