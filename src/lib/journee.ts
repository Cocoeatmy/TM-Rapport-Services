/**
 * La journée type d'un monteur.
 *
 * Une question qu'on ne se pose jamais faute de chiffre : sur une journée
 * payée, combien d'heures sont réellement passées sur un chantier ? Le reste
 * n'est pas du temps perdu — la route est indispensable, les pauses sont dues
 * — mais il se facture rarement, et personne ne sait combien il pèse.
 *
 * On reconstitue chaque JOURNÉE-MONTEUR à partir de ce qui est réellement
 * pointé : première arrivée, dernier départ, et la somme des présences par
 * cabine. Trois blocs en sortent.
 *
 *   • SUR CHANTIER — la somme des présences pointées. C'est la seule grandeur
 *     mesurée ; tout le reste en découle.
 *   • ROUTE — estimée : dépôt → premier chantier, les liaisons entre
 *     chantiers, puis retour au dépôt. Depuis le retrait du GPS, aucune route
 *     n'est mesurée. Ce chiffre sert à COMPARER des journées entre elles, pas
 *     à établir une vérité.
 *   • LE RESTE — ce que l'amplitude ne couvre ni par la présence ni par la
 *     route : pauses, attentes, imprévus. C'est le bloc le plus intéressant,
 *     et le seul qu'aucune autre statistique ne montre.
 *
 * Un binôme compte pour DEUX journées-monteur, sur la même amplitude : on
 * décrit la journée d'une personne, pas celle d'un chantier. Les montages
 * attribués à « Team » sont écartés — on ne sait pas combien de personnes s'y
 * trouvaient, donc combien de journées compter.
 */

import type { Project } from "@/lib/notion";
import {
  minutesPointees, trajet, lieuDepot, distance,
  type Lieu, type Position,
} from "@/lib/tournee";
import { regionLabel, cantonOf } from "@/lib/swiss-cantons";

export interface LigneJournee {
  /** Monteur, ou « Ensemble » pour la ligne de synthèse. */
  nom: string;
  /** Journées-monteur observées. */
  jours: number;
  /** Moyennes par journée, en minutes. */
  minutesJournee: number;
  minutesChantier: number;
  minutesRoute: number;
  minutesReste: number;
  /** Part de la journée passée sur un chantier, en pourcentage. */
  partChantier: number;
  chantiersParJour: number;
  cabinesParJour: number;
}

/** Clé du cache de géocodage — même normalisation que /api/geocode. */
function cleAdresse(adresse: string): string {
  return (adresse || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function jourDe(v: string | null | undefined): string {
  return String(v || "").slice(0, 10);
}

function dansFenetre(jour: string, de?: string, a?: string): boolean {
  if (!jour) return false;
  if (de && jour < de) return false;
  if (a && jour > a) return false;
  return true;
}

function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

/** Première arrivée et dernier départ pointés, en minutes depuis minuit. */
function bornes(p: Project): { debut: number; fin: number } | null {
  const heures = (raw: string): number[] => {
    const out: number[] = [];
    const re = /(\d{1,2}):(\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(raw || "")))) out.push(Number(m[1]) * 60 + Number(m[2]));
    return out;
  };
  const a = heures(p.heureArrivee || "");
  const d = heures(p.heureDepart || "");
  if (a.length === 0 || d.length === 0) return null;
  const debut = Math.min(...a);
  const fin = Math.max(...d);
  return fin > debut ? { debut, fin } : null;
}

function lieuDe(p: Project, positions: Record<string, Position | null>): Lieu | null {
  const texte = `${p.adresseChantier || ""} ${p.projet || ""}`;
  const npa = texte.match(/\b(\d{4})\b/)?.[1] || "";
  if (!npa) return null;
  return {
    npa,
    region: regionLabel(texte),
    canton: cantonOf(texte) || "",
    pos: positions[cleAdresse(p.adresseChantier || "")] || undefined,
  };
}

/** Monteurs nommés d'un projet ; vide pour « Team », dont on ignore l'effectif. */
function monteurs(p: Project): string[] {
  const brut = String(p.collaborateurs || "").trim();
  if (!brut || /\bteams?\b/i.test(brut)) return [];
  return brut.split("&").map((x) => x.trim()).filter(Boolean);
}

interface Journee {
  nom: string;
  debut: number;
  fin: number;
  chantier: number;
  projets: Project[];
  cabines: number;
}

interface Cumul {
  jours: number; journee: number; chantier: number; route: number;
  reste: number; chantiers: number; cabines: number;
}

const ZERO: Cumul = {
  jours: 0, journee: 0, chantier: 0, route: 0, reste: 0, chantiers: 0, cabines: 0,
};

