/**
 * Les signalements ouverts, prêts à poser dans l'app Rappels d'Apple.
 *
 * Consommée par l'agent `scripts/rappels` qui tourne sur le Mac. Même clé
 * partagée que l'agent calendrier (`SHARE_LINK_KEY`) : ces deux agents sont
 * la même machine, et une deuxième clé à tenir à jour ne protégerait rien de
 * plus.
 *
 * Route PUBLIQUE au sens du middleware, mais fermée par la clé : osascript ne
 * sait pas se connecter, et un agent qui porterait un vrai compte serait un
 * mot de passe de plus posé en clair sur un disque.
 *
 * Elle ne renvoie que ce que l'agent doit écrire — titre, notes, lien,
 * priorité. Toute la mise en forme est faite ici, où elle se teste
 * (`rappels-signalements.ts`), et non dans le script JXA d'en face.
 */
import { NextRequest, NextResponse } from "next/server";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { getAllProjectsRaw, notion, type Project } from "@/lib/notion";
import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";
import {
  listeDesRappels,
  type SignalementBrut,
  type FicheProjet,
} from "@/lib/rappels-signalements";

export const dynamic = "force-dynamic";
/* Lire les projets actifs depuis Notion peut demander une vingtaine de
   secondes sur instance froide ; l'agent, lui, a tout son temps. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cle = process.env.SHARE_LINK_KEY;
  if (!cle) {
    return NextResponse.json(
      { ok: false, error: "cle_absente", message: "SHARE_LINK_KEY non configurée" },
      { status: 503 },
    );
  }
  if (req.nextUrl.searchParams.get("key") !== cle) {
    return NextResponse.json({ ok: false, error: "non_autorise" }, { status: 401 });
  }

  try {
    /* TOUS les projets, terminés compris — et non les seuls actifs. Un
       signalement traîne souvent sur un chantier clos depuis des mois :
       trente-sept des quarante rappels perdaient leur n° TM, qui est
       justement la première chose qu'on cherche. La clé de cache est celle
       que « tous les projets » alimente déjà, et qu'un cron réchauffe. */
    const [pieces, defauts, projets] = await Promise.all([
      getData<SignalementBrut>("pieces"),
      getData<SignalementBrut>("defauts"),
      cachedOrFetch<Project[]>("projects-all-raw", getAllProjectsRaw),
    ]);

    const fiches = new Map<string, FicheProjet>();
    for (const p of projets) fiches.set(p.id, { ofrTM: p.ofrTM, projet: p.projet });

    const liste = listeDesRappels(
      Array.isArray(pieces) ? pieces : [],
      Array.isArray(defauts) ? defauts : [],
      fiches,
      { origine: req.nextUrl.origin },
    );

    return NextResponse.json({
      ok: true,
      le: new Date().toISOString(),
      /* L'agent lit cette ligne pour savoir s'il doit remonter les cases
         cochées : ici oui, cocher un rappel règle le signalement. */
      cloture: "deux-sens",
      /* Les familles de marqueurs que cette liste gouverne. Sans elles,
         l'agent cocherait les rappels d'une AUTRE catégorie au seul motif
         qu'ils ne figurent pas dans sa propre liste. */
      familles: ["piece", "defaut"],
      liste,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}

/**
 * Clôturer depuis l'app Rappels.
 *
 * L'agent envoie les clés des rappels qu'on a cochés à la main alors que le
 * signalement est encore ouvert côté app. Le trajet devient donc un
 * aller-retour : cocher dans Rappels règle le signalement, régler dans l'app
 * coche le rappel.
 *
 * Les écritures sont exactement celles du bouton « réglé » de l'app — statut,
 * drapeau, horodatage, et le report Notion « Soucis montages clôturé » quand
 * tous les défauts d'un chantier sont réglés. Un commentaire est ajouté pour
 * qu'on sache d'où vient la clôture : une case cochée sans trace, six mois
 * plus tard, ne s'explique plus.
 */
export async function POST(req: NextRequest) {
  const cle = process.env.SHARE_LINK_KEY;
  if (!cle) {
    return NextResponse.json({ ok: false, error: "cle_absente" }, { status: 503 });
  }

  let corps: { key?: string; cloturer?: string[] };
  try { corps = await req.json(); } catch { corps = {}; }
  if (corps.key !== cle) {
    return NextResponse.json({ ok: false, error: "non_autorise" }, { status: 401 });
  }

  const cles = Array.isArray(corps.cloturer) ? corps.cloturer : [];
  if (cles.length === 0) return NextResponse.json({ ok: true, clos: 0 });

  const voulus = { piece: new Set<string>(), defaut: new Set<string>() };
  for (const c of cles) {
    const m = /^tm:(piece|defaut):(.+)$/.exec(String(c));
    if (m) voulus[m[1] as "piece" | "defaut"].add(m[2]);
  }

  const trace = {
    user: "App Rappels",
    message: "Réglé depuis l'app Rappels (case cochée).",
    timestamp: Date.now(),
  };
  let clos = 0;
  const projetsTouches = new Set<string>();

  if (voulus.piece.size > 0) {
    const pieces = await getDataFresh<any>("pieces");
    let change = false;
    for (const p of pieces) {
      if (!voulus.piece.has(p.id)) continue;
      p.status = "recu";
      p.resolved = true;
      if (!p.resolvedAt) p.resolvedAt = Date.now();
      p.comments = [...(p.comments || []), trace];
      change = true;
      clos++;
    }
    if (change) await setData("pieces", pieces);
  }

  if (voulus.defaut.size > 0) {
    const defauts = await getDataFresh<any>("defauts");
    let change = false;
    for (const d of defauts) {
      if (!voulus.defaut.has(d.id)) continue;
      d.status = "resolu";
      d.resolved = true;
      d.comments = [...(d.comments || []), trace];
      if (d.projectId) projetsTouches.add(d.projectId);
      change = true;
      clos++;
    }
    if (change) {
      await setData("defauts", defauts);
      /* Même report que le bouton de l'app : la case projet n'est cochée que
         si TOUS les défauts du chantier sont réglés. Non bloquant. */
      for (const projectId of projetsTouches) {
        try {
          const duProjet = defauts.filter((d: any) => d.projectId === projectId);
          const tous = duProjet.length > 0 && duProjet.every((d: any) => d.resolved);
          await notion.pages.update({
            page_id: projectId,
            properties: { "Soucis montages clôturé": { checkbox: tous } },
          });
          await invalidateCache(`project-${projectId}`);
        } catch { /* le règlement est déjà enregistré ; le report réessaiera */ }
      }
    }
  }

  return NextResponse.json({ ok: true, clos });
}
