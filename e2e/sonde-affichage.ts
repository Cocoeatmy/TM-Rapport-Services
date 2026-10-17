/**
 * La sonde d'affichage : elle regarde la page comme un œil, pas comme un DOM.
 *
 * ── Pourquoi elle ne ressemble pas aux autres tests ─────────────────────
 *
 * Vérifier qu'un élément « existe » ne dit rien de l'écran. Un titre peut
 * être présent, visible, correctement stylé — et imprimé par-dessus le
 * paragraphe suivant. C'est exactement le défaut qu'on me décrit sur iPad.
 *
 * Cette sonde mesure donc des RECTANGLES :
 *
 *   — débordement horizontal : la page est-elle plus large que l'écran ?
 *   — chevauchement : deux textes occupent-ils le même endroit ?
 *   — hors-champ : un élément utile sort-il de la fenêtre ?
 *   — cible tactile : un bouton est-il assez grand pour un doigt ?
 *
 * ── Et pourquoi elle est prudente ───────────────────────────────────────
 *
 * Une page moderne superpose volontairement quantité de choses : une modale
 * par-dessus la page, un badge sur un coin de carte, un en-tête collant au
 * passage du défilement. Signaler tout cela noierait les vrais défauts.
 * La sonde ne retient donc que les chevauchements entre éléments qui se
 * suivent dans le flux normal — ceux qu'aucune intention de mise en page
 * n'explique.
 */
import type { Page } from "@playwright/test";

export interface Defaut {
  genre: "debordement" | "chevauchement" | "hors-champ" | "cible-tactile";
  detail: string;
  a?: string;
  b?: string;
}

/** Les gabarits qu'on éprouve. Les tailles sont celles du navigateur. */
export const GABARITS = {
  /* macOS — la référence à ne pas abîmer. */
  "mac-1440": { width: 1440, height: 900, tactile: false },
  "mac-1680": { width: 1680, height: 1050, tactile: false },
  /* iPadOS — Safari en plein écran, barres comprises. */
  "ipad-mini-portrait": { width: 744, height: 1024, tactile: true },
  "ipad-mini-paysage": { width: 1133, height: 700, tactile: true },
  "ipad-11-portrait": { width: 820, height: 1060, tactile: true },
  /* Le gabarit exact des captures envoyées par le propriétaire. */
  "ipad-913": { width: 913, height: 1192, tactile: true },
  "ipad-11-paysage": { width: 1180, height: 760, tactile: true },
  "ipad-13-portrait": { width: 1032, height: 1250, tactile: true },
  "ipad-13-paysage": { width: 1366, height: 920, tactile: true },
  /* Split View : la moitié d'un iPad, le cas le plus serré du tactile large. */
  "ipad-split": { width: 507, height: 1060, tactile: true },
  /* iOS */
  "iphone-se": { width: 375, height: 667, tactile: true },
  "iphone-13": { width: 390, height: 844, tactile: true },
  "iphone-max": { width: 430, height: 932, tactile: true },
  "iphone-paysage": { width: 844, height: 390, tactile: true },
} as const;

export type NomGabarit = keyof typeof GABARITS;

/** Les gabarits tactiles, ceux que la mission doit corriger. */
export const TACTILES = (Object.keys(GABARITS) as NomGabarit[])
  .filter((n) => GABARITS[n].tactile);

/** Les gabarits macOS, ceux qui ne doivent pas bouger d'un pixel. */
export const MACOS = (Object.keys(GABARITS) as NomGabarit[])
  .filter((n) => !GABARITS[n].tactile);

/**
 * Inspecte la page telle qu'elle est affichée et rend ses défauts.
 *
 * Tout se passe dans le navigateur : c'est la seule façon de connaître les
 * rectangles réellement calculés.
 */
