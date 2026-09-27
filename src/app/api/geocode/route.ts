/**
 * /api/geocode — coordonnées d'adresses, avec cache PERSISTANT.
 *
 * Le géocodage gratuit (Nominatim) est limité à une requête par seconde :
 * c'est ce qui avait rendu la carte des chantiers inutilisable, avec ses
 * dizaines d'adresses à résoudre à chaque affichage.
 *
 * Ici, la résolution se fait UNE SEULE FOIS par adresse : le résultat est
 * conservé côté serveur et partagé par tous les appareils. Une adresse déjà
 * vue revient instantanément. Le nombre de nouvelles adresses résolues par
 * appel est plafonné pour rester sous le temps d'exécution de la fonction ;
 * l'appelant relance simplement s'il en manque encore.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY = "geocode";
/** Au-delà, on rend ce qu'on a : l'appelant rappellera pour le reste. */
const MAX_NOUVELLES = 8;

type Entree = { adresse: string; lat: number | null; lng: number | null };

/** Clé de cache : adresse normalisée, pour que deux graphies se rejoignent. */
function cle(adresse: string): string {
  return adresse
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

async function resoudre(adresse: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = "https://nominatim.openstreetmap.org/search"
      + `?format=json&limit=1&countrycodes=ch,fr,de,it,at&q=${encodeURIComponent(adresse)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "TM-Rapport-Services/1.0 (planification de tournees)" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return null;
    const lat = Number(d[0].lat), lng = Number(d[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const adresses: string[] = Array.isArray(body?.adresses) ? body.adresses.filter(Boolean) : [];
  if (adresses.length === 0) return NextResponse.json({ resultats: {}, restant: 0 });

  const cache = await getData<Entree>(KEY);
  const connu = new Map(cache.map((e) => [e.adresse, e]));

  const resultats: Record<string, { lat: number; lng: number } | null> = {};
  const aResoudre: string[] = [];

  adresses.forEach((a) => {
    const k = cle(a);
    const e = connu.get(k);
    if (e) resultats[a] = e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null;
    else aResoudre.push(a);
  });

  const lot = aResoudre.slice(0, MAX_NOUVELLES);
  let modifie = false;
  for (let i = 0; i < lot.length; i++) {
    // Une requête par seconde : c'est la règle d'usage du service gratuit.
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const pos = await resoudre(lot[i]);
    const k = cle(lot[i]);
    connu.set(k, { adresse: k, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    resultats[lot[i]] = pos;
    modifie = true;
  }

  if (modifie) await setData<Entree>(KEY, [...connu.values()]);

  return NextResponse.json({
    resultats,
    restant: Math.max(0, aResoudre.length - lot.length),
  });
}
