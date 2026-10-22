import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { getProject, updateProject } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { estIssue, heureAppelValide, ligneJournal, rangAppel, type Appel, type SuiviProjet } from "@/lib/suivi-appels";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Le suivi des appels des chantiers « à fixer » (22.10.2026).
 *
 * GET  : tous les suivis, { [projectId]: Appel[] } — la liste les lit d'un coup.
 * POST : note UN appel. Il est rangé dans le magasin de l'app (adossé à
 *        Notion) et recopié en clair dans le journal Notion du projet
 *        (« Journal des échanges », ou « Journal d'appel SAV » pour un SAV).
 *        Si l'écriture du journal échoue, l'appel reste enregistré : la
 *        réponse le dit.
 * Rien n'est jamais effacé : on ajoute, on ne réécrit pas.
 */

const CLE = "suivi-appels";

async function utilisateur(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  return token ? await verifyToken(token) : null;
}

export async function GET(request: NextRequest) {
  const user = await utilisateur(request);
  if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const liste = await getData<SuiviProjet>(CLE).catch(() => [] as SuiviProjet[]);
  const out: Record<string, Appel[]> = {};
  for (const s of liste) if (s?.projectId && Array.isArray(s.appels)) out[s.projectId] = s.appels;
  return NextResponse.json(out);
}

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const user = await utilisateur(request);
  if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const projectId = texte(b.projectId, 64);
  if (!projectId || !estIssue(b.issue)) return NextResponse.json({ error: "Projet et issue requis" }, { status: 400 });
  const rappelLe = typeof b.rappelLe === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.rappelLe) ? b.rappelLe : null;
  if (b.issue === "rappeler" && !rappelLe) return NextResponse.json({ error: "Date de rappel requise" }, { status: 400 });
  const liste = texte(b.liste, 16) || null;
  /* Appel noté après coup : l'heure réelle de l'appel, fournie par l'app. */
  const maintenant = new Date().toISOString();
  let le = maintenant;
  if (b.le != null && b.le !== "") {
    const v = heureAppelValide(b.le);
    if (!v) return NextResponse.json({ error: "Jour d'appel invalide (dans le futur ou plus de 90 jours)" }, { status: 400 });
    le = v;
  }
  const apres = Date.parse(maintenant) - Date.parse(le) > 5 * 60_000;

  const appel: Appel = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    le,
    ...(apres ? { saisiLe: maintenant } : {}),
    ...(b.sansHeure === true && le !== maintenant ? { sansHeure: true } : {}),
    issue: b.issue,
    rappelLe,
    note: texte(b.note, 200) || null,
    par: String(user.name || user.email || "").split(/\s+/)[0] || "?",
    liste,
  };

  /* Lecture FRAÎCHE avant réécriture (le cache de 60 s est par instance) ;
     un échec de lecture n'écrit RIEN — jamais une liste vide par-dessus. */
  let tous: SuiviProjet[];
  try {
    tous = await getDataFresh<SuiviProjet>(CLE);
  } catch {
    return NextResponse.json({ error: "Lecture impossible — réessayez dans un instant" }, { status: 503 });
  }
  const i = tous.findIndex((s) => s?.projectId === projectId);
  if (i >= 0) tous[i] = { projectId, appels: [...(tous[i].appels || []), appel] };
  else tous.push({ projectId, appels: [appel] });
  await setData(CLE, tous);

  /* La trace lisible dans Notion : une ligne ajoutée à la fin du journal. */
  let journal = true;
  try {
    const champ = liste === "sav" ? "journalAppelSav" : "journalEchanges";
    const p = await getProject(projectId) as unknown as Record<string, unknown>;
    const avant = String(p[champ] || "").replace(/\s+$/, "");
    await updateProject(projectId, { [champ]: `${avant ? `${avant}\n` : ""}${ligneJournal(appel, rangAppel((i >= 0 ? tous[i] : tous[tous.length - 1]).appels, appel))}` } as never);
    await invalidateCache(`project-${projectId}`);
  } catch (e) {
    journal = false;
    console.warn("[appels] journal Notion non mis à jour :", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, appel, appels: (i >= 0 ? tous[i] : tous[tous.length - 1]).appels, journal });
}