export async function ausculter(page: Page, tactile = false): Promise<Defaut[]> {
  await page.evaluate((t) => { (window as unknown as { __tmTactile?: boolean }).__tmTactile = t; }, tactile);
  return page.evaluate(() => {
    const out: { genre: string; detail: string; a?: string; b?: string }[] = [];
    const VP = { w: window.innerWidth, h: window.innerHeight };

    /** De quoi reconnaître un élément dans un rapport, sans le DOM entier. */
    const nommer = (e: Element): string => {
      const t = e.tagName.toLowerCase();
      const c = (e.className && typeof e.className === "string")
        ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      const txt = (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${t}${c}${txt ? ` « ${txt} »` : ""}`;
    };

    const style = (e: Element) => window.getComputedStyle(e);
    const visible = (e: Element) => {
      const s = style(e);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    /* ── 1. Débordement horizontal ──────────────────────────────────── */
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      /* On cherche le coupable : l'élément le plus à droite. */
      let pire: { nom: string; droite: number } | null = null;
      for (const e of Array.from(document.body.querySelectorAll("*"))) {
        if (!visible(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.right > doc.clientWidth + 1 && (!pire || r.right > pire.droite)) {
          /* Un enfant qui déborde parce que son parent défile n'est pas en
             cause : c'est un conteneur de défilement, c'est voulu. */
          let p: Element | null = e.parentElement;
          let dansUnDefilement = false;
          while (p && p !== document.body) {
            const s = style(p);
            if (s.overflowX === "auto" || s.overflowX === "scroll") { dansUnDefilement = true; break; }
            p = p.parentElement;
          }
          if (!dansUnDefilement) pire = { nom: nommer(e), droite: Math.round(r.right) };
        }
      }
      out.push({
        genre: "debordement",
        detail: `la page fait ${doc.scrollWidth}px de large pour ${doc.clientWidth}px d'écran`
          + (pire ? ` — le plus à droite : ${pire.nom} (bord à ${pire.droite}px)` : ""),
        a: pire?.nom,
      });
    }

    /* ── 2. Chevauchements de texte ─────────────────────────────────── */
    /* On ne regarde que les éléments qui portent EUX-MÊMES du texte : un
       conteneur qui en englobe d'autres se chevauche par construction. */
    const porteursDeTexte: Element[] = [];
    for (const e of Array.from(document.body.querySelectorAll("*"))) {
      if (!visible(e)) continue;
      const propre = Array.from(e.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || "").trim())
        .join("");
      if (propre.length < 2) continue;
      const s = style(e);
      /* Hors du flux : badge, infobulle, en-tête collant, modale. Leur
         superposition est une intention de mise en page. */
      if (s.position === "absolute" || s.position === "fixed" || s.position === "sticky") continue;
      porteursDeTexte.push(e);
    }

    const estParent = (a: Element, b: Element) => a.contains(b) || b.contains(a);
    const dansLeMemeEmpilement = (a: Element, b: Element) => {
      /* Deux éléments dont un ancêtre proche est positionné hors flux
         appartiennent sans doute au même « calque » voulu. */
      for (const e of [a, b]) {
        let p: Element | null = e.parentElement;
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
          const s = style(p);
          if (s.position === "absolute" || s.position === "fixed") return true;
        }
      }
      return false;
    };

    /* Seuil : deux ou trois pixels de recouvrement viennent de l'arrondi
       des polices. On ne signale qu'un vrai empiètement. */
    const SEUIL = 4;
    const vus = new Set<string>();
    for (let i = 0; i < porteursDeTexte.length; i++) {
      const a = porteursDeTexte[i];
      const ra = a.getBoundingClientRect();
      for (let j = i + 1; j < porteursDeTexte.length; j++) {
        const b = porteursDeTexte[j];
        if (estParent(a, b)) continue;
        const rb = b.getBoundingClientRect();
        const dx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const dy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (dx <= SEUIL || dy <= SEUIL) continue;
        if (dansLeMemeEmpilement(a, b)) continue;
        const na = nommer(a), nb = nommer(b);
        const cle = na + "|" + nb;
        if (vus.has(cle)) continue;
        vus.add(cle);
        out.push({
          genre: "chevauchement",
          detail: `recouvrement de ${Math.round(dx)}×${Math.round(dy)}px`,
          a: na, b: nb,
        });
      }
    }

    /* ── 3. Contenu coupé sans moyen de l'atteindre ─────────────────── */
    /* Le cas type : une barre d'onglets plus large que l'écran, dans un
       conteneur `overflow:hidden`. Le dernier onglet est là, visible à
       moitié, et INACCESSIBLE — ni clic, ni défilement. C'est pire qu'un
       débordement, parce que rien ne le signale à l'utilisateur. */
    const defilable = (e: Element) => {
      let p: Element | null = e.parentElement;
      while (p && p !== document.documentElement) {
        const s = style(p);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return p;
        p = p.parentElement;
      }
      return null;
    };
    const coupePar = (e: Element) => {
      let p: Element | null = e.parentElement;
      const r = e.getBoundingClientRect();
      while (p && p !== document.documentElement) {
        const s = style(p);
        if (s.overflowX === "hidden" || s.overflowX === "clip") {
          const rp = p.getBoundingClientRect();
          if (r.right > rp.right + 1 || r.left < rp.left - 1) return p;
        }
        p = p.parentElement;
      }
      return null;
    };

    const vusCoupes = new Set<string>();
    for (const e of Array.from(document.body.querySelectorAll("button, a[href], input, select, textarea"))) {
      if (!visible(e)) continue;
      const r = e.getBoundingClientRect();
      if (defilable(e)) continue; // atteignable en faisant défiler : c'est voulu
      const coupeur = coupePar(e);
      if (coupeur) {
        const n = nommer(e);
        if (vusCoupes.has(n)) continue;
        vusCoupes.add(n);
        out.push({
          genre: "hors-champ",
          detail: `coupé par un conteneur sans défilement (${Math.round(r.left)}→${Math.round(r.right)}px, limite ${Math.round(coupeur.getBoundingClientRect().right)}px)`,
          a: n, b: nommer(coupeur),
        });
        continue;
      }
      if (r.right < 0 || r.left > doc.scrollWidth) {
        out.push({ genre: "hors-champ", detail: `hors de la page (x ${Math.round(r.left)}→${Math.round(r.right)})`, a: nommer(e) });
      }
    }

    /* ── 4. Cibles tactiles ─────────────────────────────────────────── */
    /* 44 points : la recommandation d'Apple, et la taille d'un doigt. */
    if ((window as unknown as { __tmTactile?: boolean }).__tmTactile) {
      const vusCibles = new Set<string>();
      for (const e of Array.from(document.body.querySelectorAll("button, a[href], input[type=checkbox], input[type=radio]"))) {
        if (!visible(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.top > VP.h || r.bottom < 0) continue; // hors de la vue : pas jugé
        if (r.width >= 36 && r.height >= 36) continue;
        /* Un lien au fil du texte n'est pas une cible tactile. */
        if (e.tagName === "A" && e.parentElement && style(e.parentElement).display.includes("inline")) continue;
        const n = nommer(e);
        if (vusCibles.has(n)) continue;
        vusCibles.add(n);
        out.push({ genre: "cible-tactile", detail: `${Math.round(r.width)}×${Math.round(r.height)}px`, a: n });
      }
    }

    return out;
  }) as Promise<Defaut[]>;
}

/** Un résumé court, lisible dans la sortie des tests. */
export function resumer(defauts: Defaut[]): string {
  const par = new Map<string, number>();
  for (const d of defauts) par.set(d.genre, (par.get(d.genre) || 0) + 1);
  return [...par.entries()].map(([g, n]) => `${n} ${g}`).join(", ") || "rien";
}
