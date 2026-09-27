/**
 * Trois analyses que les données permettent depuis toujours.
 *
 *   • TRANSFORMATION — sur cent mesures prises pour ce sanitaire, combien
 *     deviennent des commandes ? Une mesure est un déplacement de deux heures ;
 *     celles qui ne se transforment jamais sont une perte sèche, invisible
 *     parce que diluée.
 *
 *   • ROUTE — ce que coûte en trajet une cabine posée, région par région. Un
 *     argument tarifaire, ou une raison de grouper les chantiers d'une région
 *     au lieu de les prendre à l'unité.
 *
 *   • SAV — non pas combien de SAV par marque, ce que l'application sait déjà,
 *     mais combien d'HEURES ils coûtent. « Cette série nous prend 14 h pour
 *     100 cabines posées » se négocie autrement qu'un pourcentage d'incidents.
 *
 * Tout est pur : ces fonctions reçoivent des projets et rendent des chiffres.
 */

import type { Project } from "@/lib/notion";
import { minutesPointees, trajet, lieuDepot, type Position } from "@/lib/tournee";
import { regionLabel, cantonOf } from "@/lib/swiss-cantons";

const MORTS = new Set(["Annulé"]);

function vide(v: unknown): boolean {
  return !String(v ?? "").trim();
}

function jourDe(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(String(v).length <= 10 ? `${v}T12:00:00` : String(v));
  return Number.isNaN(t) ? null : t;
}

function dansFenetre(v: string | null | undefined, de?: string, a?: string): boolean {
  const t = jourDe(v);
  if (t === null) return false;
  if (de && t < jourDe(de)!) return false;
  if (a && t > jourDe(a)! + 86400000) return false;
  return true;
}

function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

function aCommande(p: Project): boolean {
  return !vide(p.cmdTM) || !vide(p.cmdTMUsine) || !vide(p.cmdGrossiste)
    || !!p.dateCMDRecue || !!p.dateCMDUsine;
}

/* ── Transformation ─────────────────────────────────────────────────────── */

export interface LigneTransformation {
  client: string;
  mesures: number;
  offres: number;
  commandes: number;
  /** Mesures anciennes restées sans commande : le déplacement perdu. */
  perdues: number;
  /** Commandes rapportées aux mesures, en pourcentage. */
  taux: number;
  cabines: number;
}

/** Une mesure sans commande est perdue au-delà de ce délai. */
const DELAI_PERDU = 60;

/**
 * Taux de transformation par client, sur les mesures reçues dans la fenêtre.
 *
 * On compte par MESURE et non par projet : c'est le déplacement qui coûte, et
 * c'est lui qu'on cherche à rentabiliser. Un client sous trois mesures n'est
 * pas affiché — un taux sur deux dossiers ne dit rien.
 */
export function transformation(
  projets: Project[],
  axe: "sanitaire" | "grossiste",
  de?: string, a?: string,
  maintenant: Date = new Date(),
): LigneTransformation[] {
  const m = new Map<string, LigneTransformation>();

  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || estServicePur(p)) return;
    if (!dansFenetre(p.dateMesuresRecue, de, a)) return;

    const noms = axe === "sanitaire" ? (p.sanitaireNames || []) : (p.grossistesNames || []);
    const client = noms[0] || "Sans client renseigné";
    const cur = m.get(client) || {
      client, mesures: 0, offres: 0, commandes: 0, perdues: 0, taux: 0, cabines: 0,
    };
    cur.mesures += 1;
    if (p.dateOffre) cur.offres += 1;
    if (aCommande(p)) {
      cur.commandes += 1;
      cur.cabines += Number(p.nbCabines) || 0;
    } else {
      const age = (maintenant.getTime() - (jourDe(p.dateMesuresRecue) ?? 0)) / 86400000;
      if (age >= DELAI_PERDU) cur.perdues += 1;
    }
    m.set(client, cur);
  });

  return [...m.values()]
    .filter((l) => l.mesures >= 3)
    .map((l) => ({ ...l, taux: Math.round((l.commandes / l.mesures) * 100) }))
    .sort((a2, b) => b.mesures - a2.mesures);
}

/* ── Route ──────────────────────────────────────────────────────────────── */

