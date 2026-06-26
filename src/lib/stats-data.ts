/**
 * Données des statistiques (4 bases Notion dédiées) + cache KV persistant.
 *
 * Chaque base est paginée via le client Notion rate-limité (~1,3 req/s), ce qui
 * est lent à froid (la base journalière = ~1500 lignes / 15 pages ≈ 12 s).
 * Pour un affichage instantané, un cron nocturne (api/cron/stats-precalc) écrit
 * un snapshot pré-calculé dans le KV (clés stats-*-snapshot). Les routes lisent
 * ce snapshot (rapide) au lieu de paginer en direct ; en l'absence de snapshot,
 * elles font le calcul live ET alimentent le KV pour les fois suivantes.
 */

import { notion } from "@/lib/notion";
import { getData, setData } from "@/lib/kv-store";

export const STATS_DB = {
  services: "17e1895b9179818281b2ec39f258a516",
  clients: "17e1895b9179812093cfca36bba18aba",
  marques: "17e1895b91798130bd39e0a3a5302b80",
  series: "2e21895b917980428d1ecc45b0c29c78",
} as const;

export type StatsKind = keyof typeof STATS_DB;

export const STATS_SNAPSHOT_KEY: Record<StatsKind, string> = {
  // v2 : inclut désormais les lignes "Objectif" + moisNum (cache précédent ignoré).
  services: "stats-services-snapshot-v2",
  clients: "stats-clients-snapshot",
  marques: "stats-marques-snapshot",
  series: "stats-series-snapshot",
};

// ── Helpers d'extraction de propriétés Notion ───────────────────────────────
function num(prop: any): number {
  if (!prop || prop.type !== "number") return 0;
  return prop.number ?? 0;
}
function formulaNum(prop: any): number {
  if (!prop) return 0;
  if (prop.type === "number") return prop.number ?? 0;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? 0;
  return 0;
}
function txt(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  return "";
}
function sel(prop: any): string {
  if (!prop || prop.type !== "select") return "";
  return prop.select?.name || "";
}
function dateVal(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}
function yearVal(prop: any): number | null {
  if (!prop) return null;
  if (prop.type === "date" && prop.date?.start) return new Date(prop.date.start).getFullYear();
  if (prop.type === "number" && prop.number != null) return prop.number;
  if (prop.type === "select" && prop.select?.name) return parseInt(prop.select.name, 10) || null;
  if (prop.type === "rich_text") return parseInt(prop.rich_text?.map((x: any) => x.plain_text).join("") || "", 10) || null;
  if (prop.type === "title") return parseInt(prop.title?.map((x: any) => x.plain_text).join("") || "", 10) || null;
  return null;
}

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

async function queryAll(dbId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const r: any = await notion.databases.query({ database_id: dbId, page_size: 100, start_cursor: cursor });
    all.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return all;
}

// ── Calcul "live" de chaque jeu de données ──────────────────────────────────
export async function fetchStatsServices() {
  const allResults = await queryAll(STATS_DB.services);
  const MOIS_NUM: Record<string, number> = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
  };
  return allResults
    .filter((page: any) => {
      // On NE filtre plus les lignes "Objectif" : elles sont conservées (flag
      // `objectif`) pour tracer la cible. On garde juste les vraies lignes-jour.
      const jour = page.properties["Jours"];
      const jourText = jour?.type === "title" ? jour.title?.map((t: any) => t.plain_text).join("") || "" : "";
      const jourNum = parseInt(jourText, 10);
      if (isNaN(jourNum) || jourNum < 1 || jourNum > 31) return false;
      return true;
    })
    .map((page: any) => {
      const p = page.properties;
      const anneeText = txt(p["Année"]);
      const objectif = anneeText.toLowerCase().includes("objectif");
      const anneeRaw = dateVal(p["Année"]);
      const annee = objectif ? null : (yearVal(p["Année"]) ?? (anneeRaw ? new Date(anneeRaw).getFullYear() : null));

      // Numéro de mois (1-12), indépendant de l'année (marche aussi pour Objectif).
      let moisNum: number | null = null;
      let moisText = "";
      const moisProp = p["Mois"];
      if (moisProp) {
        if (moisProp.type === "date" && moisProp.date?.start) {
          moisNum = new Date(moisProp.date.start).getMonth() + 1;
        } else {
          if (moisProp.type === "select") moisText = moisProp.select?.name || "";
          else if (moisProp.type === "rich_text") moisText = moisProp.rich_text?.map((t: any) => t.plain_text).join("") || "";
          else if (moisProp.type === "title") moisText = moisProp.title?.map((t: any) => t.plain_text).join("") || "";
          const numMatch = moisText.match(/^(\d{1,2})/);
          if (numMatch) moisNum = Number(numMatch[1]);
          else {
            const lower = moisText.toLowerCase();
            for (const [name, n] of Object.entries(MOIS_NUM)) {
              if (lower.includes(name)) { moisNum = n; break; }
            }
          }
        }
      }
      if (moisNum !== null && (moisNum < 1 || moisNum > 12)) moisNum = null;
      const mois = annee && moisNum ? `${annee}-${String(moisNum).padStart(2, "0")}` : null;

      return {
        id: page.id,
        jour: txt(p["Jours"]),
        annee,
        objectif,
        mois,
        moisNum,
        semaine: txt(p["Semaines"]),
        mesures: num(p["Nb. de Mesures"]),
        cabines: num(p["Nb. Cabine"]),
        montages: num(p["Nb. Montage"]),
        demontages: num(p["Nb. Démontage"]),
        services: num(p["Nb. Services"]),
        sav: num(p["Nb. SAV"]),
        rdvChantier: num(p["RDV chantier"]),
        ofr: num(p["Nb. OFR"]),
        ca: num(p["CA"]),
      };
    });
}

