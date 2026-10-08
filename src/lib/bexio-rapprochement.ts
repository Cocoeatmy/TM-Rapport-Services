/**
 * Rapprocher un chantier de l'app et sa facture dans bexio.
 *
 * Ce que disent les données réelles (relevé du 8 octobre 2026, 1 868 offres
 * et 1 291 factures) :
 *
 *  • le numéro `TM-26xxxxx` de l'app EST le numéro d'offre bexio : 1 136
 *    projets sur 1 138 retrouvent leur offre ;
 *  • AUCUNE facture ne porte ce numéro — zéro sur 1 291. Le pont entre
 *    l'offre et la facture est le TITRE (« Client, Adresse »), identique
 *    dans 97 % des cas, grâce au copier-coller des adresses ;
 *  • mais s'en tenir au titre exact ment : sur les six plus gros « non
 *    facturés » de la première analyse, un titre avait été complété au
 *    moment de facturer, et un client entier est facturé au forfait mensuel
 *    (« Services – Juillet 2026 »), chantier par chantier invisible. La
 *    première passe annonçait 155 chantiers et 68 000 francs manquants ;
 *    après vérification il en restait six, pour 10 241 francs.
 *
 * D'où une recherche EN CASCADE, de la preuve au soupçon, qui dit toujours
 * sur quoi elle se fonde. Un outil qui envoie relancer un client déjà payé
 * perd sa crédibilité à la première erreur.
 */

export interface OffreBexio {
  id: number;
  nr: string;
  titre: string;
  total: number;
  contactId: number | null;
  date: string;
}

export interface FactureBexio {
  id: number;
  nr: string;
  titre: string;
  total: number;
  /** Ce qu'il reste à encaisser (0 = payée). */
  restant: number;
  contactId: number | null;
  date: string;
  reference: string | null;
}

/** Sur quoi se fonde le rapprochement — du certain au douteux. */
export type EtatFacturation =
  /** Même titre : c'est la même affaire, sans discussion. */
  | "facturee"
  /** Même client, même montant au centime : pratiquement certain. */
  | "retrouvee"
  /** Même client, adresse concordante : très probable, à l'œil. */
  | "probable"
  /** Client facturé au forfait mensuel : le chantier y est noyé. */
  | "mensuel"
  /** Rien trouvé. C'est ici que se cachent les oublis. */
  | "sans"
  /** Aucune offre bexio ne porte ce numéro : on ne peut rien dire. */
  | "inconnue";

export interface Rapprochement {
  offre: OffreBexio | null;
  factures: FactureBexio[];
  etat: EtatFacturation;
  /** Total facturé retrouvé. */
  facture: number;
  /** Reste à encaisser sur les factures retrouvées. */
  restant: number;
}

/** Les numéros TM d'un champ Notion, qui peut en contenir plusieurs. */
export function numerosTM(ofrTM: string | null | undefined): string[] {
  return [...String(ofrTM || "").toUpperCase().matchAll(/TM-?\d{6,}/g)].map((m) =>
    m[0].replace(/^TM-?/, "TM-"));
}

/** Comparaison de titres : accents, ponctuation et casse ne comptent pas. */
export function normaliserTitre(t: string | null | undefined): string {
  return String(t || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Mots significatifs d'un titre — pour comparer deux adresses écrites autrement. */
export function motsCles(t: string | null | undefined): Set<string> {
  const propre = String(t || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return new Set(propre.split(/[^a-z0-9]+/).filter((m) => m.length > 3));
}

/**
 * Clients facturés au forfait mensuel : deux factures ou plus intitulées
 * « Services – <mois> ». Leurs chantiers ne sont pas facturés un par un, et
 * les signaler comme oubliés serait une fausse alerte tous les mois.
 */
export function clientsAuForfait(factures: FactureBexio[]): Set<number> {
  const compte = new Map<number, number>();
  for (const f of factures) {
    if (f.contactId == null) continue;
    if (!/^services\s*[-–]/i.test((f.titre || "").trim())) continue;
    compte.set(f.contactId, (compte.get(f.contactId) || 0) + 1);
  }
  return new Set([...compte.entries()].filter(([, n]) => n >= 2).map(([c]) => c));
}

export interface IndexFacturation {
  offreParNr: Map<string, OffreBexio>;
  facturesParTitre: Map<string, FactureBexio[]>;
  facturesParContact: Map<number, FactureBexio[]>;
  forfait: Set<number>;
}

export function indexerFacturation(offres: OffreBexio[], factures: FactureBexio[]): IndexFacturation {
  const offreParNr = new Map<string, OffreBexio>();
  for (const o of offres) {
    const nr = (o.nr || "").trim().toUpperCase();
    if (nr) offreParNr.set(nr, o);
  }
  const facturesParTitre = new Map<string, FactureBexio[]>();
  const facturesParContact = new Map<number, FactureBexio[]>();
  for (const f of factures) {
    const t = normaliserTitre(f.titre);
    if (t) {
      const l = facturesParTitre.get(t);
      if (l) l.push(f); else facturesParTitre.set(t, [f]);
    }
    if (f.contactId != null) {
      const l = facturesParContact.get(f.contactId);
      if (l) l.push(f); else facturesParContact.set(f.contactId, [f]);
    }
  }
  return { offreParNr, facturesParTitre, facturesParContact, forfait: clientsAuForfait(factures) };
}

const centimes = (n: number) => Math.round((n || 0) * 100);

/** Le rapprochement d'un chantier, et ce sur quoi il se fonde. */
export function rapprocher(ofrTM: string | null | undefined, idx: IndexFacturation): Rapprochement {
  const vide = (etat: EtatFacturation, offre: OffreBexio | null = null): Rapprochement =>
    ({ offre, factures: [], etat, facture: 0, restant: 0 });

  const offre = numerosTM(ofrTM).map((n) => idx.offreParNr.get(n)).find(Boolean) || null;
  if (!offre) return vide("inconnue");

  const avec = (fs: FactureBexio[], etat: EtatFacturation): Rapprochement => ({
    offre,
    factures: fs,
    etat,
    facture: fs.reduce((s, f) => s + (f.total || 0), 0),
    restant: fs.reduce((s, f) => s + (f.restant || 0), 0),
  });

  // 1. Même titre — la preuve.
  const parTitre = idx.facturesParTitre.get(normaliserTitre(offre.titre));
  if (parTitre?.length) return avec(parTitre, "facturee");

  const duClient = offre.contactId != null ? idx.facturesParContact.get(offre.contactId) || [] : [];

  // 2. Même client, même montant au centime.
  if (centimes(offre.total) > 0) {
    const memeMontant = duClient.filter((f) => centimes(f.total) === centimes(offre.total));
    if (memeMontant.length) return avec(memeMontant, "retrouvee");
  }

  // 3. Même client, adresse concordante (deux mots significatifs en commun).
  const mo = motsCles(offre.titre);
  if (mo.size >= 2) {
    const proches = duClient.filter((f) => {
      let n = 0;
      for (const m of motsCles(f.titre)) if (mo.has(m)) n++;
      return n >= 2;
    });
    if (proches.length) return avec(proches, "probable");
  }

  // 4. Client au forfait mensuel : le chantier est dans une facture globale.
  if (offre.contactId != null && idx.forfait.has(offre.contactId)) return vide("mensuel", offre);

  return vide("sans", offre);
}

/** Les états qui méritent qu'on aille vérifier. */
export function aVerifier(etat: EtatFacturation): boolean {
  return etat === "sans";
}
