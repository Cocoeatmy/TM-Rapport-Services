/**
 * L'index des bases Notion de l'assistant IA — hors base des projets, lue à
 * part (snapshot partagé de l'app).
 *
 * POURQUOI CE FICHIER (20.10.2026). L'assistant lisait ses neuf bases PENDANT
 * la question, toutes en même temps. En production, toutes ont dépassé le
 * délai Notion : l'annuaire est revenu VIDE… et ce vide a été mis en cache
 * deux heures comme un résultat complet. Un numéro pourtant enregistré était
 * alors « introuvable ».
 *
 * Les règles, désormais :
 *  - les bases sont DÉCOUVERTES (recherche Notion), pas codées en dur ;
 *  - chaque base est lue en entier, pagination comprise, l'une après l'autre ;
 *  - une lecture qui échoue ne remplace JAMAIS la version précédente, et une
 *    base jamais lue est déclarée « non lue » — pas « vide » ;
 *  - les modifications récentes arrivent par une lecture INCRÉMENTALE (pages
 *    modifiées depuis la dernière fois), une requête par base ;
 *  - le gros du travail se fait hors question (tâche planifiée).
 *
 * LECTURE SEULE. Les colonnes d'argent ne sont jamais lues (`colonneArgent`).
 */
import { redisGetJSON, redisSetJSON } from "../redis-cache";
import { colonneArgent, sansMontants } from "../annuaire-ia";
import { normaliserTelephone, telephonesDans } from "./telephone";

export type CategorieBase = "carnet" | "stats" | "technique";

export interface BaseNotion { id: string; titre: string; categorie: CategorieBase }

export interface DocIndex {
  id: string;
  baseId: string;
  titre: string;
  /** [colonne, valeur] — sans l'argent, sans les fichiers. */
  champs: [string, string][];
  /** Numéros en E.164, colonne d'origine comprise. */
  tels: { e164: string; colonne: string }[];
  emails: string[];
  /** Pages reliées (contacts, entreprise, dossiers…). */
  liens: string[];
  edite: string;
}

export interface EtatBase extends BaseNotion {
  /** « ok » : lue en entier ; « non-lue » : jamais lue, on ne peut rien conclure. */
  etat: "ok" | "non-lue";
  docs: number;
  /** Dernière lecture complète / incrémentale (ms). */
  complete: number;
  increment: number;
  erreur?: string;
}

interface Stockage { base: BaseNotion; docs: DocIndex[]; complete: number; increment: number }

const CLE_BASES = "ia:idx:bases";
const CLE_BASE = (id: string) => `ia:idx:base:${id}`;
const TTL = 14 * 24 * 3600; // c'est un index, reconstructible — mais il doit survivre à un week-end
const sansTirets = (id: string) => id.replace(/-/g, "");

/** Notion, chargé à la demande (les tests n'en ont pas besoin). */
async function clientNotion() {
  return (await import("../notion")).notion;
}

