/**
 * L'alerte du matin : ce qui reste bloqué sur les appareils (23.10.2026).
 *
 * Une écriture refusée ou coincée en file ne se voyait que sur la page
 * Appareils — on la découvrait des jours plus tard. Chaque matin, si un
 * appareil a encore des envois en attente ou en échec, Micael reçoit le
 * détail : qui, quel appareil, quoi, depuis quand. Rien d'en attente : rien
 * n'est envoyé. Règles pures — testées.
 */

import type { EtatAppareil } from "@/lib/appareils";

export interface LigneAlerte {
  nom: string;
  appareil: string;
  photos: number;
  echecs: number;
  saisies: number;
  rapports: number;
  /** Plus ancien élément connu (rapport finalisé non envoyé), sinon dernier signe de vie. */
  depuis: number;
  vu: number;
}

export function lignesAlerte(appareils: EtatAppareil[], noms: Record<string, string> = {}): LigneAlerte[] {
  return appareils
    .map((a) => {
      const rapports = (a.rapportsNonEnvoyes || []).length;
      const plusVieux = (a.rapportsNonEnvoyes || []).reduce((m, r) => Math.min(m, r.depuis || a.vu), a.vu);
      const libelle = noms[a.appareil] || [a.plateforme, a.logiciel].filter(Boolean).join(" · ") || a.navigateur || "appareil";
      return {
        nom: a.nom, appareil: libelle,
        photos: a.photosEnAttente || 0, echecs: a.photosEnEchec || 0, saisies: a.requetesEnAttente || 0, rapports,
        depuis: plusVieux, vu: a.vu,
      };
    })
    .filter((l) => l.photos + l.echecs + l.saisies + l.rapports > 0)
    .sort((x, y) => x.depuis - y.depuis);
}

const depuisLisible = (ms: number, maintenant: number) => {
  const h = Math.round((maintenant - ms) / 3_600_000);
  if (h < 1) return "moins d'une heure";
  if (h < 36) return `${h} h`;
  return `${Math.round(h / 24)} jours`;
};

export function resumeLigne(l: LigneAlerte, maintenant: number): string {
  const quoi = [
    l.saisies ? `${l.saisies} saisie${l.saisies > 1 ? "s" : ""} en file` : "",
    l.photos ? `${l.photos} photo${l.photos > 1 ? "s" : ""} en attente` : "",
    l.echecs ? `${l.echecs} photo${l.echecs > 1 ? "s" : ""} en échec` : "",
    l.rapports ? `${l.rapports} rapport${l.rapports > 1 ? "s" : ""} non envoyé${l.rapports > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(", ");
  return `${l.nom} (${l.appareil}) : ${quoi} — depuis ${depuisLisible(l.depuis, maintenant)}`;
}
