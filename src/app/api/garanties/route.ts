/**
 * /api/garanties — ce que nous avons posé à une adresse.
 *
 * Trois ans après la pose, une régie appelle pour une cabine cassée. Retrouver
 * la marque, la série, la date et les documents de garantie se fait aujourd'hui
 * en fouillant les projets ; cette route répond en une recherche.
 *
 * Elle ne regarde QUE les montages terminés : un projet en cours n'a rien à
 * faire dans un registre de garanties.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw, type Project } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { adresseDe, parseNomsCabines } from "@/lib/chantiers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normaliser(v: string): string {
  return (v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function ligne(p: Project) {
  const a = adresseDe(p as never);
  const noms = parseNomsCabines(p.nomsCabines || "");
  return {
    id: p.id,
    ofrTM: p.ofrTM || "",
    projet: p.projet || "Sans nom",
    adresse: p.adresseChantier || "",
    localite: [a.npa, a.ville].filter(Boolean).join(" "),
    datePose: p.dateMontage,
    marques: p.fournisseurs || [],
    series: p.seriesCabines || [],
    cabines: p.nbCabines ?? null,
    lots: Object.values(noms).filter(Boolean),
    monteurs: p.collaborateurs || "",
    grossiste: (p.grossistesNames || []).join(", "),
    sanitaire: (p.sanitaireNames || []).join(", "),
    /* On ne transmet pas les fichiers, seulement leur PRÉSENCE : la fiche du
       projet sert à les ouvrir, et une liste de liens Notion expirés serait
       plus trompeuse qu'utile. */
    garanties: (p.photosGaranties || []).length,
    qrCodes: (p.photosQRCode || []).length,
    photos: (p.photosMontage || []).length,
    sav: !!p.sav || !!p.dateSAVRecu,
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  const q = normaliser((req.nextUrl.searchParams.get("q") || "").trim());
  if (q.length < 2) return NextResponse.json({ resultats: [], total: 0 });

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    const mots = q.split(/\s+/).filter(Boolean);

    const poses = projets.filter((p) => p.etatCMD === "Terminé" && p.dateMontage);
    const trouves = poses.filter((p) => {
      const foin = normaliser([
        p.projet, p.adresseChantier, p.ofrTM, p.nomsCabines,
        (p.fournisseurs || []).join(" "), (p.seriesCabines || []).join(" "),
        (p.sanitaireNames || []).join(" "), (p.grossistesNames || []).join(" "),
        p.collaborateurs,
      ].join(" "));
      return mots.every((m) => foin.includes(m));
    });

    return NextResponse.json({
      total: trouves.length,
      // Du plus récent au plus ancien : une garantie récente se consulte plus.
      resultats: trouves
        .sort((a, b) => String(b.dateMontage || "").localeCompare(String(a.dateMontage || "")))
        .slice(0, 80)
        .map(ligne),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
