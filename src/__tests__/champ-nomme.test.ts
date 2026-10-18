/**
 * Prénom contre prénom.
 *
 * Le bug que ce fichier empêche de revenir : la préparation hors ligne
 * exigeait que le champ Notion CONTIENNE le nom complet du compte. Notion
 * écrit « Jean-Marc & Miguel », le compte s'appelle « Jean-Marc Nelzi » —
 * le test échouait toujours, et la préparation chargeait zéro chantier pour
 * tout le monde, sans la moindre erreur à l'écran. Pendant des semaines.
 */
import { describe, it, expect } from "vitest";
import { champNomme, prenomsDuChamp } from "@/lib/perimetre-projets";

describe("champNomme — le champ Notion nomme-t-il ce compte ?", () => {
  it("reconnaît un prénom dans une équipe de deux", () => {
    expect(champNomme("Jean-Marc & Miguel", "Jean-Marc Nelzi")).toBe(true);
    expect(champNomme("Jean-Marc & Miguel", "Miguel Roberto")).toBe(true);
  });

  it("reconnaît un prénom seul", () => {
    expect(champNomme("Micael", "Micael Ferreira")).toBe(true);
    expect(champNomme("Claudio", "Claudio Zanutto")).toBe(true);
  });

  it("ne confond pas Miguel et Micael", () => {
    /* Deux prénoms qui se ressemblent : un test par inclusion de chaîne
       aurait pu les mélanger. */
    expect(champNomme("Miguel", "Micael Ferreira")).toBe(false);
    expect(champNomme("Micael", "Miguel Roberto")).toBe(false);
  });

  it("une équipe de quatre nomme chacun des quatre", () => {
    const champ = "Claudio & Jacobo & Jean-Marc & Miguel";
    for (const nom of ["Claudio Zanutto", "Jacobo Fontan Cassas", "Jean-Marc Nelzi", "Miguel Roberto"]) {
      expect(champNomme(champ, nom), nom).toBe(true);
    }
    expect(champNomme(champ, "Micael Ferreira")).toBe(false);
  });

  it("« Team » désigne tout le monde", () => {
    expect(champNomme("Team TM", "Jacobo Fontan Cassas")).toBe(true);
    expect(champNomme("team", "Micael Ferreira")).toBe(true);
  });

  it("ignore accents et casse", () => {
    expect(champNomme("MICAËL", "Micael Ferreira")).toBe(true);
    expect(champNomme("loïc", "Loic Schiro")).toBe(true);
  });

  it("garde les prénoms composés entiers", () => {
    expect(prenomsDuChamp("Jean-Marc & Miguel")).toEqual(["Jean-Marc", "Miguel"]);
    expect(prenomsDuChamp("Claudio, Jacobo / Miguel et Loïc")).toEqual(["Claudio", "Jacobo", "Miguel", "Loïc"]);
  });

  it("un nom complet saisi dans le champ nomme aussi la personne", () => {
    expect(champNomme("Jacobo Fontan & Claudio", "Jacobo Fontan Cassas")).toBe(true);
    expect(champNomme("Miguel Ferreira da Silva", "Micael Ferreira")).toBe(false);
    expect(champNomme("Jean-Marc Nelzi", "Jean-Marc Nelzi")).toBe(true);
  });

  it("un champ vide ou absent ne nomme personne", () => {
    expect(champNomme("", "Micael Ferreira")).toBe(false);
    expect(champNomme(null, "Micael Ferreira")).toBe(false);
    expect(champNomme(undefined, "Micael Ferreira")).toBe(false);
    expect(champNomme("Micael", "")).toBe(false);
  });
});
