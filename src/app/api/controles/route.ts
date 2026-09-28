/**
 * /api/controles — anomalies de saisie et relances, calculées SUR LE SERVEUR.
 *
 * Les règles ont besoin de tous les projets, terminés compris (une marque
 * manquante ne se voit que sur un montage clos, une facture qui dort aussi).
 * Les faire calculer par le navigateur imposerait de lui envoyer les ~1350
 * fiches complètes à chaque ouverture — lourd sur un téléphone en 4G. Le
 * serveur les a déjà en cache : il renvoie ici le strict nécessaire à
 * l'affichage, quelques dizaines de lignes.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { appliquer, compterFiches, compterFichesVives, DORMANT_JOURS, REGLES_ANOMALIES, REGLES_RELANCES } from "@/lib/regles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  const jeu = req.nextUrl.searchParams.get("jeu") === "relances" ? "relances" : "anomalies";
  const regles = jeu === "relances" ? REGLES_RELANCES : REGLES_ANOMALIES;

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    const groupes = appliquer(regles, projets);
    return NextResponse.json({
      jeu,
      fiches: compterFiches(groupes),
      /* Deux compteurs, parce que ce sont deux travaux : ce qui se relance
         cette semaine, et l'arriéré de fiches jamais clôturées. */
      fichesVives: compterFichesVives(groupes),
      dormantJours: DORMANT_JOURS,
      total: groupes.reduce((n, g) => n + g.projets.length, 0),
      groupes: groupes.map((g) => ({
        id: g.regle.id,
        titre: g.regle.titre,
        pourquoi: g.regle.pourquoi,
        gravite: g.regle.gravite,
        projets: g.projets.map(({ projet, detail, priorite }) => ({
          id: projet.id,
          ofrTM: projet.ofrTM || "",
          projet: projet.projet || "Sans nom",
          etatCMD: projet.etatCMD || "",
          collaborateurs: projet.collaborateurs || "",
          journal: projet.journalEchanges || "",
          detail,
          score: priorite.score,
          raisons: priorite.raisons,
          dormant: priorite.dormant,
        })),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
