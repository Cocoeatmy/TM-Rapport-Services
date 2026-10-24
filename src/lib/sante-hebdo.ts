/**
 * Le contrôle de santé du lundi (24.10.2026) — au propriétaire seul.
 *
 * Les oublis qu'on découvrait par hasard, réunis chaque lundi à 6 h :
 *   - rapport  : chantier terminé depuis 2 jours ou plus, rapport ni envoyé
 *                au client ni traité ;
 *   - photos   : lot posé sans aucune photo « montage terminé » ;
 *   - heures   : heures manquantes ou incohérentes (règles existantes) ;
 *   - sav      : SAV ouvert depuis plus d'un mois.
 *
 * Mesuré sur les vraies données avant d'écrire la moindre règle : sur tout
 * l'historique, les heures donnaient 767 + 99 fiches — illisible chaque
 * semaine. Rapport, photos et heures ne regardent donc que les montages des
 * 60 derniers jours ; le SAV, lui, est regardé quelle que soit sa date.
 * Et le journal seul ne suffit pas à dire « envoyé » : 59 des 68 chantiers
 * sans trace d'envoi étaient déjà « Rapport traité » — c'est donc l'un OU
 * l'autre qui vaut envoi.
 *
 * Chaque constat porte une clé stable : la semaine suivante, on sait ce qui
 * est NOUVEAU, ce qui TRAÎNE encore et ce qui a été RÉGLÉ. Fonctions pures.
 */

import type { Project } from "@/lib/notion";
import { REGLES_ANOMALIES, joursDepuis, formatJour } from "@/lib/regles";
import { equipeApp } from "@/lib/equipe-app";
import { lotDeLaPhoto } from "@/lib/photo-buckets";

export type Categorie = "rapport" | "photos" | "heures" | "sav";

export interface Constat {
  cle: string;
  categorie: Categorie;
  projetId: string;
  ofr: string;
  projet: string;
  detail: string;
  /** Qui a travaillé dessus, selon l'app. */
  equipe: string;
}

/** Hash Redis : id du projet (sans tirets) → instant de l'envoi au client. */
export const CLE_RAPPORTS_ENVOYES = "rapports-envoyes";

export const FENETRE_JOURS = 60;
export const DELAI_RAPPORT_JOURS = 2;
export const DELAI_SAV_JOURS = 30;

export const TITRES: Record<Categorie, string> = {
  rapport: "Rapports non envoyés au client",
  photos: "Lots sans photo « montage terminé »",
  heures: "Heures manquantes ou incohérentes",
  sav: "SAV ouverts depuis plus d'un mois",
};

const sansTirets = (id: string) => String(id || "").replace(/-/g, "");
const servicePur = (p: Project) => {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length > 0 && t.every((x) => /^\s*(services?|mesures?)\s*$/i.test(x || ""));
};

/** Lots posés sans aucune photo « montage terminé » (lots sous-traités exclus). */
export function lotsSansPhotoApres(p: Project): number[] {
  const n = Math.max(1, Number(p.nbCabines) || 1);
  const sousTraites = new Set([...String(p.monteursSousTraitance || "").matchAll(/Cab(\d+)\s*:\s*[^|]*\S/g)].map((m) => Number(m[1])));
  const noms = (p.photosMontage || []).map((f) => f.name || "");
  if (n <= 1) return noms.length || sousTraites.size ? [] : [1];
  const manque: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (sousTraites.has(i)) continue;
    if (!noms.some((x) => lotDeLaPhoto(x, true) === i)) manque.push(i);
  }
  return manque;
}

function nomDuLot(p: Project, i: number): string {
  const m = new RegExp(`Cab${i}\\s*:([^|]*)`).exec(String((p as unknown as { nomsCabines?: string }).nomsCabines || ""));
  return (m && m[1].trim()) || `Lot ${i}`;
}

export function constatsSante(projets: Project[], envoyes: Set<string>, maintenant: Date): Constat[] {
  const out: Constat[] = [];
  const reglesHeures = REGLES_ANOMALIES.filter((r) => r.id === "heures-absentes" || r.id === "heures-invraisemblables");
  for (const p of projets) {
    if (p.etatCMD === "Annulé") continue;
    const base = {
      projetId: p.id, ofr: p.ofrTM || "—", projet: p.projet || "Sans nom",
      equipe: equipeApp(p as Parameters<typeof equipeApp>[0]).join(", "),
    };
    const j = joursDepuis(p.dateMontage, maintenant);
    const recent = j !== null && j <= FENETRE_JOURS;
    const termine = p.etatCMD === "Terminé" || p.rapportDeMontage === "A traiter";

    if (recent && termine && !servicePur(p)) {
      if (j! >= DELAI_RAPPORT_JOURS && p.rapportDeMontage !== "Rapport traité" && !envoyes.has(sansTirets(p.id))) {
        out.push({ ...base, cle: `rapport:${p.id}`, categorie: "rapport",
          detail: `Monté le ${formatJour(p.dateMontage)}, aucun envoi au client` });
      }
      const lots = lotsSansPhotoApres(p);
      if (lots.length) {
        const n = Math.max(1, Number(p.nbCabines) || 1);
        out.push({ ...base, cle: `photos:${p.id}:${lots.join(",")}`, categorie: "photos",
          detail: n <= 1 ? "Aucune photo « montage terminé »" : `${lots.map((i) => nomDuLot(p, i)).join(", ")} sans photo d'après` });
      }
    }
    if (recent && !servicePur(p)) {
      for (const r of reglesHeures) {
        const d = r.verifier(p, maintenant);
        if (d) out.push({ ...base, cle: `heures:${r.id}:${p.id}`, categorie: "heures", detail: d });
      }
    }
    if (!p.savCloture && !p.dateSavClotureLe && p.etatSAV !== "Terminé" && p.etatSAV !== "Annulé") {
      const js = joursDepuis(p.dateSAVRecu, maintenant);
      if (js !== null && js >= DELAI_SAV_JOURS) {
        out.push({ ...base, cle: `sav:${p.id}`, categorie: "sav",
          detail: `Reçu le ${formatJour(p.dateSAVRecu)}, ouvert depuis ${js} jours` });
      }
    }
  }
  return out;
}

