import { Client } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export const databaseId = process.env.NOTION_DATABASE_ID!;

// Plus de cache interne ici : la mise en cache (avec stale-while-revalidate)
// est gérée au niveau des routes API via `@/lib/server-cache`. Cela garantit
// une seule source de vérité et une invalidation cohérente après PATCH/POST.

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
  dateMontageEnd: string | null;
  dateDemandeProjet: string | null;
  dateMesuresRecue: string | null;
  dateOffre: string | null;
  dateCMDRecue: string | null;
  dateCMDUsine: string | null;
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
  photosCartons: FileItem[];
  rapportDeMontage: string;
  facturations: string;
  etatCMD: string;
  typeServices: string[];
  cmdGrossiste: string;
  cmdTM: string;
  cmdTMUsine: string;
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
  contactsRDV: string;
  commentairesMesures: string;
  soucisMontage: boolean;
  causeSoucis: string;
  etatSAV: string;
  sav: boolean;
  bonLivraison: string;
  signatureUrl: string;
  typeClient: string;
  grossistesRelation: string[];
  grossistesNames: string[];
  fournisseursRelation: string[];
  fournisseursNames: string[];
  sanitaireRelation: string[]; // IDs Sanitaire (Entreprise)
  sanitaireNames: string[];
  contactsProjetRelation: string[]; // IDs Contacts projet
  contactsProjetNames: string[];
  infoPiecesManquantes: string;
  infoDefautsSignale: string;
  photosPiecesManquantes: FileItem[];
  photosDefautsSignale: FileItem[];
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

function extractDateEnd(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.end || null;
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
    dateMontageEnd: extractDateEnd(p["Date Montage"]),
    dateDemandeProjet: extractDate(p["Demande projet reçue le"]),
    dateMesuresRecue: extractDate(p["Date Mesures reçue le"]),
    dateOffre: extractDate(p["Date Offre"]),
    dateCMDRecue: extractDate(p["CMD reçue le"]),
    dateCMDUsine: extractDate(p["Date CMD – Usine"]),
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
    photosCartons: extractFiles(p["État des cartons réceptionnés"]),
    rapportDeMontage: extractSelect(p["Rapport de montage"]),
    facturations: extractSelect(p["Facturations"]),
    etatCMD: extractStatus(p["État - CMD"]),
    typeServices: extractMultiSelect(p["Type de services"]),
    cmdGrossiste: extractText(p["N° CMD Grossiste"]),
    cmdTM: extractText(p["N° CMD TM"]),
    cmdTMUsine: extractText(p["N° CMD TM - Usine"]),
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
    contactsRDV: extractText(p["Contacts pour RDV"]),
    commentairesMesures: extractText(p["Commentaires Mesures"]),
    soucisMontage: p["Soucis montage"]?.checkbox || false,
    causeSoucis: extractSelect(p["Cause Soucis montages"]),
    etatSAV: extractStatus(p["État - SAV"]),
    sav: p["SAV"]?.checkbox || false,
    bonLivraison: (() => {
      const bl = p["Bon de livraison"];
      if (!bl) return "";
      // Support both text and files type
      if (bl.type === "files" && bl.files?.length > 0) {
        const f = bl.files[0];
        return f.type === "external" ? f.external?.url || "" : f.file?.url || "";
      }
      if (bl.type === "rich_text") return bl.rich_text?.map((t: any) => t.plain_text).join("") || "";
      return "";
    })(),
    signatureUrl: (() => {
      const sig = p["Signature client"];
      if (!sig) return "";
      if (sig.type === "files" && sig.files?.length > 0) {
        const f = sig.files[0];
        return f.type === "external" ? f.external?.url || "" : f.file?.url || "";
      }
      if (sig.type === "rich_text") return sig.rich_text?.map((t: any) => t.plain_text).join("") || "";
      return "";
    })(),
    typeClient: extractSelect(p["Type de client"]) || extractStatus(p["Type de client"]) || extractText(p["Type de client"]),
    grossistesRelation: extractRelationIds(p["Grossistes"]),
    fournisseursRelation: extractRelationIds(p["Fournisseurs"]),
    grossistesNames: [],
    fournisseursNames: [],
    sanitaireRelation: extractRelationIds(p["Sanitaire (Entreprise)"]),
    sanitaireNames: [],
    contactsProjetRelation: extractRelationIds(p["Contact Projet"]).length > 0 ? extractRelationIds(p["Contact Projet"]) : extractRelationIds(p["Contacts projet"]),
    contactsProjetNames: [],
    infoPiecesManquantes: extractText(p["Infos - Pièces manquantes"]),
    infoDefautsSignale: extractText(p["Infos - Défauts signalé"]),
    photosPiecesManquantes: extractFiles(p["Photos - Pièces manquante"]),
    photosDefautsSignale: extractFiles(p["Photos - Défauts signalé"]),
  };
}

