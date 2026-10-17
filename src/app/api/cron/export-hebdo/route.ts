/**
 * La copie hebdomadaire qui sort de chez Notion.
 *
 * ── Ce qu'elle ajoute aux sauvegardes nocturnes ──────────────────────────
 *
 * `/api/cron/backup` copie chaque liste dans une autre page Notion. C'est la
 * bonne réponse au cas probable — une écriture fautive de l'application — et
 * aucune réponse au cas grave : si l'espace Notion disparaît ou si le jeton
 * est révoqué, les sept sauvegardes partent avec les données.
 *
 * Celle-ci met donc la copie AILLEURS, et dans le seul endroit déjà payé,
 * déjà configuré, et dont personne ne peut vous couper l'accès du jour au
 * lendemain : votre boîte aux lettres. Un courriel par semaine, l'archive en
 * pièce jointe, conservée par Gmail aussi longtemps que vous le voulez.
 * Aucun service en plus, aucun abonnement, aucune donnée confiée à un tiers
 * de plus que ceux qui l'ont déjà.
 *
 * ── Volontairement silencieuse tant qu'on ne l'a pas demandée ───────────
 *
 * Sans `BACKUP_EMAIL`, cette route ne fait rien et le dit. Elle n'enverra
 * jamais de courriel que personne n'a réclamé.
 *
 * ── Et jamais en clair ──────────────────────────────────────────────────
 *
 * Le contenu a été mesuré sur les données réelles : adresses électroniques,
 * numéros de téléphone, noms de chantiers, journal d'activité nominatif, et
 * des adresses de photographies qui s'ouvrent sans authentification. Si
 * `BACKUP_PASSPHRASE` manque, la route REFUSE d'expédier quoi que ce soit —
 * et le signale en rouge plutôt que de se taire. Voir `archive-chiffree.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { construireArchive, nomDeFichier } from "@/lib/archive";
import { rassemblerLesListes } from "@/lib/sauvegarde";
import { sendEmail } from "@/lib/email";
import { chiffrer } from "@/lib/archive-chiffree";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Au-delà, on comprime : Gmail refuse les pièces jointes trop lourdes. */
const SEUIL_COMPRESSION = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  /* Les autres tâches planifiées laissent passer quand `CRON_SECRET` n'est
     pas défini. Pas celle-ci : elle expédie l'intégralité des données hors
     de l'application. Sans secret, elle se tait. */
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[ARCHIVE] CRON_SECRET absent : la copie hebdomadaire refuse de s'exécuter.");
    return NextResponse.json(
      { error: "CRON_SECRET requis pour cette tâche." }, { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const destinataire = (process.env.BACKUP_EMAIL || "").trim();
  if (!destinataire) {
    return NextResponse.json({
      actif: false,
      raison: "BACKUP_EMAIL n'est pas défini : aucune copie n'est expédiée.",
    });
  }

  /* Un destinataire sans phrase secrète, c'est une demande de sauvegarde
     restée à moitié faite. On ne la complète pas en expédiant les données
     en clair : on refuse, et on répond 503 pour que ce soit visible. */
  const passe = process.env.BACKUP_PASSPHRASE || "";
  if (passe.length < 12) {
    console.error("[ARCHIVE] BACKUP_EMAIL est défini mais BACKUP_PASSPHRASE manque (ou fait moins de 12 caractères) : rien n'a été expédié.");
    return NextResponse.json(
      {
        ok: false, envoye: false,
        raison: "BACKUP_PASSPHRASE manquante ou trop courte (12 caractères minimum). L'archive contient des données personnelles : elle n'est jamais expédiée en clair.",
      },
      { status: 503 },
    );
  }

  const quand = new Date();
  const { listes, manquantes } = await rassemblerLesListes();
  const complet = Object.keys(manquantes).length === 0;

  /* Une archive entièrement vide ne vaut pas la peine d'être expédiée, et
     laisserait croire que tout va bien alors que rien n'a été lu. */
  const lignes = Object.values(listes).reduce((n, d) => n + d.length, 0);
  if (Object.keys(listes).length === 0) {
    console.error("[ARCHIVE] export hebdomadaire : rien n'a pu être lu", manquantes);
    return NextResponse.json(
      { ok: false, envoye: false, raison: "aucune liste lisible", manquantes },
      { status: 500 },
    );
  }

  const archive = construireArchive(listes, manquantes, "export hebdomadaire", quand);
  const brut = Buffer.from(JSON.stringify(archive, null, 2), "utf-8");
  const comprimee = brut.byteLength > SEUIL_COMPRESSION;
  const nom = nomDeFichier(quand, complet);

  /* On comprime avant de chiffrer : du chiffré ne se comprime plus. */
  const charge = comprimee ? gzipSync(brut) : brut;
  const piece = {
    filename: `${nom}${comprimee ? ".gz" : ""}.tmenc`,
    content: chiffrer(charge, passe, quand),
    contentType: "application/octet-stream",
  };

  const detail = Object.entries(archive.empreintes)
    .map(([k, e]) => `<tr><td style="padding:4px 12px 4px 0">${k}</td><td style="padding:4px 0;text-align:right"><b>${e.lignes}</b></td></tr>`)
    .join("");

  const html = `
    <div style="font-family:-apple-system,Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px 0;font-size:18px">Copie hebdomadaire — ${quand.toLocaleDateString("fr-CH")}</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px 0">
        ${lignes} enregistrements, ${Math.round(piece.content.byteLength / 1024)} Ko${comprimee ? ", comprimé" : ""}, <b>chiffré</b>.
        Gardez ce message : la pièce jointe se réinstalle depuis
        Administration → Sauvegardes → Réinstaller une archive, avec la
        phrase secrète. Sans l'application, <code>scripts/dechiffrer-archive.mjs</code>
        la rouvre avec Node seul.
      </p>
      <table style="font-size:13px;border-collapse:collapse">${detail}</table>
      ${complet ? "" : `<p style="color:#b45309;font-size:13px;margin-top:16px">
        <b>Archive partielle.</b> Non lu : ${Object.keys(manquantes).join(", ")}.</p>`}
    </div>`;

  const envoi = await sendEmail(
    destinataire,
    `Copie TM Rapport — ${quand.toISOString().slice(0, 10)}${complet ? "" : " (PARTIELLE)"}`,
    html,
    [piece],
  );

  if (!envoi.success) {
    console.error("[ARCHIVE] export hebdomadaire non expédié :", envoi.error);
    return NextResponse.json({ ok: false, envoye: false, erreur: envoi.error }, { status: 502 });
  }

  console.log(`[ARCHIVE] copie hebdomadaire expédiée, chiffrée (${lignes} lignes, ${piece.content.byteLength} octets)`);
  return NextResponse.json({
    ok: true, envoye: true, complet, lignes,
    fichier: piece.filename, octets: piece.content.byteLength,
    chiffre: true, comprimee,
    manquantes,
  });
}
