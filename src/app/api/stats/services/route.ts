import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { cachedOrFetchLong } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const DB_ID = "17e1895b9179818281b2ec39f258a516";

function num(prop: any): number {
  if (!prop || prop.type !== "number") return 0;
  return prop.number ?? 0;
}

function txt(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  return "";
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

async function fetchData() {
    const allResults: any[] = [];
    let cursor: string | undefined = undefined;
    do {
      const response: any = await notion.databases.query({
        database_id: DB_ID,
        page_size: 100,
        start_cursor: cursor,
      });
      allResults.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    // Log first few rows for debugging
    if (allResults.length > 0) {
      const sample = allResults.slice(0, 3).map((p: any) => {
        const jour = p.properties["Jours"];
        const jourText = jour?.type === "title" ? jour.title?.map((t: any) => t.plain_text).join("") : jour?.type;
        return jourText;
      });
      console.log("[stats/services] Sample Jours values:", sample, "Total rows:", allResults.length);
    }

    const rows = allResults.filter((page: any) => {
      // Exclude "Objectif" rows and non-day rows
      const props = page.properties;

      // Check all text fields for "objectif"
      for (const key of Object.keys(props)) {
        const prop = props[key];
        let text = "";
        if (prop?.type === "title") text = prop.title?.map((t: any) => t.plain_text).join("") || "";
        else if (prop?.type === "rich_text") text = prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
        else if (prop?.type === "select") text = prop.select?.name || "";
        if (text.toLowerCase().includes("objectif")) return false;
      }

      // Only keep rows where "Jours" is a valid day number (1-31)
      const jour = props["Jours"];
      const jourText = jour?.type === "title" ? jour.title?.map((t: any) => t.plain_text).join("") || "" : "";
      const jourNum = parseInt(jourText, 10);
      if (isNaN(jourNum) || jourNum < 1 || jourNum > 31) return false;

      return true;
    }).map((page: any) => {
      const p = page.properties;
      const anneeRaw = dateVal(p["Année"]);
      const annee = yearVal(p["Année"]) ?? (anneeRaw ? new Date(anneeRaw).getFullYear() : null);

      // Extract month — could be date ("2026-04-01"), select ("04.Avril"), or text ("04.Avril")
      let mois: string | null = null;
      const moisProp = p["Mois"];
      if (moisProp) {
        if (moisProp.type === "date" && moisProp.date?.start) {
          mois = moisProp.date.start.substring(0, 7); // "YYYY-MM"
        } else {
          // Extract month number from text like "04.Avril" or select
          let moisText = "";
          if (moisProp.type === "select") moisText = moisProp.select?.name || "";
          else if (moisProp.type === "rich_text") moisText = moisProp.rich_text?.map((t: any) => t.plain_text).join("") || "";
          else if (moisProp.type === "title") moisText = moisProp.title?.map((t: any) => t.plain_text).join("") || "";

          if (moisText) {
            // Try to extract month number from "04.Avril" or "04" or "Avril"
            const numMatch = moisText.match(/^(\d{1,2})/);
            if (numMatch && annee) {
              mois = `${annee}-${numMatch[1].padStart(2, "0")}`;
            } else {
              // Try month name
              const moisNames: Record<string, string> = {
                "janvier": "01", "février": "02", "mars": "03", "avril": "04",
                "mai": "05", "juin": "06", "juillet": "07", "août": "08",
                "septembre": "09", "octobre": "10", "novembre": "11", "décembre": "12",
              };
              const lower = moisText.toLowerCase();
              for (const [name, num] of Object.entries(moisNames)) {
                if (lower.includes(name)) { mois = annee ? `${annee}-${num}` : null; break; }
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

    return rows;
}

export async function GET() {
  try {
    const rows = await cachedOrFetchLong("stats-services", fetchData);
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats services:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
