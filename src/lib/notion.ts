import { Client } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export const databaseId = process.env.NOTION_DATABASE_ID!;

export interface Project {
  id: string;
  projet: string;
  ofrTM: string;
  emplacementCabine: string;
  nbCabines: number | null;
  fournisseurs: string[];
  seriesCabines: string[];
  nomChantier: string;
  adresseChantier: string;
  dateMontage: string | null;
  collaborateurs: string;
  documentsMontagee: FileItem[];
  documentsMesures: FileItem[];
  heureArrivee: string;
  heureDepart: string;
  commentairesMontages: string;
  rapportMonteur: string;
  photosAvant: FileItem[];
  photosMontage: FileItem[];
  photosQRCode: FileItem[];
  photosGaranties: FileItem[];
  rapportDeMontage: string;
  facturations: string;
  etatCMD: string;
  cmdGrossiste: string;
  cmdFournisseurs: string;
  servCmdFournisseurs: string;
  etatMesures: string;
  ofrGrossiste: string;
  servMesuresFournisseurs: string;
  mesuresTraiteePar: string;
  dateMesures: string | null;
  photosSituations: FileItem[];
  photosMesures: FileItem[];
  photosLocalite: FileItem[];
  contacts: string;
  soucisMontage: boolean;
  causeSoucis: string;
  etatSAV: string;
  sav: boolean;
  bonLivraison: string;
  typeClient: string;
  grossistesRelation: string[]; // IDs des grossistes liés
  grossistesNames: string[]; // Noms résolus des grossistes
}

export interface FileItem {
  name: string;
  url: string;
}

function extractText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") {
    return prop.title?.map((t: any) => t.plain_text).join("") || "";
  }
  if (prop.type === "rich_text") {
    return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  }
  return "";
}

function extractSelect(prop: any): string {
  if (!prop || prop.type !== "select") return "";
  return prop.select?.name || "";
}

function extractMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select?.map((s: any) => s.name) || [];
}

function extractStatus(prop: any): string {
  if (!prop || prop.type !== "status") return "";
  return prop.status?.name || "";
}

function extractNumber(prop: any): number | null {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

function extractRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation?.map((r: any) => r.id) || [];
}

function extractDate(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}

function extractFiles(prop: any): FileItem[] {
  if (!prop || prop.type !== "files") return [];
  return (prop.files?.map((f: any) => ({
    name: f.name || "file",
    url: f.type === "external" ? f.external?.url : f.file?.url || "",
  })) || []).filter((f: FileItem) => f.url && f.url.length > 0);
}

function extractPlace(prop: any): string {
  if (!prop) return "";
  if (prop.type === "place" && prop.place) {
    return prop.place.address || prop.place.name || "";
  }
  return "";
}

function extractFormula(prop: any): string {
  if (!prop || prop.type !== "formula") return "";
  const f = prop.formula;
  if (f.type === "string") return f.string || "";
  if (f.type === "number") return f.number?.toString() || "";
  return "";
}

export function mapPageToProject(page: any): Project {
  const p = page.properties;
  return {
    id: page.id,
    projet: extractText(p["Projet"]),
    ofrTM: extractText(p["N° OFR TM"]),
    emplacementCabine: extractSelect(p["Emplacement de cabine"]),
    nbCabines: extractNumber(p["Nb. Cabines"]),
    fournisseurs: extractMultiSelect(p["n8n Fournisseurs"]),
    seriesCabines: extractMultiSelect(p["n8n Séries Cabines"]),
    nomChantier: extractText(p["Nom chantier"]),
    adresseChantier: extractPlace(p["Adresse chantier"]) || extractFormula(p["n8n - Adresse chantier"]),
    dateMontage: extractDate(p["Date Montage"]),
    collaborateurs: extractSelect(p["Collaborateurs montages"]),
    documentsMontagee: extractFiles(p["Documents pour Montage"]),
    documentsMesures: extractFiles(p["Documents pour prise de mesures"]),
    heureArrivee: extractText(p["Heure arrivée"]),
    heureDepart: extractText(p["Heure départ"]),
    commentairesMontages: extractText(p["Commentaires Montages"]),
    rapportMonteur: extractText(p["Rapport monteur"]),
    photosAvant: extractFiles(p["Photos avant montage"]),
    photosMontage: extractFiles(p["Photos montage terminé"]),
    photosQRCode: extractFiles(p["Photos QR Code"]),
    photosGaranties: extractFiles(p["Photos garanties"]),
    rapportDeMontage: extractSelect(p["Rapport de montage"]),
    facturations: extractSelect(p["Facturations"]),
    etatCMD: extractStatus(p["État - CMD"]),
    cmdGrossiste: extractText(p["N° CMD Grossiste"]),
    cmdFournisseurs: extractText(p["n° CMD Fournisseurs"]),
    servCmdFournisseurs: extractText(p["N° Serv. CMD Fournisseurs"]),
    etatMesures: extractStatus(p["État - Mesures"]),
    ofrGrossiste: extractText(p["N° OFR Grossiste"]),
    servMesuresFournisseurs: extractText(p["N° Serv. Mesures Fournisseurs"]),
    mesuresTraiteePar: extractSelect(p["Mesures traitée par"]),
    dateMesures: extractDate(p["Mesures traitée le"]),
    photosSituations: extractFiles(p["Photos situations"]),
    photosMesures: extractFiles(p["Photos mesures"]),
    photosLocalite: extractFiles(p["Photos localité"]),
    contacts: extractText(p["Contacts projet"]),
    soucisMontage: p["Soucis montage"]?.checkbox || false,
    causeSoucis: extractSelect(p["Cause Soucis montages"]),
    etatSAV: extractStatus(p["État - SAV"]),
    sav: p["SAV"]?.checkbox || false,
    bonLivraison: extractText(p["Bon de livraison"]),
    typeClient: extractSelect(p["Type de client"]),
    grossistesRelation: extractRelationIds(p["Grossistes"]),
    grossistesNames: [], // resolved later
  };
}

