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
import { exigerDroit } from "@/lib/droits-serveur";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { appliquer, compterFiches, compterFichesVives, DORMANT_JOURS, REGLES_ANOMALIES, REGLES_RELANCES } from "@/lib/regles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const jeu = req.nextUrl.searchParams.get("jeu") === "relances" ? "relances" : "anomalies";
  /* Toutes les fiches, hors périmètre : réservé à qui en a le droit. Les
     relances (dossiers, factures qui dorment) relèvent de « argent.relances » ;
     les anomalies de saisie, d'une page d'administration. Il suffisait
     auparavant d'être connecté. */
  const v = await exigerDroit(jeu === "relances" ? "argent.relances" : "administration.droits");
  if ("refus" in v) return v.refus;
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
