/**
 * Normalisation et structuration du « Rapport du monteur ».
 *
 * Modèle : le rapport se compose de
 *   - une partie GÉNÉRALE (phrases type + précisions libres), en tête ;
 *   - une ligne (ou bloc multi-lignes) PAR LOT, au format « Nom : texte ».
 *
 * La section par lot est désormais GÉNÉRÉE depuis les données des cabines
 * (triée, noms à jour) — voir `buildCabineReportLines`. Au chargement, on
 * ré-éclate un rapport existant en (général + par cabine) via
 * `splitRapportByCabine` pour alimenter ce modèle.
 */

/** Normalise un libellé de lot pour comparaison tolérante (espaces/tirets/casse). */
function norm(s: string | undefined | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Un « titre de lot » est une ligne « <id> : … » dont l'identifiant contient au
 * moins un chiffre. On accepte désormais les ESPACES et lettres accentuées dans
 * l'identifiant (« B01 - Douche : … », « B02 sdb : … »), avec une longueur
 * bornée pour ne pas confondre avec une phrase générale contenant « : ».
 */
const HEADER_RE = /^([A-Za-z0-9][\wÀ-ÿ .\-]{0,30}?\d[\wÀ-ÿ .\-]{0,30}?)\s*:\s+.*$/;

export function normalizeRapportMonteur(raw: string | null | undefined): string {
  if (!raw) return "";

  type Block = { id: string; lines: string[] };
  const general: string[] = [];
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue; // on saute les lignes vides
    const m = line.match(HEADER_RE);
    if (m) {
      current = { id: m[1].trim(), lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line); // continuation de la cabine courante
    } else {
      general.push(line); // rapport général (avant tout titre de cabine)
    }
  }

  // Texte APRÈS « id : » d'une ligne d'en-tête (pour repérer les continuations
  // qui ne font que redoubler le texte du lot).
  const headerText = (line: string) => line.replace(/^[^:]*:\s*/, "").trim();

  // ── Déduplication (répare les rapports historiques accumulés) ──────────────
  // 1) Dans chaque bloc : lignes en double + continuation identique à l'en-tête.
  for (const b of blocks) {
    const ht = headerText(b.lines[0]);
    const seen = new Set<string>();
    b.lines = b.lines.filter((ln, i) => {
      if (seen.has(ln)) return false;
      seen.add(ln);
      if (i > 0 && ln === ht) return false; // « texte » nu qui redouble « id : texte »
      return true;
    });
  }
  // 2) Blocs entièrement identiques (même id + même contenu) → un seul.
  const seenBlocks = new Set<string>();
  const uniqueBlocks = blocks.filter((b) => {
    const key = `${b.id}|${b.lines.join("\n")}`;
    if (seenBlocks.has(key)) return false;
    seenBlocks.add(key);
    return true;
  });

  // Tri naturel des cabines par identifiant (alphabétique puis numérique).
  uniqueBlocks.sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true, sensitivity: "base" }));

  // 3) Général : lignes en double + lignes nues qui redoublent le texte d'un lot.
  const blockTexts = new Set(uniqueBlocks.map((b) => headerText(b.lines[0])));
  const seenGen = new Set<string>();
  const cleanGeneral = general.filter((ln) => {
    if (seenGen.has(ln) || blockTexts.has(ln)) return false;
    seenGen.add(ln);
    return true;
  });

  const chunks: string[] = [];
  if (cleanGeneral.length) chunks.push(cleanGeneral.join("\n"));
  for (const b of uniqueBlocks) chunks.push(b.lines.join("\n"));
  return chunks.join("\n\n");
}

/**
 * Génère la section « par lot » d'un rapport à partir des cabines : une entrée
 * « Nom : texte » par cabine ayant un rapport, TRIÉE alphabétiquement puis
 * numériquement, avec le nom À JOUR (donc un renommage se répercute tout seul).
 * Les blocs sont séparés par une ligne vide.
 */
export function buildCabineReportLines(cabines: { nom: string; rapport: string }[]): string {
  return cabines
    .filter((c) => c.rapport && c.rapport.trim())
    .map((c) => ({ nom: (c.nom || "").trim(), rapport: c.rapport.trim() }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true, sensitivity: "base" }))
    .map((c) => `${c.nom} : ${c.rapport}`)
    .join("\n\n");
}

/**
 * Ré-éclate un rapport (texte libre) en partie GÉNÉRALE + texte PAR CABINE,
 * en rattachant chaque bloc « Nom : … » à la cabine dont le nom correspond
 * (comparaison tolérante). Les blocs non reconnus restent dans le général
 * (aucune perte). Sert au chargement pour alimenter le modèle structuré.
 */
export function splitRapportByCabine(
  raw: string | null | undefined,
  noms: string[],
): { general: string; perCabine: Record<number, string> } {
  const general: string[] = [];
  const per: Record<number, string[]> = {};
  const nomKeys = noms.map(norm);
  let currentIdx: number | null = null;

  // Retrouve l'index de cabine d'un libellé de lot :
  //  1) correspondance exacte (normalisée) ;
  //  2) sinon correspondance par PRÉFIXE UNIQUE (« A02 » ↔ « A02 - Bains »),
  //     uniquement si UNE seule cabine correspond (jamais d'appariement ambigu).
  const findCabine = (label: string): number => {
    const key = norm(label);
    if (!key) return -1;
    const exact = nomKeys.findIndex((k) => k && k === key);
    if (exact >= 0) return exact;
    const matches: number[] = [];
    nomKeys.forEach((k, idx) => { if (k && (k.startsWith(key) || key.startsWith(k))) matches.push(idx); });
    return matches.length === 1 ? matches[0] : -1;
  };

  for (const rawLine of (raw || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (currentIdx === null) general.push("");
      else per[currentIdx].push("");
      continue;
    }
    const m = line.match(/^(.+?)\s*:\s+(.*)$/);
    let matchedIdx: number | null = null;
    if (m) {
      const i = findCabine(m[1]);
      if (i >= 0) matchedIdx = i;
    }
    if (matchedIdx !== null && m) {
      currentIdx = matchedIdx;
      if (!per[matchedIdx]) per[matchedIdx] = [];
      per[matchedIdx].push(m[2]);
    } else if (currentIdx !== null) {
      per[currentIdx].push(line); // continuation du dernier lot
    } else {
      general.push(line);
    }
  }

  const perCabine: Record<number, string> = {};
  for (const [k, arr] of Object.entries(per)) {
    // Déduplique les lignes (rapports historiques doublés) tout en gardant l'ordre.
    const seen = new Set<string>();
    const deduped = arr.filter((ln) => {
      const t = ln.trim();
      if (!t) return true; // on garde les sauts pour le nettoyage \n{3,} ci-dessous
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
    const txt = deduped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (txt) perCabine[Number(k)] = txt;
  }
  return {
    general: general.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    perCabine,
  };
}
