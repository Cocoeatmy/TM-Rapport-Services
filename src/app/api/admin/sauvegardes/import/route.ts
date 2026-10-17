/**
 * Relire l'archive — et la réinstaller.
 *
 * ── Pourquoi cette route existe ───────────────────────────────────────────
 *
 * L'export rendait un fichier que personne n'avait jamais rouvert. Une
 * sauvegarde qu'on ne sait pas restaurer n'est pas une sauvegarde : c'est un
 * fichier, et on ne découvre la différence que le jour où l'on en a besoin.
 * Cette route ferme la boucle. Le fichier téléchargé revient par ici, et les
 * données reprennent leur place.
 *
 * ── Trois verrous, comme pour la restauration interne ────────────────────
 *
 *   1. le droit d'administration ;
 *   2. une phrase de confirmation à recopier exactement, qui contient la
 *      date de l'archive — on ne réinstalle pas celle d'il y a six mois en
 *      croyant prendre celle d'hier ;
 *   3. un refus automatique dès qu'une liste perdrait des lignes, qu'il faut
 *      lever explicitement.
 *
 * Et par défaut, RIEN ne s'écrit : sans `appliquer: true`, la route se
 * contente de dire ce qu'elle ferait. C'est le mode normal — on regarde
 * avant de toucher.
 *
 * ── Les archives chiffrées ──────────────────────────────────────────────
 *
 * Les copies hebdomadaires arrivent sous enveloppe (`.tmenc`). On les
 * accepte telles quelles : le fichier est transmis en base64 avec sa phrase
 * secrète, déchiffré ici, et la suite est identique. La phrase ne sort
 * jamais de la requête — elle n'est ni journalisée, ni conservée.
 *
 * Note d'exploitation : le corps d'une requête est plafonné à 4,5 Mo chez
 * Vercel. Au-delà, on réinstalle liste par liste avec `cles: ["defauts"]`.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { setData } from "@/lib/kv-store";
import { CLES_SAUVEGARDEES, lireListeSauvegardable } from "@/lib/sauvegarde";
import { validerArchive, comparerArchive, type Archive, type LigneComparaison } from "@/lib/archive";
import { dechiffrer, estChiffree, PhraseIncorrecte } from "@/lib/archive-chiffree";
import { gunzipSync } from "node:zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** La phrase à recopier. Elle nomme l'archive, pas seulement l'action. */
export function phraseDImport(archive: Archive): string {
  return `IMPORTER L'ARCHIVE DU ${(archive.genereLe || "?").slice(0, 10)}`;
}

interface Corps {
  archive?: unknown;
  /** Une enveloppe chiffrée, en base64, au lieu de l'archive en clair. */
  fichierChiffre?: string;
  phraseSecrete?: string;
  /** Se limiter à certaines listes. Par défaut : toutes celles de l'archive. */
  cles?: string[];
  confirmation?: string;
  accepterPerte?: boolean;
  /** Sans ce drapeau, aucune écriture. */
  appliquer?: boolean;
}

