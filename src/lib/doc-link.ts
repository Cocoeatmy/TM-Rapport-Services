// Liens de documents signés (proxy /api/doc) — URL Notion fraîche au clic.
// Voir src/app/api/doc/route.ts pour la contrepartie serveur.
import { createHmac } from "crypto";

const SECRET = process.env.SHARE_LINK_KEY || "";

/** Signature HMAC tronquée d'un triplet (projectId|field|index). */
export function signDoc(projectId: string, field: string, index: number): string {
  return createHmac("sha256", SECRET).update(`${projectId}|${field}|${index}`).digest("hex").slice(0, 32);
}

/** URL de base absolue de l'app (pour les emails/cron, hors contexte requête). */
export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://tm-rapport.vercel.app").replace(/\/$/, "");
}

/** Lien signé vers un document (redirige vers l'URL Notion fraîche au clic). */
export function docLink(projectId: string, field: "montage" | "mesures", index: number, baseUrl = appBaseUrl()): string {
  const s = signDoc(projectId, field, index);
  return `${baseUrl}/api/doc?p=${encodeURIComponent(projectId)}&f=${field}&i=${index}&s=${s}`;
}
