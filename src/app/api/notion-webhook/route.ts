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
import { revalidatePath } from "next/cache";
import { createHmac, timingSafeEqual } from "crypto";
import { invalidateCache } from "@/lib/server-cache";

// Forcer le rendu dynamique — indispensable pour recevoir des webhooks
export const dynamic = "force-dynamic";

// Stockage en mémoire du jeton de vérification reçu de Notion
// (visible via GET /api/notion-webhook pour le copier-coller)
let storedVerificationToken: string | null = null;

// Toutes les routes API projets à invalider lors d'un changement Notion
const PROJECT_PATHS = [
  "/api/projects",
  "/api/projects/mesures",
  "/api/projects/services",
  "/api/projects/sav",
  "/api/projects/cmd-termine",
  "/api/projects/services-termine",
  "/api/projects/sav-termine",
  "/api/projects/mesures-termine",
  "/api/projects/mesures-sans-commande",
  "/api/projects/mesures-annulees",
  "/api/projects/all-active",
  "/api/projects/all",
];

/**
 * Vérifie la signature HMAC-SHA256 envoyée par Notion.
 * Utilise timingSafeEqual pour prévenir les timing attacks.
 */
function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    // Notion envoie "v0=<hex>" ; on extrait juste le hex
    const signatureHex = signature.startsWith("v0=") ? signature.slice(3) : signature;
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
      storedVerificationToken = payload.verification_token;
      console.log("[notion-webhook] Verification handshake reçu ✓ token:", payload.verification_token);
      return NextResponse.json({ verification_token: payload.verification_token });
    }

    // ── 3. Traitement des événements ─────────────────────────────────────
    const eventType: string = payload?.type ?? payload?.event?.type ?? "";
    console.log(`[notion-webhook] Événement reçu : ${eventType}`);

    // Invalider uniquement sur les événements qui modifient des données projet
    const relevantEvents = [
      "page.property_values.updated",
      "page.created",
      "page.content_updated",
    ];

    if (relevantEvents.some((e) => eventType.includes(e)) || relevantEvents.includes(eventType)) {
      // a) Cache mémoire serveur (instance courante)
      invalidateCache();

      // b) Cache ISR Next.js (infrastructure Vercel — cross-instances)
      for (const path of PROJECT_PATHS) {
        try {
          revalidatePath(path);
        } catch {
          // revalidatePath peut ne pas fonctionner hors contexte Next.js
        }
      }

      console.log(`[notion-webhook] Cache invalidé pour ${PROJECT_PATHS.length} routes ✓`);
      return NextResponse.json({ ok: true, invalidated: PROJECT_PATHS.length });
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
      storedVerificationToken = payload.verification_token;
      console.warn("[notion-webhook] ⚠️  Mode sans signature — token reçu:", payload.verification_token);
      return NextResponse.json({ verification_token: payload.verification_token });
    }

    console.warn("[notion-webhook] ⚠️  NOTION_WEBHOOK_SECRET manquant — webhook non sécurisé");
    return NextResponse.json({ ok: true, warning: "Secret non configuré" });
  }
}

// GET — health check + affichage du jeton de vérification si disponible
export async function GET() {
  const payload: Record<string, unknown> = {
    status: "ok",
    endpoint: "/api/notion-webhook",
    secured: !!process.env.NOTION_WEBHOOK_SECRET,
  };

  if (storedVerificationToken) {
    payload.verification_token = storedVerificationToken;
    payload.instruction = "Copiez ce jeton dans le champ 'Jeton de vérification' sur Notion";
  } else {
    payload.verification_token = null;
    payload.instruction = "Aucun jeton reçu pour l'instant — relancez la vérification depuis Notion";
  }

  return NextResponse.json(payload, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

// HEAD — Notion envoie une requête HEAD pour valider le SSL/accessibilité
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