// Cache for relation page titles (noms de pages liées)
const relationNameCache: Record<string, string> = {};
// In-flight dedup: si plusieurs appels demandent le même id en parallèle, on ne tire qu'une seule requête.
const relationInflight: Record<string, Promise<string>> = {};

async function fetchRelationName(id: string): Promise<string> {
  const cached = relationNameCache[id];
  if (cached) return cached;
  const pending = relationInflight[id];
  if (pending) return pending;
  const p = (async () => {
    try {
      const page = await notion.pages.retrieve({ page_id: id });
      const props = (page as any).properties;
      for (const val of Object.values(props) as any[]) {
        if (val?.type === "title") {
          const name = val.title?.map((t: any) => t.plain_text).join("") || id;
          relationNameCache[id] = name;
          return name;
        }
      }
      relationNameCache[id] = id;
      return id;
    } catch {
      relationNameCache[id] = id;
      return id;
    } finally {
      delete relationInflight[id];
    }
  })();
  relationInflight[id] = p;
  return p;
}

async function resolveRelationNames(ids: string[]): Promise<Record<string, string>> {
  // Dédup + cache lookup en un seul passage
  const uniqueIds = [...new Set(ids)];
  const uncached = uniqueIds.filter((id) => !relationNameCache[id]);
  // Toutes les requêtes sont lancées en parallèle (Notion tolère 3 req/s en moyenne
  // mais accepte des bursts — la dédup via `relationInflight` évite les doublons,
  // et le cache persistant côté module fait que les appels suivants sont instantanés).
  if (uncached.length > 0) {
    await Promise.all(uncached.map((id) => fetchRelationName(id)));
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

  // Resolve fournisseurs + sanitaire + contacts projet relation names
  const allRelIds = [...new Set([
    ...projects.flatMap((p) => p.fournisseursRelation),
    ...projects.flatMap((p) => p.sanitaireRelation),
    ...projects.flatMap((p) => p.contactsProjetRelation),
  ])];
  if (allRelIds.length > 0) {
    const names = await resolveRelationNames(allRelIds);
    projects.forEach((p) => {
      p.fournisseursNames = p.fournisseursRelation.map((id) => names[id] || id);
      p.sanitaireNames = p.sanitaireRelation.map((id) => names[id] || id);
      p.contactsProjetNames = p.contactsProjetRelation.map((id) => names[id] || id);
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

// Tous les projets non terminés/non annulés (pour les vues Grossistes/Fournisseurs)
export async function getAllActiveProjects(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - CMD", status: { does_not_equal: "Annulé" } },
        { property: "État - CMD", status: { does_not_equal: "Terminé" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProject(pageId: string): Promise<Project> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  const project = mapPageToProject(page);
  // Resolve relation names for single project
  const allRelIds = [...new Set([...project.grossistesRelation, ...project.fournisseursRelation, ...project.sanitaireRelation, ...project.contactsProjetRelation])];
  if (allRelIds.length > 0) {
    const names = await resolveRelationNames(allRelIds);
    project.grossistesNames = project.grossistesRelation.map((id) => names[id] || id);
    project.fournisseursNames = project.fournisseursRelation.map((id) => names[id] || id);
    project.sanitaireNames = project.sanitaireRelation.map((id) => names[id] || id);
    project.contactsProjetNames = project.contactsProjetRelation.map((id) => names[id] || id);
  }
  return project;
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
    dateDemandeProjet?: string | null;
    dateMesuresRecue?: string | null;
    dateOffre?: string | null;
    dateCMDRecue?: string | null;
    dateCMDUsine?: string | null;
    collaborateurs?: string;
    mesuresTraiteePar?: string;
    bonLivraison?: string;
    etatCMD?: string;
    etatMesures?: string;
    contacts?: string;
    contactsRDV?: string;
    commentairesMesures?: string;
    nomChantier?: string;
    nbCabines?: number;
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
  if (data.dateDemandeProjet !== undefined) {
    properties["Demande projet reçue le"] = {
      date: data.dateDemandeProjet ? { start: data.dateDemandeProjet } : null,
    };
  }
  if (data.dateMesuresRecue !== undefined) {
    properties["Date Mesures reçue le"] = {
      date: data.dateMesuresRecue ? { start: data.dateMesuresRecue } : null,
    };
  }
  if (data.dateOffre !== undefined) {
    properties["Date Offre"] = {
      date: data.dateOffre ? { start: data.dateOffre } : null,
    };
  }
  if (data.dateCMDRecue !== undefined) {
    properties["CMD reçue le"] = {
      date: data.dateCMDRecue ? { start: data.dateCMDRecue } : null,
    };
  }
  if (data.dateCMDUsine !== undefined) {
    properties["Date CMD – Usine"] = {
      date: data.dateCMDUsine ? { start: data.dateCMDUsine } : null,
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
    if (data.bonLivraison && data.bonLivraison.startsWith("http")) {
      // Store as file (external URL)
      properties["Bon de livraison"] = {
        files: [{
          type: "external" as const,
          name: "bon-de-livraison.jpg",
          external: { url: data.bonLivraison },
        }],
      };
    } else {
      // Clear the field
      properties["Bon de livraison"] = { files: [] };
    }
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
  if (data.contacts !== undefined) {
    properties["Contacts projet"] = {
      rich_text: [{ text: { content: data.contacts } }],
    };
  }
  if (data.contactsRDV !== undefined) {
    properties["Contacts pour RDV"] = {
      rich_text: [{ text: { content: data.contactsRDV } }],
    };
  }
  if (data.commentairesMesures !== undefined) {
    properties["Commentaires Mesures"] = {
      rich_text: [{ text: { content: data.commentairesMesures } }],
    };
  }
  if ((data as any).infoPiecesManquantes !== undefined) {
    properties["Infos - Pièces manquantes"] = {
      rich_text: [{ text: { content: ((data as any).infoPiecesManquantes || "").slice(0, 2000) } }],
    };
  }
  if ((data as any).infoDefautsSignale !== undefined) {
    properties["Infos - Défauts signalé"] = {
      rich_text: [{ text: { content: ((data as any).infoDefautsSignale || "").slice(0, 2000) } }],
    };
  }
  if (data.nomChantier !== undefined) {
    properties["Nom chantier"] = {
      rich_text: [{ text: { content: data.nomChantier } }],
    };
  }
  if (data.nbCabines !== undefined) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
    };
  }
  if ((data as any).signatureUrl !== undefined) {
    const sigUrl = (data as any).signatureUrl;
    if (sigUrl) {
      properties["Signature client"] = {
        files: [{ type: "external" as const, name: "signature.png", external: { url: sigUrl } }],
      };
    }
  }
  if ((data as any).photosCartons !== undefined) {
    const urls: string[] = (data as any).photosCartons;
    properties["État des cartons réceptionnés"] = {
      files: urls.map((url) => ({
        type: "external" as const,
        name: url.split("/").pop()?.slice(0, 100) || "carton.jpg",
        external: { url },
      })),
    };
  }
  if ((data as any).photosAvant !== undefined) {
    const urls: string[] = (data as any).photosAvant;
    properties["Photos avant montage"] = {
      files: urls.map((url) => ({
        type: "external" as const,
        name: url.split("/").pop()?.slice(0, 100) || "avant.jpg",
        external: { url },
      })),
    };
  }
  if ((data as any).photosMontage !== undefined) {
    const urls: string[] = (data as any).photosMontage;
    properties["Photos montage terminé"] = {
      files: urls.map((url) => ({
        type: "external" as const,
        name: url.split("/").pop()?.slice(0, 100) || "montage.jpg",
        external: { url },
      })),
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
  commentairesMesures?: string;
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
  if (data.commentairesMesures) {
    properties["Commentaires Mesures"] = {
      rich_text: [{ text: { content: data.commentairesMesures } }],
    };
  }
  if (data.nomChantier) {
    properties["Nom chantier"] = {
      rich_text: [{ text: { content: data.nomChantier } }],
    };
  }
  if (data.nbCabines !== undefined) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
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
