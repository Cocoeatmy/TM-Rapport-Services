/**
 * Notion Webhook Handler
 * ──────────────────────
 * Reçoit les événements Notion (page.property_values.updated, etc.)
 * et invalide immédiatement le cache ISR Next.js + le cache mémoire serveur.
 *
 * Résultat : changement Notion → visible dans l'app en < 35 s
 * (webhook < 3 s + prochain poll client ≤ 30 s).
 *
 * Sécurité :
 *   - Vérification HMAC-SHA256 avec le secret fourni par Notion
 *   - Header : X-Notion-Signature: v0=<sha256hex>
 *   - Variable d'env requise : NOTION_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { revalidateInBackground } from "@/lib/server-cache";
import { redisSetJSON } from "@/lib/redis-cache";
import {
  getProjects, getProjectsMesures, getProjectsServices, getProjectsSAV, getAllActiveProjects,
} from "@/lib/notion";
import { getData, setData } from "@/lib/kv-store";

// Forcer le rendu dynamique — indispensable pour recevoir des webhooks
export const dynamic = "force-dynamic";

// Clé kv-store pour le jeton de vérification (persisté dans Notion)
const KV_VERIFY_KEY = "notion-webhook-verify";

// Cache mémoire local (évite un appel Notion à chaque GET sur la même instance)
let cachedVerifyToken: string | null = null;

async function storeVerificationToken(token: string): Promise<void> {
  cachedVerifyToken = token;
  try {
    await setData<{ token: string }>(KV_VERIFY_KEY, [{ token }]);
  } catch (err) {
    console.error("[notion-webhook] Failed to persist verification token:", err);
  }
}

async function getVerificationToken(): Promise<string | null> {
  if (cachedVerifyToken) return cachedVerifyToken;
  try {
    const rows = await getData<{ token: string }>(KV_VERIFY_KEY);
    cachedVerifyToken = rows[0]?.token ?? null;
  } catch {
    // Silencieux
  }
  return cachedVerifyToken;
}

/**
 * Les cinq listes qui font vivre le tableau de bord. Elles seules sont
 * rafraîchies sur un événement Notion.
 *
 * L'ancien code vidait TOUT le cache, partagé compris. Chaque serveur devait
 * alors tout redemander à Notion depuis zéro — dix à trente-cinq secondes par
 * liste, et autant d'écrans figés. C'est précisément ce qui avait saturé
 * Notion en juin. On ne vide donc plus rien : on va chercher la nouvelle
 * version en arrière-plan, et on la pose à la place de l'ancienne.
 */
const LISTES_ACTIVES: { cle: string; lire: () => Promise<unknown[]> }[] = [
  { cle: "projects", lire: getProjects },
  { cle: "projects-mesures", lire: getProjectsMesures },
  { cle: "projects-services", lire: getProjectsServices },
  { cle: "projects-sav", lire: getProjectsSAV },
  { cle: "projects-all-active", lire: getAllActiveProjects },
];

/**
 * Événements qui méritent un rafraîchissement, aux noms EXACTS de la
 * documentation Notion.
 *
 * L'ancienne liste guettait « page.property_values.updated » — un nom qui
 * n'existe pas. Changer l'état d'un chantier, une annulation par exemple,
 * n'aurait donc jamais rien déclenché, même le webhook correctement branché.
 */
const EVENEMENTS_SUIVIS = [
  "page.properties_updated",
  "page.created",
  "page.deleted",
  "page.undeleted",
  "page.moved",
  "page.content_updated",
  "data_source.content_updated",
  "database.content_updated",
];

/** Page où l'app range ses propres données : ses événements ne concernent
 *  aucun chantier, et une opération d'entretien en produit des milliers. */
const PAGE_MAGASIN = "3431895b9179804eb9bfc51868936cf2";

/* Un rafraîchissement au plus toutes les quinze secondes. Modifier une fiche
   dans Notion produit plusieurs événements d'affilée ; sans ce frein, chacun
   relancerait cinq requêtes. */
const PAUSE_MS = 15_000;
let dernierRafraichissement = 0;

/** Trace du dernier message reçu de Notion, partagée entre les serveurs.
 *  Sans elle, savoir si le webhook fonctionne demandait de fouiller les
 *  journaux — qui ne gardent que quelques minutes. */
function noterEvenement(type: string, retenu: boolean): void {
  redisSetJSON("webhook:dernier", { type, retenu, le: new Date().toISOString() }, 7 * 24 * 3600)
    .catch(() => {});
}

function rafraichirListesActives(): number {
  const maintenant = Date.now();
  if (maintenant - dernierRafraichissement < PAUSE_MS) return 0;
  dernierRafraichissement = maintenant;
  for (const { cle, lire } of LISTES_ACTIVES) revalidateInBackground(cle, lire);
  return LISTES_ACTIVES.length;
}

/**
 * Vérifie la signature HMAC-SHA256 envoyée par Notion.
 * Utilise timingSafeEqual pour prévenir les timing attacks.
 */
