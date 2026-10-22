/**
 * Qui, dans bexio, est ce grossiste, ce fournisseur, cette entreprise ?
 *
 * Notion connaît « Dubat » ; bexio facture « DUBAT SA, Rte de… » sous un
 * numéro de contact. Aucun champ ne relie les deux. La correspondance se
 * DÉDUIT de deux indices, du plus sûr au plus faible :
 *
 *  1. les chantiers du partenaire : leur numéro TM est le numéro de l'offre
 *     bexio (1 136 sur 1 138), et l'offre dit quel contact est facturé ;
 *  2. le nom : la première ligne de l'adresse de facturation.
 *
 * Une déduction reste une proposition. Une fois confirmée par le
 * propriétaire de l'accès bexio, elle est mémorisée et fait foi — avec qui
 * l'a confirmée, et quand. Rien n'est jamais écrit dans bexio ni dans Notion.
 */

import { getData, getDataFresh, setData } from "@/lib/kv-store";
import type { CopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, normaliserTitre, rapprocher, type FactureBexio } from "@/lib/bexio-rapprochement";

const CLE = "bexio-correspondances-partenaires";

export interface Correspondance {
  /** « grossistes:Dubat », « fournisseurs:Duka », « entreprises:Roch Sanitaire »… */
  cle: string;
  contacts: number[];
  par: string;
  le: string;
}

export async function lireCorrespondances(): Promise<Map<string, Correspondance>> {
  try {
    const l = await getData<Correspondance>(CLE);
    return new Map(l.filter((c) => c?.cle && Array.isArray(c.contacts)).map((c) => [c.cle, c]));
  } catch {
    return new Map();
  }
}

/** Lecture FRAÎCHE avant réécriture : le cache de 60 s est par instance. */
export async function poserCorrespondance(c: Correspondance): Promise<void> {
  const l = await getDataFresh<Correspondance>(CLE);
  const m = new Map(l.filter((x) => x?.cle).map((x) => [x.cle, x]));
  if (c.contacts.length) m.set(c.cle, c); else m.delete(c.cle);
  await setData(CLE, [...m.values()]);
}

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export interface DemandePartenaire {
  cle: string;
  /** Mots qui désignent le partenaire dans un nom de client (« Dubat », « Gétaz »…). */
  mots: string[];
  /** Champ « N° OFR TM » des chantiers du partenaire, tels que l'app les connaît. */
  numeros: string[];
  de?: string;
  a?: string;
}