export interface LigneRoute {
  region: string;
  cabines: number;
  projets: number;
  /** Minutes de route aller-retour depuis le dépôt, cumulées. */
  minutes: number;
  km: number;
  minutesParCabine: number;
  kmParCabine: number;
}

/** Clé du cache de géocodage — même normalisation que /api/geocode. */
function cleAdresse(adresse: string): string {
  return (adresse || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Coût de trajet par région, rapporté à la cabine posée.
 *
 * Le trajet est compté ALLER-RETOUR depuis le dépôt, pour chaque chantier pris
 * isolément. C'est volontairement pessimiste : une tournée qui enchaîne trois
 * chantiers d'une même région coûte bien moins. Le chiffre ne dit donc pas ce
 * qu'on dépense, il dit ce que coûterait chaque région si l'on y allait
 * séparément — ce qui est exactement la comparaison qu'on veut faire.
 */
export function coutRoute(
  projets: Project[],
  positions: Record<string, Position | null>,
  de?: string, a?: string,
): LigneRoute[] {
  const depot = lieuDepot(positions[cleAdresse("1400 Yverdon-les-Bains")] || undefined);
  const m = new Map<string, LigneRoute>();

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const cabines = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    if (cabines <= 0) return;

    const texte = `${p.adresseChantier || ""} ${p.projet || ""}`;
    const npa = texte.match(/\b(\d{4})\b/)?.[1] || "";
    if (!npa) return;
    const lieu = {
      npa,
      region: regionLabel(texte),
      canton: cantonOf(texte) || "",
      pos: positions[cleAdresse(p.adresseChantier || "")] || undefined,
    };
    const t = trajet(depot, lieu);
    const region = lieu.region || "Hors zone";
    const cur = m.get(region) || {
      region, cabines: 0, projets: 0, minutes: 0, km: 0, minutesParCabine: 0, kmParCabine: 0,
    };
    cur.cabines += cabines;
    cur.projets += 1;
    cur.minutes += t.minutes * 2;
    cur.km += t.km * 2;
    m.set(region, cur);
  });

  return [...m.values()]
    .filter((l) => l.projets >= 3)
    .map((l) => ({
      ...l,
      minutesParCabine: Math.round(l.minutes / l.cabines),
      kmParCabine: Math.round(l.km / l.cabines),
    }))
    .sort((x, y) => y.minutesParCabine - x.minutesParCabine);
}

/* ── SAV ────────────────────────────────────────────────────────────────── */

export interface LigneSav {
  cle: string;
  /** Interventions SAV distinctes. */
  interventions: number;
  minutes: number;
  /** Cabines posées de cette marque ou série sur la période. */
  cabinesPosees: number;
  /** Heures de SAV pour cent cabines posées. */
  heuresPour100: number;
  /** Part des SAV imputés « Erreur TM ». */
  erreursTM: number;
}

/** Durée d'un SAV, cabines multiples comprises — même encodage que le montage. */
function minutesSav(p: Project): number {
  return minutesPointees({
    id: p.id,
    heureArrivee: p.heureArriveeSav,
    heureDepart: p.heureDepartSav,
  }) ?? 0;
}

function compteErreursTM(p: Project): number {
  const raw = String(p.causeSavCabines || "");
  const parCabine = [...raw.matchAll(/Cab\d+\s*:\s*([^|]*)/g)].map((x) => x[1].trim());
  const valeurs = parCabine.length > 0 ? parCabine : [String(p.causeSAV || "")];
  return valeurs.filter((v) => /erreur\s*tm/i.test(v)).length;
}

/**
 * Coût du SAV en heures, par marque ou par série.
 *
 * Le dénominateur est le nombre de cabines POSÉES de la même marque sur la
 * période : sans lui, un gros fournisseur paraîtrait toujours le pire.
 */
