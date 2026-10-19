/**
 * Chronomètre des PDF : où passe le temps, étape par étape.
 *
 * Une ligne par génération dans les journaux (« [PDF] … ») et un en-tête
 * `Server-Timing`, lisible dans l'inspecteur du navigateur. Coût négligeable :
 * quelques appels à performance.now().
 */
export interface ChronoPdf {
  etape(nom: string): void;
  /** Durée totale depuis la création, en ms. */
  total(): number;
  /** « Server-Timing: projet;dur=812, … » */
  enTete(): string;
  journal(etiquette: string, extra?: Record<string, string | number>): void;
}

import { compteursNotion } from "@/lib/notion";

export function chronoPdf(): ChronoPdf {
  const debut = performance.now();
  const appels0 = compteursNotion.appels, attente0 = compteursNotion.attenteMs;
  let dernier = debut;
  const etapes: [string, number][] = [];
  return {
    etape(nom) {
      const t = performance.now();
      etapes.push([nom, t - dernier]);
      dernier = t;
    },
    total: () => performance.now() - debut,
    enTete() {
      return [...etapes, ["total", performance.now() - debut] as [string, number],
        ["notion", compteursNotion.appels - appels0] as [string, number],
        ["attenteSeau", compteursNotion.attenteMs - attente0] as [string, number]]
        .map(([n, d]) => `${n};dur=${Math.round(d)}`).join(", ");
    },
    journal(etiquette, extra = {}) {
      const parties = [...etapes.map(([n, d]) => `${n}=${Math.round(d)}ms`),
        `total=${Math.round(performance.now() - debut)}ms`,
        `notion=${compteursNotion.appels - appels0}`,
        `attenteSeau=${Math.round(compteursNotion.attenteMs - attente0)}ms`,
        ...Object.entries(extra).map(([k, v]) => `${k}=${v}`)];
      console.log(`[PDF] ${etiquette} ${parties.join(" ")}`);
    },
  };
}