export function calculerPartenaire(copie: CopieBexio, d: DemandePartenaire, confirmee?: Correspondance) {
  const idx = indexerFacturation(copie.offres, copie.factures);
  const inc = (m: Map<number, number>, k: number | null | undefined) => { if (k) m.set(k, (m.get(k) || 0) + 1); };

  /* Indice 1 — les chantiers. */
  const parChantiers = new Map<number, number>();
  const surChantiers = new Map<number, FactureBexio>();
  for (const n of d.numeros) {
    const r = rapprocher(n, idx);
    inc(parChantiers, r.offre?.contactId);
    for (const f of r.factures) surChantiers.set(f.id, f);
  }

  /* Indice 2 — le nom. Trois lettres au moins : « SA » ne désigne personne. */
  const mots = d.mots.map((m) => normaliserTitre(m)).filter((m) => m.length >= 3);
  const parNom = new Map<number, number>();
  const nomDe = new Map<number, string>();
  for (const x of [...copie.factures, ...copie.offres]) {
    if (!x.contactId) continue;
    if (x.client && !nomDe.has(x.contactId)) nomDe.set(x.contactId, x.client);
    const c = normaliserTitre(x.client);
    if (c && mots.some((m) => c.includes(m))) inc(parNom, x.contactId);
  }

  const ids = new Set([...parChantiers.keys(), ...parNom.keys()]);
  const totalDe = (id: number) => copie.factures.filter((f) => f.contactId === id);
  const candidats = [...ids].map((id) => {
    const fs = totalDe(id);
    return {
      id, nom: nomDe.get(id) || `Contact ${id}`,
      parChantiers: parChantiers.get(id) || 0, parNom: parNom.get(id) || 0,
      factures: fs.length, total: r2(fs.reduce((s, f) => s + f.total, 0)),
    };
  }).sort((a, b) => b.parChantiers - a.parChantiers || b.parNom - a.parNom || b.total - a.total).slice(0, 12);

  /* Proposition : le nom correspond, ou une part nette des chantiers passe
     par ce contact. Un contact vu une seule fois sur cinquante chantiers
     est un client final, pas le partenaire. */
  const maxCh = Math.max(0, ...candidats.map((c) => c.parChantiers));
  const proposes = candidats
    .filter((c) => c.parNom > 0 || (c.parChantiers >= 2 && c.parChantiers >= maxCh * 0.3))
    .map((c) => c.id);
  const retenus = new Set(confirmee ? confirmee.contacts : proposes);

  const dans = (x: string | null | undefined) => {
    const v = String(x || "").slice(0, 10);
    if (!v) return false;
    return (!d.de || v >= d.de) && (!d.a || v <= d.a);
  };
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const sesFactures = copie.factures.filter((f) => f.contactId !== null && retenus.has(f.contactId));
  const fp = sesFactures.filter((f) => dans(f.date));
  const facture = fp.reduce((s, f) => s + f.total, 0);
  const restant = fp.reduce((s, f) => s + f.restant, 0);
  const echues = sesFactures.filter((f) => f.restant > 0.01 && f.echeance && f.echeance.slice(0, 10) < aujourdhui);

  const sesOffres = copie.offres.filter((o) => o.contactId !== null && retenus.has(o.contactId) && dans(o.date));
  const acceptees = sesOffres.filter((o) => o.statut === 3);
  const declinees = sesOffres.filter((o) => o.statut === 4);

  /* Douze mois glissants, facturé par mois — indépendant de la période. */
  const now = new Date();
  const mois = Array.from({ length: 12 }, (_, i) => {
    const x = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const cle = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
    const l = sesFactures.filter((f) => (f.date || "").startsWith(cle));
    return { mois: cle, total: r2(l.reduce((s, f) => s + f.total, 0)), nb: l.length };
  });

  const chantiersPeriode = [...surChantiers.values()].filter((f) => dans(f.date));

  const achats = copie.achats.filter((a) => {
    const n = normaliserTitre(a.fournisseur);
    return n && mots.some((m) => n.includes(m)) && dans(a.date);
  });

  return {
    statut: confirmee ? "confirmee" as const : "proposee" as const,
    confirmeePar: confirmee ? { par: confirmee.par, le: confirmee.le } : null,
    retenus: [...retenus].map((id) => ({ id, nom: nomDe.get(id) || `Contact ${id}` })),
    candidats,
    facture: r2(facture), encaisse: r2(facture - restant), restant: r2(restant), nbFactures: fp.length,
    echues: { nb: echues.length, total: r2(echues.reduce((s, f) => s + f.restant, 0)) },
    offres: {
      nb: sesOffres.length, total: r2(sesOffres.reduce((s, o) => s + o.total, 0)),
      acceptees: acceptees.length, declinees: declinees.length,
      tauxAcceptation: (acceptees.length + declinees.length)
        ? Math.round((acceptees.length / (acceptees.length + declinees.length)) * 100) : null,
    },
    surSesChantiers: { total: r2(chantiersPeriode.reduce((s, f) => s + f.total, 0)), nb: chantiersPeriode.length },
    achats: {
      nb: achats.length, ttc: r2(achats.reduce((s, a) => s + a.ttc, 0)), du: r2(achats.reduce((s, a) => s + a.du, 0)),
    },
    parMois: mois,
    dernieres: sesFactures.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
      .map((f) => ({ nr: f.nr, titre: f.titre, date: f.date, total: r2(f.total), restant: r2(f.restant), echeance: f.echeance || null })),
    copieLe: copie.le,
  };
}

export type StatsBexioPartenaire = ReturnType<typeof calculerPartenaire>;
