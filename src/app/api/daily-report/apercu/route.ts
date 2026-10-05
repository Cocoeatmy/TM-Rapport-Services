/**
 * /api/daily-report/apercu — ce que dit le rapport du jour, sans l'envoyer.
 *
 * Le rapport part par e-mail à 6 h 45 ; encore faut-il pouvoir le relire à
 * 10 h, ou vérifier avant l'envoi ce qu'un collaborateur va recevoir. Cette
 * route rend le même contenu, calculé par les mêmes fonctions, plus les deux
 * compteurs de contrôle — anomalies bloquantes et dossiers à relancer.
 *
 * Un collaborateur ne voit que SES montages ; un administrateur voit la
 * répartition complète.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAllUsers } from "@/lib/auth";
import { getAllActiveProjects, getAllProjectsRaw, type Project } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { isMontageOnDay, collaboratorOnProject, isoDay } from "@/lib/daily-report";
import { appliquer, compterFiches, compterFichesVives, REGLES_ANOMALIES, REGLES_RELANCES } from "@/lib/regles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Le strict nécessaire à l'affichage — pas les photos ni les documents. */
function leger(p: Project) {
  return {
    id: p.id,
    ofrTM: p.ofrTM || "",
    projet: p.projet || "Sans nom",
    nomChantier: p.nomChantier || "",
    adresseChantier: p.adresseChantier || "",
    heure: (p.dateMontage || "").match(/T(\d{2}:\d{2})/)?.[1] || "",
    collaborateurs: p.collaborateurs || "",
    nbCabines: p.nbCabines ?? null,
    typeServices: p.typeServices || [],
    emplacementCabine: p.emplacementCabine || "",
    contactsRDV: p.contactsRDV || "",
    commentaires: p.commentairesMontages || "",
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const jour = req.nextUrl.searchParams.get("date") || isoDay(new Date());
  const estAdmin = (user as any).role === "admin";

  try {
    const actifs = await getAllActiveProjects();
    const montages = actifs.filter((p) => isMontageOnDay(p, jour));

    const moi = montages.filter((p) => collaboratorOnProject(p, String((user as any).name || "")));

    /* Répartition par collaborateur : la même règle que l'envoi — « Team »
       concerne tout le monde, un binôme concerne les deux. Un montage peut
       donc apparaître dans plusieurs colonnes, comme dans les e-mails. */
    const parCollaborateur = estAdmin
      ? (await getAllUsers())
        .map((u) => ({
          nom: u.name,
          email: u.email || "",
          role: u.role,
          projets: montages.filter((p) => collaboratorOnProject(p, u.name)).map(leger),
        }))
        .filter((x) => x.projets.length > 0)
        .sort((a, b) => b.projets.length - a.projets.length)
      : [];

    /* Les deux compteurs de contrôle ne concernent que l'administration :
       un monteur n'a pas à relancer une facture. */
    let alertes: { anomalies: number; relances: number } | null = null;
    if (estAdmin) {
      const tous = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
      const anomalies = appliquer(REGLES_ANOMALIES, tous)
        .filter((g) => g.regle.gravite === "bloquant");
      alertes = {
        anomalies: compterFiches(anomalies),
        /* Les fiches VIVANTES seulement : compter l'arriéré de dossiers
           jamais clôturés donnait un millier d'unités que personne ne
           regardait plus. Le détail reste sur la page Relances. */
        relances: compterFichesVives(appliquer(REGLES_RELANCES, tous)),
      };
    }

    return NextResponse.json({
      date: jour,
      nom: (user as any).name || "",
      estAdmin,
      total: montages.length,
      moi: moi.map(leger),
      parCollaborateur,
      alertes,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
