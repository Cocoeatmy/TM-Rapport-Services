/**
 * Couleurs des collaborateurs et des binômes.
 *
 * Les teintes sont celles des calendriers macOS de TM Douche (relevées dans
 * Calendrier.app) : un monteur ou un binôme porte dans l'app EXACTEMENT la
 * couleur de son calendrier, pour qu'on reconnaisse les mêmes repères des deux
 * côtés. Seule différence : le calendrier affiche « Prénom Nom », l'app se
 * contente du prénom.
 *
 * `dot` est la couleur du calendrier, telle quelle : c'est elle qu'on voit sur
 * les barres, les pastilles et les légendes. `bg` (fond clair d'étiquette) et
 * `text` (texte lisible sur ce fond) en sont dérivés automatiquement, pour
 * qu'une correction de teinte n'ait à se faire qu'à un seul endroit.
 */

/* ── Teintes relevées dans Calendrier.app ────────────────────────────────── */

/** Un monteur seul → la couleur de son calendrier personnel. */
const CALENDAR_DOTS: Record<string, string> = {
  claudio: "#ffd54f",      // Claudio Zanutto
  jacobo: "#00e676",       // Jacob Fontan Casas
  "jean-marc": "#795548",  // Jean-Marc Nelzi
  loic: "#ff4081",         // Loïc Schiro
  miguel: "#827717",       // Miguel Roberto
  micael: "#263238",       // Micael Ferreira
  natalia: "#009688",      // Natalia Puerta
  "team tm": "#ff6d00",    // Team TM Douche Montage
};

/** Un binôme → la couleur de SON calendrier, pas celle d'un de ses membres. */
const CALENDAR_TEAM_DOTS: Record<string, string> = {
  "claudio|jacobo": "#e57373",
  "claudio|jean-marc": "#00308c",
  "claudio|loic": "#0091ea",
  "claudio|miguel": "#33691e",
  "jacobo|jean-marc": "#1de9b6",
  "jacobo|loic": "#b71c1c",
  "jacobo|miguel": "#b39ddb",
  "jean-marc|loic": "#80deea",
  "jean-marc|miguel": "#651fff",
  "loic|miguel": "#2962ff",
};

/** Hors calendrier montage : conservé tel quel. */
const EXTRA_DOTS: Record<string, string> = {
  "atelier art home": "#a855f7",
};

/* ── Dérivation bg / text ────────────────────────────────────────────────── */

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Luminance relative approchée — sert à garantir un texte lisible. */
function luminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Étiquette lisible à partir d'une couleur de calendrier :
 * fond = la teinte très éclaircie, texte = la teinte assombrie jusqu'à un
 * contraste confortable (certaines couleurs, comme le jaune de Claudio, sont
 * illisibles telles quelles sur du clair).
 */
function labelFromDot(dot: string) {
  const [r, g, b] = toRgb(dot);
  const bg = toHex(r + (255 - r) * 0.86, g + (255 - g) * 0.86, b + (255 - b) * 0.86);
  let f = 1;
  while (f > 0.2 && luminance(r * f, g * f, b * f) > 0.13) f -= 0.05;
  return { bg, text: toHex(r * f, g * f, b * f), dot };
}

/** Clé de recherche : minuscules, sans accent, espaces réduits. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Prénom d'un collaborateur, sous la forme utilisée par les clés ci-dessus. */
function firstNameKey(name: string): string {
  const n = norm(name);
  if (n.startsWith("team")) return "team tm";
  for (const key of Object.keys(CALENDAR_DOTS)) {
    if (key === "team tm") continue;
    // « Jean-Marc Nelzi », « Nelzi Jean-Marc » ou « Jean-Marc » → jean-marc.
    if (n === key || n.startsWith(key + " ") || n.endsWith(" " + key)) return key;
  }
  // Le calendrier écrit « Jacob », l'app « Jacobo » : même personne.
  if (n === "jacob" || n.startsWith("jacob ")) return "jacobo";
  return n;
}

/** Clé normalisée d'un libellé d'équipe : prénoms sans accent, triés. */
function teamKey(label: string): string {
  return label
    .split("&")
    .map((s) => firstNameKey(s))
    .filter(Boolean)
    .sort()
    .join("|");
}

/* ── API publique (inchangée) ────────────────────────────────────────────── */

export function getCollaboratorColor(name: string) {
  const key = firstNameKey(name);
  const dot = CALENDAR_DOTS[key] || EXTRA_DOTS[key];
  if (dot) return labelFromDot(dot);
  // Inconnu : teinte stable dérivée du libellé (la même chaîne donne toujours
  // la même couleur), comportement historique.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return { bg: `hsl(${hue}, 70%, 92%)`, text: `hsl(${hue}, 70%, 25%)`, dot: `hsl(${hue}, 70%, 50%)` };
}

/**
 * Couleur d'un libellé d'équipe : un seul nom → couleur du collaborateur ;
 * binôme connu → la couleur de SON calendrier ; sinon repli sur la teinte
 * stable dérivée du libellé.
 */
export function getTeamColor(label: string) {
  const names = label.split("&").map((s) => s.trim()).filter(Boolean);
  if (names.length <= 1) return getCollaboratorColor(names[0] || label);
  const dot = CALENDAR_TEAM_DOTS[teamKey(label)];
  if (dot) return labelFromDot(dot);
  return getCollaboratorColor(label);
}

const COLLABORATOR_INITIALS: Record<string, string> = {
  "Micael": "MF",
  "Micael Ferreira": "MF",
  "Ferreira Micael": "MF",
  "Claudio": "CZ",
  "Claudio Zanutto": "CZ",
  "Jean-Marc": "JMN",
  "Jean-Marc Nelzi": "JMN",
  "Jean-Marc Nezli": "JMN",
  "Jacobo": "JF",
  "Jacobo Fontan Cassas": "JF",
  "Miguel": "MR",
  "Miguel Roberto": "MR",
  "Loïc": "LS",
  "Loic": "LS",
  "Loic Schiro": "LS",
  "Loïc Schiro": "LS",
  "Team TM": "TM",
  "Atelier Art Home": "AH",
};

export function getCollaboratorInitials(name: string): string {
  const trimmed = name.trim();
  if (COLLABORATOR_INITIALS[trimmed]) return COLLABORATOR_INITIALS[trimmed];
  // Fallback: première lettre de chaque mot
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return trimmed[0]?.toUpperCase() || "?";
}