/** Un appel Notion, réessayé deux fois sur erreur passagère (délai, 429, 5xx). */
async function avecReprise<T>(fn: () => Promise<T>): Promise<T> {
  let derniere: unknown;
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch (e: any) {
      derniere = e;
      const passager = e?.status === 429 || e?.status >= 500 || /timed out|timeout|ECONNRESET|fetch failed/i.test(String(e?.message || e?.code));
      if (!passager) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw derniere;
}

export function categorieDe(titre: string): CategorieBase {
  if (/stat/i.test(titre)) return "stats";
  if (/s[ée]rie|cabine|produit|technique|article/i.test(titre)) return "technique";
  return "carnet";
}

/* ── Les bases connectées ────────────────────────────────────────────── */

export async function decouvrirBases(): Promise<BaseNotion[]> {
  const notion = await clientNotion();
  const projets = sansTirets(process.env.NOTION_DATABASE_ID || "");
  const out: BaseNotion[] = [];
  let curseur: string | undefined;
  do {
    const r: any = await avecReprise(() => notion.search({
      filter: { property: "object", value: "database" }, start_cursor: curseur, page_size: 100,
    } as any));
    for (const d of r.results || []) {
      if (d.archived || d.in_trash) continue;
      if (sansTirets(d.id) === projets) continue; // les projets : lus à part
      const titre = (d.title || []).map((t: any) => t.plain_text).join("").trim() || "Base sans titre";
      out.push({ id: sansTirets(d.id), titre, categorie: categorieDe(titre) });
    }
    curseur = r.has_more ? r.next_cursor : undefined;
  } while (curseur);
  return out;
}

/* ── Une page → un document ──────────────────────────────────────────── */

function texteDe(pr: any): string {
  if (!pr) return "";
  const rt = (x: any[]) => (x || []).map((t: any) => t.plain_text).join("").trim();
  switch (pr.type) {
    case "title": return rt(pr.title);
    case "rich_text": return rt(pr.rich_text);
    case "select": return pr.select?.name || "";
    case "status": return pr.status?.name || "";
    case "multi_select": return (pr.multi_select || []).map((s: any) => s.name).join(", ");
    case "phone_number": return pr.phone_number || "";
    case "email": return pr.email || "";
    case "url": return pr.url || "";
    case "number": return pr.number != null ? String(pr.number) : "";
    case "checkbox": return pr.checkbox ? "oui" : "";
    case "date": return pr.date?.start ? `${pr.date.start}${pr.date.end ? ` → ${pr.date.end}` : ""}` : "";
    case "people": return (pr.people || []).map((p: any) => p.name).filter(Boolean).join(", ");
    case "place": return [pr.place?.name, pr.place?.address].filter(Boolean).join(", ");
    case "formula": {
      const f = pr.formula || {};
      if (f.type === "string") return (f.string || "").trim();
      if (f.type === "number" && f.number != null) return String(f.number);
      if (f.type === "date") return f.date?.start || "";
      if (f.type === "boolean") return f.boolean ? "oui" : "";
      return "";
    }
    case "rollup": {
      const r = pr.rollup || {};
      if (r.type === "number" && r.number != null) return String(r.number);
      if (r.type === "array") return (r.array || []).map(texteDe).filter(Boolean).join(", ");
      return "";
    }
    default: return "";
  }
}

export function pageEnDocument(page: any, baseId: string): DocIndex | null {
  const props: Record<string, any> = page?.properties || {};
  let titre = "";
  const champs: [string, string][] = [];
  const tels: { e164: string; colonne: string }[] = [];
  const emails = new Set<string>();
  const liens = new Set<string>();
  for (const [colonne, pr] of Object.entries(props)) {
    if (!pr) continue;
    if (pr.type === "title") { titre = texteDe(pr); continue; }
    if (colonneArgent(colonne)) continue;      // l'argent n'est jamais lu
    if (pr.type === "files") continue;
    if (pr.type === "relation") { for (const r of pr.relation || []) liens.add(sansTirets(r.id)); continue; }
    const v = texteDe(pr);
    if (!v) continue;
    if (pr.type === "email" || /e-?mail|courriel/i.test(colonne)) {
      for (const e of v.split(/[\s,;]+/)) if (/@/.test(e)) emails.add(e.replace(/^mailto:/i, "").toLowerCase());
    }
    const numeros = pr.type === "phone_number"
      ? [normaliserTelephone(v)].filter((x): x is string => !!x)
      : telephonesDans(v);
    for (const e164 of numeros) tels.push({ e164, colonne });
    champs.push([colonne, sansMontants(v).slice(0, 400)]);
  }
  if (!titre && champs.length === 0) return null;
  return {
    id: sansTirets(page.id), baseId, titre: titre || "(sans titre)", champs,
    tels, emails: [...emails], liens: [...liens], edite: page.last_edited_time || "",
  };
}

/* ── Lecture d'une base ──────────────────────────────────────────────── */

async function lirePages(baseId: string, depuis?: string): Promise<DocIndex[]> {
  const notion = await clientNotion();
  const out: DocIndex[] = [];
  let curseur: string | undefined;
  do {
    const r: any = await avecReprise(() => notion.databases.query({
      database_id: baseId, start_cursor: curseur, page_size: 100,
      ...(depuis ? { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: depuis } } } : {}),
    } as any));
    for (const p of r.results || []) {
      const d = pageEnDocument(p, baseId);
      if (d) out.push(d);
    }
    curseur = r.has_more ? r.next_cursor : undefined;
  } while (curseur);
  return out;
}

const memoire = new Map<string, { s: Stockage; lu: number }>();

async function lireStockage(baseId: string): Promise<Stockage | null> {
  const m = memoire.get(baseId);
  if (m && Date.now() - m.lu < 20_000) return m.s;
  const s = await redisGetJSON<Stockage>(CLE_BASE(baseId)).catch(() => null);
  if (s && Array.isArray(s.docs)) { memoire.set(baseId, { s, lu: Date.now() }); return s; }
  return null;
}

async function ecrireStockage(s: Stockage): Promise<void> {
  memoire.set(s.base.id, { s, lu: Date.now() });
  await redisSetJSON(CLE_BASE(s.base.id), s, TTL);
}