export function coutSav(
  projets: Project[],
  axe: "marque" | "serie",
  de?: string, a?: string,
): LigneSav[] {
  const champ = (p: Project) => (axe === "marque" ? p.fournisseurs : p.seriesCabines) || [];
  const m = new Map<string, LigneSav>();
  const ligne = (cle: string) => {
    const cur = m.get(cle) || {
      cle, interventions: 0, minutes: 0, cabinesPosees: 0, heuresPour100: 0, erreursTM: 0,
    };
    m.set(cle, cur);
    return cur;
  };

  // Dénominateur : les cabines posées sur la période.
  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    champ(p).forEach((k) => { ligne(k || "Non renseigné").cabinesPosees += n; });
  });

  // Numérateur : les heures de SAV, datées par la réception du SAV.
  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD)) return;
    const quand = p.dateSAVRecu || p.dateRDVSAV || p.dateMontage;
    if (!dansFenetre(quand, de, a)) return;
    const min = minutesSav(p);
    const aSav = min > 0 || !!p.dateSAVRecu || !!p.dateRDVSAV;
    if (!aSav) return;
    const erreurs = compteErreursTM(p);
    champ(p).forEach((k) => {
      const l = ligne(k || "Non renseigné");
      l.interventions += 1;
      l.minutes += min;
      l.erreursTM += erreurs;
    });
  });

  return [...m.values()]
    .filter((l) => l.interventions > 0 && l.cabinesPosees >= 10)
    .map((l) => ({
      ...l,
      heuresPour100: Math.round((l.minutes / 60) / l.cabinesPosees * 100 * 10) / 10,
    }))
    .sort((x, y) => y.heuresPour100 - x.heuresPour100);
}

/* ── Rendement horaire ──────────────────────────────────────────────────── */

export interface LigneRendement {
  cle: string;
  cabines: number;
  minutesPose: number;
  minutesSav: number;
  /** Minutes totales consommées par cabine, SAV compris. */
  minutesParCabine: number;
}

/**
 * Temps consommé par cabine, pose et SAV réunis, par marque ou par série.
 *
 * C'est la moitié du rendement horaire : l'autre moitié — le prix — n'existe
 * pas par projet dans Notion, seulement en chiffre d'affaires mensuel. La page
 * combine donc ces minutes avec le CA moyen par cabine de la période, et le
 * dit clairement : ce que ce tableau compare, c'est le TEMPS que chaque série
 * dévore pour un produit vendu au même prix moyen.
 */
export function rendement(
  projets: Project[],
  axe: "marque" | "serie",
  de?: string, a?: string,
): LigneRendement[] {
  const champ = (p: Project) => (axe === "marque" ? p.fournisseurs : p.seriesCabines) || [];
  const m = new Map<string, LigneRendement>();
  const ligne = (cle: string) => {
    const cur = m.get(cle) || { cle, cabines: 0, minutesPose: 0, minutesSav: 0, minutesParCabine: 0 };
    m.set(cle, cur);
    return cur;
  };

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    if (n <= 0) return;
    const pose = minutesPointees(p) ?? 0;
    const sav = minutesSav(p);
    champ(p).forEach((k) => {
      const l = ligne(k || "Non renseigné");
      l.cabines += n;
      l.minutesPose += pose;
      l.minutesSav += sav;
    });
  });

  return [...m.values()]
    // Sous dix cabines et sans heures pointées, la moyenne ne vaut rien.
    .filter((l) => l.cabines >= 10 && l.minutesPose > 0)
    .map((l) => ({
      ...l,
      minutesParCabine: Math.round((l.minutesPose + l.minutesSav) / l.cabines),
    }))
    .sort((x, y) => x.minutesParCabine - y.minutesParCabine);
}

/* ── Clients en recul ───────────────────────────────────────────────────── */

export interface LigneRecul {
  client: string;
  /** Cabines posées sur les douze derniers mois. */
  recent: number;
  /** Cabines posées sur les douze mois précédents. */
  avant: number;
  variation: number;
  derniereCommande: string | null;
  joursDepuis: number | null;
}

/**
 * Clients dont le volume recule.
 *
 * Un sanitaire passé de quarante cabines à trois est une information
 * commerciale de premier ordre, et elle disparaît dans un total qui, lui,
 * continue de monter. On compare douze mois glissants aux douze précédents —
 * une année entière de chaque côté, pour que la saisonnalité s'annule.
 */
