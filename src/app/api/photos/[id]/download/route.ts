import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getProject } from "@/lib/notion";
import { getData } from "@/lib/kv-store";
import { detectBucket, extractCabine, defaultBucketForField, PhotoBucketKey } from "@/lib/photo-buckets";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro — jusqu'à 5 min possible, 60 s suffit pour un ZIP

// Label court pour les noms de fichiers du ZIP.
const BUCKET_DL_LABEL: Record<PhotoBucketKey, string> = {
  AVANT_INTERVENTION:  "Photo avant intervention",
  AVANT_MONTAGE:       "Photo avant montage",
  DEMONTAGE:           "Photo démontage",
  MONTAGE_GAUCHE:      "Photo montage",
  MONTAGE_CENTRE:      "Photo montage",
  MONTAGE_DROITE:      "Photo montage",
  APRES_INTERVENTION:  "Photo après intervention",
  QR_CODE:             "QR Code",
  GARANTIE:            "Photo garantie",
};

/** Remplace les caractères interdits + supprime les accents (ASCII pur pour HTTP headers). */
function sanitize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // supprime les diacritiques (é→e, à→a, etc.)
    .replace(/[/\\:*?"<>|]/g, "-")
    .trim();
}

/** Tente d'extraire l'extension depuis l'URL (jpg par défaut). */
function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const seg = path.split("/").pop() || "";
    const dot = seg.lastIndexOf(".");
    if (dot >= 0) {
      const e = seg.slice(dot + 1).toLowerCase().split("?")[0];
      if (e && e.length <= 4) return e;
    }
  } catch { /* ignore */ }
  return "jpg";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Authentification
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;

  // Récupération du projet
  let project: Awaited<ReturnType<typeof getProject>>;
  try {
    project = await getProject(id);
  } catch {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const nbCabines = project.nbCabines || 1;
  const isMultiCabine = nbCabines > 1;

  // Noms des cabines (optionnel — un échec KV ne doit pas bloquer le ZIP)
  let cabineNames: string[] = Array.from({ length: nbCabines }, (_, i) => `Cabine ${i + 1}`);
  try {
    const allAttr = await getData<{ projectId: string; noms?: string[] }>("cabine-attributions");
    const attr = allAttr.find((a) => a.projectId === id);
    if (attr?.noms) {
      cabineNames = Array.from({ length: nbCabines }, (_, i) => attr.noms?.[i] || `Cabine ${i + 1}`);
    }
  } catch { /* noms par défaut utilisés */ }

  // Collecte de toutes les photos
  type PhotoEntry = {
    url: string;
    cabineIdx: number | null; // 1-based, null = pas de cabine encodée
    label: string;
  };

  const fields = [
    { key: "photosAvant" as const,      fallback: "AVANT_INTERVENTION" as PhotoBucketKey },
    { key: "photosDemontage" as const,  fallback: "DEMONTAGE"          as PhotoBucketKey },
    { key: "photosMontage" as const,    fallback: "MONTAGE_CENTRE"     as PhotoBucketKey },
    { key: "photosQRCode" as const,     fallback: "QR_CODE"            as PhotoBucketKey },
    { key: "photosGaranties" as const,  fallback: "GARANTIE"           as PhotoBucketKey },
  ] as const;

  const all: PhotoEntry[] = [];

  for (const { key, fallback } of fields) {
    const files = (project[key] ?? []) as { name: string; url: string }[];
    for (const file of files) {
      const bucket = detectBucket(file.name, fallback);
      const cabineIdx = extractCabine(file.name); // 1-based ou null
      const label = BUCKET_DL_LABEL[bucket];
      all.push({ url: file.url, cabineIdx, label });
    }
  }

  // Signalements : pièces manquantes, défauts signalés, et photos du souci réglé
  // (champs projet Notion). Label fixe — cabine encodée dans le nom si présente.
  const signalementFields: { key: "photosPiecesManquantes" | "photosDefautsSignale" | "photosSoucisRegle"; label: string }[] = [
    { key: "photosPiecesManquantes", label: "Photo piece manquante" },
    { key: "photosDefautsSignale",   label: "Photo defaut signale" },
    { key: "photosSoucisRegle",      label: "Photo travaux executes" },
  ];
  for (const { key, label } of signalementFields) {
    const files = (project[key] ?? []) as { name: string; url: string }[];
    for (const file of files) {
      const cabineIdx = extractCabine(file.name); // 1-based ou null
      all.push({ url: file.url, cabineIdx, label });
    }
  }

  // Repli KV-store : certaines photos de signalements ne vivent que dans le KV
  // (par signalement). On les ajoute — la déduplication par URL évite les doublons.
  try {
    const pieces = await getData<{ projectId: string; photoUrls?: string[]; photoUrl?: string }>("pieces");
    for (const p of pieces.filter((x) => x.projectId === id)) {
      const urls = p.photoUrls?.length ? p.photoUrls : (p.photoUrl ? [p.photoUrl] : []);
      for (const url of urls) all.push({ url, cabineIdx: null, label: "Photo piece manquante" });
    }
  } catch { /* KV indisponible → on garde les champs Notion */ }
  try {
    const defauts = await getData<{ projectId: string; photoUrls?: string[] }>("defauts");
    for (const d of defauts.filter((x) => x.projectId === id)) {
      for (const url of (d.photoUrls || [])) all.push({ url, cabineIdx: null, label: "Photo defaut signale" });
    }
  } catch { /* idem */ }

  // Déduplication par URL en gardant la PREMIÈRE occurrence (champ Notion, qui
  // porte la cabine) plutôt que la copie KV (cabineIdx null).
  {
    const seen = new Set<string>();
    const deduped = all.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
    all.length = 0;
    all.push(...deduped);
  }

  // Regroupement par (cabineIdx, label) pour numérotation séquentielle
  // Clé = "<cabineIdx|0>::<label>"
  const groups = new Map<string, PhotoEntry[]>();
  for (const entry of all) {
    const k = `${entry.cabineIdx ?? 0}::${entry.label}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(entry);
  }

  // Construction du ZIP — téléchargements en parallèle (batch de 8)
  // pour éviter le timeout Vercel avec les projets à nombreuses photos.
  const zip = new JSZip();

  // Aplatir toutes les entrées en une liste de tâches avec leur nom de fichier
  type ZipTask = { url: string; filename: string };
  const tasks: ZipTask[] = [];

  for (const items of groups.values()) {
    const { cabineIdx, label } = items[0];
    const cabineName =
      isMultiCabine && cabineIdx !== null
        ? cabineNames[(cabineIdx as number) - 1] ?? `Cabine ${cabineIdx}`
        : null;

    for (let i = 0; i < items.length; i++) {
      const { url } = items[i];
      const ext = extFromUrl(url);
      const suffix = i === 0 ? "" : `.${i + 1}`;
      const filename = cabineName
        ? `${sanitize(cabineName)} - ${sanitize(label)}${suffix}.${ext}`
        : `${sanitize(label)}${suffix}.${ext}`;
      tasks.push({ url, filename });
    }
  }

  // Exécution en parallèle — fetch sans AbortSignal (compatibilité maximale)
  await Promise.all(
    tasks.map(async ({ url, filename }) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          zip.file(filename, buf);
        }
      } catch {
        // On ignore les images inaccessibles ou expirées
      }
    })
  );

  let zipUint8: Uint8Array;
  try {
    zipUint8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
  } catch (err) {
    console.error("[download] ZIP generation failed:", err);
    return NextResponse.json({ error: "Erreur génération ZIP" }, { status: 500 });
  }

  if (zipUint8.length === 0) {
    return NextResponse.json({ error: "Aucune photo disponible pour ce projet" }, { status: 404 });
  }

  // sanitize() retourne de l'ASCII pur pour le filename (RFC 7230)
  const projectName = sanitize(project.nomChantier || id);
  const zipFilename = `${projectName} - Photos.zip`;

  return new NextResponse(Buffer.from(zipUint8.buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/zip",
      // filename* (RFC 5987) pour les clients modernes, filename ASCII en fallback
      "Content-Disposition": `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
      "Cache-Control": "no-store",
    },
  });
}