export async function fetchStatsClients() {
  const allResults = await queryAll(STATS_DB.clients);
  return allResults.map((page: any) => {
    const p = page.properties;
    const monthly: Record<string, number> = {};
    MOIS.forEach((m) => { monthly[m] = num(p[m]); });
    return {
      id: page.id,
      client: txt(p["Client"]),
      annee: yearVal(p["Année"]),
      typeClient: sel(p["Type client"]),
      monthly,
      total: formulaNum(p["Total"]),
    };
  });
}

export async function fetchStatsMarques() {
  const allResults = await queryAll(STATS_DB.marques);
  return allResults.map((page: any) => {
    const p = page.properties;
    const monthly: Record<string, number> = {};
    MOIS.forEach((m) => { monthly[m] = num(p[m]); });
    return {
      id: page.id,
      marque: txt(p["Marque"]),
      annee: yearVal(p["Année"]),
      monthly,
      total: formulaNum(p["Total"]),
    };
  });
}

export async function fetchStatsSeries() {
  const allResults = await queryAll(STATS_DB.series);
  return allResults.map((page: any) => {
    const p = page.properties;
    const countProp = p["Nb. de cabine installée"] || p["Nb. de cabines installées"] || p["Nb. de cabines installée"];
    let count = num(countProp);
    if (count === 0 && countProp?.type === "formula") count = countProp.formula?.number ?? 0;
    if (count === 0 && countProp?.type === "rollup") count = countProp.rollup?.number ?? 0;
    return {
      id: page.id,
      serie: txt(p["Série"]),
      annee: yearVal(p["Année"]),
      fournisseur: sel(p["Fournisseur"]),
      count,
    };
  });
}

const FETCHERS: Record<StatsKind, () => Promise<any[]>> = {
  services: fetchStatsServices,
  clients: fetchStatsClients,
  marques: fetchStatsMarques,
  series: fetchStatsSeries,
};

/** Calcule un jeu de données et le persiste dans le KV (utilisé par le cron). */
export async function computeAndStoreStats(kind: StatsKind): Promise<any[]> {
  const rows = await FETCHERS[kind]();
  await setData(STATS_SNAPSHOT_KEY[kind], rows);
  return rows;
}

/**
 * Lecture utilisée par les routes : snapshot KV pré-calculé (rapide) si présent,
 * sinon calcul live + auto-alimentation du KV pour les fois suivantes.
 */
export async function getStats(kind: StatsKind): Promise<any[]> {
  try {
    const snap = await getData<any>(STATS_SNAPSHOT_KEY[kind]);
    if (Array.isArray(snap) && snap.length > 0) return snap;
  } catch { /* KV indisponible → fallback live */ }
  const rows = await FETCHERS[kind]();
  // Self-heal : alimente le KV sans bloquer la réponse.
  setData(STATS_SNAPSHOT_KEY[kind], rows).catch(() => {});
  return rows;
}
