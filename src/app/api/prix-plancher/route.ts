/**
 * /api/prix-plancher — le prix minimum d'un chantier (lib/prix-plancher).
 *
 * PROPRIÉTAIRE SEUL : coûts, salaires et montants bexio n'atteignent aucun
 * autre compte (même règle que /api/finances).
 *
 *   GET  ?options=1                      séries et fournisseurs connus
 *   GET  ?serie=&fournisseur=&cabines=&adresse=   calculateur
 *   GET  ?projet=<id>                    un dossier, et son offre bexio
 *   POST { lignes: [{ nr, projetId }] }  plusieurs offres (Devis en attente) ;
 *                                         adresses lues dans le cache seulement
 *
 * Ne lit que des copies (Redis, cache des projets) et n'écrit nulle part.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { estProprietaire } from "@/lib/droits-serveur";
import { getData } from "@/lib/kv-store";
import { getAllProjectsRaw, getProjectsCmdTermine, type Project } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher, type IndexFacturation } from "@/lib/bexio-rapprochement";
import { calculerPrixPlancher, verdictOffre, type PrixPlancher } from "@/lib/prix-plancher";
import { lieuDepot, trajet, DEPOT, type Lieu } from "@/lib/tournee";
import { regionLabel, cantonOf } from "@/lib/swiss-cantons";
import { positionDe, CLE_CACHE_GEOCODE, type Entree } from "@/lib/geocode";
import { numerosOffre } from "@/lib/devis-attente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function proprietaire(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try {
    const user = await verifyToken(token);
    return !!user && user.role === "admin" && (await estProprietaire(user));
  } catch { return false; }
}

interface Contexte {
  historique: Project[];
  valeurs: Record<string, unknown>;
  recettes: Record<string, { ht: number; estime: boolean }>;
  idx: IndexFacturation | null;
  geocache: Entree[];
  depot: Lieu;
}

async function contexte(): Promise<Contexte> {
  const [historique, finances, copie, geocache] = await Promise.all([
    cachedOrFetch<Project[]>("projects-cmd-termine", getProjectsCmdTermine),
    getData<Record<string, unknown>>("finances").catch(() => []),
    lireCopieBexio().catch(() => null),
    getData<Entree>(CLE_CACHE_GEOCODE).catch(() => [] as Entree[]),
  ]);
  const recettes: Contexte["recettes"] = {};
  let idx: IndexFacturation | null = null;
  if (copie) {
    idx = indexerFacturation(copie.offres, copie.factures);
    for (const p of historique) {
      const r = rapprocher(p.ofrTM, idx);
      if (!r.offre || !r.factures.length) continue;
      const ht = r.factures.reduce((s, f) => s + (f.ht ?? f.total), 0);
      for (const nr of numerosOffre(p.ofrTM)) recettes[nr] = { ht, estime: false };
    }
  }
  const posDepot = await positionDe(DEPOT, geocache);
  return { historique, valeurs: finances[0] || {}, recettes, idx, geocache, depot: lieuDepot(posDepot) };
}

async function trajetVers(adresse: string, c: Contexte, resoudre: boolean) {
  if (!adresse.trim()) return null;
  const pos = await positionDe(adresse, c.geocache, resoudre);
  const npa = (adresse.match(/\b(\d{4})\b/) || [])[1] || "";
  if (!pos && !npa) return null;
  const lieu: Lieu = { npa, region: regionLabel(adresse), canton: cantonOf(adresse) || "", pos: pos || undefined };
  return trajet(c.depot, lieu);
}

function calculerPourProjet(p: Project, c: Contexte, t: { minutes: number; km: number } | null): PrixPlancher {
  return calculerPrixPlancher({
    serie: p.seriesCabines?.[0],
    fournisseur: p.fournisseurs?.[0],
    cabines: Number(p.nbCabines) || 1,
    trajet: t,
  }, c.historique, c.valeurs, c.recettes);
}

function offreHT(nr: string, c: Contexte): number | null {
  const o = c.idx?.offreParNr.get(nr.trim().toUpperCase());
  if (!o) return null;
  return Math.round((o.ht ?? o.total) * 100) / 100;
}

export async function GET(req: NextRequest) {
  if (!(await proprietaire(req))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const c = await contexte();

  if (q.get("options")) {
    const series = new Map<string, number>(), fournisseurs = new Map<string, number>();
    for (const p of c.historique) {
      for (const s of p.seriesCabines || []) series.set(s, (series.get(s) || 0) + 1);
      for (const f of p.fournisseurs || []) fournisseurs.set(f, (fournisseurs.get(f) || 0) + 1);
    }
    const trier = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nom, n]) => ({ nom, n }));
    /* Pour le choix de la série : à quel fournisseur elle appartient. */
    const serieFournisseur: Record<string, string> = {};
    for (const p of c.historique) for (const s of p.seriesCabines || []) if (p.fournisseurs?.[0]) serieFournisseur[s] ??= p.fournisseurs[0];
    return NextResponse.json({ series: trier(series), fournisseurs: trier(fournisseurs), serieFournisseur });
  }

  const projetId = q.get("projet");
  if (projetId) {
    const tous = await cachedOrFetch<Project[]>("projects-all-raw", getAllProjectsRaw);
    const p = tous.find((x) => x.id === projetId || x.id.replace(/-/g, "") === projetId.replace(/-/g, ""));
    if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    const t = await trajetVers(p.adresseChantier || "", c, true);
    const resultat = calculerPourProjet(p, c, t);
    const nrs = numerosOffre(p.ofrTM);
    const offres = nrs.map((nr) => {
      const ht = offreHT(nr, c);
      return ht === null ? null : { nr, ht, verdict: verdictOffre(ht, resultat) };
    }).filter(Boolean);
    return NextResponse.json({
      resultat, offres,
      entree: { serie: p.seriesCabines?.[0] || null, fournisseur: p.fournisseurs?.[0] || null, cabines: Number(p.nbCabines) || 1, adresse: p.adresseChantier || "", trajet: t },
    });
  }

  const adresse = q.get("adresse") || "";
  const t = await trajetVers(adresse, c, true);
  const resultat = calculerPrixPlancher({
    serie: q.get("serie") || undefined,
    fournisseur: q.get("fournisseur") || undefined,
    cabines: Number(q.get("cabines")) || 1,
    trajet: t,
  }, c.historique, c.valeurs, c.recettes);
  return NextResponse.json({ resultat, trajet: t });
}

