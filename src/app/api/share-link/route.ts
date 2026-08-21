/**
 * /api/share-link?tm=TM-2600508&key=XXXX[&format=text]
 * /api/share-link?title=Montage%20-%20TM-2600508%20-%20...&key=XXXX
 *
 * Renvoie le lien client (portail) d'un projet à partir de son numéro TM.
 * Utilisé par l'agent calendrier macOS (AppleScript) pour remplir
 * automatiquement le champ URL des RDV.
 *
 * Public mais protégé par une clé secrète (SHARE_LINK_KEY) — voir middleware.ts
 * qui laisse passer /api/share-link sans cookie d'auth.
 *
 * - tm     : numéro TM exact (ex. TM-2600508). Prioritaire.
 * - title  : titre complet du RDV ; le n° TM est extrait via /TM-\d+/.
 * - format : "text" → renvoie le lien brut (text/plain) ; sinon JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key");

  // ── Auth par clé secrète ───────────────────────────────────────────────────
  if (!process.env.SHARE_LINK_KEY || key !== process.env.SHARE_LINK_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ── Numéro TM (paramètre tm, sinon extrait du titre) ───────────────────────
  let tm = (sp.get("tm") || "").trim().toUpperCase();
  if (!tm) {
    const title = sp.get("title") || "";
    const m = title.match(/TM-\d+/i);
    if (m) tm = m[0].toUpperCase();
  }
  if (!tm) {
    return NextResponse.json({ ok: false, error: "missing_tm" }, { status: 400 });
  }

  try {
    // ── Recherche Notion par OFR TM ──────────────────────────────────────────
    const resp: any = await notion.databases.query({
      database_id: databaseId,
      filter: { property: "N° OFR TM", rich_text: { contains: tm } },
      page_size: 10,
    });

    if (!resp.results?.length) {
      return NextResponse.json({ ok: false, error: "not_found", tm }, { status: 404 });
    }

    const projects = resp.results.map(mapPageToProject);
    // Préfère une correspondance exacte sur le n° OFR TM, sinon le 1er résultat.
    const project =
      projects.find((p: any) => (p.ofrTM || "").toUpperCase() === tm) || projects[0];

    const token = Buffer.from(project.id).toString("base64url");
    const origin = req.nextUrl.origin;
    const link = `${origin}/client/${token}`;

    // ── Notes pré-formatées selon le type de RDV (pour l'agent calendrier) ─────
    // Bloc « auto » avec sentinelle → l'agent peut le remplacer sans toucher aux
    // notes écrites à la main.
    const type = (sp.get("type") || "").toLowerCase();
    const nb = project.nbCabines != null ? String(project.nbCabines) : "";
    const notesLines: string[] = [];
    const add = (label: string, val?: string) => { if (val && val.trim()) notesLines.push(`${label} : ${val.trim()}`); };
    if (type === "montage") {
      add("Nb. cabines", nb);
      add("Emplacement cabine", project.emplacementCabine);
      add("Contacts RDV", project.contactsRDV);
      add("Commentaires montage", project.commentairesMontages);
    } else if (type === "mesures") {
      add("Nb. cabines", nb);
      add("Contacts RDV", project.contactsRDV);
      add("Commentaires mesures", project.commentairesMesures);
    } else if (type === "services") {
      add("Contacts RDV", project.contactsRDV);
    }
    const NOTES_SENTINEL = "——— Infos projet (auto) ———";
    const notes = notesLines.length ? `${NOTES_SENTINEL}\n${notesLines.join("\n")}` : "";

    if (sp.get("format") === "text") {
      return new NextResponse(link, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({
      ok: true,
      tm,
      projet: project.projet,
      link,
      notes,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