// Cache for relation page titles
const relationNameCache: Record<string, string> = {};

async function resolveRelationNames(ids: string[]): Promise<Record<string, string>> {
  const uncached = ids.filter((id) => !relationNameCache[id]);
  // Resolve in batches of 10 to avoid rate limits
  for (let i = 0; i < uncached.length; i += 10) {
    const batch = uncached.slice(i, i + 10);
    await Promise.all(batch.map(async (id) => {
      try {
        const page = await notion.pages.retrieve({ page_id: id });
        const props = (page as any).properties;
        // Find the title property
        for (const val of Object.values(props) as any[]) {
          if (val?.type === "title") {
            relationNameCache[id] = val.title?.map((t: any) => t.plain_text).join("") || id;
            break;
          }
        }
        if (!relationNameCache[id]) relationNameCache[id] = id;
      } catch {
        relationNameCache[id] = id;
      }
    }));
  }
  const result: Record<string, string> = {};
  ids.forEach((id) => { result[id] = relationNameCache[id] || id; });
  return result;
}

async function queryAll(filter: any, sorts?: any[]): Promise<Project[]> {
  const allResults: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const response: any = await notion.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      page_size: 100,
      start_cursor: cursor,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  const projects = allResults.map(mapPageToProject).filter((p) => !p.projet.startsWith("[DATA]"));

  // Resolve grossistes relation names
  const allGrossisteIds = [...new Set(projects.flatMap((p) => p.grossistesRelation))];
  if (allGrossisteIds.length > 0) {
    const names = await resolveRelationNames(allGrossisteIds);
    projects.forEach((p) => {
      p.grossistesNames = p.grossistesRelation.map((id) => names[id] || id);
    });
  }

  return projects;
}

