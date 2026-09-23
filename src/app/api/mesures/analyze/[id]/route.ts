/**
 * POST /api/mesures/analyze/[id]
 * Analyse les fichiers de « Documents pour Montage » d'un projet :
 *  - PDF Duka multi-lots → détecte chaque lot (réf + série + plage de pages),
 *    crée/complète les cabines (nom « Lot <réf> », noms existants conservés) et
 *    mémorise le mappage cabine → {fichier, pages} pour le téléchargement.
 *  - Autres marques (1 fichier par lot) → rattache le fichier à la cabine dont
 *    le nom correspond à l'emplacement présent dans le nom du fichier.
 *
 * Idempotent : ne réécrit rien si la liste des fichiers n'a pas changé
 * (signature), sauf ?force=1. Appelé automatiquement par l'app.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getProject, updateProject, type FileItem } from "@/lib/notion";
import { getDataFresh, setData } from "@/lib/kv-store";
import { verifyToken } from "@/lib/auth";
import { parseDukaReport, fold, mesureFilenameSegments, isNewProjectForMesures } from "@/lib/mesures-duka";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface MesureLot {
  projectId: string;
  cab: number;        // index de cabine (1-based)
  ref?: string;       // réf Duka (si applicable)
  serie?: string;     // modèle / série
  fileName: string;   // nom du fichier source (dans « Documents pour Montage »)
  pageStart: number | null; // plage de pages (Duka) ; null = fichier entier
  pageEnd: number | null;
}
interface MesureSig { projectId: string; sig: string }

const MAP_KEY = "mesures-map";
const SIG_KEY = "mesures-sig";

function isPdf(name: string) { return /\.pdf$/i.test(name || ""); }
function isMesureFile(name: string) { return /mesures?/i.test(name || "") && isPdf(name); }

// Parse « Cab1:nom | Cab2:nom » → { 1:"nom", 2:"nom" }.
function parseNoms(raw: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:\s*([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) map[parseInt(m[1], 10)] = m[2].trim();
  return map;
}
function encodeNoms(map: Record<number, string>): string {
  return Object.keys(map).map(Number).sort((a, b) => a - b)
    .filter((n) => map[n] && map[n].trim())
    .map((n) => `Cab${n}:${map[n].trim()}`).join(" | ");
}
// Un nom est « personnalisé » s'il n'est ni vide ni « Cabine N ».
function isCustom(name: string | undefined, idx: number): boolean {
  const v = (name || "").trim();
  return !!v && v.toLowerCase() !== `cabine ${idx}`;
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await isAuthed(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const project = await getProject(id);
    // Uniquement les NOUVEAUX projets : on ne touche jamais aux projets existants
    // (souvent finis) pour éviter tout mélange de lots.
    if (!isNewProjectForMesures(project.createdTime)) {
      return NextResponse.json({ ok: true, skipped: true, lots: [] });
    }
    const docs: FileItem[] = project.documentsMontagee || [];
    const mesureFiles = docs.filter((f) => isMesureFile(f.name));

    // Signature = liste des fichiers mesures (nom+url). Inchangée → on ne refait rien.
    const sig = createHash("sha256")
      .update(mesureFiles.map((f) => `${f.name}::${f.url}`).sort().join("|"))
      .digest("hex").slice(0, 24);
    const sigs = await getDataFresh<MesureSig>(SIG_KEY).catch(() => [] as MesureSig[]);
    const prevSig = sigs.find((s) => s.projectId === id)?.sig;
    const existingMap = (await getDataFresh<MesureLot>(MAP_KEY).catch(() => [] as MesureLot[]))
      .filter((e) => e.projectId === id);
    if (!force && prevSig === sig) {
      return NextResponse.json({ ok: true, unchanged: true, lots: existingMap });
    }

    const entries: MesureLot[] = [];
    const existingNoms = parseNoms(project.nomsCabines);
    let nbCabines = project.nbCabines || 0;
    let nomsChanged = false;

    // ── 1) PDF Duka multi-lots ────────────────────────────────────────────────
    const dukaFile = mesureFiles.find((f) => /duka/i.test(f.name));
    let dukaHandled = false;
    if (dukaFile) {
      try {
        const res = await fetch(dukaFile.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const parsed = await parseDukaReport(buf);
          if (parsed.isDuka && parsed.lots.length > 0) {
            dukaHandled = true;
            nbCabines = Math.max(nbCabines, parsed.lots.length);
            parsed.lots.forEach((lot, i) => {
              const cab = i + 1; // ordre du relevé → index cabine
              // Nom : on ne remplace jamais un nom personnalisé existant.
              if (!isCustom(existingNoms[cab], cab)) {
                existingNoms[cab] = `Lot ${lot.ref}`;
                nomsChanged = true;
              }
              entries.push({ projectId: id, cab, ref: lot.ref, serie: lot.serie, fileName: dukaFile.name, pageStart: lot.pageStart, pageEnd: lot.pageEnd });
            });
          }
        }
      } catch { /* PDF illisible → on ignore le Duka, repli plus bas */ }
    }

    // ── 2) Fichiers « 1 mesure / lot » (Duscholux, Novellini…) ────────────────
    // Rattachés par correspondance nom de fichier ↔ nom de cabine.
    const perLotFiles = mesureFiles.filter((f) => !(dukaHandled && f.name === dukaFile!.name));
    if (perLotFiles.length > 0) {
      const cabCount = Math.max(nbCabines, Object.keys(existingNoms).length);
      const cabNames: { cab: number; folded: string }[] = [];
      for (let n = 1; n <= cabCount; n++) {
        const nm = existingNoms[n];
        if (nm) cabNames.push({ cab: n, folded: fold(nm) });
      }
      for (const f of perLotFiles) {
        const segs = mesureFilenameSegments(f.name).map(fold);
        // Cabine dont le nom apparaît dans un segment (ou l'inverse).
        let matched = 0;
        for (const c of cabNames) {
          if (!c.folded) continue;
          if (segs.some((s) => s && (s.includes(c.folded) || c.folded.includes(s)))) { matched = c.cab; break; }
        }
        if (matched && !entries.some((e) => e.cab === matched)) {
          entries.push({ projectId: id, cab: matched, fileName: f.name, pageStart: null, pageEnd: null });
        }
      }
    }

    // ── Écriture Notion (nb + noms) — seulement si nécessaire ─────────────────
    const patch: Record<string, unknown> = {};
    if (nbCabines !== (project.nbCabines || 0)) patch.nbCabines = nbCabines;
    if (nomsChanged) patch.nomsCabines = encodeNoms(existingNoms);
    if (Object.keys(patch).length > 0) await updateProject(id, patch);

    // ── Sauvegarde du mappage + signature (KV) ────────────────────────────────
    const allMap = (await getDataFresh<MesureLot>(MAP_KEY).catch(() => [] as MesureLot[]))
      .filter((e) => e.projectId !== id);
    await setData(MAP_KEY, [...allMap, ...entries]);
    const allSigs = sigs.filter((s) => s.projectId !== id);
    await setData(SIG_KEY, [...allSigs, { projectId: id, sig }]);

    return NextResponse.json({ ok: true, unchanged: false, lots: entries, nbCabines });
  } catch (err: any) {
    return NextResponse.json({ error: "server_error", message: String(err?.message || err) }, { status: 500 });
  }
}
