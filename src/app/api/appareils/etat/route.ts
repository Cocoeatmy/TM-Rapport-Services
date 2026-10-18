/**
 * Le battement d'un appareil.
 *
 * Chaque téléphone, toutes les trente secondes quand l'application est
 * ouverte et en ligne, dépose ici son état en chiffres : photos en attente,
 * échecs, écritures en file, rapports finalisés non envoyés, chantiers
 * préparés hors ligne. Le serveur le range dans un hachage Redis, une
 * entrée par appareil, et rend en réponse l'éventuel SIGNAL que le bureau a
 * laissé pour cet appareil — « relance tout ».
 *
 * ── Ce qui n'y transite pas ─────────────────────────────────────────────
 *
 * Aucune donnée de chantier. Des compteurs, des identifiants de projet,
 * des horodatages, un identifiant d'appareil. Un battement intercepté
 * n'apprend rien d'un client.
 *
 * ── Redis plutôt que Notion ─────────────────────────────────────────────
 *
 * Cinq appareils × deux battements par minute = une écriture toutes les six
 * secondes. Notion n'est pas fait pour cela (trois requêtes par seconde,
 * pages en doublon à chaque écriture ratée — voir kv-store.ts). Redis, oui.
 * Sans Redis, on garde un état en mémoire de l'instance : le bureau verra
 * ce que cette instance a vu, et c'est dit dans la réponse.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { redisEnabled } from "@/lib/redis-cache";
import { CLE_APPAREILS, CLE_SIGNAUX, ecrireChamp, lireHash, type EtatAppareil } from "@/lib/appareils";

export const dynamic = "force-dynamic";

const entier = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let corps: Record<string, unknown>;
  try { corps = await request.json(); } catch { return NextResponse.json({ error: "Requête illisible" }, { status: 400 }); }

  const appareil = String(corps.appareil || "").slice(0, 64);
  if (!appareil) return NextResponse.json({ error: "appareil requis" }, { status: 400 });

  /* On ne garde que ce qu'on attend, aux bons types : un battement est une
     donnée venue d'un navigateur, on ne la recopie pas aveuglément. */
  const rapports = Array.isArray(corps.rapportsNonEnvoyes)
    ? (corps.rapportsNonEnvoyes as unknown[]).slice(0, 50).flatMap((r) => {
        const o = r as Record<string, unknown>;
        const projectId = String(o?.projectId || "").slice(0, 64);
        return projectId ? [{
          projectId, depuis: entier(o.depuis), client: !!o.client, retenuPar: entier(o.retenuPar),
        }] : [];
      })
    : [];

  const etat: EtatAppareil = {
    appareil,
    email: user.email,
    nom: user.name,
    role: user.role,
    navigateur: String(corps.navigateur || "").slice(0, 80),
    enLigne: corps.enLigne !== false,
    photosEnAttente: entier(corps.photosEnAttente),
    photosEnEchec: entier(corps.photosEnEchec),
    requetesEnAttente: entier(corps.requetesEnAttente),
    rapportsNonEnvoyes: rapports,
    preparesHorsLigne: entier(corps.preparesHorsLigne),
    preparesQuand: entier(corps.preparesQuand),
    build: String(corps.build || "").slice(0, 40),
    vu: Date.now(),
  };
  await ecrireChamp(CLE_APPAREILS, appareil, JSON.stringify(etat));

  /* Le signal laissé par le bureau pour CET appareil, s'il y en a un. Le
     téléphone décide lui-même s'il l'a déjà vu (il retient la date). */
  let signal: { requestedAt: number; par?: string } | null = null;
  try {
    const brut = (await lireHash(CLE_SIGNAUX))[appareil];
    if (brut) signal = JSON.parse(brut);
  } catch { /* un signal illisible vaut pas de signal */ }

  return NextResponse.json({ ok: true, signal, memoireSeule: !redisEnabled });
}