export interface Bilan {
  nouveaux: Constat[];
  toujours: Constat[];
  /** Clés de la semaine passée qui ont disparu. */
  regles: number;
}

export function comparer(constats: Constat[], precedents: string[]): Bilan {
  const avant = new Set(precedents);
  const maintenant = new Set(constats.map((c) => c.cle));
  return {
    nouveaux: constats.filter((c) => !avant.has(c.cle)),
    toujours: constats.filter((c) => avant.has(c.cle)),
    regles: precedents.filter((k) => !maintenant.has(k)).length,
  };
}

const echap = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
const ORDRE: Categorie[] = ["rapport", "photos", "heures", "sav"];

/** Le message, en HTML (e-mail) et en HTML Telegram (sans listes ni styles). */
export function messageSante(b: Bilan, base: string): { sujet: string; html: string; telegram: string } {
  const total = b.nouveaux.length + b.toujours.length;
  const sujet = `TM Rapport — contrôle du lundi : ${b.nouveaux.length} nouveau${b.nouveaux.length > 1 ? "x" : ""}, ${b.toujours.length} toujours ouvert${b.toujours.length > 1 ? "s" : ""}`;
  const lien = (c: Constat) => `${base}/projet/${c.projetId}`;
  const bloc = (titre: string, liste: Constat[], mail: boolean) => {
    if (!liste.length) return "";
    const parts: string[] = [];
    for (const cat of ORDRE) {
      const l = liste.filter((c) => c.categorie === cat);
      if (!l.length) continue;
      if (mail) {
        parts.push(`<p style="margin:12px 0 4px"><b>${TITRES[cat]}</b> (${l.length})</p><ul style="margin:0;padding-left:18px">${l.map((c) =>
          `<li style="margin:3px 0"><a href="${lien(c)}">${echap(c.ofr)}</a> · ${echap(c.projet)} — ${echap(c.detail)}${c.equipe ? ` <span style="color:#64748b">(${echap(c.equipe)})</span>` : ""}</li>`).join("")}</ul>`);
      } else {
        parts.push(`\n<b>${TITRES[cat]}</b> (${l.length})\n${l.slice(0, 15).map((c) =>
          `• <a href="${lien(c)}">${echap(c.ofr)}</a> ${echap(c.projet).slice(0, 40)} — ${echap(c.detail)}`).join("\n")}${l.length > 15 ? `\n… et ${l.length - 15} autres (voir l'e-mail)` : ""}`);
      }
    }
    return mail ? `<h3 style="margin:18px 0 0;font-size:15px">${titre}</h3>${parts.join("")}` : `\n\n<b>━ ${titre}</b>${parts.join("")}`;
  };
  const chapeau = total === 0
    ? "Rien à signaler cette semaine."
    : `${b.nouveaux.length} nouveau${b.nouveaux.length > 1 ? "x" : ""} · ${b.toujours.length} toujours ouvert${b.toujours.length > 1 ? "s" : ""} · ${b.regles} réglé${b.regles > 1 ? "s" : ""} depuis lundi dernier`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a">
    <p><b>Contrôle de santé du lundi</b><br>${chapeau}</p>
    ${bloc("Nouveaux cette semaine", b.nouveaux, true)}
    ${bloc("Toujours ouverts", b.toujours, true)}
    <p style="color:#64748b;font-size:12px;margin-top:18px">Montages des ${FENETRE_JOURS} derniers jours ; SAV quelle que soit leur date. Un rapport « traité » ou envoyé au client ne compte pas comme oubli.</p>
  </div>`;
  const telegram = `<b>🩺 Contrôle du lundi</b>\n${chapeau}${bloc("Nouveaux", b.nouveaux, false)}${bloc("Toujours ouverts", b.toujours, false)}`;
  /* Telegram refuse au-delà de 4 096 caractères : on coupe à une fin de
     ligne (jamais au milieu d'une balise), l'e-mail porte la liste entière. */
  const court = telegram.length <= 3900 ? telegram
    : `${telegram.slice(0, telegram.lastIndexOf("\n", 3800))}\n… suite dans l'e-mail`;
  return { sujet, html, telegram: court };
}