/** Relit une base EN ENTIER. En cas d'échec, lève : l'ancienne version reste. */
export async function reconstruireBase(base: BaseNotion): Promise<Stockage> {
  const debut = Date.now();
  const docs = await lirePages(base.id);
  const s: Stockage = { base, docs, complete: debut, increment: debut };
  await ecrireStockage(s);
  return s;
}

/** Les pages modifiées depuis la dernière lecture, fusionnées. */
export async function rafraichirBase(s: Stockage): Promise<Stockage> {
  const debut = Date.now();
  // Deux minutes de recouvrement : les horloges ne sont pas parfaitement d'accord.
  const depuis = new Date(s.increment - 120_000).toISOString();
  const nouvelles = await lirePages(s.base.id, depuis);
  if (nouvelles.length === 0) {
    const r = { ...s, increment: debut };
    await ecrireStockage(r);
    return r;
  }
  const parId = new Map(s.docs.map((d) => [d.id, d]));
  for (const d of nouvelles) parId.set(d.id, d);
  const r = { ...s, docs: [...parId.values()], increment: debut };
  await ecrireStockage(r);
  return r;
}

/* ── L'index, tel que la question le lit ─────────────────────────────── */

export interface Index { bases: EtatBase[]; docs: DocIndex[] }

async function basesConnues(forcer = false): Promise<BaseNotion[]> {
  if (!forcer) {
    const l = await redisGetJSON<{ bases: BaseNotion[]; t: number }>(CLE_BASES).catch(() => null);
    if (l && Array.isArray(l.bases) && l.bases.length > 0 && Date.now() - l.t < 24 * 3600_000) return l.bases;
  }
  const bases = await decouvrirBases();
  if (bases.length > 0) await redisSetJSON(CLE_BASES, { bases, t: Date.now() }, TTL);
  return bases;
}

/**
 * L'index pour une question. Ce qui est en mémoire partagée sert tout de
 * suite ; les bases dont la dernière lecture date de plus de `fraicheurMs`
 * reçoivent leurs pages modifiées ; une base jamais lue est lue si le budget
 * le permet, sinon déclarée « non lue ». Tout dans un budget de temps.
 */
export async function lireIndex(opts: { budgetMs?: number; fraicheurMs?: number; categories?: CategorieBase[] } = {}): Promise<Index> {
  const budget = Date.now() + (opts.budgetMs ?? 8000);
  const fraicheur = opts.fraicheurMs ?? 60_000;
  let bases: BaseNotion[] = [];
  try { bases = await basesConnues(); } catch (e) { console.error("[index-ia] découverte impossible :", (e as Error).message); }
  if (opts.categories) bases = bases.filter((b) => opts.categories!.includes(b.categorie));
  /* Le carnet d'adresses d'abord : c'est lui qu'on cherche le plus, et le
     budget de temps doit lui revenir avant les statistiques. */
  const rang = { carnet: 0, technique: 1, stats: 2 } as const;
  bases = [...bases].sort((a, b) => rang[a.categorie] - rang[b.categorie]);
  const stockages = await Promise.all(bases.map((b) => lireStockage(b.id)));

  const etats: EtatBase[] = [];
  const docs: DocIndex[] = [];
  /* L'une après l'autre : neuf bases lancées ensemble saturaient la file
     Notion (3 req/s) et tout expirait. */
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];
    let s = stockages[i];
    let erreur: string | undefined;
    try {
      if (!s && Date.now() < budget) s = await reconstruireBase(b);
      else if (s && Date.now() - s.increment > fraicheur && Date.now() < budget) s = await rafraichirBase(s);
    } catch (e) {
      erreur = (e as Error).message;
      console.error(`[index-ia] base « ${b.titre} » : ${erreur}`);
    }
    if (s) docs.push(...s.docs);
    etats.push({
      ...b, etat: s ? "ok" : "non-lue", docs: s?.docs.length || 0,
      complete: s?.complete || 0, increment: s?.increment || 0, ...(erreur ? { erreur } : {}),
    });
  }
  return { bases: etats, docs };
}

/** Pour la tâche planifiée : tout relire, base par base. */
export async function reconstruireTout(): Promise<EtatBase[]> {
  const bases = await basesConnues(true);
  const out: EtatBase[] = [];
  for (const b of bases) {
    try {
      const s = await reconstruireBase(b);
      out.push({ ...b, etat: "ok", docs: s.docs.length, complete: s.complete, increment: s.increment });
    } catch (e) {
      const ancien = await lireStockage(b.id);
      out.push({ ...b, etat: ancien ? "ok" : "non-lue", docs: ancien?.docs.length || 0,
        complete: ancien?.complete || 0, increment: ancien?.increment || 0, erreur: (e as Error).message });
    }
  }
  return out;
}
