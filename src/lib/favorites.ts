const FAVS_KEY = "tm-rapport-favorites";

export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function toggleFavorite(projectId: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(projectId);
  if (idx >= 0) {
    favs.splice(idx, 1);
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
    return false;
  } else {
    favs.push(projectId);
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
    return true;
  }
}

export function isFavorite(projectId: string): boolean {
  return getFavorites().includes(projectId);
}
