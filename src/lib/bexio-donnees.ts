/**
 * Copie locale des offres et factures bexio.
 *
 * Pourquoi copier plutôt qu'interroger bexio à chaque affichage : la vue
 * Facturation croise MILLE huit cents offres avec MILLE trois cents factures.
 * Les redemander à chaque ouverture de page serait lent, et userait pour rien
 * un quota qui ne nous appartient pas. On les range une fois par nuit, et au
 * premier appel si la copie manque.
 *
 * Rangées dans Redis seulement : ce sont des données dérivées, qui se
 * reconstruisent en deux secondes depuis bexio. Les écrire aussi dans le
 * magasin Notion gonflerait des pages pour rien.
 */

import { bexioFetch } from "@/lib/bexio";
import { redisGetJSON, redisSetJSON, siRedis } from "@/lib/redis-cache";
import type { OffreBexio, FactureBexio } from "@/lib/bexio-rapprochement";

/* Version 2 : les factures portent désormais le nom du client. Changer la
   clé évite de servir une copie d'hier à laquelle il manquerait. */
const CLE_OFFRES = "bexio:offres2";
const CLE_FACTURES = "bexio:factures2";
const CLE_SYNCHRO = "bexio:synchro";
/** Un mois : la copie est refaite chaque nuit, ce plafond n'est qu'un filet. */
const DUREE = 30 * 24 * 3600;
/** Plafond imposé par bexio sur une page de résultats. */
const PAR_PAGE = 2000;

/** Première ligne de l'adresse de facturation : c'est le nom du client. */
const nomClient = (adresse: string | null | undefined): string =>
  String(adresse || "").split("\n")[0].trim();

const nombre = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

interface BrutDocument {
  id: number;
  document_nr?: string;
  title?: string;
  total?: string | number;
  total_remaining_payments?: string | number;
  contact_id?: number | null;
  is_valid_from?: string;
  reference?: string | null;
  contact_address?: string | null;
}

/** Toutes les pages d'un objet bexio, dans l'ordre où il les rend. */
async function toutesLesPages(base: string): Promise<BrutDocument[]> {
  const out: BrutDocument[] = [];
  for (let page = 0; page < 20; page++) {
    const lot = await bexioFetch<BrutDocument[]>(
      `${base}?limit=${PAR_PAGE}&offset=${page * PAR_PAGE}`,
    );
    if (!Array.isArray(lot) || lot.length === 0) break;
    out.push(...lot);
    if (lot.length < PAR_PAGE) break;
  }
  return out;
}

export async function synchroniserBexio(): Promise<{ offres: number; factures: number }> {
  const [brutOffres, brutFactures] = await Promise.all([
    toutesLesPages("/2.0/kb_offer"),
    toutesLesPages("/2.0/kb_invoice"),
  ]);

  const offres: OffreBexio[] = brutOffres.map((o) => ({
    id: o.id,
    nr: (o.document_nr || "").trim(),
    titre: o.title || "",
    total: nombre(o.total),
    contactId: o.contact_id ?? null,
    date: (o.is_valid_from || "").slice(0, 10),
  }));
  const factures: FactureBexio[] = brutFactures.map((f) => ({
    id: f.id,
    nr: (f.document_nr || "").trim(),
    titre: f.title || "",
    total: nombre(f.total),
    restant: nombre(f.total_remaining_payments),
    contactId: f.contact_id ?? null,
    date: (f.is_valid_from || "").slice(0, 10),
    reference: f.reference || null,
    client: nomClient(f.contact_address),
  }));

  await siRedis(() => redisSetJSON(CLE_OFFRES, offres, DUREE));
  await siRedis(() => redisSetJSON(CLE_FACTURES, factures, DUREE));
  await siRedis(() => redisSetJSON(CLE_SYNCHRO, { le: new Date().toISOString(), offres: offres.length, factures: factures.length }, DUREE));
  return { offres: offres.length, factures: factures.length };
}

export interface CopieBexio {
  offres: OffreBexio[];
  factures: FactureBexio[];
  /** Quand la copie a été faite — l'écran doit pouvoir le dire. */
  le: string | null;
}

/** La copie locale ; reconstruite depuis bexio si elle manque. */
export async function lireCopieBexio(forcer = false): Promise<CopieBexio> {
  if (!forcer) {
    const o = await siRedis(() => redisGetJSON<OffreBexio[]>(CLE_OFFRES));
    const f = await siRedis(() => redisGetJSON<FactureBexio[]>(CLE_FACTURES));
    if (o?.valeur?.length && f?.valeur?.length) {
      const s = await siRedis(() => redisGetJSON<{ le: string }>(CLE_SYNCHRO));
      return { offres: o.valeur, factures: f.valeur, le: s?.valeur?.le || null };
    }
  }
  await synchroniserBexio();
  const o = await siRedis(() => redisGetJSON<OffreBexio[]>(CLE_OFFRES));
  const f = await siRedis(() => redisGetJSON<FactureBexio[]>(CLE_FACTURES));
  /* Sans cache partagé (panne Redis), on rend ce qu'on vient de lire chez
     bexio plutôt que de renvoyer une page vide. */
  if (o?.valeur && f?.valeur) {
    return { offres: o.valeur, factures: f.valeur, le: new Date().toISOString() };
  }
  const [offres, factures] = await Promise.all([
    toutesLesPages("/2.0/kb_offer"),
    toutesLesPages("/2.0/kb_invoice"),
  ]);
  return {
    offres: offres.map((x) => ({
      id: x.id, nr: (x.document_nr || "").trim(), titre: x.title || "",
      total: nombre(x.total), contactId: x.contact_id ?? null, date: (x.is_valid_from || "").slice(0, 10),
    })),
    factures: factures.map((x) => ({
      id: x.id, nr: (x.document_nr || "").trim(), titre: x.title || "",
      total: nombre(x.total), restant: nombre(x.total_remaining_payments),
      contactId: x.contact_id ?? null, date: (x.is_valid_from || "").slice(0, 10),
      reference: x.reference || null, client: nomClient(x.contact_address),
    })),
    le: new Date().toISOString(),
  };
}
