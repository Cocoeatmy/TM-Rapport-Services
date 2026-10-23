/**
 * Qui a fait quoi, et quand, sur un chantier (23.10.2026).
 *
 * Les traces existaient, éparpillées : passages de montage lot par lot,
 * heures, mesures, démontage, SAV par lot (rendez-vous, passages, clôture),
 * signalements. Ce module les rassemble en une seule chronologie, pour qu'on
 * trouve d'un coup d'œil qui est venu, qui viendra, et qui a signalé quoi.
 * Règles pures — testées.
 */

import { parseInterventions } from "@/lib/sav-interventions";

export type Genre = "mesures" | "demontage" | "montage" | "sav" | "signalement";
export type Statut = "fait" | "prevu" | "cloture" | "ouvert";

export interface Evenement {
  /** AAAA-MM-JJ (vide si inconnu). */
  quand: string;
  genre: Genre;
  statut: Statut;
  titre: string;
  noms: string[];
  detail?: string;
}

export interface SourceHistorique {
  etatCMD?: string | null;
  etatMesures?: string | null;
  nbCabines?: number | string | null;
  nomsCabines?: string | null;
  dateMesures?: string | null;
  mesuresTraiteePar?: string | null;
  dateDemontage?: string | null;
  collaborateursDemontage?: string | null;
  dateMontage?: string | null;
  collaborateurs?: string | null;
  interventionsMontageCabines?: string | null;
  heureArrivee?: string | null;
  heureDepart?: string | null;
  attributionCabines?: string | null;
  // SAV
  etatSAV?: string | null;
  dateRDVSAV?: string | null;
  collaborateursSAV?: string | null;
  causeSAV?: string | null;
  dateSavClotureLe?: string | null;
  causeSavCabines?: string | null;
  datesRdvSavCabines?: string | null;
  collaborateursSavCabines?: string | null;
  interventionsSavCabines?: string | null;
  datesSavClotureCabines?: string | null;
}

export interface SignalementHisto {
  timestamp?: number | null;
  user?: string | null;
  types?: string[] | null;
  typesLabel?: string | null;
  cabineLabel?: string | null;
  description?: string | null;
  resolved?: boolean | null;
  status?: string | null;
}

const ISO = /\d{4}-\d{2}-\d{2}/;
const jour = (v?: string | null) => (String(v || "").match(ISO)?.[0] || "");

/** « Jean-Marc & Miguel », « A, B », « A et B » → noms, sans doublon. */
export function noms(brut?: string | null): string[] {
  const vus = new Map<string, string>();
  for (const n of String(brut || "").split(/\s*(?:,|&|\+|\bet\b)\s*/)) {
    const x = n.trim();
    if (x && !vus.has(x.toLowerCase())) vus.set(x.toLowerCase(), x);
  }
  return [...vus.values()];
}

function parLot(brut?: string | null): Map<number, string> {
  const m = new Map<number, string>();
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(String(brut || "")))) m.set(parseInt(x[1], 10), x[2].trim());
  return m;
}

function nomDuLot(p: SourceHistorique, n: number): string {
  return parLot(p.nomsCabines).get(n) || `Cabine ${n}`;
}

const heureDe = (s?: string | null) => (String(s || "").match(/(\d{1,2}:\d{2})\s*$/)?.[1] || "");

