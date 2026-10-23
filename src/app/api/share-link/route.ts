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
import { jetonCourt } from "@/lib/jeton-court";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key");

  // ── Auth par clé secrète ───────────────────────────────────────────────────
  if (!process.env.SHARE_LINK_KEY || key !== process.env.SHARE_LINK_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ── Identifiant projet : « q » (ou « tm »), sinon extrait du titre. ─────────
  // Peut être un N° OFR TM (« TM-2600508 ») OU un N° « AS 2026/1707 » présent
  // dans le TITRE du projet (RDV mesures Duka, avec ou sans « / »).
  let ident = (sp.get("q") || sp.get("tm") || "").trim();
  if (!ident) {
    const title = sp.get("title") || "";
    const mm = title.match(/TM-\d+/i) || title.match(/AS\s*\d{4}\s*\/?\s*\d+/i);
    if (mm) ident = mm[0].trim();
  }
  if (!ident) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  // Normalise en NFC : le calendrier macOS envoie souvent les accents en NFD
  // (« 2ème » = e + U+0300) ; sans ça la tokenisation crée des tokens parasites
  // (« 2e ») qui cassent le rattachement par référence.
  ident = ident.normalize("NFC");
  const tmMatch = ident.match(/TM-\d+/i);
  const tm = tmMatch ? tmMatch[0].toUpperCase() : "";

  try {
    let resp: any;
    if (tm) {
      // Recherche par N° OFR TM (rich_text).
      resp = await notion.databases.query({
        database_id: databaseId,
        filter: { property: "N° OFR TM", rich_text: { contains: tm } },
        page_size: 10,
      });
    } else if (/AS\s*\d{4}/i.test(ident)) {
      // Recherche par N° « AS … ». Il vit normalement dans « N° Serv. Mesures
      // Fournisseurs » (rich_text, ex. « AS 2026/2071 ») ; repli sur le TITRE
      // (certains projets ont l'AS dans le nom). On essaie plusieurs variantes de
      // séparateur (« / », « : », espace, collé) et on garde le 1er résultat.
      const am = ident.toUpperCase().match(/AS\s*(\d{4})\D*(\d+)/);
      const variants = am
        ? Array.from(new Set([
            ident.toUpperCase().replace(/\s+/g, " ").trim(),
            `AS ${am[1]}/${am[2]}`, `AS ${am[1]}:${am[2]}`,
            `AS ${am[1]}${am[2]}`, `AS ${am[1]} ${am[2]}`,
          ]))
        : [ident.toUpperCase().replace(/\s+/g, " ").trim()];
      const searchProps: { name: string; kind: "rich_text" | "title" }[] = [
        { name: "N° Serv. Mesures Fournisseurs", kind: "rich_text" },
        { name: "Projet", kind: "title" },
      ];
      resp = { results: [] };
      for (const spec of searchProps) {
        let found = false;
        for (const v of variants) {
          resp = await notion.databases.query({
            database_id: databaseId,
            filter: { property: spec.name, [spec.kind]: { contains: v } } as any,
            page_size: 10,
          });
          if (resp.results?.length) { found = true; break; }
        }
        if (found) break;
      }
    } else {
      // Référence TEXTE = nom du projet (pas encore de n°). On rattache par
      // TOKENS distinctifs en AND sur le titre — robuste aux accents (Notion
      // stocke parfois en NFD, « à » = a+U+0300 → un `contains` sur la chaîne
      // accentuée échoue) et à la ponctuation/tirets (« REZ Gauche » == « REZ-
      // Gauche »). On GARDE les codes d'appartement « 1B/2A/1er » (chiffre+lettre)
      // qui distinguent les lots d'un même immeuble, et les mots ≥3 lettres ;
      // on écarte les tokens accentués et les nombres purs (adresses).
      const STOP = new Set(["rue", "route", "chemin", "avenue", "place", "impasse", "villa",
        "appartement", "etage", "suisse", "sarl", "chez", "residence", "batiment", "immeuble", "lot"]);
      const tokens = Array.from(new Set(
        ident.split(/[^0-9A-Za-zÀ-ÿ]+/).filter(Boolean).filter((t) => {
          if (/[À-ÿ]/.test(t)) return false;                 // accent → NFC/NFD : on écarte
          if (/\d/.test(t)) return /[A-Za-z]/.test(t) && t.length >= 2; // code appart. « 1B »
          return t.length >= 3 && !STOP.has(t.toLowerCase());
        })
      ));
      resp = { results: [] };
      if (tokens.length >= 3) {
        const codes = tokens.filter((t) => /\d/.test(t));
        const letters = tokens.filter((t) => !/\d/.test(t)).sort((a, b) => b.length - a.length);
        const andFilter = (ws: string[]) => ({ and: ws.map((w) => ({ property: "Projet", title: { contains: w } })) });
        // 1) tous les tokens ; 2) codes + 3 mots les plus longs (tolère un token en trop).
        const attempts = [tokens, Array.from(new Set([...codes, ...letters.slice(0, 3)]))];
        for (const ws of attempts) {
          if (ws.length < 2) continue;
          resp = await notion.databases.query({ database_id: databaseId, filter: andFilter(ws) as any, page_size: 10 });
          if (resp.results?.length) break;
        }
      }
    }

    if (!resp.results?.length) {
      return NextResponse.json({ ok: false, error: "not_found", ident }, { status: 404 });
    }

    const projects = resp.results.map(mapPageToProject);
    // Pour un TM : préfère la correspondance exacte sur le n° OFR TM, sinon le 1er.
    const project = (tm
      ? projects.find((p: any) => (p.ofrTM || "").toUpperCase() === tm)
      : null) || projects[0];

    const token = Buffer.from(project.id).toString("base64url");
    const origin = req.nextUrl.origin;
    const type = (sp.get("type") || "").toLowerCase();
    // URL « officielle » de l'événement : MESURES → lien du projet (portail
    // client /client/…) ; autres types → Fiche de travail (lien court /f/…,
    // redirige vers le PDF signé).
    const link = type === "mesures" ? `${origin}/client/${token}` : `${origin}/f/${token}`;

    // Détails complets (résout les CONTACTS relationnels + le reste). Repli sur
    // la version « query » si la résolution échoue (le lien reste renvoyé).
    let full: any = project;
    try { full = await getProject(project.id); } catch { full = project; }

    // ── Notes pré-formatées selon le type de RDV (pour l'agent calendrier) ─────
    // Bloc « auto » avec sentinelle → l'agent peut le remplacer sans toucher aux
    // notes écrites à la main. Titres mis en évidence via ***…*** (le calendrier
    // Apple n'accepte pas le vrai gras dans les notes = texte brut).
    const nb = full.nbCabines != null ? String(full.nbCabines) : "";
    const cartons = full.nbCartons != null ? String(full.nbCartons) : "";
    const notesLines: string[] = [];
    // Champs courts : titre en **gras** (double) + valeur sur la MÊME ligne.
    /* Une valeur sur PLUSIEURS lignes (ex. N° CMD Grossiste : Client / TM /
       Usine) passe tout entière SOUS le titre, une par ligne (23.10.2026). */
    const addField = (label: string, val?: string) => {
      const v = (val || "").trim();
      if (!v) return;
      const lignes = v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (lignes.length > 1) { notesLines.push(`**${label}** :`); notesLines.push(...lignes); }
      else notesLines.push(`**${label}** : ${v}`);
    };
    // Blocs multi-lignes : titre en **gras** (double), valeur sur la ligne
    // SUIVANTE, précédés d'une ligne vide de séparation.
    const addBlock = (label: string, val?: string) => {
      if (!val || !val.trim()) return;
      notesLines.push("");
      notesLines.push(`**${label}** :`);
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
      /* Qui y va, en tout premier : c'est la première question qu'on se pose
         en ouvrant un RDV, et le calendrier ne la montre que si l'on a pensé
         à poser le rendez-vous dans le bon calendrier de couleur. Le champ
         Notion s'appelle « Collaborateurs montages » ; sur le calendrier on
         l'intitule « Collaborateur », plus court à lire. Pour les MESURES, c'est
         plutôt le champ « Mesures traitée par » (qui fait la prise de mesures). */
      addField("Collaborateur", type === "mesures" ? full.mesuresTraiteePar : full.collaborateurs);
      addField("Nb. Cabines", nb);
      addField("Nb. de cartons", cartons);
      addField("Fournisseurs", fournisseurs);
      addField("Séries cabines", series);
      if (type === "montage") addField("Emplacement cabine", full.emplacementCabine);

      // ── Groupe N° CMD (Grossiste / Fournisseurs / Serv.), précédé d'une ligne
      //    vide si au moins un numéro est renseigné. ──
      if ((full.cmdGrossiste && full.cmdGrossiste.trim())
        || (full.cmdFournisseurs && full.cmdFournisseurs.trim())
        || (full.servCmdFournisseurs && full.servCmdFournisseurs.trim())) {
        notesLines.push("");
        addField("N° CMD Grossiste", full.cmdGrossiste);
        addField("N° CMD Fournisseurs", full.cmdFournisseurs);
        addField("N° Serv. CMD Fournisseurs", full.servCmdFournisseurs);
      }

      // ── Contacts CRM (bloc **, valeur ligne suivante) — si présents. ──
      /* « Contacts pour RDV » en premier : c'est la personne qu'on appelle en
         partant, ou quand on sonne et que personne n'ouvre. Les autres
         familles servent après coup. */
      addBlock("Contacts pour RDV", String(full.contactsRDV || "").trim());
      addBlock("Contacts Locataires", fmtContacts(full.contactsLocatairesDetails));
      addBlock("Contacts Clients finaux", fmtContacts(full.contactsClientsFinauxDetails));
      addBlock("Contacts Sanitaire", fmtContacts(full.contactsSanitaireDetails));
      addBlock("Contacts DT", fmtContacts(full.contactsDTDetails));
      addBlock("Contacts Architecte", fmtContacts(full.contactsArchitecteDetails));

      // ── Commentaires (bloc **, valeur ligne suivante). ──
      if (type === "montage") addBlock("Commentaires montage", full.commentairesMontages);
      if (type === "mesures") addBlock("Commentaires mesures", full.commentairesMesures);

      // ── MESURES : lien de téléchargement des « Documents pour prise de
      //    mesures » (route courte /m/<token> → sert les fichiers Notion). ──
      if (type === "mesures" && Array.isArray(full.documentsMesures) && full.documentsMesures.length) {
        notesLines.push("");
        /* Lien COURT (jeton de 22 caractères) précédé d'une icône : le
           Calendrier n'accepte pas de lien caché derrière un mot (texte brut). */
        notesLines.push("**Documents pour prise de mesures** :");
        notesLines.push(`📄 ${origin}/m/${jetonCourt(project.id)}`);
      }

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
      ident,
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
