const COLLABORATOR_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Claudio":         { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  "Jean-Marc":       { bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  "Jacobo":          { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  "Micael":          { bg: "#ede9fe", text: "#5b21b6", dot: "#8b5cf6" },
  "Miguel":          { bg: "#ffe4e6", text: "#9f1239", dot: "#f43f5e" },
  "Loïc":            { bg: "#ccfbf1", text: "#115e59", dot: "#14b8a6" },
  "Team TM":         { bg: "#e0f2fe", text: "#075985", dot: "#0ea5e9" },
  "Ferreira Micael": { bg: "#ede9fe", text: "#5b21b6", dot: "#8b5cf6" },
  "Atelier Art Home": { bg: "#f3e8ff", text: "#7e22ce", dot: "#a855f7" },
};

/**
 * Couleur PROPRE à chaque binôme.
 *
 * Côté macOS, chaque binôme a son propre calendrier avec sa propre couleur :
 * on reproduit ce principe plutôt que de donner au binôme la couleur du
 * premier monteur. La clé est normalisée (prénoms en minuscules, triés) pour
 * que « Claudio & Miguel » et « Miguel & Claudio » soient le même binôme.
 *
 * Pour ajuster une couleur sur celle du calendrier : changer `dot` (la teinte
 * pleine des barres et pastilles), `bg` (fond clair des étiquettes) et `text`.
 */
const TEAM_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "claudio|jean-marc": { bg: "#cffafe", text: "#155e75", dot: "#0891b2" }, // cyan
  "claudio|jacobo":    { bg: "#ede9fe", text: "#5b21b6", dot: "#7c3aed" }, // violet
  "claudio|loïc":      { bg: "#dbeafe", text: "#1e3a8a", dot: "#1d4ed8" }, // bleu profond
  "claudio|miguel":    { bg: "#fce7f3", text: "#9d174d", dot: "#db2777" }, // rose
  "jacobo|jean-marc":  { bg: "#ecfccb", text: "#3f6212", dot: "#65a30d" }, // lime
  "jacobo|loïc":       { bg: "#ffedd5", text: "#9a3412", dot: "#ea580c" }, // orange
  "jacobo|miguel":     { bg: "#fef3c7", text: "#854d0e", dot: "#a16207" }, // ambre foncé
  "jean-marc|loïc":    { bg: "#d1fae5", text: "#065f46", dot: "#059669" }, // émeraude
  "jean-marc|miguel":  { bg: "#fee2e2", text: "#991b1b", dot: "#dc2626" }, // rouge
  "loïc|miguel":       { bg: "#e0e7ff", text: "#3730a3", dot: "#4f46e5" }, // indigo
};

/** Clé normalisée d'un libellé d'équipe : prénoms minuscules, triés. */
function teamKey(label: string): string {
  return label
    .split("&")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Couleur d'un libellé d'équipe : un seul nom → couleur du collaborateur ;
 * binôme connu → sa couleur dédiée ; sinon teinte stable dérivée du libellé
 * (la même chaîne donne toujours la même couleur).
 */
export function getTeamColor(label: string) {
  const names = label.split("&").map((s) => s.trim()).filter(Boolean);
  if (names.length <= 1) return getCollaboratorColor(names[0] || label);
  const key = teamKey(label);
  if (TEAM_COLORS[key]) return TEAM_COLORS[key];
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

export function getCollaboratorColor(name: string) {
  if (COLLABORATOR_COLORS[name]) return COLLABORATOR_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return { bg: `hsl(${hue}, 70%, 92%)`, text: `hsl(${hue}, 70%, 25%)`, dot: `hsl(${hue}, 70%, 50%)` };
}
