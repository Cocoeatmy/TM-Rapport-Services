import { describe, it, expect } from "vitest";
import { repriseDepuisHeures } from "@/lib/sav-passages-reprise";
import { comptesSavParCabine, prochaineDateSavPlanifiee } from "@/lib/sav-cabines";

/**
 * Les passages SAV restés dans les colonnes d'heures.
 *
 * Relevé réel du 16 octobre 2026 : trois chantiers avaient leurs passages
 * écrits dans « Heure arrivée SAV » / « Heure départ SAV » et rien dans
 * les colonnes que les listes lisent. TM-2600864 figurait donc dans
 * « RDV SAV à fixer » alors qu'une reprise était calée au 20 octobre.
 */
describe("reprise des passages SAV", () => {
  it("LE CAS TM-2600864 : deux passages, dont un à venir", () => {
    const r = repriseDepuisHeures({
      heureArriveeSav: "2026-10-15 Jean-Marc & Miguel 10:00 | 2026-10-20 Claudio 15:30",
      heureDepartSav: "2026-10-15 Jean-Marc & Miguel 11:00 | 2026-10-20 Claudio",
    });
    expect(r?.nombre).toBe(2);
    expect(r?.derniereDate).toBe("2026-10-20");
    expect(r?.interventions).toContain("2026-10-15");
    expect(r?.interventions).toContain("2026-10-20");
    expect(r?.interventions).toContain("Claudio");
  });

  it("une fois repris, le chantier quitte « RDV SAV à fixer »", () => {
    const r = repriseDepuisHeures({
      heureArriveeSav: "2026-10-15 Jean-Marc & Miguel 10:00 | 2026-10-20 Claudio 15:30",
      heureDepartSav: "2026-10-15 Jean-Marc & Miguel 11:00 | 2026-10-20 Claudio",
    })!;
    const projet = {
      causeSavCabines: "Cab1:Erreur TM",
      interventionsSavCabines: `Cab1:${r.interventions}`,
      datesRdvSavCabines: `Cab1:${r.derniereDate}`,
    };
    expect(comptesSavParCabine(projet).aFixer).toBe(0);
    expect(comptesSavParCabine(projet).planifies).toBe(1);
    expect(prochaineDateSavPlanifiee(projet)).toBe("2026-10-20");
  });

  it("un passage sans collaborateur se reprend quand même", () => {
    /* TM-2600836 : seule la date et l'heure avaient été saisies. */
    const r = repriseDepuisHeures({
      heureArriveeSav: "2026-10-07 12:45",
      heureDepartSav: "2026-10-07 13:47",
    });
    expect(r?.nombre).toBe(1);
    expect(r?.derniereDate).toBe("2026-10-07");
  });

  it("NE TOUCHE À RIEN si la colonne par lot porte déjà quelque chose", () => {
    /* Une reprise ne doit jamais écraser une saisie récente : la colonne
       par lot fait autorité dès qu'elle est remplie. */
    expect(repriseDepuisHeures({
      heureArriveeSav: "2026-10-07 12:45",
      heureDepartSav: "2026-10-07 13:47",
      interventionsSavCabines: "Cab1:2026-10-09~Micael",
    })).toBeNull();
  });

  it("ne reprend rien quand les heures ne portent aucune date", () => {
    /* Le cas normal : des horaires simples, pas une liste de passages. */
    expect(repriseDepuisHeures({ heureArriveeSav: "13:30", heureDepartSav: "14:25" })).toBeNull();
    expect(repriseDepuisHeures({})).toBeNull();
  });
});
