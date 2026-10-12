import { describe, it, expect } from "vitest";
import { equipeDuJour, listeDeNoms } from "@/lib/equipe-intervention";

describe("liste de noms", () => {
  it("découpe, nettoie et dédoublonne", () => {
    expect(listeDeNoms("Claudio & Jacobo")).toEqual(["Claudio", "Jacobo"]);
    expect(listeDeNoms("  Claudio  &  & Jacobo ")).toEqual(["Claudio", "Jacobo"]);
    expect(listeDeNoms("Claudio & claudio")).toEqual(["Claudio"]);
    expect(listeDeNoms("")).toEqual([]);
    expect(listeDeNoms(null)).toEqual([]);
  });
});

describe("équipe d'un passage qui commence", () => {
  /* Le défaut d'origine : Claudio envoie la photo de 7 h, l'intervention ne
     retient que Claudio, et les heures de Jacobo disparaissent du relevé. */
  it("prend l'équipe prévue dans Notion, pas seulement celui qui envoie la photo", () => {
    expect(equipeDuJour("Claudio & Jacobo", "Claudio")).toBe("Claudio & Jacobo");
  });

  it("ajoute le remplaçant qui n'était pas annoncé", () => {
    expect(equipeDuJour("Claudio & Jacobo", "Miguel")).toBe("Claudio & Jacobo & Miguel");
  });

  it("se contente de la personne présente quand Notion ne dit rien", () => {
    expect(equipeDuJour("", "Claudio")).toBe("Claudio");
    expect(equipeDuJour(null, "Claudio")).toBe("Claudio");
  });

  it("garde l'équipe prévue quand personne n'est identifié", () => {
    expect(equipeDuJour("Claudio & Jacobo")).toBe("Claudio & Jacobo");
    expect(equipeDuJour("Claudio & Jacobo", null)).toBe("Claudio & Jacobo");
  });

  it("ne duplique pas, quelle que soit la casse", () => {
    expect(equipeDuJour("Jean-Marc & Miguel", "jean-marc")).toBe("Jean-Marc & Miguel");
  });

  it("rend une chaîne vide quand il n'y a rien à dire", () => {
    expect(equipeDuJour("", "")).toBe("");
  });

  it("conserve l'ordre de Notion", () => {
    expect(equipeDuJour("Jacobo & Claudio", "Claudio")).toBe("Jacobo & Claudio");
  });
});
