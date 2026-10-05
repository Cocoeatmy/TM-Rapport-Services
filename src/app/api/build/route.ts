import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Signature de la version DÉPLOYÉE de l'app (pas des données : voir
 * /api/projects/version pour celles-là).
 *
 * Elle existe pour un défaut observé sur iPhone : l'app installée sur l'écran
 * d'accueil peut rester des jours sur un ANCIEN bundle. Le service worker sert
 * la coquille HTML mise en cache dès que le réseau dépasse son délai (cellulaire
 * lent), et cette coquille référence les anciens fichiers JS, eux aussi en
 * cache. Les données étaient fraîches, le CODE ne l'était pas — d'où un tableau
 * de bord qui comptait autrement que sur le Mac (66 projets au lieu de 36).
 *
 * Le client compare cette signature à celle inscrite dans sa propre page
 * (`<meta name="tm-build">`). Si elles diffèrent, il tourne sur du code périmé
 * et se recharge. Aucune requête Notion ici : la route doit rester
 * instantanée, elle est interrogée régulièrement.
 */
export async function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  return NextResponse.json(
    { build },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