/** Moins de cinq journées : une moyenne ne dit rien. */
const MINIMUM_JOURS = 5;

/**
 * Décompose les journées réellement travaillées.
 *
 * @param positions Cache de géocodage. Vide, la route se rabat sur une
 *                  estimation par code postal — moins précise, jamais fausse
 *                  au point d'inverser deux régions.
 */
export function journeeType(
  projets: Project[],
  positions: Record<string, Position | null>,
  de?: string, a?: string,
): { ensemble: LigneJournee | null; parMonteur: LigneJournee[] } {
  const depot = lieuDepot(positions[cleAdresse("1400 Yverdon-les-Bains")] || undefined);

  /* Une entrée par couple (monteur, jour) : c'est l'unité qu'on décrit. Le nom
     est porté par la valeur, pas déduit de la clé — un prénom composé ferait
     échouer n'importe quel découpage. */
  const jours = new Map<string, Journee>();

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    const jour = jourDe(p.dateMontage);
    if (!dansFenetre(jour, de, a)) return;
    const presence = minutesPointees(p as never);
    const b = bornes(p);
    if (presence === null || presence <= 0 || !b) return;

    monteurs(p).forEach((nom) => {
      const cle = `${jour}|${nom}`;
      const cur = jours.get(cle)
        || { nom, debut: b.debut, fin: b.fin, chantier: 0, projets: [], cabines: 0 };
      cur.debut = Math.min(cur.debut, b.debut);
      cur.fin = Math.max(cur.fin, b.fin);
      cur.chantier += presence;
      cur.projets.push(p);
      cur.cabines += Number(p.nbCabines) || 0;
      jours.set(cle, cur);
    });
  });

  /**
   * Route estimée d'une journée, en deux parts qui ne se comportent pas
   * pareil : celle du dépôt ENCADRE l'amplitude pointée — on roule avant la
   * première arrivée et après le dernier départ — tandis que les liaisons
   * entre chantiers sont COMPRISES dedans. Les confondre reviendrait à
   * compter deux fois le même temps.
   */
  const routeDe = (j: Journee): { depot: number; interne: number } => {
    const lieux = j.projets
      .map((p) => lieuDe(p, positions))
      .filter((l): l is Lieu => l !== null);
    if (lieux.length === 0) return { depot: 0, interne: 0 };
    let interne = 0;
    for (let i = 1; i < lieux.length; i++) {
      /* Deux chantiers de la même localité : la liaison est marginale, et
         `trajet` y ajouterait un forfait d'arrêt qui gonflerait la route. */
      if (distance(lieux[i - 1], lieux[i]) === 0) continue;
      interne += trajet(lieux[i - 1], lieux[i]).minutes;
    }
    return {
      depot: trajet(depot, lieux[0]).minutes + trajet(lieux[lieux.length - 1], depot).minutes,
      interne,
    };
  };

  const parNom = new Map<string, Cumul>();
  const total: Cumul = { ...ZERO };

  jours.forEach((j) => {
    const amplitude = j.fin - j.debut;
    const route = routeDe(j);
    const journee = route.depot + amplitude;
    /* Borné à zéro : une route surestimée ne doit pas produire une pause
       négative, qui ne voudrait rien dire. */
    const reste = Math.max(0, amplitude - j.chantier - route.interne);

    const ajouter = (c: Cumul) => {
      c.jours += 1;
      c.journee += journee;
      c.chantier += j.chantier;
      c.route += route.depot + route.interne;
      c.reste += reste;
      c.chantiers += j.projets.length;
      c.cabines += j.cabines;
    };
    const cur = parNom.get(j.nom) || { ...ZERO };
    ajouter(cur);
    parNom.set(j.nom, cur);
    ajouter(total);
  });

  const ligne = (nom: string, v: Cumul): LigneJournee => {
    const n = v.jours || 1;
    const journee = Math.round(v.journee / n);
    const chantier = Math.round(v.chantier / n);
    return {
      nom,
      jours: v.jours,
      minutesJournee: journee,
      minutesChantier: chantier,
      minutesRoute: Math.round(v.route / n),
      minutesReste: Math.round(v.reste / n),
      partChantier: journee > 0 ? Math.round((chantier / journee) * 100) : 0,
      chantiersParJour: Math.round((v.chantiers / n) * 10) / 10,
      cabinesParJour: Math.round((v.cabines / n) * 10) / 10,
    };
  };

  return {
    ensemble: total.jours > 0 ? ligne("Ensemble", total) : null,
    parMonteur: [...parNom.entries()]
      .filter(([, v]) => v.jours >= MINIMUM_JOURS)
      .map(([nom, v]) => ligne(nom, v))
      .sort((x, y) => y.partChantier - x.partChantier),
  };
}
