/**
 * Chiffre d'affaires : ce que chaque chantier rapporte.
 *
 * Longtemps, aucune statistique ne pouvait parler d'argent — le champ
 * « Montant OFR » n'existait pas. Il est désormais renseigné sur 98 % des
 * montages terminés, et tout ce qui suit en découle.
 *
 * ── Une distinction qui commande tout ────────────────────────────────────
 *
 * TM vend du SERVICE : le client achète sa cabine et TM la pose. Quelques
 * clients veulent du CLÉ EN MAIN, et TM fournit alors aussi la marchandise.
 * Les deux ne se comparent pas : le second inclut le prix d'une cabine, qui
 * n'est pas une prestation mais un achat revendu. Les mélanger dans un prix
 * moyen donnerait un chiffre qui ne décrit aucune des deux réalités.
 *
 * Le partage se lit sur le NUMÉRO DE COMMANDE TM : si TM a passé commande —
 * à l'usine ou au fournisseur — c'est TM qui a acheté la cabine. Le chiffre
 * confirme la règle : 1 787 francs par cabine en médiane avec un numéro de
 * commande, 490 sans. Un rapport de trois et demi, qui ne s'explique que par
 * la marchandise.
 */

import type { Project } from "@/lib/notion";
import { clientFacture } from "@/lib/analyses";
import { regionLabel } from "@/lib/swiss-cantons";

export type Prestation = "service" | "cle-en-main";

export interface LigneCA {
  cle: string;
  /** Montants hors taxes, en francs. */
  total: number;
  service: number;
  cleEnMain: number;
  projets: number;
  cabines: number;
  /** Prix par cabine, SERVICE SEUL — la seule comparaison qui ait un sens. */
  parCabine: number | null;
}

export interface CA {
  /** Montages terminés, chiffrés, sur la période. */
  projets: number;
  chiffres: number;
  /** Montages terminés SANS montant : le total est partiel tant qu'il en reste. */
  sansMontant: number;
  total: number;
  service: number;
  cleEnMain: number;
  cabines: number;
  /** Prix médian d'une cabine posée, service seul. */
  medianeParCabine: number | null;
  parMois: { mois: string; total: number; service: number; cleEnMain: number }[];
  parClient: LigneCA[];
  parFournisseur: LigneCA[];
  parRegion: LigneCA[];
}

function vide(v: unknown): boolean {
  return !String(v ?? "").trim();
}

/**
 * Service, ou clé en main ?
 *
 * Un numéro de commande TM signifie que TM a commandé la marchandise. Le
 * champ usine et le champ général comptent l'un comme l'autre : c'est l'acte
 * d'acheter qui distingue, pas l'interlocuteur.
 */
export function prestation(p: Project): Prestation {
  return !vide(p.cmdTM) || !vide(p.cmdTMUsine) ? "cle-en-main" : "service";
}

function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

function mediane(v: number[]): number | null {
  if (v.length === 0) return null;
  const t = [...v].sort((a, b) => a - b);
  return Math.round(t[Math.floor(t.length / 2)]);
}

/** Au-dessous, un prix par cabine ne se compare à rien. */
const MINIMUM_PROJETS = 3;

function ligne(cle: string): LigneCA & { prix: number[] } {
  return { cle, total: 0, service: 0, cleEnMain: 0, projets: 0, cabines: 0, parCabine: null, prix: [] };
}

function conclure(m: Map<string, LigneCA & { prix: number[] }>): LigneCA[] {
  return [...m.values()]
    .map(({ prix, ...l }) => ({
      ...l,
      total: Math.round(l.total),
      service: Math.round(l.service),
      cleEnMain: Math.round(l.cleEnMain),
      /* Le prix par cabine ne se calcule que sur le service : y verser un
         clé en main ferait passer le prix d'une cabine pour celui d'une pose. */
      parCabine: prix.length >= MINIMUM_PROJETS ? mediane(prix) : null,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Le chiffre d'affaires réalisé, sous tous les angles utiles.
 *
 * Seuls les montages TERMINÉS comptent : une offre acceptée n'est pas un
 * revenu tant que le travail n'est pas fait. Les interventions de service pur
 * — ni pose, ni cabine — sont écartées du prix par cabine, faute de cabine,
 * mais leur montant entre bien dans le total.
 *
 * @param de  Date de montage minimale, incluse (AAAA-MM-JJ).
 * @param a   Date de montage maximale, incluse.
 */
export function chiffreAffaires(projets: Project[], de?: string, a?: string): CA {
  const parMois = new Map<string, { total: number; service: number; cleEnMain: number }>();
  const parClient = new Map<string, LigneCA & { prix: number[] }>();
  const parFournisseur = new Map<string, LigneCA & { prix: number[] }>();
  const parRegion = new Map<string, LigneCA & { prix: number[] }>();

  let total = 0, service = 0, cleEnMain = 0, cabines = 0, chiffres = 0, sansMontant = 0;
  const prixGlobal: number[] = [];

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé") return;
    const jour = String(p.dateMontage || "").slice(0, 10);
    if (!jour) return;
    if (de && jour < de) return;
    if (a && jour > a) return;

    const montant = Number(p.montantOFR);
    if (!Number.isFinite(montant) || montant <= 0) { sansMontant += 1; return; }
    chiffres += 1;

    const type = prestation(p);
    const cab = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    total += montant;
    cabines += cab;
    if (type === "service") service += montant; else cleEnMain += montant;

    /* Le prix par cabine : service seul, et seulement quand il y a des cabines.
       Une intervention de service pur n'en pose aucune. */
    const prixCabine = type === "service" && cab > 0 && !estServicePur(p) ? montant / cab : null;
    if (prixCabine !== null) prixGlobal.push(prixCabine);

    const mois = jour.slice(0, 7);
    const m = parMois.get(mois) || { total: 0, service: 0, cleEnMain: 0 };
    m.total += montant;
    if (type === "service") m.service += montant; else m.cleEnMain += montant;
    parMois.set(mois, m);

    const ajouter = (carte: Map<string, LigneCA & { prix: number[] }>, cle: string) => {
      if (!cle) return;
      const l = carte.get(cle) || ligne(cle);
      l.total += montant;
      l.projets += 1;
      l.cabines += cab;
      if (type === "service") l.service += montant; else l.cleEnMain += montant;
      if (prixCabine !== null) l.prix.push(prixCabine);
      carte.set(cle, l);
    };

    ajouter(parClient, clientFacture(p).nom);
    ajouter(parFournisseur, (p.fournisseurs || [])[0] || "Non renseigné");
    ajouter(parRegion, regionLabel(`${p.adresseChantier || ""} ${p.projet || ""}`) || "Inconnue");
  });

  return {
    projets: chiffres + sansMontant,
    chiffres,
    sansMontant,
    total: Math.round(total),
    service: Math.round(service),
    cleEnMain: Math.round(cleEnMain),
    cabines,
    medianeParCabine: mediane(prixGlobal),
    parMois: [...parMois.entries()]
      .map(([mois, v]) => ({
        mois,
        total: Math.round(v.total),
        service: Math.round(v.service),
        cleEnMain: Math.round(v.cleEnMain),
      }))
      .sort((x, y) => x.mois.localeCompare(y.mois)),
    parClient: conclure(parClient),
    parFournisseur: conclure(parFournisseur),
    parRegion: conclure(parRegion),
  };
}
