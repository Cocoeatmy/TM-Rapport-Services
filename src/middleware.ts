import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { comptesDesactives, idSession, sessionsRevoquees } from "@/lib/revocation";

/* Aucune valeur de repli : avec un secret connu de tous, n'importe qui
   pourrait se fabriquer une session d'administrateur le jour où la vraie clé
   viendrait à manquer. Sans clé, on refuse tout le monde — panne visible et
   sans danger, plutôt qu'une porte ouverte que personne ne remarque. */
const CLE = process.env.JWT_SECRET;
const secret = CLE ? new TextEncoder().encode(CLE) : null;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes publiques
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/client/") ||
    pathname.startsWith("/api/share-link") || // protégé par sa propre clé (SHARE_LINK_KEY)
    pathname.startsWith("/api/rappels/") || // agent Rappels macOS — même clé (SHARE_LINK_KEY)
    // Dépôt des factures par l'agent du Mac : il n'a pas de session, et
    // présente la même clé partagée. La route vérifie elle-même la clé en
    // écriture, et l'adresse du propriétaire en lecture.
    pathname === "/api/stats/ca/factures" ||
    /* Égalité stricte, PAS un préfixe : « /api/doc » suffisait à rendre public
       « /api/doc-proxy », qui sert les PDF internes et se croyait protégé —
       son propre commentaire l'affirmait. */
    pathname === "/api/doc" ||
    pathname.startsWith("/api/fiche") || // PDF Fiche de travail (protégé par signature HMAC ou cookie admin)
    pathname.startsWith("/api/sav") || // PDF Rapport SAV (protégé par signature HMAC ou cookie admin)
    pathname.startsWith("/api/synthese") || // PDF Suivi du chantier (protégé par signature HMAC ou cookie admin)
    pathname.startsWith("/api/pdf") || // PDF Rapport de montage interne (protégé par signature HMAC ou cookie admin)
    pathname.startsWith("/api/rapport-signalements") || // PDF Rapport des signalements (signature HMAC ou cookie admin)
    (pathname.startsWith("/api/photos/") && pathname.endsWith("/download")) || // ZIP photos (signature HMAC ou cookie)
    pathname.startsWith("/api/notion-webhook") || // webhook Notion (pas de cookie auth)
    pathname.startsWith("/client/") ||
    pathname.startsWith("/f/") || // lien court Fiche de travail (redirige vers /api/fiche signé)
    pathname.startsWith("/s/") || // lien court Rapport de suivi (redirige vers /api/synthese signé)
    pathname.startsWith("/sav/") || // lien court Rapport SAV (redirige vers /api/sav signé)
    pathname.startsWith("/sig/") || // lien court Signalements (redirige vers /api/rapport-signalements signé)
    pathname.startsWith("/m/") || // lien court Documents de prise de mesures (RDV mesures)
    pathname.startsWith("/ch/") || // suivi public d'un chantier PPE (signature HMAC)
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" // service worker : toujours accessible (sinon corruption au renouvellement de session)
  ) {
    return NextResponse.next();
  }

  if (!secret) {
    console.error("[middleware] JWT_SECRET absent : tout accès est refusé.");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let email = "";
  let session = "";
  try {
    const { payload } = await jwtVerify(token, secret);
    email = String(payload.email || "").toLowerCase();
    session = idSession(payload);
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  /* Compte désactivé : la session, pourtant bien signée, est refusée. Les
     données restent intactes ; seul l'accès est coupé. Si la liste est
     illisible (panne Redis), on laisse passer : les routes qui vérifient la
     session relisent de toute façon la fiche du compte. */
  /* Accès de CET appareil retiré depuis la page Appareils : on le renvoie à
     la connexion (une nouvelle connexion ouvre une nouvelle session). */
  const revoquees = await sessionsRevoquees();
  if (session && revoquees?.has(session)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Accès de cet appareil retiré" }, { status: 401 });
    }
    const reponse = NextResponse.redirect(new URL("/login?revoque=1", request.url));
    reponse.cookies.delete("auth-token");
    return reponse;
  }

  const desactives = await comptesDesactives();
  if (email && desactives?.has(email)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Compte désactivé" }, { status: 401 });
    }
    const reponse = NextResponse.redirect(new URL("/login?desactive=1", request.url));
    reponse.cookies.delete("auth-token");
    return reponse;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
};