export function clientsEnRecul(
  projets: Project[],
  axe: "sanitaire" | "grossiste",
  maintenant: Date = new Date(),
): LigneRecul[] {
  const fin = maintenant.getTime();
  const unAn = 365 * 86400000;
  const m = new Map<string, { recent: number; avant: number; derniere: number | null }>();

  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || estServicePur(p)) return;
    const t = jourDe(p.dateMontage);
    if (t === null || t > fin) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    if (n <= 0) return;

    const noms = axe === "sanitaire" ? (p.sanitaireNames || []) : (p.grossistesNames || []);
    const client = noms[0];
    if (!client) return;

    const cur = m.get(client) || { recent: 0, avant: 0, derniere: null };
    if (t >= fin - unAn) cur.recent += n;
    else if (t >= fin - 2 * unAn) cur.avant += n;
    if (cur.derniere === null || t > cur.derniere) cur.derniere = t;
    m.set(client, cur);
  });

  return [...m.entries()]
    // Un client qui pesait moins de cinq cabines l'an passé ne « recule » pas.
    .filter(([, v]) => v.avant >= 5 && v.recent < v.avant * 0.6)
    .map(([client, v]) => ({
      client,
      recent: v.recent,
      avant: v.avant,
      variation: Math.round(((v.recent - v.avant) / v.avant) * 100),
      derniereCommande: v.derniere ? new Date(v.derniere).toISOString().slice(0, 10) : null,
      joursDepuis: v.derniere ? Math.round((fin - v.derniere) / 86400000) : null,
    }))
    .sort((x, y) => (y.avant - y.recent) - (x.avant - x.recent));
}

/* ── Dégâts à la livraison ──────────────────────────────────────────────── */

export interface LigneDegats {
  cle: string;
  /** Livraisons dont l'état des cartons a été photographié. */
  documentees: number;
  /** Livraisons portant des photos de dégâts. */
  abimees: number;
  taux: number;
  /** Part des livraisons de la période qui ont été photographiées. */
  couverture: number;
}

/**
 * Livraisons abîmées, par fournisseur ou par grossiste.
 *
 * Le SAV met en cause le produit ; les cartons mettent en cause le transport
 * et l'emballage — donc des responsables différents. La `couverture` est
 * publiée avec le taux, et non cachée : si la moitié des livraisons n'est pas
 * photographiée, le taux est faux vers le bas, et il faut le savoir avant de
 * s'en servir dans une négociation.
 */
export function degatsLivraison(
  projets: Project[],
  axe: "marque" | "grossiste",
  de?: string, a?: string,
): LigneDegats[] {
  const champ = (p: Project) => (axe === "marque" ? p.fournisseurs : p.grossistesNames) || [];
  const m = new Map<string, { livrees: number; documentees: number; abimees: number }>();

  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || estServicePur(p)) return;
    const quand = p.arrivageTM || p.arrivageGrossiste;
    if (!dansFenetre(quand, de, a)) return;

    const recues = (p.photosCartonsRecus || []).length;
    const degats = (p.photosCartons || []).length;
    champ(p).forEach((k) => {
      const cle = k || "Non renseigné";
      const cur = m.get(cle) || { livrees: 0, documentees: 0, abimees: 0 };
      cur.livrees += 1;
      if (recues > 0 || degats > 0) cur.documentees += 1;
      if (degats > 0) cur.abimees += 1;
      m.set(cle, cur);
    });
  });

  return [...m.entries()]
    .filter(([, v]) => v.documentees >= 5)
    .map(([cle, v]) => ({
      cle,
      documentees: v.documentees,
      abimees: v.abimees,
      taux: Math.round((v.abimees / v.documentees) * 100),
      couverture: Math.round((v.documentees / v.livrees) * 100),
    }))
    .sort((x, y) => y.taux - x.taux);
}

/* ── Solo ou binôme ─────────────────────────────────────────────────────── */

export interface LigneEquipage {
  /** « Seul » ou « À deux ». */
  forme: string;
  cabines: number;
  projets: number;
  /** Minutes de présence sur place, par cabine. */
  minutesParCabine: number;
  /** Minutes × nombre de personnes, par cabine : le vrai coût. */
  minutesHommeParCabine: number;
}

/**
 * Un binôme pose-t-il plus de deux fois ce qu'un monteur seul pose ?
 *
 * Deux mesures, et la seconde tranche : le temps de PRÉSENCE par cabine dit si
 * le chantier avance plus vite, le temps-HOMME par cabine dit s'il coûte moins.
 * Un binôme qui divise la présence par deux fait match nul ; c'est en dessous
 * qu'il est gagnant, au-dessus qu'il est un confort payé.
 */
