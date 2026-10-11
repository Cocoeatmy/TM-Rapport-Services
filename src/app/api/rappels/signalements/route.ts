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
import { getData } from "@/lib/kv-store";
import { getAllActiveProjects } from "@/lib/notion";
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
    const [pieces, defauts, projets] = await Promise.all([
      getData<SignalementBrut>("pieces"),
      getData<SignalementBrut>("defauts"),
      getAllActiveProjects(),
    ]);

    const fiches = new Map<string, FicheProjet>();
    for (const p of projets) fiches.set(p.id, { ofrTM: p.ofrTM, projet: p.projet });

    const liste = listeDesRappels(
      Array.isArray(pieces) ? pieces : [],
      Array.isArray(defauts) ? defauts : [],
      fiches,
      { origine: req.nextUrl.origin },
    );

    return NextResponse.json({ ok: true, le: new Date().toISOString(), liste });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}
