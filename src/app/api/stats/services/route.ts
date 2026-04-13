import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const revalidate = 300;

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

export async function GET() {
  try {
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

    const rows = allResults.filter((page: any) => {
      // Exclude "Objectif" rows
      const jour = page.properties["Jours"];
      const jourText = jour?.type === "title" ? jour.title?.map((t: any) => t.plain_text).join("") || "" : "";
      if (jourText.toLowerCase().includes("objectif")) return false;
      return true;
    }).map((page: any) => {
      const p = page.properties;
      const anneeRaw = dateVal(p["Année"]);
      const moisRaw = dateVal(p["Mois"]);
      return {
        id: page.id,
        jour: txt(p["Jours"]),
        annee: yearVal(p["Année"]) ?? (anneeRaw ? new Date(anneeRaw).getFullYear() : null),
        mois: moisRaw ? moisRaw.substring(0, 7) : null, // "YYYY-MM"
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

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats services:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
