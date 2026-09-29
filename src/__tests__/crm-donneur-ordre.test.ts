/**
 * À qui appartient un chantier, dans le CRM.
 *
 * Presque tous les projets portent un fournisseur, souvent un grossiste et un
 * sanitaire par-dessus. Apparaître sur un projet ne fait pas de vous son
 * donneur d'ordre — et l'attribuer au mauvais gonfle les statistiques d'une
 * entreprise avec l'activité d'une autre.
 */
import { describe, it, expect } from "vitest";

/* La règle, telle qu'elle vit dans crm-clients. On la duplique ici plutôt que
   d'exporter depuis un composant client : c'est une règle métier, et c'est
   elle qu'on veut geler. */
function estDonneurDOrdre(projet: { typeClient?: string }, entityType: string): boolean {
  const t = String(projet?.typeClient || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const fournisseur = t.startsWith("fournisseur");
  const grossiste = t.startsWith("grossiste");
  if (entityType === "fournisseurs") return fournisseur;
  if (entityType === "grossistes") return grossiste;
  if (entityType === "entreprises") return !fournisseur && !grossiste;
  return true;
}

const p = (typeClient: string) => ({ typeClient });

describe("donneur d'ordre", () => {
  it("attribue un chantier au fournisseur seulement si le client est un fournisseur", () => {
    expect(estDonneurDOrdre(p("Fournisseurs"), "fournisseurs")).toBe(true);
    expect(estDonneurDOrdre(p("Grossistes"), "fournisseurs")).toBe(false);
    expect(estDonneurDOrdre(p("Sanitaires"), "fournisseurs")).toBe(false);
  });

  it("fait de même pour les grossistes", () => {
    expect(estDonneurDOrdre(p("Grossistes"), "grossistes")).toBe(true);
    expect(estDonneurDOrdre(p("Fournisseurs"), "grossistes")).toBe(false);
  });

  it("définit les entreprises EN CREUX : tout sauf fournisseur et grossiste", () => {
    /* Les énumérer condamnerait à courir après chaque valeur ajoutée dans
       Notion ; la définition en creux couvre aussi les futures. */
    ["Sanitaires", "Client finaux", "Régies", "Entreprise générales", "Architecte", "Carreleur"]
      .forEach((t) => expect(estDonneurDOrdre(p(t), "entreprises")).toBe(true));
    expect(estDonneurDOrdre(p("Fournisseurs"), "entreprises")).toBe(false);
    expect(estDonneurDOrdre(p("Grossistes"), "entreprises")).toBe(false);
  });

  it("tolère le singulier, le pluriel et les accents de Notion", () => {
    expect(estDonneurDOrdre(p("Fournisseur"), "fournisseurs")).toBe(true);
    expect(estDonneurDOrdre(p("grossiste"), "grossistes")).toBe(true);
    expect(estDonneurDOrdre(p("Grossistes "), "grossistes")).toBe(true);
  });

  it("range un projet sans type de client parmi les entreprises", () => {
    /* Faute de mieux : il n'est ni fournisseur ni grossiste, et l'écarter de
       partout le rendrait invisible dans tout le CRM. */
    expect(estDonneurDOrdre(p(""), "entreprises")).toBe(true);
    expect(estDonneurDOrdre(p(""), "fournisseurs")).toBe(false);
  });
});
