/**
 * Le rapport dicté : une seule dictée pour toute la visite, rangée par l'IA
 * (24.10.2026).
 *
 * Le monteur parle librement — « Lot 3 OK, client content. Lot 4 : joint de
 * porte à reprendre, il manque une poignée. » — et l'IA :
 *   - répartit ce qui est dit entre les lots (numéro 0 = le chantier entier) ;
 *   - coche les phrases toutes faites qui correspondent ;
 *   - rédige le reste en phrases propres, pour le client, sans rien inventer ;
 *   - met à part ce qui ne regarde pas le client (note interne) ;
 *   - repère les pièces à commander et les défauts, PROPOSÉS seulement.
 *
 * Rien n'est écrit sans la relecture du monteur. Ce module ne contient que
 * des fonctions pures : la consigne, le schéma de réponse, le nettoyage de
 * ce que renvoie l'IA (qui peut se tromper de lot ou paraphraser une phrase
 * toute faite), et la façon d'ajouter le tout à un rapport existant.
 */

/** Un lot tel que l'IA doit le connaître. Numéro 0 = le chantier entier. */
export interface LotDictee {
  numero: number;
  nom: string;
  /** Les phrases toutes faites qu'on peut cocher pour ce lot. */
  options: string[];
}

export interface PartieDictee {
  numero: number;
  /** Phrases toutes faites à cocher — toujours copiées EXACTEMENT de la liste. */
  coches: string[];
  /** Le reste, rédigé pour le client. */
  texte: string;
}

export interface SignalementPropose {
  numero: number;
  type: "piece" | "defaut";
  description: string;
}

export interface AnalyseDictee {
  parties: PartieDictee[];
  noteInterne: string;
  signalements: SignalementPropose[];
}

export const LIMITE_TEXTE = 8000;
export const LIMITE_LOTS = 80;

export function consigneAnalyse(lots: LotDictee[]): string {
  const liste = lots.map((l) => {
    const opts = l.options.length
      ? `\n    Phrases toutes faites :\n${l.options.map((o) => `      - ${o}`).join("\n")}`
      : "\n    (pas de phrase toute faite)";
    return `  - numéro ${l.numero} : ${l.nom}${opts}`;
  }).join("\n");
  return [
    "Tu reçois la transcription d'un monteur de cabines de douche qui dicte le rapport de sa visite sur un chantier.",
    "Ta tâche : ranger ce qu'il a dit, SANS RIEN INVENTER.",
    "",
    "Les lots du chantier (le numéro 0 désigne le chantier entier) :",
    liste,
    "",
    "Règles :",
    "1. Rattache chaque propos au lot dont il parle (par son numéro, son nom, son étage…). Ce qui ne vise aucun lot précis va au numéro 0.",
    "2. Pour chaque lot, coche les phrases toutes faites qui disent ce que le monteur a dit. Recopie-les EXACTEMENT, caractère pour caractère. N'en coche aucune s'il n'en a pas parlé.",
    "3. Dans « texte », écris en phrases courtes et professionnelles, à destination du client, ce qui a été dit et n'est pas déjà couvert par une phrase cochée. Vouvoiement inutile : style constat (« Le joint de la porte a été repris. »). N'ajoute aucune information.",
    "4. Ce qui ne doit pas être lu par le client (remarque sur le client, organisation interne, retard, oubli, matériel de l'équipe) va dans « noteInterne », pas dans le texte.",
    "5. Une pièce manquante ou à commander → un signalement de type « piece ». Un défaut, une casse, une rayure, un élément abîmé ou non conforme → type « defaut ». Description courte et précise. Ne propose un signalement que si le monteur l'a dit.",
    "6. Ne mets jamais de prix ni de montant.",
    "7. Si quelque chose n'a pas été dit, laisse vide. N'omets aucun lot mentionné.",
  ].join("\n");
}

/** Schéma de réponse JSON (format Gemini `responseSchema`). */
export const SCHEMA_ANALYSE = {
  type: "OBJECT",
  properties: {
    parties: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          numero: { type: "INTEGER" },
          coches: { type: "ARRAY", items: { type: "STRING" } },
          texte: { type: "STRING" },
        },
        required: ["numero", "coches", "texte"],
      },
    },
    noteInterne: { type: "STRING" },
    signalements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          numero: { type: "INTEGER" },
          type: { type: "STRING", enum: ["piece", "defaut"] },
          description: { type: "STRING" },
        },
        required: ["numero", "type", "description"],
      },
    },
  },
  required: ["parties", "noteInterne", "signalements"],
} as const;

