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
 */
import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { construireArchive, nomDeFichier } from "@/lib/archive";
import { rassemblerLesListes } from "@/lib/sauvegarde";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Au-delà, on comprime : Gmail refuse les pièces jointes trop lourdes. */
const SEUIL_COMPRESSION = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const destinataire = (process.env.BACKUP_EMAIL || "").trim();
  if (!destinataire) {
    return NextResponse.json({
      actif: false,
      raison: "BACKUP_EMAIL n'est pas défini : aucune copie n'est expédiée.",
    });
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

  const piece = comprimee
    ? { filename: `${nom}.gz`, content: gzipSync(brut), contentType: "application/gzip" }
    : { filename: nom, content: brut, contentType: "application/json" };

  const detail = Object.entries(archive.empreintes)
    .map(([k, e]) => `<tr><td style="padding:4px 12px 4px 0">${k}</td><td style="padding:4px 0;text-align:right"><b>${e.lignes}</b></td></tr>`)
    .join("");

  const html = `
    <div style="font-family:-apple-system,Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px 0;font-size:18px">Copie hebdomadaire — ${quand.toLocaleDateString("fr-CH")}</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px 0">
        ${lignes} enregistrements, ${Math.round(piece.content.byteLength / 1024)} Ko${comprimee ? " (comprimé)" : ""}.
        Gardez ce message : la pièce jointe se réinstalle depuis
        Administration → Sauvegardes → Réinstaller une archive.
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

  console.log(`[ARCHIVE] copie hebdomadaire expédiée (${lignes} lignes, ${piece.content.byteLength} octets)`);
  return NextResponse.json({
    ok: true, envoye: true, complet, lignes,
    fichier: piece.filename, octets: piece.content.byteLength,
    manquantes,
  });
}
