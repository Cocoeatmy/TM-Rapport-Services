/**
 * Accès bexio — EN LECTURE SEULE.
 *
 * Pourquoi OAuth et pas un jeton personnel : le « Personal Access Token » de
 * bexio porte TOUS les droits par défaut (écriture comprise, comptabilité
 * comprise) et expire au bout de soixante jours. Avec OAuth, on ne demande
 * que les permissions en `_show` : l'application est alors techniquement
 * incapable d'écrire quoi que ce soit dans bexio — ce n'est pas une règle de
 * politesse, le serveur refuse.
 *
 * Les scopes de paie (`payroll_*`) ne sont PAS demandés : les salaires n'ont
 * rien à faire dans une application de chantier, et un accès qu'on ne demande
 * pas est un accès qu'on ne peut pas perdre. Le scope `accounting` non plus :
 * c'est le seul qui ne se décline pas en lecture seule.
 *
 * Le jeton de rafraîchissement est CHIFFRÉ avant d'être rangé : il ouvre la
 * comptabilité de l'entreprise, il ne doit pas traîner en clair dans un
 * magasin que d'autres yeux peuvent lire.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { getData, setData } from "@/lib/kv-store";
import { redisGetJSON, redisSetJSON, siRedis } from "@/lib/redis-cache";

const AUTH_BASE = "https://auth.bexio.com/realms/bexio/protocol/openid-connect";
export const BEXIO_API = "https://api.bexio.com";

/** Permissions demandées : lecture seule, et rien de la paie. */
export const SCOPES = [
  "openid",
  "profile",
  "email",
  "company_profile",
  // Sans lui, l'accès meurt à la fin de la session du navigateur.
  "offline_access",
  "contact_show",
  "kb_invoice_show",
  "kb_offer_show",
  "kb_order_show",
  "kb_delivery_show",
  "kb_bill_show",
  "kb_expense_show",
  "project_show",
  "article_show",
] as const;

const CLE_STOCKAGE = "bexio-oauth";

export interface JetonBexio {
  /** Jeton de rafraîchissement, CHIFFRÉ. */
  refresh: string;
  /** Jeton d'accès courant, chiffré lui aussi (durée de vie courte). */
  acces?: string;
  /** Expiration du jeton d'accès (ms epoch). */
  expire?: number;
  /** Permissions réellement accordées, telles que bexio les renvoie. */
  scopes?: string;
  /** Qui a autorisé, et quand — pour que la page d'état sache le dire. */
  par?: string;
  le?: string;
}

export function bexioConfigure(): boolean {
  return !!(process.env.BEXIO_CLIENT_ID && process.env.BEXIO_CLIENT_SECRET);
}

function redirectUri(origin: string): string {
  return process.env.BEXIO_REDIRECT_URI || `${origin}/api/bexio/callback`;
}

/* ── Chiffrement au repos ────────────────────────────────────────────────── */

function cle(): Buffer {
  const secret = process.env.BEXIO_TOKEN_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("BEXIO_TOKEN_KEY (ou JWT_SECRET) manquant");
  return createHash("sha256").update(secret).digest();
}

export function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(), iv);
  const chiffre = Buffer.concat([c.update(texte, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), chiffre.toString("base64")].join(".");
}

export function dechiffrer(paquet: string): string {
  const [iv, tag, corps] = (paquet || "").split(".");
  if (!iv || !tag || !corps) throw new Error("jeton illisible");
  const d = createDecipheriv("aes-256-gcm", cle(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(corps, "base64")), d.final()]).toString("utf8");
}

/* ── Rangement : Redis d'abord, magasin Notion comme filet ───────────────── */

export async function lireJeton(): Promise<JetonBexio | null> {
  const red = await siRedis(() => redisGetJSON<JetonBexio>(CLE_STOCKAGE));
  if (red?.valeur?.refresh) return red.valeur;
  try {
    const lignes = await getData<JetonBexio>(CLE_STOCKAGE);
    return lignes.find((l) => l?.refresh) || null;
  } catch {
    return null;
  }
}