function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    /* Notion envoie « sha256=<hex> » (documentation officielle). Le code
       n'enlevait qu'un préfixe « v0= », qui ne correspond à rien ici : le
       « sha256= » restait collé devant, la comparaison échouait, et CHAQUE
       événement aurait été rejeté comme signature invalide — sans un mot
       ailleurs que dans les journaux. On enlève donc ce qui précède le
       premier « = », quel que soit le nom du préfixe. */
    const signatureHex = signature.includes("=") ? signature.slice(signature.indexOf("=") + 1) : signature;
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const a = Buffer.from(signatureHex, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.NOTION_WEBHOOK_SECRET;

  // ── 1. Vérification de la signature ─────────────────────────────────────
  if (secret) {
    const signature = req.headers.get("x-notion-signature") ?? "";
    const rawBody = await req.text();

    if (!verifySignature(rawBody, signature, secret)) {
      console.warn("[notion-webhook] Signature invalide — requête rejetée");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    // Lire le body depuis le texte déjà lu
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
    }

    // ── 2. Handshake de vérification initial ──────────────────────────────
    // Notion envoie un POST avec verification_token pour valider l'endpoint
    if (payload?.verification_token) {
      await storeVerificationToken(payload.verification_token);
      console.log("[notion-webhook] Verification handshake reçu ✓ token:", payload.verification_token);
      return NextResponse.json({ verification_token: payload.verification_token });
    }

    // ── 3. Traitement des événements ─────────────────────────────────────
    const eventType: string = payload?.type ?? payload?.event?.type ?? "";
    console.log(`[notion-webhook] Événement reçu : ${eventType}`);

    // Invalider uniquement sur les événements qui modifient des données projet
    /* L'abonnement couvre tout l'espace de travail. On écarte ce qui vient de
       la page où l'app range ses propres données — un ménage y produit des
       milliers d'événements qui ne concernent aucun chantier. On écarte par
       exclusion, et non par inclusion : un message dont la forme nous échappe
       déclenche quand même un rafraîchissement, ce qui est sans danger. */
    if (rawBody.replace(/-/g, "").includes(PAGE_MAGASIN)) {
      noterEvenement(eventType, false);
      return NextResponse.json({ ok: true, skipped: "données internes de l'app" });
    }

    noterEvenement(eventType, EVENEMENTS_SUIVIS.includes(eventType));
    if (EVENEMENTS_SUIVIS.includes(eventType)) {
      const listes = rafraichirListesActives();
      console.log(listes > 0
        ? `[notion-webhook] ${eventType} → ${listes} listes en cours de rafraîchissement`
        : `[notion-webhook] ${eventType} → ignoré (rafraîchissement déjà lancé)`);
      return NextResponse.json({ ok: true, listes });
    }

    // Événement ignoré (structure, commentaire, etc.)
    console.log(`[notion-webhook] Événement ignoré : ${eventType}`);
    return NextResponse.json({ ok: true, skipped: true });

  } else {
    // ── Mode sans secret (setup initial / test) ───────────────────────────
    // Permet de valider le endpoint Notion avant d'avoir configuré le secret.
    // À RETIRER une fois NOTION_WEBHOOK_SECRET configuré en production.
    const rawBody = await req.text();
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { payload = {}; }

    if (payload?.verification_token) {
      await storeVerificationToken(payload.verification_token);
      console.warn("[notion-webhook] ⚠️  Mode sans signature — token reçu:", payload.verification_token);
      return NextResponse.json({ verification_token: payload.verification_token });
    }

    console.warn("[notion-webhook] ⚠️  NOTION_WEBHOOK_SECRET manquant — webhook non sécurisé");
    return NextResponse.json({ ok: true, warning: "Secret non configuré" });
  }
}

// GET — health check + affichage du jeton de vérification si disponible
export async function GET() {
  /* Cette adresse est publique — Notion doit pouvoir l'atteindre sans session.
     Elle affichait le jeton de vérification en clair, ce qui était commode
     pendant l'installation et inacceptable après : ce jeton est la clé qui
     signe les messages de Notion, et qui la connaît peut en fabriquer de faux.
     Une fois le secret installé, l'adresse ne dit plus que l'essentiel. */
  const installe = !!process.env.NOTION_WEBHOOK_SECRET;
  const token = installe ? null : await getVerificationToken();

  const payload: Record<string, unknown> = {
    status: "ok",
    endpoint: "/api/notion-webhook",
    secured: installe,
    ...(installe ? {} : { verification_token: token }),
    instruction: installe
      ? "Webhook sécurisé — le jeton est installé côté serveur."
      : token
        ? "Copiez ce jeton dans le champ 'Jeton de vérification' sur Notion"
        : "Aucun jeton reçu pour l'instant — relancez la vérification depuis Notion",
  };

  return NextResponse.json(payload, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

// HEAD — Notion envoie une requête HEAD pour valider le SSL/accessibilité
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