const plat = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'")
  .replace(/\s+/g, " ").trim().toLowerCase();

/** Numéro où va ce qui n'a pas de lot : 0 s'il existe, sinon le premier lot. */
export function numeroParDefaut(lots: LotDictee[]): number {
  return lots.some((l) => l.numero === 0) ? 0 : (lots[0]?.numero ?? 0);
}

/** Tout le texte dans la partie par défaut — quand l'IA ne répond pas. */
export function analyseDeSecours(lots: LotDictee[], transcription: string): AnalyseDictee {
  return {
    parties: [{ numero: numeroParDefaut(lots), coches: [], texte: transcription.trim() }],
    noteInterne: "",
    signalements: [],
  };
}

/**
 * Nettoie la réponse de l'IA : lots inconnus ramenés au lot par défaut,
 * phrases toutes faites ramenées à leur texte exact (ou écartées si elles
 * n'existent pas pour ce lot), doublons fusionnés. Une réponse vide ou
 * illisible donne l'analyse de secours — la dictée n'est jamais perdue.
 */
export function normaliserAnalyse(brut: unknown, lots: LotDictee[], transcription: string): AnalyseDictee {
  const defaut = numeroParDefaut(lots);
  const parNumero = new Map(lots.map((l) => [l.numero, l]));
  const numeroValide = (n: unknown) => (typeof n === "number" && parNumero.has(n) ? n : defaut);
  const obj = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;

  const parties = new Map<number, PartieDictee>();
  const partie = (n: number) => {
    let p = parties.get(n);
    if (!p) { p = { numero: n, coches: [], texte: "" }; parties.set(n, p); }
    return p;
  };
  for (const item of Array.isArray(obj.parties) ? obj.parties : []) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const n = numeroValide(it.numero);
    const p = partie(n);
    const options = parNumero.get(n)?.options ?? [];
    for (const c of Array.isArray(it.coches) ? it.coches : []) {
      if (typeof c !== "string") continue;
      const exacte = options.find((o) => plat(o) === plat(c));
      if (exacte && !p.coches.includes(exacte)) p.coches.push(exacte);
      // Une phrase qui n'existe pas pour ce lot : on garde le propos dans le texte.
      else if (!exacte && c.trim()) p.texte = [p.texte, c.trim()].filter(Boolean).join(" ");
    }
    const t = typeof it.texte === "string" ? it.texte.trim() : "";
    if (t) p.texte = [p.texte, t].filter(Boolean).join(" ");
  }

  const signalements: SignalementPropose[] = [];
  for (const item of Array.isArray(obj.signalements) ? obj.signalements : []) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const description = typeof it.description === "string" ? it.description.trim() : "";
    if (!description) continue;
    signalements.push({
      numero: numeroValide(it.numero),
      type: it.type === "piece" ? "piece" : "defaut",
      description,
    });
  }
  const noteInterne = typeof obj.noteInterne === "string" ? obj.noteInterne.trim() : "";

  const utiles = [...parties.values()].filter((p) => p.coches.length || p.texte)
    .sort((a, b) => a.numero - b.numero);
  if (!utiles.length && !noteInterne && !signalements.length) return analyseDeSecours(lots, transcription);
  return { parties: utiles, noteInterne, signalements };
}

/**
 * Ajoute à un rapport existant : d'abord les phrases cochées qui n'y sont
 * pas encore (une ligne chacune, comme la case à cocher de l'écran), puis le
 * texte. Rien n'est jamais retiré ni réécrit.
 */
export function ajouterAuRapport(actuel: string, coches: string[], texte: string): string {
  let r = actuel || "";
  for (const c of coches) {
    if (r.includes(c)) continue;
    r = r.trim() ? `${r.replace(/\s+$/, "")}\n${c}` : c;
  }
  const t = texte.trim();
  if (t && !r.includes(t)) r = r.trim() ? `${r.replace(/\s+$/, "")}\n${t}` : t;
  return r;
}