export async function ecrireJeton(j: JetonBexio): Promise<void> {
  // Durée « jamais » : c'est un réglage, pas un cache.
  await siRedis(() => redisSetJSON(CLE_STOCKAGE, j, 315_360_000));
  try { await setData(CLE_STOCKAGE, [j]); } catch { /* best-effort */ }
}

export async function oublierJeton(): Promise<void> {
  await siRedis(() => redisSetJSON(CLE_STOCKAGE, [], 60));
  try { await setData(CLE_STOCKAGE, []); } catch {}
}

/* ── Flux OAuth ──────────────────────────────────────────────────────────── */

/** URL vers laquelle envoyer l'administrateur pour autoriser l'accès. */
export function urlAutorisation(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.BEXIO_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_BASE}/auth?${p}`;
}

interface ReponseJeton {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function appelerJeton(corps: URLSearchParams): Promise<ReponseJeton> {
  const auth = Buffer.from(
    `${process.env.BEXIO_CLIENT_ID}:${process.env.BEXIO_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: corps,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as ReponseJeton;
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `bexio ${res.status}`);
  }
  return data;
}

/** Échange le code reçu après consentement contre un couple de jetons. */
export async function echangerCode(code: string, origin: string, qui: string): Promise<JetonBexio> {
  const data = await appelerJeton(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
  }));
  if (!data.refresh_token) throw new Error("bexio n'a pas renvoyé de jeton de rafraîchissement");
  const j: JetonBexio = {
    refresh: chiffrer(data.refresh_token),
    acces: data.access_token ? chiffrer(data.access_token) : undefined,
    expire: data.expires_in ? Date.now() + (data.expires_in - 60) * 1000 : undefined,
    scopes: data.scope,
    par: qui,
    le: new Date().toISOString(),
  };
  await ecrireJeton(j);
  return j;
}

/**
 * Jeton d'accès valide, renouvelé si besoin.
 *
 * bexio fait TOURNER le jeton de rafraîchissement : celui qu'on reçoit au
 * renouvellement remplace l'ancien, et oublier de l'enregistrer coupe l'accès
 * au renouvellement suivant.
 */
export async function jetonAcces(): Promise<string | null> {
  const j = await lireJeton();
  if (!j?.refresh) return null;
  if (j.acces && j.expire && j.expire > Date.now()) {
    try { return dechiffrer(j.acces); } catch { /* on renouvelle */ }
  }
  const data = await appelerJeton(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: dechiffrer(j.refresh),
  }));
  if (!data.access_token) throw new Error("bexio n'a pas renvoyé de jeton d'accès");
  await ecrireJeton({
    ...j,
    refresh: data.refresh_token ? chiffrer(data.refresh_token) : j.refresh,
    acces: chiffrer(data.access_token),
    expire: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
    scopes: data.scope || j.scopes,
  });
  return data.access_token;
}

/**
 * Appel à l'API bexio. Refuse tout verbe d'écriture : même si une erreur de
 * code en demandait un, rien ne partirait — la lecture seule doit tenir aussi
 * du côté de l'app, pas seulement du côté de bexio.
 */
export async function bexioFetch<T>(chemin: string, init?: RequestInit): Promise<T> {
  const methode = (init?.method || "GET").toUpperCase();
  /* Chez bexio, la RECHERCHE filtrée se fait en POST sur « …/search ». C'est
     une lecture malgré le verbe : on l'autorise nommément, et elle seule —
     sans quoi il faudrait rapatrier toutes les factures pour en trouver une. */
  const estRecherche = methode === "POST" && /\/search$/.test(chemin.split("?")[0]);
  if (methode !== "GET" && methode !== "HEAD" && !estRecherche) {
    throw new Error(`Accès bexio en lecture seule : ${methode} refusé`);
  }
  const acces = await jetonAcces();
  if (!acces) throw new Error("bexio n'est pas connecté");
  const res = await fetch(`${BEXIO_API}${chemin}`, {
    ...init,
    method: methode,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${acces}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bexio ${res.status} sur ${chemin}`);
  return (await res.json()) as T;
}
