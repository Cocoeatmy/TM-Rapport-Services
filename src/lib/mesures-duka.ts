// Analyse d'un relevé de mesures Duka (PDF multi-lots) : détecte chaque
// « situation » (= lot), sa référence (ex. « 5.101 »), son modèle/série
// (ex. « primo ») et la plage de pages qu'elle occupe dans le PDF.
//
// Le PDF Duka a une structure régulière : une page récap (« LISTE DES
// SITUATIONS ») puis un bloc de pages par lot commençant par
// « SITUATIONS<n> - <réf> » et contenant « MODÈLE <série> … ART. … ».

export interface DukaLot {
  index: number;      // n° d'ordre dans le relevé (1, 2, 3…)
  ref: string;        // référence Duka du lot (ex. « 5.101 »)
  serie: string;      // modèle / série (ex. « primo »)
  pageStart: number;  // 1-based, incluse
  pageEnd: number;    // 1-based, incluse
}

export interface DukaParseResult {
  isDuka: boolean;
  numPages: number;
  lots: DukaLot[];
}

function cleanSerie(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+/, "")
    .trim()
    .slice(0, 60);
}

/** Extrait la série (valeur de « MODÈLE ») du texte d'une page de situation. */
function extractSerie(pageText: string): string {
  // « MODÈLE <valeur> ART. … »
  let m = pageText.match(/MOD[ÈE]LE\s*:?\s*(.*?)\s*ART\./i);
  if (m && m[1]) return cleanSerie(m[1]);
  // Repli : « NOTE SUR LA SITUATION <valeur> MONTAGE »
  m = pageText.match(/NOTE SUR LA SITUATION\s*(.*?)\s*MONTAGE/i);
  if (m && m[1]) return cleanSerie(m[1]);
  return "";
}

/**
 * Analyse un buffer PDF. Renvoie isDuka=false si le format n'est pas reconnu
 * (pas de page de situation) → l'appelant se rabat sur le rattachement par nom.
 */
export async function parseDukaReport(buffer: Buffer): Promise<DukaParseResult> {
  // Import direct du module interne pour éviter le code de debug de l'index
  // de pdf-parse (qui tente de lire un fichier de test au require).
  // @ts-ignore - pas de fichier de types pour ce sous-module interne
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    b: Buffer,
    opts?: any,
  ) => Promise<{ numpages: number }>;

  const pagesText: string[] = [];
  await pdfParse(buffer, {
    pagerender: (pageData: any) =>
      pageData.getTextContent().then((tc: any) => {
        const s = tc.items.map((i: any) => i.str).join(" ");
        pagesText.push(s);
        return s;
      }),
  });

  const numPages = pagesText.length;
  // Début d'un lot : « SITUATIONS<n> - <réf> » ET présence de « MODÈLE » sur la
  // même page (exclut la page récap « RÉFÉRENCE MODÈLE ET ARTICLE DÉFINIS »).
  const startRe = /SITUATIONS\s*(\d+)\s*-\s*(\d+\.\d+)/;
  const starts: { page: number; index: number; ref: string }[] = [];
  pagesText.forEach((txt, i) => {
    const m = txt.match(startRe);
    if (m && /MOD[ÈE]LE/i.test(txt)) {
      starts.push({ page: i + 1, index: parseInt(m[1], 10), ref: m[2] });
    }
  });

  const lots: DukaLot[] = starts.map((s, i) => {
    const pageEnd = i + 1 < starts.length ? starts[i + 1].page - 1 : numPages;
    return {
      index: s.index,
      ref: s.ref,
      serie: extractSerie(pagesText[s.page - 1] || ""),
      pageStart: s.page,
      pageEnd,
    };
  });

  return { isDuka: lots.length > 0, numPages, lots };
}

/** Normalise pour comparaison (minuscules, sans accents, espaces compactés). */
export function fold(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait l'« emplacement » d'un nom de fichier mesure « 1 fichier / lot »
 * (Duscholux, Novellini…). Formats tolérés :
 *   « Mesures <Marque> - <Emplacement> - <Client> - … »
 *   « Mesures - <Marque> - <Emplacement> - … »
 * Renvoie la liste des segments (hors « Mesures » et marque) pour un
 * rapprochement souple avec les noms de cabines.
 */
export function mesureFilenameSegments(fileName: string): string[] {
  const base = (fileName || "").replace(/\.[a-z0-9]+$/i, ""); // enlève l'extension
  return base
    .replace(/^mesures\s*[-:]?\s*/i, "")
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
}
