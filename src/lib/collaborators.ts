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

const COLLABORATOR_INITIALS: Record<string, string> = {
  "Micael": "MF",
  "Ferreira Micael": "MF",
  "Claudio": "CZ",
  "Jean-Marc": "JMN",
  "Jacobo": "JF",
  "Miguel": "MR",
  "Loïc": "LS",
  "Loic": "LS",
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
