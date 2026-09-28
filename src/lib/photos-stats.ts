/**
 * Conformité des photos de montage.
 *
 * Trois séries sont demandées sur chaque cabine posée : deux photos avant
 * intervention, trois du montage, deux après. Le QR code et la garantie ne
 * sont pas comptés — ils ne figurent pas sur toutes les cabines, et les
 * réclamer ferait passer pour fautif un monteur qui n'avait rien à
 * photographier.
 *
 * La règle n'est pas redéfinie ici : elle est lue de `photo-buckets`, qui la
 * fait déjà respecter au moment de l'envoi du rapport. Si le nombre de photos
 * exigées change, cette statistique suit sans qu'on y touche.
 *
 * L'attribution se fait CABINE PAR CABINE quand le projet en compte
 * plusieurs : sur un immeuble partagé entre deux monteurs, chacun répond de
 * ses propres lots, pas de ceux du voisin.
 */

import { missingRequiredPhotos, TOTAL_PHOTOS_REQUISES } from "@/lib/photo-buckets";

/** Ce dont la statistique a besoin sur un projet — rien de plus. */
export interface ProjetPhotos {
  id: string;
  ofrTM?: string;
  projet?: string;
  nbCabines?: number | null;
  nbCabinesInstallees?: number | null;
  collaborateurs?: string;
  attributionCabines?: string;
  monteursSousTraitance?: string;
  typeServices?: string[];
  etatCMD?: string;
  photosAvant?: { name: string }[];
  photosDemontage?: { name: string }[];
  photosMontage?: { name: string }[];
  photosQRCode?: { name: string }[];
  photosGaranties?: { name: string }[];
}

export interface LignePhotos {
  /** Monteur seul, ou équipe telle que saisie selon l'axe demandé. */
  nom: string;
  cabines: number;
  attendues: number;
  manquantes: number;
  /** Part des photos demandées qui manquent, en pourcentage. */
  tauxManquant: number;
  /** Cabines dont la série est complète, en pourcentage. */
  tauxCabinesCompletes: number;
  cabinesCompletes: number;
  /** Projets dont au moins une cabine de cette personne est incomplète. */
  projetsIncomplets: ProjetPhotos[];
}

/** « Cab1:Miguel | Cab2:Claudio » → { 1: "Miguel", 2: "Claudio" }. */
function parseCabines(raw: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:\s*([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) {
    const v = m[2].trim();
    if (v) map[parseInt(m[1], 10)] = v;
  }
  return map;
}

function estServicePur(p: ProjetPhotos): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

/** Photos manquantes par cabine (index 1-based) pour un projet donné. */
function manquantesParCabine(p: ProjetPhotos, nbCabines: number, multi: boolean): Record<number, number> {
  const out: Record<number, number> = {};
  const shortfalls = missingRequiredPhotos(p as never, { multiCabine: multi, nbCabines });
  shortfalls.forEach((s) => {
    const m = /^Cabine (\d+) — /.exec(s.label);
    const cab = m ? parseInt(m[1], 10) : 1;
    out[cab] = (out[cab] || 0) + Math.max(0, s.min - s.have);
  });
  return out;
}

/**
 * Agrège la conformité photo par monteur ou par équipe.
 *
 * Axe « monteur » : un binôme engage les DEUX monteurs sur les mêmes cabines.
 * On ne divise pas — il ne s'agit pas de volume produit mais d'une règle
 * respectée ou non, et elle l'était pour les deux ou pour aucun.
 */
export function conformitePhotos(
  projets: ProjetPhotos[],
  axe: "monteur" | "equipe",
): LignePhotos[] {
  const agg = new Map<string, {
    cabines: number; attendues: number; manquantes: number;
    completes: number; projets: Map<string, ProjetPhotos>;
  }>();

  const ligne = (nom: string) => {
    const cur = agg.get(nom)
      || { cabines: 0, attendues: 0, manquantes: 0, completes: 0, projets: new Map() };
    agg.set(nom, cur);
    return cur;
  };

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    // Une cabine sous-traitée n'est pas photographiée par nos monteurs.
    if ((p.monteursSousTraitance || "").trim()) return;
    const nbCabines = Math.max(1, Number(p.nbCabines) || 0);
    const multi = nbCabines > 1;
    const manquantes = manquantesParCabine(p, nbCabines, multi);
    const attribution = parseCabines(p.attributionCabines || "");

    for (let cab = 1; cab <= nbCabines; cab++) {
      const brut = (attribution[cab] || p.collaborateurs || "").trim();
      if (!brut) continue; // sans responsable identifié, rien à imputer
      const noms = axe === "equipe"
        ? [brut]
        : brut.split("&").map((x) => x.trim()).filter(Boolean);
      const trous = manquantes[cab] || 0;

      noms.forEach((nom) => {
        const l = ligne(nom);
        l.cabines += 1;
        l.attendues += TOTAL_PHOTOS_REQUISES;
        l.manquantes += trous;
        if (trous === 0) l.completes += 1;
        else l.projets.set(p.id, p);
      });
    }
  });

  return [...agg.entries()]
    .map(([nom, v]) => ({
      nom,
      cabines: v.cabines,
      attendues: v.attendues,
      manquantes: v.manquantes,
      tauxManquant: v.attendues > 0 ? Math.round((v.manquantes / v.attendues) * 100) : 0,
      cabinesCompletes: v.completes,
      tauxCabinesCompletes: v.cabines > 0 ? Math.round((v.completes / v.cabines) * 100) : 0,
      projetsIncomplets: [...v.projets.values()],
    }))
    // Le meilleur en tête : c'est le classement demandé, sans colonne de plus.
    .sort((a, b) => a.tauxManquant - b.tauxManquant || b.cabines - a.cabines);
}

/** Totaux tous monteurs confondus, pour situer chacun par rapport à l'ensemble. */
export function totalPhotos(lignes: LignePhotos[], axe: "monteur" | "equipe") {
  /* Sur l'axe « monteur », un binôme compte deux fois : additionner les lignes
     gonflerait le total. On ne le calcule donc que sur l'axe « équipe », où
     chaque cabine n'apparaît qu'une fois. */
  if (axe !== "equipe") return null;
  const attendues = lignes.reduce((s, l) => s + l.attendues, 0);
  const manquantes = lignes.reduce((s, l) => s + l.manquantes, 0);
  const cabines = lignes.reduce((s, l) => s + l.cabines, 0);
  const completes = lignes.reduce((s, l) => s + l.cabinesCompletes, 0);
  return {
    cabines, attendues, manquantes,
    tauxManquant: attendues > 0 ? Math.round((manquantes / attendues) * 100) : 0,
    tauxCabinesCompletes: cabines > 0 ? Math.round((completes / cabines) * 100) : 0,
  };
}
