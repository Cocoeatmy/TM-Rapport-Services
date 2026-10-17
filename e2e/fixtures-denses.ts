/**
 * Des données DENSES — parce qu'un tableau vide ne déborde jamais.
 *
 * Le premier relevé d'affichage n'a presque rien trouvé, pour une raison
 * bête : les fixtures ne contenaient qu'un seul chantier au nom court.
 * Or les défauts dont on me parle — textes superposés, colonnes illisibles,
 * étiquettes qui débordent — naissent de la QUANTITÉ et de la LONGUEUR.
 *
 * Ces fixtures-ci ressemblent donc aux vraies données : des noms de
 * chantiers à rallonge, des adresses complètes, des listes de trente
 * lignes, des commentaires qui font trois phrases.
 */
import { projetFictif } from "./harnais";

const VILLES = ["Yverdon-les-Bains", "Lausanne", "Neuchâtel", "La Chaux-de-Fonds", "Montreux", "Vevey"];
const LONGS = [
  "Rénovation complète des salles d'eau — Résidence Les Jardins du Lac, bâtiment C",
  "PPE Champs-Lovat 13, remplacement de 24 cabines de douche et habillages",
  "Immeuble locatif Rue du Midi 42 — intervention en site occupé, accès par la cour",
  "Villa",
  "Chantier des Quatre-Saisons — phase 2, étages 3 à 7, livraison échelonnée",
];
const MONTEURS = ["Miguel Ferreira da Silva", "Claudio Fontan", "Jacobo Fontan Cassas", "Javier Moreno"];

export function projetsDenses(n = 30) {
  return Array.from({ length: n }, (_, i) =>
    projetFictif({
      id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
      projet: LONGS[i % LONGS.length] + (i % 3 === 0 ? " — URGENT, client sur place" : ""),
      ofrTM: `TM-26${String(100000 + i)}`,
      nomChantier: LONGS[(i + 2) % LONGS.length],
      adresseChantier: `Avenue des Anciennes-Casernes ${i + 1}, 1400 ${VILLES[i % VILLES.length]}`,
      emplacementCabine: i % 2 ? "Dépôt Champs-Lovat, travée B, étagère haute" : "Sur chantier",
      nbCabines: (i % 8) + 1,
      collaborateurs: MONTEURS.slice(0, (i % 3) + 1).join(", "),
      dateMontage: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      rapportMonteur: i % 2
        ? "Pose effectuée sans difficulté particulière. Le client était présent à la réception et a validé l'ensemble des prestations. Un joint de finition reste à reprendre au niveau du receveur côté mur."
        : "",
      etatCMD: ["Récéptionné - RDV à fixer", "RDV fixé", "Terminé", "En attente de pièces"][i % 4],
      etatMesures: ["Terminé", "À planifier", "Annulé"][i % 3],
      priorite: i % 5 === 0 ? "Haute" : "",
      seriesCabines: [`Série ${i}A`, `Série ${i}B`],
    }),
  );
}

export function signalementsDenses(projectId: string, n = 14) {
  return Array.from({ length: n }, (_, i) => ({
    id: `sig-${i}`,
    projectId,
    projectName: LONGS[i % LONGS.length],
    types: ["Rayure", "Casse"],
    typesLabel: "Rayure sur le profilé vertical droit, visible à hauteur d'œil",
    description: "Le panneau fixe présente une rayure de douze centimètres environ sur sa face intérieure, probablement due au transport. Le client l'a remarquée immédiatement et demande un remplacement sous garantie.",
    photoUrls: ["https://c.test/a.jpg", "https://c.test/b.jpg"],
    displayInRapport: true,
    user: MONTEURS[i % MONTEURS.length],
    status: i % 2 ? "signale" : "resolu",
    timestamp: Date.parse("2026-10-01T08:00:00Z") + i * 3600_000,
    comments: [{ user: "Micael Ferreira", message: "Commande passée chez le fournisseur, délai annoncé trois semaines.", timestamp: 1 }],
    cabineLabel: `Lot ${i + 1} — salle de bain parents`,
    resolved: i % 2 === 0,
    cabineIdx: (i % 4) + 1,
  }));
}
