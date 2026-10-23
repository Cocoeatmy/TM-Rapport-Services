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

/* La clé change à chaque enrichissement de la copie : servir celle d'hier,
   à laquelle il manque un champ, ferait taire un signal sans rien dire.
   Version 5 : statut des offres (devis sans réponse) et échéance des factures
   (factures échues). */
const CLE_OFFRES = "bexio:offres5";
const CLE_FACTURES = "bexio:factures5";
const CLE_ACHATS = "bexio:achats1";
const CLE_COMPTES = "bexio:comptes1";
const CLE_SYNCHRO = "bexio:synchro";
/** Date du (dernier) paiement de chaque facture réglée : { [id]: AAAA-MM-JJ }. */
const CLE_PAIEMENTS = "bexio:paiements1";
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
  /** Chez bexio, « gross » veut dire HORS TAXES sur une facture de vente. */
  total_gross?: string | number;
  /** Offres : 1 brouillon, 2 en attente, 3 confirmée, 4 déclinée. */
  kb_item_status_id?: number;
  /** Factures : échéance de paiement. */
  is_valid_to?: string;
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

/**
 * Facture fournisseur — ce que l'entreprise DÉPENSE.
 *
 * Attention : ces factures-là vivent dans le module « achats » de bexio, à
 * une autre adresse (`/4.0/purchase/bills`) et avec une autre pagination
 * (page / page_size) que les factures de vente. La documentation annonce
 * `/2.0/bill`, qui répond 404 : c'est la sonde qui a trouvé la bonne porte.
 */
export interface AchatBexio {
  id: string;
  no: string;
  /** Qui nous facture. */
  fournisseur: string;
  titre: string;
  /** TTC, pour se comparer au chiffre d'affaires qui l'est aussi. */
  ttc: number;
  /** Hors taxes. */
  ht: number;
  /** Ce qu'il reste à payer. */
  du: number;
  date: string;
  echeance: string;
  enRetard: boolean;
  statut: string;
  /** Comptes comptables imputés : c'est la nature de la dépense. */
  comptes: number[];
}

export interface CompteBexio { id: number; no: string; nom: string }

interface BrutAchat {
  id: string; document_no?: string; vendor?: string; lastname_company?: string;
  title?: string; gross?: number; net?: number; pending_amount?: number;
  bill_date?: string; due_date?: string; overdue?: boolean; status?: string;
  booking_account_ids?: number[];
}

/** Pagination du module achats : page / page_size, et non limit / offset. */
async function toutesLesPagesAchats(): Promise<BrutAchat[]> {
  const out: BrutAchat[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await bexioFetch<{ data?: BrutAchat[]; paging?: { page_count?: number } }>(
      `/4.0/purchase/bills?page=${page}&page_size=500`,
    );
    const lot = Array.isArray(r?.data) ? r.data : [];
    out.push(...lot);
    if (lot.length === 0 || page >= (r?.paging?.page_count || 1)) break;
  }
  return out;
}

export async function synchroniserBexio(): Promise<{ offres: number; factures: number; achats: number }> {
  const [brutOffres, brutFactures, brutAchats, brutComptes] = await Promise.all([
    toutesLesPages("/2.0/kb_offer"),
    toutesLesPages("/2.0/kb_invoice"),
    toutesLesPagesAchats().catch(() => [] as BrutAchat[]),
    bexioFetch<{ id: number; account_no?: string; name?: string }[]>("/2.0/accounts")
      .catch(() => [] as { id: number; account_no?: string; name?: string }[]),
  ]);

  const offres: OffreBexio[] = brutOffres.map((o) => ({
    id: o.id,
    nr: (o.document_nr || "").trim(),
    titre: o.title || "",
    total: nombre(o.total),
    contactId: o.contact_id ?? null,
    date: (o.is_valid_from || "").slice(0, 10),
    client: nomClient(o.contact_address),
    ht: nombre(o.total_gross),
    statut: o.kb_item_status_id ?? null,
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
    ht: nombre(f.total_gross),
    echeance: (f.is_valid_to || "").slice(0, 10) || null,
  }));

  const achats: AchatBexio[] = brutAchats.map((b) => ({
    id: String(b.id),
    no: b.document_no || "",
    fournisseur: (b.vendor || b.lastname_company || "").trim() || "Sans fournisseur",
    titre: b.title || "",
    ttc: nombre(b.gross),
    ht: nombre(b.net),
    du: nombre(b.pending_amount),
    date: (b.bill_date || "").slice(0, 10),
    echeance: (b.due_date || "").slice(0, 10),
    enRetard: !!b.overdue,
    statut: b.status || "",
    comptes: Array.isArray(b.booking_account_ids) ? b.booking_account_ids : [],
  }));
  const comptes: CompteBexio[] = (Array.isArray(brutComptes) ? brutComptes : []).map((c) => ({
    id: c.id, no: c.account_no || "", nom: c.name || "",
  }));

  /* Les dates de paiement, pour les délais de paiement par client. bexio ne
     les donne qu'une facture à la fois : on ne demande que celles qu'on
     n'a pas encore, par lots — la première nuit en rattrape une partie, les
     suivantes le reste (23.10.2026). */
  await completerPaiements(factures).catch((e) => console.warn("[bexio] paiements :", (e as Error).message));

  await siRedis(() => redisSetJSON(CLE_OFFRES, offres, DUREE));
  await siRedis(() => redisSetJSON(CLE_FACTURES, factures, DUREE));
  await siRedis(() => redisSetJSON(CLE_ACHATS, achats, DUREE));
  await siRedis(() => redisSetJSON(CLE_COMPTES, comptes, DUREE));
  await siRedis(() => redisSetJSON(CLE_SYNCHRO, { le: new Date().toISOString(), offres: offres.length, factures: factures.length, achats: achats.length }, DUREE));
  return { offres: offres.length, factures: factures.length, achats: achats.length };
}

