import { describe, it, expect } from "vitest";
import { enRappelFacture, listeDesFactures, type ChantierAFacturer } from "@/lib/rappels-facturation";

const ORIGINE = "https://tm-rapport-services.vercel.app";
const MAINTENANT = Date.UTC(2026, 9, 12, 10, 0, 0);

const chantier = (p: Partial<ChantierAFacturer> = {}): ChantierAFacturer => ({
  id: "abc-123",
  ofrTM: "TM-2600455",
  projet: "Gétaz — Rue du Lac 4, 1800 Vevey",
  adresseChantier: "Rue du Lac 4, 1800 Vevey",
  nbCabines: 3,
  dateMontage: "2026-07-14",
  collaborateurs: "Claudio & Jacobo",
  etat: "sans",
  offre: { nr: "TM-2600455", total: 3200, date: "2026-06-02" },
  ...p,
});

describe("rappel « à facturer »", () => {
  it("met le n° et le montant dans le titre", () => {
    const r = enRappelFacture(chantier(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.titre).toBe("TM-2600455 · À facturer — CHF 3 200");
  });

  it("ouvre la note par le lien du chantier", () => {
    const r = enRappelFacture(chantier(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes.split("\n")[0]).toBe(`→ Ouvrir le chantier : ${ORIGINE}/projet/abc-123?mode=dashboard`);
  });

  it("dit depuis quand le montage est fini", () => {
    const r = enRappelFacture(chantier(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes).toContain("Montage terminé le 14.07.2026 (il y a 89 jours)");
    expect(r.priorite).toBe(1);
  });

  it("dit sur quoi l'alerte se fonde et comment la faire disparaître", () => {
    const r = enRappelFacture(chantier(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes).toContain("Aucune facture bexio ne correspond");
    expect(r.notes).toContain("Facture-le dans bexio et le rappel se cochera tout seul.");
  });

  it("porte un marqueur stable en fin de notes", () => {
    const r = enRappelFacture(chantier(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.cle).toBe("tm:facture:abc-123");
    expect(r.notes.trimEnd().endsWith("[tm:facture:abc-123]")).toBe(true);
  });

  it("tient sans offre retrouvée", () => {
    const r = enRappelFacture(chantier({ offre: null }), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.titre).toBe("TM-2600455 · À facturer");
    expect(r.notes).not.toContain("Offre bexio");
  });
});

describe("la liste", () => {
  /* La première analyse annonçait 155 chantiers et 68 000 francs manquants ;
     après vérification il en restait six. Tout ce qui n'est pas « aucune
     facture trouvée » est une fausse alerte en puissance. */
  it("ne retient QUE « aucune facture trouvée »", () => {
    const l = listeDesFactures([
      chantier({ id: "a", etat: "sans" }),
      chantier({ id: "b", etat: "probable" }),
      chantier({ id: "c", etat: "retrouvee" }),
      chantier({ id: "d", etat: "mensuel" }),
      chantier({ id: "e", etat: "facturee" }),
    ], { origine: ORIGINE, maintenant: MAINTENANT });
    expect(l.map((r) => r.cle)).toEqual(["tm:facture:a"]);
  });

  it("met le montage le plus ancien en premier", () => {
    const l = listeDesFactures([
      chantier({ id: "recent", dateMontage: "2026-09-30" }),
      chantier({ id: "vieux", dateMontage: "2026-02-03" }),
      chantier({ id: "milieu", dateMontage: "2026-06-11" }),
    ], { origine: ORIGINE, maintenant: MAINTENANT });
    expect(l.map((r) => r.cle)).toEqual(["tm:facture:vieux", "tm:facture:milieu", "tm:facture:recent"]);
  });
});
