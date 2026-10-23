import { describe, it, expect } from "vitest";
import { historiqueDuChantier, intervenants } from "@/lib/historique-equipe";

const AUJ = "2026-10-23";

describe("équipe & historique d'un chantier", () => {
  it("un lot, deux jours : démontage puis montage, chacun avec son équipe", () => {
    const ev = historiqueDuChantier({
      nbCabines: 1, etatCMD: "Terminé",
      dateDemontage: "2026-10-12T08:00", collaborateursDemontage: "Jean-Marc & Miguel",
      heureArrivee: "2026-10-12 Jean-Marc & Miguel 07:30 | 2026-10-23 Jean-Marc & Miguel 08:00",
      heureDepart: "2026-10-12 Jean-Marc & Miguel 09:00 | 2026-10-23 Jean-Marc & Miguel 09:31",
    }, [], AUJ);
    const montages = ev.filter((e) => e.genre === "montage");
    expect(montages.map((e) => [e.quand, e.detail])).toEqual([["2026-10-23", "08:00 → 09:31"], ["2026-10-12", "07:30 → 09:00"]]);
    expect(montages[0].noms).toEqual(["Jean-Marc", "Miguel"]);
    expect(intervenants(ev).find((x) => x.nom === "Miguel")?.dernier).toBe("2026-10-23");
  });

  it("chantier pas terminé : le montage prévu et son équipe passent en tête", () => {
    const ev = historiqueDuChantier({ etatCMD: "RDV - fixé", dateMontage: "2026-11-03", collaborateurs: "Claudio & Javier", nbCabines: 5 }, [], AUJ);
    expect(ev[0]).toMatchObject({ statut: "prevu", titre: "Montage prévu", noms: ["Claudio", "Javier"], quand: "2026-11-03" });
  });

  it("SAV par lot : passé, prévu, clôturé, avec qui", () => {
    const ev = historiqueDuChantier({
      nbCabines: 2, nomsCabines: "Cab1:SDB | Cab2:SDD",
      causeSavCabines: "Cab1:Joint | Cab2:Vitre",
      interventionsSavCabines: "Cab1:2026-10-01~Jacobo~08:00~09:00",
      datesSavClotureCabines: "Cab1:2026-10-01",
      datesRdvSavCabines: "Cab2:2026-10-28", collaborateursSavCabines: "Cab2:Miguel",
    }, [], AUJ);
    const sav = ev.filter((e) => e.genre === "sav");
    expect(sav.find((e) => e.statut === "prevu")).toMatchObject({ quand: "2026-10-28", noms: ["Miguel"], detail: "SDD · Vitre" });
    expect(sav.find((e) => e.statut === "cloture")).toMatchObject({ quand: "2026-10-01" });
    expect(sav.find((e) => e.titre === "Passage SAV")).toMatchObject({ noms: ["Jacobo"] });
  });

  it("signalements : le type et qui l'a fait", () => {
    const ev = historiqueDuChantier({}, [
      { timestamp: Date.parse("2026-10-20T10:00:00Z"), user: "Claudio Zanutto", typesLabel: "Dommage de transport", cabineLabel: "SDB", description: "Vitre fissurée" },
      { timestamp: Date.parse("2026-10-21T10:00:00Z"), user: "Miguel Roberto", typesLabel: "Pièce manquante", status: "recu" },
    ], AUJ);
    expect(ev.map((e) => [e.titre, e.noms[0], e.statut])).toEqual([
      ["Signalement — Pièce manquante", "Miguel Roberto", "cloture"],
      ["Signalement — Dommage de transport", "Claudio Zanutto", "ouvert"],
    ]);
  });
});

describe("pas de doublon le jour du démontage", () => {
  it("un passage ce jour-là raconte le démontage ; personne n'est compté deux fois", () => {
    const ev = historiqueDuChantier({
      nbCabines: 2, dateDemontage: "2026-10-12", collaborateursDemontage: "Jean-Marc & Miguel",
      interventionsMontageCabines: "Cab1:2026-10-12~Jean-Marc & Miguel~08:00~11:30",
    }, [], AUJ);
    expect(ev.filter((e) => e.quand === "2026-10-12")).toHaveLength(1);
    expect(intervenants(ev).find((x) => x.nom === "Miguel")?.fois).toBe(1);
  });
});
