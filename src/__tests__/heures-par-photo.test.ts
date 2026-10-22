/**
 * Arrivée et départ corrigés par la PRISE DE VUE (TM-2600765, 22.10.2026).
 *
 * Cabine 1 : « Maintenant » pressé à 14:56 en remplissant le rapport, photo
 * d'avant prise à 14:10, photo d'après prise à 14:45 (ajoutée à 14:58).
 * Cabine 2 : arrivée 15:06, départ 14:53 — l'impossible.
 */
import { describe, it, expect } from "vitest";
import { corrigerCoupleParPhoto, type HeurePhoto } from "@/lib/heure-photo";

const J = "2026-10-22";
const photo = (heure: string, source: HeurePhoto["source"] = "exif"): HeurePhoto => ({ jour: J, heure, source });

describe("corrigerCoupleParPhoto", () => {
  it("l'arrivée recule jusqu'à la photo d'avant intervention", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "14:56", depart: "" }, photo("14:10"), "AVANT_INTERVENTION", J))
      .toEqual({ arrivee: "14:10", depart: "" });
  });
  it("arriver avant la première photo reste permis", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "13:30", depart: "" }, photo("14:10"), "AVANT_INTERVENTION", J).arrivee).toBe("13:30");
  });
  it("le départ est la dernière photo d'après, même en arrière d'une heure saisie", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "14:10", depart: "14:58" }, photo("14:45"), "APRES_INTERVENTION", J, { dernierePriseApres: "14:40" }))
      .toEqual({ arrivee: "14:10", depart: "14:45" });
  });
  it("une photo d'après plus ancienne que la dernière connue ne recule pas le départ", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "14:10", depart: "14:45" }, photo("14:30"), "APRES_INTERVENTION", J, { dernierePriseApres: "14:45" }).depart).toBe("14:45");
  });
  it("jamais un départ avant l'arrivée : la première photo du jour ramène l'arrivée", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "15:06", depart: "" }, photo("14:54"), "APRES_INTERVENTION", J, { premierePrise: "14:17" }))
      .toEqual({ arrivee: "14:17", depart: "14:54" });
  });
  it("sans preuve de l'arrivée, un départ impossible n'est pas écrit", () => {
    const r = corrigerCoupleParPhoto({ arrivee: "15:06", depart: "" }, photo("14:54", "envoi"), "APRES_INTERVENTION", J);
    expect(r.depart === "" || r.depart >= r.arrivee).toBe(true);
  });
  it("l'heure d'envoi seule ne corrige pas une arrivée déjà saisie", () => {
    expect(corrigerCoupleParPhoto({ arrivee: "14:56", depart: "" }, photo("14:10", "envoi"), "AVANT_INTERVENTION", J).arrivee).toBe("14:56");
  });
});