export async function POST(req: NextRequest) {
  if (!(await proprietaire(req))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const corps = await req.json().catch(() => null) as { lignes?: { nr?: string; projetId?: string }[] } | null;
  const lignes = (corps?.lignes || []).filter((l) => l?.nr && l?.projetId).slice(0, 400);
  const c = await contexte();
  const tous = await cachedOrFetch<Project[]>("projects-all-raw", getAllProjectsRaw);
  const parId = new Map(tous.map((p) => [p.id.replace(/-/g, ""), p]));
  const sortie: Record<string, { plancher: number; verdict: string; offreHT: number; habituel: number | null; base: string; chantiers: number }> = {};
  for (const l of lignes) {
    const p = parId.get(String(l.projetId).replace(/-/g, ""));
    const ht = offreHT(String(l.nr), c);
    if (!p || ht === null) continue;
    const t = await trajetVers(p.adresseChantier || "", c, false);
    const r = calculerPourProjet(p, c, t);
    sortie[String(l.nr).toUpperCase()] = {
      plancher: r.plancher, verdict: verdictOffre(ht, r), offreHT: ht,
      habituel: r.habituel?.median ?? null, base: r.fiabilite.base, chantiers: r.fiabilite.chantiers,
    };
  }
  return NextResponse.json({ offres: sortie });
}
