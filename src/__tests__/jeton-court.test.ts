import { describe, it, expect } from "vitest";
import { jetonCourt, idDepuisJeton } from "@/lib/jeton-court";

const ID = "3479b7a4-8b2f-81d2-9c55-e3e5f1a9b001";
describe("jeton court des liens du calendrier", () => {
  it("22 caractères, et l'aller-retour redonne l'identifiant", () => {
    const j = jetonCourt(ID);
    expect(j).toHaveLength(22);
    expect(idDepuisJeton(j)).toBe(ID);
  });
  it("les anciens liens (identifiant en texte) restent lisibles", () => {
    expect(idDepuisJeton(Buffer.from(ID).toString("base64url"))).toBe(ID);
  });
});
