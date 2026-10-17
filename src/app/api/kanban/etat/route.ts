/**
 * Ce que le Kanban doit savoir en plus des projets.
 *
 * Trois choses, en une seule requête : le journal des déplacements, les
 * priorités posées à la main, et les règles qui décident des couleurs. Trois
 * appels séparés au chargement d'une page qu'on ouvre vingt fois par jour,
 * c'est trois fois l'occasion d'attendre.
 *
 * Les priorités manuelles sont rangées ICI, et non dans Notion. Créer une
 * propriété Notion pour un confort d'affichage l'imposerait à tous les écrans
 * et à tous les exports, pour une information qui n'appartient pas au dossier
 * mais à la façon dont on le pilote. Le jour où elle devra voyager hors de
 * l'application, il sera temps d'en faire une vraie colonne.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { lireHistorique } from "@/lib/kanban-historique";
import {
  ORDRE_INDICATEURS, REGLES_PAR_DEFAUT, type Indicateur, type Regles,
} from "@/lib/kanban-indicateurs";

export const dynamic = "force-dynamic";

const CLE = "kanban-reglages";

interface LigneReglages {
  id: string;
  priorites?: Record<string, Indicateur>;
  regles?: Partial<Regles>;
}

async function lire(frais = false): Promise<{ priorites: Record<string, Indicateur>; regles: Regles }> {
  try {
    const lignes = frais ? await getDataFresh<LigneReglages>(CLE) : await getData<LigneReglages>(CLE);
    const l = lignes?.[0];
    return {
      priorites: l?.priorites || {},
      regles: { ...REGLES_PAR_DEFAUT, ...(l?.regles || {}) },
    };
  } catch {
    return { priorites: {}, regles: REGLES_PAR_DEFAUT };
  }
}

export async function GET() {
  const v = await exigerDroit("kanban.voir");
  if ("refus" in v) return v.refus;

  const [{ priorites, regles }, historique] = await Promise.all([lire(), lireHistorique()]);
  return NextResponse.json({ priorites, regles, historique });
}

function indicateurValide(x: unknown): x is Indicateur {
  return typeof x === "string" && (ORDRE_INDICATEURS as string[]).includes(x);
}

export async function PUT(request: NextRequest) {
  let corps: { priorites?: Record<string, string | null>; regles?: Partial<Regles> };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }

  /* Poser une priorité à la main revient à annoter un dossier : le droit de
     modifier un projet suffit. Changer les RÈGLES change la lecture du
     tableau pour tout le monde — cela relève de l'administration. */
  if (corps.priorites) {
    const v = await exigerDroit("projets.modifier");
    if ("refus" in v) return v.refus;
  }
  if (corps.regles) {
    const v = await exigerDroit("administration.droits");
    if ("refus" in v) return v.refus;
  }

  const actuel = await lire(true);
  const priorites = { ...actuel.priorites };
  for (const [id, valeur] of Object.entries(corps.priorites || {})) {
    /* `null` efface la priorité manuelle : le projet retrouve sa couleur
       calculée, celle qui dit la vérité sur son état. */
    if (valeur === null) delete priorites[id];
    else if (indicateurValide(valeur)) priorites[id] = valeur;
  }

  const regles: Regles = { ...actuel.regles };
  if (corps.regles) {
    const r = corps.regles;
    if (typeof r.nouveauHeures === "number" && r.nouveauHeures > 0) regles.nouveauHeures = Math.min(r.nouveauHeures, 720);
    if (typeof r.relanceOffreJours === "number" && r.relanceOffreJours > 0) regles.relanceOffreJours = Math.min(r.relanceOffreJours, 365);
    if (typeof r.relanceSuivanteJours === "number" && r.relanceSuivanteJours > 0) regles.relanceSuivanteJours = Math.min(r.relanceSuivanteJours, 365);
    if (Array.isArray(r.desactives)) regles.desactives = r.desactives.filter(indicateurValide);
  }

  try {
    await setData<LigneReglages>(CLE, [{ id: "reglages", priorites, regles }]);
  } catch {
    return NextResponse.json({ error: "Enregistrement impossible. Rien n'a été modifié." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, priorites, regles });
}
