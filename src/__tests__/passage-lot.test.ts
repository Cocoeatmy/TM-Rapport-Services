import { describe, it, expect } from "vitest";
import { fusionnerPassage } from "@/lib/passage-lot";

describe("accord entre les heures d'un lot et ses passages", () => {
  /* Le cas réel : le passage avait été créé avec l'arrivée seule, le départ
     n'est arrivé qu'ensuite par la photo — et le rapport affichait « --:-- ». */
  it("complète le départ manquant du passage du jour", () => {
    expect(fusionnerPassage("2026-10-09~~10:14", { date: "2026-10-09", depart: "11:09" }))
      .toBe("2026-10-09~~10:14~11:09");
  });

  it("crée le passage quand le lot n'en a aucun", () => {
    expect(fusionnerPassage("", { date: "2026-10-09", arrivee: "08:00", depart: "12:00" }))
      .toBe("2026-10-09~~08:00~12:00");
  });

  it("ouvre un NOUVEAU passage pour un autre jour", () => {
    expect(fusionnerPassage("2026-10-06~Miguel~09:00~12:00", { date: "2026-10-09", arrivee: "08:30" }))
      .toBe("2026-10-06~Miguel~09:00~12:00 ; 2026-10-09~~08:30");
  });

  it("ne remplace pas une arrivée déjà notée", () => {
    expect(fusionnerPassage("2026-10-09~~10:14", { date: "2026-10-09", arrivee: "09:00" }))
      .toBe("2026-10-09~~10:14");
  });

  it("repousse un départ quand une photo plus tardive le prouve", () => {
    expect(fusionnerPassage("2026-10-09~~10:14~11:09", { date: "2026-10-09", depart: "12:30" }))
      .toBe("2026-10-09~~10:14~12:30");
  });

  it("ne ramène jamais un départ en arrière", () => {
    expect(fusionnerPassage("2026-10-09~~10:14~12:30", { date: "2026-10-09", depart: "11:09" }))
      .toBe("2026-10-09~~10:14~12:30");
  });

  it("complète le collaborateur s'il manque, sans écraser", () => {
    expect(fusionnerPassage("2026-10-09~~10:14", { date: "2026-10-09", collaborateurs: "Jean-Marc" }))
      .toBe("2026-10-09~Jean-Marc~10:14");
    expect(fusionnerPassage("2026-10-09~Miguel~10:14", { date: "2026-10-09", collaborateurs: "Jean-Marc" }))
      .toBe("2026-10-09~Miguel~10:14");
  });

  it("ne touche à rien sans date", () => {
    expect(fusionnerPassage("2026-10-09~~10:14", { date: "", depart: "12:00" }))
      .toBe("2026-10-09~~10:14");
  });

  it("vise le DERNIER passage du jour quand il y en a deux", () => {
    expect(fusionnerPassage("2026-10-09~~08:00~09:00 ; 2026-10-09~~13:00", { date: "2026-10-09", depart: "17:00" }))
      .toBe("2026-10-09~~08:00~09:00 ; 2026-10-09~~13:00~17:00");
  });
});