export function historiqueDuChantier(
  p: SourceHistorique,
  signalements: SignalementHisto[] = [],
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): Evenement[] {
  const ev: Evenement[] = [];
  const nb = Number(p.nbCabines) || 0;
  const multi = nb > 1 || /Cab\d+\s*:/.test(String(p.heureArrivee || "") + String(p.interventionsMontageCabines || ""));

  // ── Mesures ───────────────────────────────────────────────────────────
  const dMes = jour(p.dateMesures);
  if (dMes) {
    ev.push({
      quand: dMes, genre: "mesures", statut: dMes <= aujourdhui ? "fait" : "prevu",
      titre: dMes <= aujourdhui ? "Prise de mesures" : "Prise de mesures prévue",
      noms: noms(p.mesuresTraiteePar),
    });
  }

  // ── Démontage (ajouté après les passages : s'il y a un passage ce
  //    jour-là, c'est lui qui le raconte, avec ses heures) ─────────────
  const dDem = jour(p.dateDemontage);

  // ── Montage : les passages, regroupés par jour ─────────────────────────
  const jours = new Map<string, { noms: Set<string>; lots: string[]; debut: string; fin: string }>();
  const ajouter = (d: string, qui: string[], lot: string | null, arr?: string, dep?: string) => {
    if (!d) return;
    const e = jours.get(d) || { noms: new Set<string>(), lots: [], debut: "", fin: "" };
    qui.forEach((n) => e.noms.add(n));
    if (lot && !e.lots.includes(lot)) e.lots.push(lot);
    if (arr && (!e.debut || arr < e.debut)) e.debut = arr;
    if (dep && (!e.fin || dep > e.fin)) e.fin = dep;
    jours.set(d, e);
  };
  const passages = parLot(p.interventionsMontageCabines);
  const attrib = parLot(p.attributionCabines);
  if (passages.size > 0) {
    for (const [n, v] of passages) {
      for (const x of parseInterventions(v)) {
        ajouter(jour(x.date), noms(x.collaborateurs || attrib.get(n) || p.collaborateurs), multi ? nomDuLot(p, n) : null, x.arrivee, x.depart);
      }
    }
  } else if (multi) {
    const arr = parLot(p.heureArrivee);
    const dep = parLot(p.heureDepart);
    for (const [n, v] of arr) ajouter(jour(v), noms(attrib.get(n) || p.collaborateurs), nomDuLot(p, n), heureDe(v), heureDe(dep.get(n)));
  } else {
    // Un lot, plusieurs jours : « 2026-10-12 Jean-Marc & Miguel 08:00 | … »
    const deps = String(p.heureDepart || "").split("|").map((s) => s.trim());
    String(p.heureArrivee || "").split("|").map((s) => s.trim()).filter(Boolean).forEach((seg) => {
      const d = jour(seg);
      if (!d) return;
      const qui = seg.replace(ISO, "").replace(/\d{1,2}:\d{2}\s*$/, "").trim();
      const dep = deps.find((x) => jour(x) === d);
      ajouter(d, noms(qui || p.collaborateurs), null, heureDe(seg), heureDe(dep));
    });
  }
  for (const [d, e] of jours) {
    const heures = e.debut || e.fin ? `${e.debut || "--:--"} → ${e.fin || "--:--"}` : "";
    ev.push({
      quand: d, genre: "montage", statut: d <= aujourdhui ? "fait" : "prevu",
      titre: d === dDem ? "Démontage / montage" : "Montage",
      noms: [...e.noms],
      detail: [e.lots.length ? e.lots.join(", ") : "", heures].filter(Boolean).join(" · ") || undefined,
    });
  }
  if (dDem && !jours.has(dDem)) {
    ev.push({
      quand: dDem, genre: "demontage", statut: dDem <= aujourdhui ? "fait" : "prevu",
      titre: dDem <= aujourdhui ? "Démontage" : "Démontage prévu",
      noms: noms(p.collaborateursDemontage || p.collaborateurs),
    });
  }
  // Prévu : chantier pas terminé, date de montage à venir, pas encore de passage ce jour-là.
  const dMon = jour(p.dateMontage);
  if (p.etatCMD !== "Terminé" && p.etatCMD !== "Annulé" && dMon && dMon >= aujourdhui && !jours.has(dMon)) {
    ev.push({ quand: dMon, genre: "montage", statut: "prevu", titre: "Montage prévu", noms: noms(p.collaborateurs) });
  }

  // ── SAV, lot par lot ──────────────────────────────────────────────────
  const causes = parLot(p.causeSavCabines);
  const rdv = parLot(p.datesRdvSavCabines);
  const collabSav = parLot(p.collaborateursSavCabines);
  const passSav = parLot(p.interventionsSavCabines);
  const clotures = parLot(p.datesSavClotureCabines);
  const lotsSav = [...new Set([...causes.keys(), ...rdv.keys(), ...passSav.keys(), ...clotures.keys()])].sort((a, b) => a - b);
  for (const n of lotsSav) {
    const lot = multi || lotsSav.length > 1 ? nomDuLot(p, n) : "";
    const cause = causes.get(n) || "";
    const detail = [lot, cause].filter(Boolean).join(" · ") || undefined;
    const fait = new Set<string>();
    for (const x of parseInterventions(passSav.get(n))) {
      const d = jour(x.date);
      if (!d) continue;
      fait.add(d);
      ev.push({ quand: d, genre: "sav", statut: d <= aujourdhui ? "fait" : "prevu", titre: d <= aujourdhui ? "Passage SAV" : "SAV prévu", noms: noms(x.collaborateurs || collabSav.get(n)), detail });
    }
    const dCl = jour(clotures.get(n));
    const dRdv = jour(rdv.get(n));
    if (dRdv && !fait.has(dRdv) && !dCl) {
      ev.push({ quand: dRdv, genre: "sav", statut: dRdv >= aujourdhui ? "prevu" : "ouvert", titre: dRdv >= aujourdhui ? "SAV prévu" : "SAV (rendez-vous passé, non clôturé)", noms: noms(collabSav.get(n) || p.collaborateursSAV), detail });
    }
    if (dCl) ev.push({ quand: dCl, genre: "sav", statut: "cloture", titre: "SAV clôturé", noms: noms(collabSav.get(n) || p.collaborateursSAV), detail });
    if (!dRdv && !dCl && fait.size === 0) ev.push({ quand: "", genre: "sav", statut: "ouvert", titre: "SAV à planifier", noms: [], detail });
  }
  // SAV sans détail par lot : le niveau projet.
  if (lotsSav.length === 0 && (p.dateRDVSAV || p.dateSavClotureLe || (p.etatSAV && p.etatSAV !== "Aucun SAV"))) {
    const dCl = jour(p.dateSavClotureLe);
    const dR = jour(p.dateRDVSAV);
    if (dCl) ev.push({ quand: dCl, genre: "sav", statut: "cloture", titre: "SAV clôturé", noms: noms(p.collaborateursSAV), detail: p.causeSAV || undefined });
    else if (dR) ev.push({ quand: dR, genre: "sav", statut: dR >= aujourdhui ? "prevu" : "ouvert", titre: dR >= aujourdhui ? "SAV prévu" : "SAV", noms: noms(p.collaborateursSAV), detail: p.causeSAV || p.etatSAV || undefined });
    else ev.push({ quand: "", genre: "sav", statut: "ouvert", titre: `SAV — ${p.etatSAV}`, noms: noms(p.collaborateursSAV), detail: p.causeSAV || undefined });
  }

  // ── Signalements : qui a signalé quoi ─────────────────────────────────
  for (const s of signalements) {
    const d = s.timestamp ? new Date(s.timestamp).toISOString().slice(0, 10) : "";
    const type = s.typesLabel || (s.types || []).join(", ") || "Pièce manquante";
    ev.push({
      quand: d, genre: "signalement", statut: s.resolved || s.status === "recu" ? "cloture" : "ouvert",
      titre: `Signalement — ${type}`,
      noms: noms(s.user),
      detail: [s.cabineLabel, String(s.description || "").split("\n")[0].slice(0, 140)].filter(Boolean).join(" · ") || undefined,
    });
  }

  // À venir d'abord (du plus proche au plus lointain), puis le passé, du plus récent au plus ancien.
  const avenir = ev.filter((e) => e.statut === "prevu").sort((a, b) => a.quand.localeCompare(b.quand));
  const reste = ev.filter((e) => e.statut !== "prevu").sort((a, b) => (b.quand || "0").localeCompare(a.quand || "0"));
  return [...avenir, ...reste];
}

/** Qui est venu, combien de fois, et quand pour la dernière fois. */
export function intervenants(ev: Evenement[]): { nom: string; fois: number; dernier: string }[] {
  const m = new Map<string, { nom: string; fois: number; dernier: string }>();
  for (const e of ev) {
    if (e.statut === "prevu" || e.genre === "signalement") continue;
    for (const n of e.noms) {
      const k = n.toLowerCase();
      const x = m.get(k) || { nom: n, fois: 0, dernier: "" };
      x.fois += 1;
      if (e.quand > x.dernier) x.dernier = e.quand;
      m.set(k, x);
    }
  }
  return [...m.values()].sort((a, b) => b.fois - a.fois || a.nom.localeCompare(b.nom));
}