export async function POST(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  let corps: Corps;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }

  /* ── Une enveloppe chiffrée ? On l'ouvre d'abord ───────────────────── */
  let brut: unknown;
  if (corps.fichierChiffre) {
    if (!corps.phraseSecrete) {
      return NextResponse.json(
        { error: "Cette archive est chiffrée : la phrase secrète est nécessaire.", chiffree: true },
        { status: 428 },
      );
    }
    let fichier: Buffer;
    try {
      fichier = Buffer.from(corps.fichierChiffre, "base64");
    } catch {
      return NextResponse.json({ error: "Fichier illisible." }, { status: 400 });
    }
    if (!estChiffree(fichier)) {
      return NextResponse.json(
        { error: "Ce fichier n'est pas une archive chiffrée." }, { status: 400 },
      );
    }
    let clair: Buffer;
    try {
      clair = dechiffrer(fichier, corps.phraseSecrete);
    } catch (e) {
      /* 428 et non 400 : la requête est correcte, il manque la bonne clé.
         Le message ne distingue pas phrase fausse et fichier abîmé, parce
         que le chiffrement authentifié ne le distingue pas non plus. */
      const incorrecte = e instanceof PhraseIncorrecte;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e), chiffree: true },
        { status: incorrecte ? 428 : 400 },
      );
    }
    /* Les grosses archives partent comprimées sous l'enveloppe. */
    if (clair[0] === 0x1f && clair[1] === 0x8b) {
      try { clair = gunzipSync(clair); }
      catch { return NextResponse.json({ error: "Décompression impossible." }, { status: 400 }); }
    }
    try {
      brut = JSON.parse(clair.toString("utf-8"));
    } catch {
      return NextResponse.json(
        { error: "L'enveloppe s'est ouverte, mais son contenu n'est pas une archive lisible." },
        { status: 400 },
      );
    }
  } else {
    /* L'archive peut arriver seule (le fichier tel quel) ou enveloppée. */
    brut = corps.archive ?? corps;
  }
  const verdict = validerArchive(brut);
  if (!verdict.valide) {
    return NextResponse.json({ error: `Archive refusée : ${verdict.motif}` }, { status: 400 });
  }
  const archive = verdict.archive;

  /* On ne réinstalle que des listes connues : une archive bricolée ne doit
     pas pouvoir créer des clés dans le magasin. */
  const inconnues = Object.keys(archive.listes).filter((k) => !CLES_SAUVEGARDEES.includes(k as never));
  const demandees = corps.cles?.length
    ? corps.cles.filter((k) => k in archive.listes)
    : Object.keys(archive.listes);
  const retenues = demandees.filter((k) => CLES_SAUVEGARDEES.includes(k as never));

  if (retenues.length === 0) {
    return NextResponse.json(
      { error: "Aucune liste connue à réinstaller.", inconnues }, { status: 400 },
    );
  }

  /* État actuel, pour dire exactement ce qui changerait. Une lecture qui
     échoue n'est pas un zéro : elle vaut « inconnu », et un état inconnu
     interdit d'écrire — on ne devine pas ce qu'on écrase. */
  const actuels: Record<string, number | null> = {};
  const illisibles: Record<string, string> = {};
  for (const cle of retenues) {
    try {
      /* Par le MÊME chemin que l'export : le journal a deux sources, et les
         compter différemment ferait annoncer un écart imaginaire. */
      actuels[cle] = (await lireListeSauvegardable(cle)).length;
    } catch (e) {
      actuels[cle] = null;
      illisibles[cle] = e instanceof Error ? e.message : String(e);
    }
  }

  const comparaison = comparerArchive(
    { ...archive, listes: Object.fromEntries(retenues.map((k) => [k, archive.listes[k]])) },
    actuels,
  );
  const pertes = comparaison.filter((c) => c.perteNette);
  const attendue = phraseDImport(archive);

  /* ── Mode normal : on regarde, on n'écrit pas ──────────────────────────── */
  if (!corps.appliquer) {
    return NextResponse.json({
      simulation: true,
      archive: { genereLe: archive.genereLe, par: archive.par, version: archive.version },
      lisible: true,
      listes: comparaison,
      inconnues,
      illisibles,
      manquantesDansArchive: archive.manquantes,
      confirmationAttendue: attendue,
      avertissements: [
        ...pertes.map((p) => `« ${p.cle} » passerait de ${p.actuel} à ${p.archive} lignes.`),
        ...Object.entries(illisibles).map(([k, m]) => `État actuel de « ${k} » illisible : ${m}`),
      ],
    });
  }

  /* ── Mode écriture : les verrous ───────────────────────────────────────── */
  if (corps.confirmation !== attendue) {
    return NextResponse.json(
      { error: "Confirmation manquante ou incorrecte.", confirmationAttendue: attendue },
      { status: 428 },
    );
  }
  if (Object.keys(illisibles).length > 0) {
    return NextResponse.json(
      {
        error: "État actuel illisible : impossible de savoir ce qu'on écraserait. Rien n'a été touché.",
        illisibles,
      },
      { status: 503 },
    );
  }
  if (pertes.length > 0 && !corps.accepterPerte) {
    return NextResponse.json(
      {
        error: `Refusé : ${pertes.map((p) => `« ${p.cle} » perdrait ${Math.abs(p.delta || 0)} ligne(s)`).join(", ")}. Renvoyez avec accepterPerte: true si c'est voulu.`,
        listes: comparaison,
      },
      { status: 409 },
    );
  }

  const resultats: (LigneComparaison & { etat: "ok" | "refusee"; message?: string })[] = [];
  for (const c of comparaison) {
    const donnees = archive.listes[c.cle];
    try {
      /* `permettreVide` seulement si l'archive est elle-même vide ET que
         l'humain a accepté la perte : le garde-fou de `setData` reste la
         dernière barrière contre un effacement accidentel. */
      await setData(c.cle, donnees, {
        permettreVide: donnees.length === 0 && !!corps.accepterPerte,
      });
      resultats.push({ ...c, etat: "ok" });
    } catch (e) {
      /* Une liste refusée n'arrête pas les autres : mieux vaut en remettre
         quatre sur cinq que zéro. Le compte rendu dit laquelle a manqué. */
      resultats.push({ ...c, etat: "refusee", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const echecs = resultats.filter((r) => r.etat !== "ok");
  console.warn(
    `[ARCHIVE] import de ${resultats.length} liste(s) depuis l'archive du ${archive.genereLe} par ${v.user.email}` +
    (echecs.length ? ` — ${echecs.length} refus` : ""),
  );

  return NextResponse.json(
    { ok: echecs.length === 0, simulation: false, resultats, inconnues },
    { status: echecs.length === 0 ? 200 : 207 },
  );
}