export interface CopieBexio {
  offres: OffreBexio[];
  factures: FactureBexio[];
  achats: AchatBexio[];
  comptes: CompteBexio[];
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
      const ac = await siRedis(() => redisGetJSON<AchatBexio[]>(CLE_ACHATS));
      const cp = await siRedis(() => redisGetJSON<CompteBexio[]>(CLE_COMPTES));
      return {
        offres: o.valeur, factures: f.valeur,
        achats: ac?.valeur || [], comptes: cp?.valeur || [],
        le: s?.valeur?.le || null,
      };
    }
  }
  await synchroniserBexio();
  const o = await siRedis(() => redisGetJSON<OffreBexio[]>(CLE_OFFRES));
  const f = await siRedis(() => redisGetJSON<FactureBexio[]>(CLE_FACTURES));
  /* Sans cache partagé (panne Redis), on rend ce qu'on vient de lire chez
     bexio plutôt que de renvoyer une page vide. */
  if (o?.valeur && f?.valeur) {
    const ac = await siRedis(() => redisGetJSON<AchatBexio[]>(CLE_ACHATS));
    const cp = await siRedis(() => redisGetJSON<CompteBexio[]>(CLE_COMPTES));
    return {
      offres: o.valeur, factures: f.valeur,
      achats: ac?.valeur || [], comptes: cp?.valeur || [],
      le: new Date().toISOString(),
    };
  }
  const [offres, factures] = await Promise.all([
    toutesLesPages("/2.0/kb_offer"),
    toutesLesPages("/2.0/kb_invoice"),
  ]);
  return {
    offres: offres.map((x) => ({
      id: x.id, nr: (x.document_nr || "").trim(), titre: x.title || "",
      total: nombre(x.total), contactId: x.contact_id ?? null, date: (x.is_valid_from || "").slice(0, 10),
      client: nomClient(x.contact_address),
    })),
    factures: factures.map((x) => ({
      id: x.id, nr: (x.document_nr || "").trim(), titre: x.title || "",
      total: nombre(x.total), restant: nombre(x.total_remaining_payments),
      contactId: x.contact_id ?? null, date: (x.is_valid_from || "").slice(0, 10),
      reference: x.reference || null, client: nomClient(x.contact_address),
    })),
    achats: [],
    comptes: [],
    le: new Date().toISOString(),
  };
}

/* ── Dates de paiement (23.10.2026) ───────────────────────────────────── */

/** Les dates de paiement connues : { [id facture]: AAAA-MM-JJ }. */
export async function lirePaiements(): Promise<Record<string, string>> {
  const r = await siRedis(() => redisGetJSON<Record<string, string>>(CLE_PAIEMENTS));
  return r?.valeur || {};
}

const LOT_PAIEMENTS = 200;

/** Va chercher la date de paiement des factures réglées qu'on ne connaît pas encore. */
export async function completerPaiements(factures: FactureBexio[]): Promise<number> {
  const connus = await lirePaiements();
  const manquants = factures
    .filter((f) => f.total > 0 && f.restant <= 0.009 && !connus[String(f.id)])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LOT_PAIEMENTS);
  if (manquants.length === 0) return 0;
  let trouves = 0;
  const parQuatre = async (debut: number) => {
    for (let i = debut; i < manquants.length; i += 4) {
      const f = manquants[i];
      try {
        const l = await bexioFetch<{ date?: string; value?: string | number }[]>(`/2.0/kb_invoice/${f.id}/payment`);
        const dates = (Array.isArray(l) ? l : []).map((x) => String(x.date || "").slice(0, 10)).filter(Boolean).sort();
        if (dates.length) { connus[String(f.id)] = dates[dates.length - 1]; trouves++; }
      } catch { /* la nuit suivante réessaiera */ }
    }
  };
  await Promise.all([0, 1, 2, 3].map(parQuatre));
  await siRedis(() => redisSetJSON(CLE_PAIEMENTS, connus, 400 * 24 * 3600));
  return trouves;
}

