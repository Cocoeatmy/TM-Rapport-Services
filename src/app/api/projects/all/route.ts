import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;
/* Reconstruire cette liste depuis Notion demande une trentaine de
   secondes. Sans durée déclarée, la requête est coupée bien avant, et
   l'écran reste vide sur un serveur qui vient de démarrer. */
export const maxDuration = 60;

/* Pièces jointes allégées dans la LISTE.
 *
 * Douze des quatorze mégaoctets de cette réponse sont des pièces jointes. Les
 * écrans servis par cette adresse — « Projets en cours », « Archives », les
 * statistiques — affichent des noms, des dates et des nombres. Sur le téléphone
 * en 4G, c'était l'équivalent de cinq minutes de vidéo téléchargées pour une
 * liste de texte.
 *
 * Deux traitements différents, selon ce dont les écrans ont réellement besoin :
 *
 *   • DOCUMENTS ET OFFRES : retirés. Seul l'aperçu les affichait, et il va
 *     désormais les chercher sur la fiche du chantier quand on l'ouvre.
 *
 *   • PHOTOS : gardées, mais réduites à leur NOM. La conformité photo compte
 *     les séries par cabine à partir du nom du fichier, et les statistiques de
 *     livraison comptent les cartons : ces calculs continuent de fonctionner.
 *     Ce sont les adresses web, longues de plusieurs centaines de caractères,
 *     qui pesaient — et aucune image n'est affichée dans ces écrans.
 *
 * Un compte est conservé pour chaque champ retiré, afin de pouvoir savoir
 * qu'il y a quelque chose sans tout télécharger. */
const PIECES_RETIREES = [
  "documentsMesures", "documentsMontagee", "offresTM", "photosBonLivraison",
] as const;

const PHOTOS_SANS_URL = [
  "photosAvant", "photosDemontage", "photosMontage", "photosQRCode",
  "photosGaranties", "photosCartons", "photosCartonsRecus",
] as const;

function allegerListe(projets: Record<string, unknown>[]): Record<string, unknown>[] {
  return projets.map((p) => {
    const allege: Record<string, unknown> = { ...p };
    for (const champ of PIECES_RETIREES) {
      const v = allege[champ];
      if (Array.isArray(v)) {
        allege[champ] = [];
        allege[`${champ}Nb`] = v.length;
      }
    }
    for (const champ of PHOTOS_SANS_URL) {
      const v = allege[champ];
      if (Array.isArray(v)) {
        allege[champ] = (v as { name?: string }[]).map((f) => ({ name: f?.name || "" }));
      }
    }
    return allege;
  });
}

export async function GET() {
  try {
    // Liste TRÈS lourde (~1580 projets → "Projets en cours" / "Archives").
    // Servie par Redis (compressé) ; politique longue (10 min / 2 h) gérée dans
    // setCache pour limiter la charge Notion.
    const projects = await cachedOrFetch<Record<string, unknown>[]>("projects-all-raw", getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>);
    return cachedJson(allegerListe(projects), { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
