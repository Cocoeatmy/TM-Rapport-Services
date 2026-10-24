/**
 * Coordonnées d'adresses — le cache partagé (`geocode`) et la résolution
 * Nominatim, communs à /api/geocode (carte, tournée) et au prix plancher.
 */
import { getData } from "@/lib/kv-store";

export const CLE_CACHE_GEOCODE = "geocode";

export type Entree = { adresse: string; lat: number | null; lng: number | null };

/** Clé de cache : adresse normalisée, pour que deux graphies se rejoignent. */
export function cle(adresse: string): string {
  return adresse
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

export async function resoudre(adresse: string): Promise<{ lat: number; lng: number } | null> {
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

/**
 * Position d'une adresse : d'abord le cache, sinon UNE résolution (non
 * enregistrée ici : c'est /api/geocode qui tient le cache, avec ses règles).
 */
export async function positionDe(adresse: string, cache?: Entree[], resoudreSiAbsent = true): Promise<{ lat: number; lng: number } | null> {
  if (!adresse.trim()) return null;
  const liste = cache ?? await getData<Entree>(CLE_CACHE_GEOCODE).catch(() => [] as Entree[]);
  const e = liste.find((x) => x.adresse === cle(adresse));
  if (e) return e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null;
  return resoudreSiAbsent ? resoudre(adresse) : null;
}