export function soloOuBinome(
  projets: Project[],
  de?: string, a?: string,
): LigneEquipage[] {
  const m = new Map<string, { cabines: number; projets: number; minutes: number; minutesHomme: number }>();

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    const minutes = minutesPointees(p) ?? 0;
    if (n <= 0 || minutes <= 0) return;

    /* Nombre de personnes : l'attribution par cabine d'abord, qui est cochée
       sur place, sinon le champ « Collaborateurs montages ». « Team » désigne
       l'équipe entière : on ne sait pas combien, on l'écarte plutôt que de
       deviner. */
    const attr = String(p.attributionCabines || "");
    const noms = attr
      ? [...attr.matchAll(/Cab\d+\s*:\s*([^|]*)/g)].map((x) => x[1])
      : [String(p.collaborateurs || "")];
    const personnes = new Set(
      noms.flatMap((v) => v.split("&").map((x) => x.trim()).filter(Boolean)));
    if (personnes.size === 0) return;
    if ([...personnes].some((x) => /team/i.test(x))) return;

    const forme = personnes.size === 1 ? "Seul" : personnes.size === 2 ? "À deux" : "À trois ou plus";
    const cur = m.get(forme) || { cabines: 0, projets: 0, minutes: 0, minutesHomme: 0 };
    cur.cabines += n;
    cur.projets += 1;
    cur.minutes += minutes;
    cur.minutesHomme += minutes * personnes.size;
    m.set(forme, cur);
  });

  const ordre = ["Seul", "À deux", "À trois ou plus"];
  return [...m.entries()]
    .filter(([, v]) => v.projets >= 5)
    .map(([forme, v]) => ({
      forme,
      cabines: v.cabines,
      projets: v.projets,
      minutesParCabine: Math.round(v.minutes / v.cabines),
      minutesHommeParCabine: Math.round(v.minutesHomme / v.cabines),
    }))
    .sort((x, y) => ordre.indexOf(x.forme) - ordre.indexOf(y.forme));
}

/* ── Devenir des mesures ────────────────────────────────────────────────── */

export interface LigneMesures {
  personne: string;
  prises: number;
  commandees: number;
  annulees: number;
  ouvertes: number;
  /** Mesures devenues commande, en pourcentage. */
  taux: number;
}

/**
 * Ce que deviennent les mesures, par personne qui les a relevées.
 *
 * L'étape la plus coûteuse quand elle rate : une cabine qui ne rentre pas fait
 * repartir le chantier à zéro. À lire avec précaution — une annulation est le
 * plus souvent la décision du client, pas une erreur de relevé. Ce qui
 * s'interprète, c'est l'ÉCART entre personnes sur des chantiers comparables,
 * jamais le taux absolu de l'une d'elles.
 */
export function devenirMesures(
  projets: Project[],
  de?: string, a?: string,
): LigneMesures[] {
  const m = new Map<string, LigneMesures>();

  projets.forEach((p) => {
    if (estServicePur(p)) return;
    if (!dansFenetre(p.dateMesuresRecue, de, a)) return;
    if (p.etatMesures !== "Terminé" && !p.dateMesuresRecue) return;

    /* Un relevé fait à deux compte pour chacun : les deux étaient sur place,
       et l'on cherche à comparer des personnes, pas à répartir un mérite. */
    const noms = String(p.mesuresTraiteePar || "").split("&")
      .map((x) => x.trim()).filter(Boolean);
    if (noms.length === 0) return;

    noms.forEach((personne) => {
      const cur = m.get(personne)
        || { personne, prises: 0, commandees: 0, annulees: 0, ouvertes: 0, taux: 0 };
      cur.prises += 1;
      if (MORTS.has(p.etatCMD)) cur.annulees += 1;
      else if (aCommande(p)) cur.commandees += 1;
      else cur.ouvertes += 1;
      m.set(personne, cur);
    });
  });

  return [...m.values()]
    .filter((l) => l.prises >= 5)
    .map((l) => ({ ...l, taux: Math.round((l.commandees / l.prises) * 100) }))
    .sort((x, y) => y.prises - x.prises);
}
