import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { comptesSavParCabine, etatSavAffiche, prochaineDateSavPlanifiee } from "@/lib/sav-cabines";

/**
 * UN PASSAGE SAISI DOIT EXISTER POUR LES LISTES.
 *
 * TM-2600864, 16 octobre 2026 : deux interventions saisies — une faite le
 * 15, une calée au 20 — et le chantier restait dans « RDV SAV à fixer »
 * comme si rien n'était prévu. Les deux colonnes que les listes lisent,
 * « Interventions SAV cabines » et « Dates RDV SAV cabines », étaient
 * VIDES.
 *
 * Cause : en mono-cabine, dès la deuxième intervention, l'écran basculait
 * en mode liste et n'écrivait plus que dans « Heure arrivée SAV » /
 * « Heure départ SAV » — des colonnes d'heures, que personne d'autre ne
 * lit.
 */
const PAGE = fs.readFileSync("src/app/projet/[id]/page.tsx", "utf8");

describe("passages SAV mono-cabine — persistance", () => {
  const bloc = (() => {
    const i = PAGE.indexOf("const renderSavHoursEditor");
    return PAGE.slice(i, PAGE.indexOf("\n  };", i + 100));
  })();

  it("l'éditeur écrit dans les colonnes PAR LOT, pas seulement dans les heures", () => {
    expect(bloc).toContain("interventionsSavCabines");
    expect(bloc).toContain("datesRdvSavCabines");
  });

  it("chaque modification de la liste les met à jour", () => {
    /* Ajouter, modifier, retirer : si une seule voie oublie d'écrire, le
       chantier retombe dans la mauvaise liste sans prévenir. */
    const appels = [...bloc.matchAll(/persistPassagesSav\(/g)].length;
    expect(appels).toBeGreaterThanOrEqual(4);
  });

  it("la date retenue est la plus lointaine, pas la première", () => {
    /* Deux passages : celui du 15 est fait, celui du 20 est le rendez-vous
       qui compte. */
    expect(bloc).toMatch(/\.sort\(\)\s*\n?\s*\.pop\(\)/);
  });
});

describe("TM-2600864 — ce que les listes doivent en conclure", () => {
  /* Les données telles qu'elles DOIVENT être écrites après la correction. */
  const projet = {
    etatSAV: "Aucun SAV",
    causeSavCabines: "Cab1:Erreur TM",
    commentairesSav: "Cab1:Le silicone est mal fait",
    interventionsSavCabines: "Cab1:2026-10-15~Jean-Marc & Miguel~10:00~11:00;2026-10-20~Claudio",
    datesRdvSavCabines: "Cab1:2026-10-20",
  };

  it("le lot est planifié, donc le chantier quitte « RDV SAV à fixer »", () => {
    const c = comptesSavParCabine(projet);
    expect(c.aFixer).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("le prochain passage est celui du 20, pas celui du 15", () => {
    expect(prochaineDateSavPlanifiee(projet)).toBe("2026-10-20");
  });

  it("l'état déduit est « RDV Fixé », et non « A contacter »", () => {
    /* C'est l'autre moitié du défaut : la correction automatique écrivait
       « A contacter » d'office, sans regarder si le rendez-vous était
       déjà pris — ce qui a mis TM-2600634 dans la mauvaise liste avec le
       mauvais état. */
    const e = etatSavAffiche(projet);
    expect(e.etat).toBe("RDV Fixé");
    expect(e.deduit).toBe(true);
  });
});

describe("la correction automatique n'invente plus l'état", () => {
  it("elle écrit l'état DÉDUIT, pas « A contacter » en dur", () => {
    const i = PAGE.indexOf("Coche automatiquement") >= 0
      ? PAGE.indexOf("Coche automatiquement")
      : PAGE.indexOf("Un SAV existe");
    const effet = PAGE.slice(i, i + 2200);
    expect(effet).toContain("etatSavAffiche");
    /* Plus aucune valeur d'état écrite en dur dans cet effet. */
    expect(effet).not.toMatch(/patch\.etatSAV = "A contacter"/);
  });
});
