// Historique des modifications par projet

export interface HistoryEntry {
  timestamp: number;
  user: string;
  action: string;
  details?: string;
}

const HISTORY_KEY = "tm-rapport-history";

function getAll(): Record<string, HistoryEntry[]> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function addHistory(projectId: string, user: string, action: string, details?: string) {
  const all = getAll();
  if (!all[projectId]) all[projectId] = [];
  all[projectId].unshift({
    timestamp: Date.now(),
    user,
    action,
    details,
  });
  // Garder les 50 dernières entrées par projet
  all[projectId] = all[projectId].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}

export function getHistory(projectId: string): HistoryEntry[] {
  return getAll()[projectId] || [];
}
