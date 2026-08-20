/**
 * /api/doc?p=<projectId>&f=<field>&i=<index>&s=<signature>
 *
 * Proxy de document : redirige (302) vers l'URL Notion FRAÎCHE du document.
 * Pourquoi : les fichiers Notion sont des URL S3 pré-signées qui EXPIRENT
 * (~1 h). Un lien brut dans un email du matin est mort quand on clique plus
 * tard. Ici on re-récupère le projet depuis Notion AU CLIC → URL re-signée
 * valide à cet instant.
 *
 * Sécurité : lien public (cliqué depuis un email, sans cookie) mais protégé
 * par une SIGNATURE HMAC (clé SHARE_LINK_KEY) — impossible à deviner/énumérer.
 * Autorisé sans auth dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { signDoc } from "@/lib/doc-link";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const SECRET = process.env.SHARE_LINK_KEY || "";

// Champs de documents autorisés (clé courte → propriété du projet).
const FIELDS = {
  montage: "documentsMontagee",
  mesures: "documentsMesures",
} as const;
type FieldKey = keyof typeof FIELDS;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") || "";
  const f = (req.nextUrl.searchParams.get("f") || "") as FieldKey;
  const i = parseInt(req.nextUrl.searchParams.get("i") || "0", 10);
  const s = req.nextUrl.searchParams.get("s") || "";

  if (!SECRET) return NextResponse.json({ error: "Non configuré" }, { status: 503 });
  if (!p || !FIELDS[f] || !Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }
  // Vérification signature (temps constant)
  const expected = signDoc(p, f, i);
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 403 });
  }

  try {
    const project = await getProject(p); // retrieve Notion FRAIS → URL re-signée
    const files = (project as unknown as Record<string, { name: string; url: string }[]>)[FIELDS[f]] || [];
    const file = files[i];
    if (!file?.url) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    // 302 (temporaire) + no-store : le navigateur ne met JAMAIS en cache une URL
    // signée expirable — à chaque clic on repasse par le proxy.
    return NextResponse.redirect(file.url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
}
