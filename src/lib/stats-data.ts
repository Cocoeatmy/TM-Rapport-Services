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
  services: "stats-services-snapshot",
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
  return allResults
    .filter((page: any) => {
      const props = page.properties;
      for (const key of Object.keys(props)) {
        const prop = props[key];
        let text = "";
        if (prop?.type === "title") text = prop.title?.map((t: any) => t.plain_text).join("") || "";
        else if (prop?.type === "rich_text") text = prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
        else if (prop?.type === "select") text = prop.select?.name || "";
        if (text.toLowerCase().includes("objectif")) return false;
      }
      const jour = props["Jours"];
      const jourText = jour?.type === "title" ? jour.title?.map((t: any) => t.plain_text).join("") || "" : "";
      const jourNum = parseInt(jourText, 10);
      if (isNaN(jourNum) || jourNum < 1 || jourNum > 31) return false;
      return true;
    })
    .map((page: any) => {
      const p = page.properties;
      const anneeRaw = dateVal(p["Année"]);
      const annee = yearVal(p["Année"]) ?? (anneeRaw ? new Date(anneeRaw).getFullYear() : null);

      let mois: string | null = null;
      const moisProp = p["Mois"];
      if (moisProp) {
        if (moisProp.type === "date" && moisProp.date?.start) {
          mois = moisProp.date.start.substring(0, 7);
        } else {
          let moisText = "";
          if (moisProp.type === "select") moisText = moisProp.select?.name || "";
          else if (moisProp.type === "rich_text") moisText = moisProp.rich_text?.map((t: any) => t.plain_text).join("") || "";
          else if (moisProp.type === "title") moisText = moisProp.title?.map((t: any) => t.plain_text).join("") || "";
          if (moisText) {
            const numMatch = moisText.match(/^(\d{1,2})/);
            if (numMatch && annee) {
              mois = `${annee}-${numMatch[1].padStart(2, "0")}`;
            } else {
              const moisNames: Record<string, string> = {
                "janvier": "01", "février": "02", "mars": "03", "avril": "04",
                "mai": "05", "juin": "06", "juillet": "07", "août": "08",
                "septembre": "09", "octobre": "10", "novembre": "11", "décembre": "12",
              };
              const lower = moisText.toLowerCase();
              for (const [name, n] of Object.entries(moisNames)) {
                if (lower.includes(name)) { mois = annee ? `${annee}-${n}` : null; break; }
              }
            }
          }
        }
      }

      return {
        id: page.id,
        jour: txt(p["Jours"]),
        annee,
        mois,
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
