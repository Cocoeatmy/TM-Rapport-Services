import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { echangerCode, peutVoirBexio } from "@/lib/bexio";

export const dynamic = "force-dynamic";

/** Retour de bexio après consentement — administrateur seulement. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const url = request.nextUrl;
  const erreur = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (erreur) return reponse(request, `bexio a refusé : ${erreur}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const attendu = request.cookies.get("bexio-state")?.value;
  if (!code) return reponse(request, "Aucun code reçu de bexio.");
  if (!state || !attendu || state !== attendu) {
    return reponse(request, "Jeton de sécurité invalide — relancez la connexion depuis l'app.");
  }

  try {
    const j = await echangerCode(code, url.origin, user.email);
    const res = reponse(request, null, j.scopes || "");
    res.cookies.delete("bexio-state");
    return res;
  } catch (e) {
    return reponse(request, `Échec de la connexion : ${(e as Error).message}`);
  }
}

/** Petite page de retour : on ne renvoie pas un JSON brut à un humain. */
function reponse(request: NextRequest, erreur: string | null, scopes = "") {
  const accueil = new URL("/", request.nextUrl.origin).toString();
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bexio</title>
<style>
 body{font-family:-apple-system,system-ui,sans-serif;background:#f6f7f9;margin:0;
      display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
 .c{background:#fff;border-radius:16px;padding:28px;max-width:460px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
 h1{font-size:18px;margin:0 0 10px;color:#1e3a5f}
 p{font-size:14px;line-height:1.5;color:#475569;margin:0 0 14px}
 code{font-size:11px;color:#64748b;word-break:break-word}
 a{display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;
   padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600}
</style></head><body><div class="c">
<h1>${erreur ? "Connexion bexio impossible" : "bexio est connecté"}</h1>
<p>${erreur ? escapeHtml(erreur) : "L'application peut désormais lire vos données bexio. Elle ne peut rien y écrire : seules les permissions de consultation ont été demandées."}</p>
${!erreur && scopes ? `<p><code>${escapeHtml(scopes)}</code></p>` : ""}
<a href="${accueil}">Retour à l'application</a>
</div></body></html>`;
  return new NextResponse(html, {
    status: erreur ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
