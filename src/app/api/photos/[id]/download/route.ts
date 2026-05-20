import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getProject } from "@/lib/notion";
import { getData } from "@/lib/kv-store";
import { detectBucket, extractCabine, defaultBucketForField, PhotoBucketKey } from "@/lib/photo-buckets";
import { verifyToken } from "@/lib/auth";

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

/** Remplace les caractères interdits dans les noms de fichiers. */
function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "-").trim();
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

  // Noms des cabines (source de vérité : kv-store attribution)
  const allAttr = await getData<{ projectId: string; noms?: string[] }>("cabine-attributions");
  const attr = allAttr.find((a) => a.projectId === id);
  const cabineNames: string[] = Array.from({ length: nbCabines }, (_, i) =>
    attr?.noms?.[i] || `Cabine ${i + 1}`,
  );

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

  // Regroupement par (cabineIdx, label) pour numérotation séquentielle
  // Clé = "<cabineIdx|0>::<label>"
  const groups = new Map<string, PhotoEntry[]>();
  for (const entry of all) {
    const k = `${entry.cabineIdx ?? 0}::${entry.label}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(entry);
  }

  // Construction du ZIP
  const zip = new JSZip();

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
      const name = cabineName
        ? `${sanitize(cabineName)} - ${sanitize(label)}${suffix}.${ext}`
        : `${sanitize(label)}${suffix}.${ext}`;

      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          zip.file(name, buf);
        }
      } catch {
        // On ignore les images inaccessibles
      }
    }
  }

  const zipUint8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
  const projectName = sanitize(project.nomChantier || id);

  return new NextResponse(Buffer.from(zipUint8), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${projectName} - Photos.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
