/**
 * Tracé d'une courbe lissée passant par des points.
 *
 * Interpolation de Catmull-Rom convertie en Bézier : la courbe passe
 * exactement par chaque point relevé — une courbe qui les « approche »
 * ferait mentir le graphique — tout en évitant les angles secs qui rendent
 * une tendance illisible.
 *
 * Partagé par les graphiques de l'app (statistiques, CA-Bexio) : une même
 * donnée doit se dessiner de la même façon partout.
 */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
