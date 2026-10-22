import { describe, it, expect } from "vitest";
import { posesDuChantier } from "@/lib/poses-lots";

describe("poses lot par lot (date de l'app, pas la Date montage Notion)", () => {
  it("un chantier non terminé ne compte pas", () => {
    expect(posesDuChantier({ etatCMD: "RDV - fixé", nbCabines: 3, dateMontage: "2026-10-01" })).toEqual([]);
  });

  it("chaque lot prend la date de SON dernier passage, avec son équipe", () => {
    const l = posesDuChantier({
      etatCMD: "Terminé", nbCabines: 3, dateMontage: "2026-09-01", collaborateurs: "Claudio",
      interventionsMontageCabines: "Cab1:2026-09-02~Jean-Marc~08:00~12:00 | Cab2:2026-09-02~Jean-Marc & Miguel;2026-10-14~Miguel",
      heureArrivee: "Cab3:2026-10-20:09:00",
      attributionCabines: "Cab3:Jacobo",
    });
    expect(l.map((x) => [x.lot, x.date, x.debut, x.equipe.join("+")])).toEqual([
      [1, "2026-09-02", "2026-09-02", "Jean-Marc"],
      [2, "2026-10-14", "2026-09-02", "Jean-Marc+Miguel"],
      [3, "2026-10-20", "2026-10-20", "Jacobo"],
    ]);
  });

  it("sans trace dans l'app : la Date montage Notion et l'équipe du chantier", () => {
    const l = posesDuChantier({ etatCMD: "Terminé", nbCabines: 2, dateMontage: "2026-05-04T08:00", collaborateurs: "Claudio & Javier" });
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ date: "2026-05-04", equipe: ["Claudio", "Javier"] });
  });

  it("aucune date nulle part : le lot n'est pas placé", () => {
    expect(posesDuChantier({ etatCMD: "Terminé", nbCabines: 1 })).toEqual([]);
  });
});

describe("équipe : toutes les écritures de liste", () => {
  it("virgule, &, + et « et » séparent les noms", () => {
    const [l] = posesDuChantier({ etatCMD: "Terminé", nbCabines: 1, dateMontage: "2026-05-04", collaborateurs: "Javier, Miguel & Claudio + Jacobo et Loïc" });
    expect(l.equipe).toEqual(["Javier", "Miguel", "Claudio", "Jacobo", "Loïc"]);
  });
});
