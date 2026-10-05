/**
 * /api/rapport-journalier/cibles?date=YYYY-MM-DD
 *
 * Qui travaille ce jour-là : les monteurs concernés, et les équipes telles
 * qu'elles sont saisies. Rien d'autre — deux listes de noms.
 *
 * Cette route existe pour sa VITESSE. L'aperçu du rapport du jour rendait déjà
 * l'information, mais il lit au passage tous les projets de la base et y
 * applique les dix-neuf règles d'anomalie et de relance : plusieurs secondes,
 * pour remplir une liste déroulante qu'on ouvre à chaque changement de date.
 * Ici, une seule requête Notion filtrée sur la journée.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAllUsers } from "@/lib/auth";
import { getProjectsMontageJour } from "@/lib/notion";
import { isMontageOnDay, collaboratorOnProject, isoDay } from "@/lib/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Une équipe compte PLUSIEURS personnes.
 *
 * Un montage saisi au seul prénom — « Miguel » — n'est pas une équipe : c'est
 * le même homme que le « Miguel Roberto » de la liste des monteurs, et le
 * proposer deux fois laisse croire à deux feuilles de route différentes.
 * « Team » est retenu bien qu'il ne porte pas d'esperluette : c'est ainsi
 * qu'on note un montage à plusieurs sans détailler qui s'y trouvait.
 */
function estEquipe(nom: string): boolean {
  return nom.includes("&") || /\bteams?\b/i.test(nom);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }

  const jour = req.nextUrl.searchParams.get("date") || isoDay(new Date());

  try {
    const montages = (await getProjectsMontageJour(jour))
      .filter((p) => isMontageOnDay(p, jour));

    /* Les monteurs viennent des comptes, pas des chaînes saisies : c'est leur
       nom complet qui doit s'afficher, et la même règle d'appartenance que
       l'envoi du matin qui décide s'ils sont concernés. */
    const monteurs = (await getAllUsers())
      .filter((u) => montages.some((p) => collaboratorOnProject(p, u.name)))
      .map((u) => u.name)
      .sort((a, b) => a.localeCompare(b, "fr"));

    const equipes = [...new Set(montages
      .map((p) => (p.collaborateurs || "").normalize("NFC").trim())
      .filter((v) => v && estEquipe(v)))]
      .sort((a, b) => a.localeCompare(b, "fr"));

    return NextResponse.json({ date: jour, monteurs, equipes, total: montages.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