export async function getProjects(): Promise<Project[]> {
  return queryAll(
    {
      or: [
        { property: "État - CMD", status: { equals: "Cabines à recevoir" } },
        { property: "État - CMD", status: { equals: "Livraison partielle" } },
        { property: "État - CMD", status: { equals: "Cabine à aller chercher" } },
        { property: "État - CMD", status: { equals: "Récéptionné - RDV à fixer" } },
        { property: "État - CMD", status: { equals: "RDV - fixé" } },
        { property: "État - CMD", status: { equals: "RDV - Attendre news" } },
        { property: "État - CMD", status: { equals: "Montage partiel" } },
        { property: "État - CMD", status: { equals: "Soucis montage" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProjectsMesures(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - CMD", status: { equals: "En attente de mesures" } },
        {
          or: [
            { property: "État - Mesures", status: { equals: "Pas contacté" } },
            { property: "État - Mesures", status: { equals: "Contact sans réponse" } },
            { property: "État - Mesures", status: { equals: "OFR envoyée sans mesures" } },
            { property: "État - Mesures", status: { equals: "Mesures non relevées - attendre news" } },
            { property: "État - Mesures", status: { equals: "RDV - Fixé" } },
            { property: "État - Mesures", status: { equals: "RDV - Attendre news" } },
            { property: "État - Mesures", status: { equals: "Mesures partielles" } },
            { property: "État - Mesures", status: { equals: "Mesures relevées - attente news" } },
          ],
        },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProjectsServices(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "Type de services", multi_select: { contains: "Services" } },
        { property: "État - CMD", status: { does_not_equal: "Annulé" } },
        { property: "État - CMD", status: { does_not_equal: "Terminé" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProjectsSAV(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - SAV", status: { does_not_equal: "Aucun SAV" } },
        { property: "État - SAV", status: { does_not_equal: "Terminé" } },
        { property: "SAV Clôturé", checkbox: { equals: false } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProject(pageId: string): Promise<Project> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return mapPageToProject(page);
}

export async function updateProject(
  pageId: string,
  data: {
    heureArrivee?: string;
    heureDepart?: string;
    commentairesMontages?: string;
    rapportMonteur?: string;
    dateMontage?: string | null;
    dateMesures?: string | null;
    collaborateurs?: string;
    mesuresTraiteePar?: string;
    bonLivraison?: string;
    etatCMD?: string;
    etatMesures?: string;
  }
) {
  const properties: any = {};

  if (data.heureArrivee !== undefined) {
    properties["Heure arrivée"] = {
      rich_text: [{ text: { content: data.heureArrivee } }],
    };
  }
  if (data.heureDepart !== undefined) {
    properties["Heure départ"] = {
      rich_text: [{ text: { content: data.heureDepart } }],
    };
  }
  if (data.commentairesMontages !== undefined) {
    properties["Commentaires Montages"] = {
      rich_text: [{ text: { content: data.commentairesMontages } }],
    };
  }
  if (data.rapportMonteur !== undefined) {
    properties["Rapport monteur"] = {
      rich_text: [{ text: { content: data.rapportMonteur } }],
    };
  }
  if (data.dateMontage !== undefined) {
    properties["Date Montage"] = {
      date: data.dateMontage ? { start: data.dateMontage } : null,
    };
  }
  if (data.dateMesures !== undefined) {
    properties["Mesures traitée le"] = {
      date: data.dateMesures ? { start: data.dateMesures } : null,
    };
  }
  if (data.collaborateurs !== undefined) {
    properties["Collaborateurs montages"] = {
      select: data.collaborateurs ? { name: data.collaborateurs } : null,
    };
  }
  if (data.mesuresTraiteePar !== undefined) {
    properties["Mesures traitée par"] = {
      select: data.mesuresTraiteePar ? { name: data.mesuresTraiteePar } : null,
    };
  }
  if (data.bonLivraison !== undefined) {
    properties["Bon de livraison"] = {
      rich_text: [{ text: { content: data.bonLivraison } }],
    };
  }
  if (data.etatCMD !== undefined) {
    properties["État - CMD"] = {
      status: { name: data.etatCMD },
    };
  }
  if (data.etatMesures !== undefined) {
    properties["État - Mesures"] = {
      status: { name: data.etatMesures },
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}

export async function createProject(data: {
  projet: string;
  ofrTM?: string;
  nomChantier?: string;
  adresseChantier?: string;
  nbCabines?: number;
  dateMontage?: string;
  dateMesures?: string;
  collaborateurs?: string;
  mesuresTraiteePar?: string;
  etatCMD?: string;
  etatMesures?: string;
  contacts?: string;
}): Promise<string> {
  const properties: any = {
    Projet: {
      title: [{ text: { content: data.projet } }],
    },
  };

  if (data.ofrTM) {
    properties["N° OFR TM"] = {
      rich_text: [{ text: { content: data.ofrTM } }],
    };
  }
  if (data.nomChantier) {
    properties["Nom chantier"] = {
      rich_text: [{ text: { content: data.nomChantier } }],
    };
  }
  if (data.adresseChantier) {
    properties["Adresse chantier"] = {
      rich_text: [{ text: { content: data.adresseChantier } }],
    };
  }
  if (data.nbCabines !== undefined && data.nbCabines !== null) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
    };
  }
  if (data.dateMontage) {
    properties["Date Montage"] = {
      date: { start: data.dateMontage },
    };
  }
  if (data.dateMesures) {
    properties["Mesures traitée le"] = {
      date: { start: data.dateMesures },
    };
  }
  if (data.collaborateurs) {
    properties["Collaborateurs montages"] = {
      select: { name: data.collaborateurs },
    };
  }
  if (data.mesuresTraiteePar) {
    properties["Mesures traitée par"] = {
      select: { name: data.mesuresTraiteePar },
    };
  }
  if (data.etatCMD) {
    properties["État - CMD"] = {
      status: { name: data.etatCMD },
    };
  }
  if (data.etatMesures) {
    properties["État - Mesures"] = {
      status: { name: data.etatMesures },
    };
  }
  if (data.contacts) {
    properties["Contacts projet"] = {
      rich_text: [{ text: { content: data.contacts } }],
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties,
  });

  return page.id;
}

export async function deleteProject(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
}
