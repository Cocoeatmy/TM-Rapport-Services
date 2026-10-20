/**
 * Un projet Notion vu par le moteur de recherche de l'assistant.
 *
 * Les colonnes sont choisies UNE PAR UNE : la base des projets porte aussi
 * le montant de l'offre, la facturation, le coût des soucis — rien de cela
 * n'entre ici. Les textes libres passent par `sansMontants`.
 */
import type { Project } from "../notion";
import { sansMontants } from "../annuaire-ia";
import { telephonesDans } from "./telephone";
import type { DocRecherche } from "./moteur";

export const sansTirets = (id: string) => String(id || "").replace(/-/g, "");

/** Les relations d'un dossier vers les autres bases, avec le rôle de chacune. */
export function liensDuProjet(p: Project): [string, string][] {
  const paires: [string[] | undefined, string][] = [
    [p.grossistesRelation, "Grossiste"], [p.fournisseursRelation, "Fournisseur"], [p.sanitaireRelation, "Sanitaire"],
    [p.dtRelation, "Direction des travaux"], [p.architecteRelation, "Architecte"],
    [p.contactsProjetRelation, "Contact grossiste"], [p.contactsSanitaireRelation, "Contact sanitaire"],
    [p.contactsDTRelation, "Contact DT"], [p.contactsArchitecteRelation, "Contact architecte"],
    [p.contactsClientsFinauxRelation, "Client final"], [p.contactsLocatairesRelation, "Locataire"],
    [p.contactsAutresRelation, "Autre contact"],
  ];
  const out: [string, string][] = [];
  for (const [ids, role] of paires) for (const id of ids || []) out.push([sansTirets(id), role]);
  return out;
}

const liste = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : String(v ?? ""));

export function docDeProjet(p: Project): DocRecherche {
  const champs: [string, string][] = ([
    ["N° OFR TM", p.ofrTM], ["Chantier", p.nomChantier], ["Adresse du chantier", p.adresseChantier],
    ["Emplacement", p.emplacementCabine], ["État commande", p.etatCMD], ["État mesures", p.etatMesures],
    ["État SAV", p.etatSAV], ["Collaborateurs", p.collaborateurs], ["Attribution des lots", p.attributionCabines],
    ["Collaborateurs SAV", p.collaborateursSAV], ["Mesures traitées par", p.mesuresTraiteePar],
    ["Contacts", p.contacts], ["Contacts pour RDV", p.contactsRDV],
    ["Grossistes", liste(p.grossistesNames)], ["Fournisseurs", liste([...(p.fournisseursNames || []), ...(p.fournisseurs || [])])],
    ["Sanitaire", liste(p.sanitaireNames)], ["Séries", liste(p.seriesCabines)], ["Type de services", liste(p.typeServices)],
    ["N° CMD TM", p.cmdTM], ["N° CMD TM usine", p.cmdTMUsine], ["N° CMD grossiste", p.cmdGrossiste],
    ["N° OFR grossiste", p.ofrGrossiste], ["N° CMD fournisseurs", p.cmdFournisseurs], ["N° OFR fournisseurs", p.ofrFournisseurs],
    ["N° serv. CMD fournisseurs", p.servCmdFournisseurs], ["N° serv. mesures", p.servMesuresFournisseurs],
    ["Bon de livraison", p.bonLivraison], ["Noms des lots", p.nomsCabines],
    ["Date de montage", p.dateMontage || ""], ["Infos chantier", p.diversInfosChantier],
  ] as [string, unknown][])
    .map(([k, v]) => [k, sansMontants(String(v ?? "").replace(/\s+/g, " ").trim()).slice(0, 400)] as [string, string])
    .filter(([, v]) => v);

  // Les numéros notés en clair sur le dossier, colonne d'origine comprise.
  const tels: DocRecherche["tels"] = [];
  for (const [colonne, v] of [
    ["Contacts", p.contacts], ["Contacts pour RDV", p.contactsRDV], ["Infos chantier", p.diversInfosChantier],
    ["Journal des échanges", p.journalEchanges], ["Commentaires montage", p.commentairesMontages],
    ["Commentaires mesures", p.commentairesMesures], ["Commentaires SAV", p.commentairesSav],
    ["Commentaire livraison", p.commentaireLivraison], ["Emplacement", p.emplacementCabine],
  ] as [string, string][]) {
    for (const e164 of telephonesDans(v)) tels.push({ e164, colonne });
  }

  const refs = new Set<string>();
  for (const v of [p.ofrTM, p.cmdTM, p.cmdTMUsine, p.cmdGrossiste, p.ofrGrossiste, p.cmdFournisseurs,
    p.ofrFournisseurs, p.servCmdFournisseurs, p.servMesuresFournisseurs, p.bonLivraison]) {
    for (const m of String(v || "").matchAll(/\d{5,12}/g)) refs.add(m[0]);
  }

  return {
    id: sansTirets(p.id), source: "Projets", titre: `${p.ofrTM || "—"} — ${p.projet}`,
    champs, tels, emails: [], liens: liensDuProjet(p).map(([id]) => id), refs: [...refs],
  };
}
