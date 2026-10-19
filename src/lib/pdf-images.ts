/**
 * Les images d'un PDF, téléchargées AVANT le rendu.
 *
 * Le moteur PDF (@react-pdf) télécharge lui-même les images au moment du
 * rendu, toutes à la fois et seulement une fois la fiche, les défauts et les
 * pièces relus. On les demande ici dès que la fiche est connue, en parallèle
 * des autres lectures, avec une concurrence bornée — et on les garde en
 * mémoire : une adresse Cloudinary est versionnée, son contenu ne change pas.
 * Le PDF « client » qui suit un PDF « interne » ne retélécharge donc rien.
 *
 * Mêmes adresses, mêmes octets qu'avant : aucune perte de qualité. Une image
 * absente du cache (ou d'un format que le moteur ne lit pas) retombe sur le
 * téléchargement habituel par le moteur.
 */
type ImagePdf = { data: Buffer; format: "jpg" | "png" };

const PLAFOND_OCTETS = 96 * 1024 * 1024;
const cache = new Map<string, ImagePdf>(); // ordre d'insertion = ancienneté
let octetsEnCache = 0;

function formatDe(b: Buffer): "jpg" | "png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

function garder(url: string, img: ImagePdf) {
  if (cache.has(url)) return;
  cache.set(url, img);
  octetsEnCache += img.data.length;
  for (const [cle, v] of cache) {
    if (octetsEnCache <= PLAFOND_OCTETS) break;
    cache.delete(cle);
    octetsEnCache -= v.data.length;
  }
}

/** L'image déjà téléchargée pour cette adresse, ou l'adresse elle-même. */
export function sourceImage(url: string): string | ImagePdf {
  const vu = cache.get(url);
  if (!vu) return url;
  // Rafraîchit l'ancienneté (le moins récemment utilisé part en premier).
  cache.delete(url); cache.set(url, vu);
  return vu;
}

/** Télécharge les images manquantes, `concurrence` à la fois. Ne lève jamais. */
export async function prechargerImages(urls: string[], concurrence = 16, delaiMs = 15_000): Promise<{ demandees: number; chargees: number; octets: number }> {
  const aFaire = [...new Set(urls.filter((u) => typeof u === "string" && /^https:\/\//.test(u) && !cache.has(u)))];
  let chargees = 0, octets = 0, i = 0;
  const ouvrier = async () => {
    while (i < aFaire.length) {
      const url = aFaire[i++];
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(delaiMs) });
        if (!r.ok) continue;
        const data = Buffer.from(await r.arrayBuffer());
        const format = formatDe(data);
        if (!format) continue; // format illisible par le moteur : il retentera lui-même
        garder(url, { data, format });
        chargees++; octets += data.length;
      } catch { /* le moteur retentera cette adresse au rendu */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrence, aFaire.length) }, ouvrier));
  return { demandees: aFaire.length, chargees, octets };
}
