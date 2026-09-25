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
import { notion, databaseId, mapPageToProject, getProject, fournisseursForDisplay, type ContactDetail } from "@/lib/notion";

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
    // Lien « officiel » de l'événement calendrier = Fiche de travail (lien court
    // /f/…, redirige vers le PDF signé). Auparavant : portail client /client/….
    const link = `${origin}/f/${token}`;

    // Détails complets (résout les CONTACTS relationnels + le reste). Repli sur
    // la version « query » si la résolution échoue (le lien reste renvoyé).
    let full: any = project;
    try { full = await getProject(project.id); } catch { full = project; }

    // ── Notes pré-formatées selon le type de RDV (pour l'agent calendrier) ─────
    // Bloc « auto » avec sentinelle → l'agent peut le remplacer sans toucher aux
    // notes écrites à la main. Titres mis en évidence via ***…*** (le calendrier
    // Apple n'accepte pas le vrai gras dans les notes = texte brut).
    const type = (sp.get("type") || "").toLowerCase();
    const nb = full.nbCabines != null ? String(full.nbCabines) : "";
    const cartons = full.nbCartons != null ? String(full.nbCartons) : "";
    const notesLines: string[] = [];
    // Champs courts : titre en **gras** (double) + valeur sur la MÊME ligne.
    const addField = (label: string, val?: string) => { if (val && val.trim()) notesLines.push(`**${label}** : ${val.trim()}`); };
    // Blocs multi-lignes : titre en ***gras*** (triple), valeur sur la ligne
    // SUIVANTE, précédés d'une ligne vide de séparation.
    const addBlock = (label: string, val?: string) => {
      if (!val || !val.trim()) return;
      notesLines.push("");
      notesLines.push(`***${label}*** :`);
      notesLines.push(val.trim());
    };
    const joinArr = (a?: string[]) => (a || []).filter(Boolean).join(", ");
    const fournisseurs = joinArr(fournisseursForDisplay(full.fournisseurs));
    const series = joinArr(full.seriesCabines);
    // Formatte une liste de contacts CRM : « Nom — tél — email », séparés par « ; ».
    const fmtContacts = (list?: ContactDetail[]) => (list || [])
      .map((c) => [c.name, c.phone, c.email].filter(Boolean).join(" — "))
      .filter(Boolean)
      .join(" ; ");

    if (["montage", "mesures", "services", "sav"].includes(type)) {
      // ── Champs courts (double **), une ligne chacun. ──
      addField("Nb. Cabines", nb);
      addField("Nb. de cartons", cartons);
      addField("Fournisseurs", fournisseurs);
      addField("Séries cabines", series);
      if (type === "montage") addField("Emplacement cabine", full.emplacementCabine);
      addField("N° CMD Fournisseurs", full.cmdFournisseurs);
      addField("N° Serv. CMD Fournisseurs", full.servCmdFournisseurs);

      // ── Contacts CRM (triple ***, valeur ligne suivante) — si présents. ──
      addBlock("Contacts Locataires", fmtContacts(full.contactsLocatairesDetails));
      addBlock("Contacts Clients finaux", fmtContacts(full.contactsClientsFinauxDetails));
      addBlock("Contacts Sanitaire", fmtContacts(full.contactsSanitaireDetails));
      addBlock("Contacts DT", fmtContacts(full.contactsDTDetails));
      addBlock("Contacts Architecte", fmtContacts(full.contactsArchitecteDetails));

      // ── Commentaires (triple ***, valeur ligne suivante). ──
      if (type === "montage") addBlock("Commentaires montage", full.commentairesMontages);
      if (type === "mesures") addBlock("Commentaires mesures", full.commentairesMesures);

      // ── Divers infos chantier (double **, précédé d'une ligne vide). ──
      if (full.diversInfosChantier && full.diversInfosChantier.trim()) {
        notesLines.push("");
        notesLines.push(`**Divers infos chantier** : ${full.diversInfosChantier.trim()}`);
      }
    }
    // NB : plus aucun lien de rapport dans les notes (lisibilité du calendrier).
    // La Fiche de travail est désormais le lien « officiel » de l'événement
    // (champ URL, cf. `link` ci-dessus).
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
