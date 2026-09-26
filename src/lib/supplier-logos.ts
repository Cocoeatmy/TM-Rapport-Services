/**
 * Logos des fournisseurs et grossistes.
 *
 * Extrait du tableau de bord pour être réutilisable ailleurs (aperçu de
 * projet…) sans importer tout le composant. Même table, même tolérance aux
 * accents : « Gétaz » et « getaz » désignent la même maison.
 */

const LOGOS: { prefix: string; logo: string; scale?: number; whiteOnTransparent?: boolean }[] = [
  { prefix: "getaz",      logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "gétaz",      logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "bms",        logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "duka",       logo: "/logos/fournisseurs/duka.ch-logo.png",    scale: 1.3 },
  { prefix: "duscholux",  logo: "/logos/fournisseurs/Duscholux-logo.png",  scale: 1.3 },
  { prefix: "ronal",      logo: "/logos/fournisseurs/ronal-logo-v2.png",   scale: 1.5 },
  { prefix: "nelo",       logo: "/logos/fournisseurs/Nelo-logo.jpg",       scale: 1.5 },
  { prefix: "novellini",  logo: "/logos/fournisseurs/Novellini-logo.png",  scale: 1.2, whiteOnTransparent: true },
  { prefix: "samo",       logo: "/logos/fournisseurs/Samo-logo.jpg",       scale: 1.5 },
  { prefix: "dubat",      logo: "/logos/fournisseurs/Dubat-Logo.png",      scale: 1.3 },
  { prefix: "tema",       logo: "/logos/fournisseurs/Tema-Logo.png",       scale: 1.4 },
  { prefix: "matway",     logo: "/logos/fournisseurs/Matway-Logo.png",     scale: 1.5, whiteOnTransparent: true },
  { prefix: "bringhen",   logo: "/logos/fournisseurs/Bringhen-logo.jpg" },
  { prefix: "kermi",      logo: "/logos/fournisseurs/Kermi-logo.png" },
  { prefix: "koralle",    logo: "/logos/fournisseurs/Koralle-logo.png" },
  { prefix: "bekon",      logo: "/logos/fournisseurs/Koralle-logo.png" },
  { prefix: "vismara",    logo: "/logos/fournisseurs/Vismaravetro-logo.png" },
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Logo d'un fournisseur, ou null s'il n'en a pas. */
export function supplierLogo(name: string): { src: string; white: boolean } | null {
  const n = fold(name || "").trim();
  if (!n) return null;
  const m = LOGOS.find((c) => n.startsWith(fold(c.prefix)) || n.includes(fold(c.prefix)));
  return m ? { src: m.logo, white: !!m.whiteOnTransparent } : null;
}
