import { describe, it, expect } from "vitest";
import { deciderNomLot, memeNom, nomParDefautLot } from "@/lib/noms-lots";

/**
 * Non-régression du renommage des lots.
 *
 * Micael l'a signalé plusieurs fois : des lettres qui disparaissent pendant
 * la frappe, et des noms qui reviennent d'eux-mêmes au libellé par défaut.
 * Chaque cas ci-dessous reproduit une relecture serveur arrivant au mauvais
 * moment — c'est exactement ce qui écrasait la saisie.
 */
describe("deciderNomLot", () => {
  it("garde la saisie quand le serveur renvoie encore l'ancien nom", () => {
    /* Le monteur tape « SDD parentale », une relecture apporte « SDD ».
       Avant : l'écran repassait à « SDD ». */
    const d = deciderNomLot({ idx0: 3, voulu: "SDD parentale", serveur: "SDD", actuel: "SDD parentale" });
    expect(d).toEqual({ nom: "SDD parentale", confirme: false });
  });

  it("garde la saisie quand le serveur ne connaît encore aucun nom", () => {
    const d = deciderNomLot({ idx0: 3, voulu: "SDD", serveur: "", actuel: "SDD" });
    expect(d).toEqual({ nom: "SDD", confirme: false });
  });

  it("garde la saisie contre le nom par défaut, indéfiniment", () => {
    /* Pas d'horloge : même une heure plus tard, « Cabine 4 » ne gagne pas. */
    const d = deciderNomLot({ idx0: 3, voulu: "SDD", serveur: "Cabine 4", actuel: "SDD" });
    expect(d).toEqual({ nom: "SDD", confirme: false });
  });

  it("oublie le souhait dès que le serveur dit la même chose", () => {
    const d = deciderNomLot({ idx0: 3, voulu: "SDD", serveur: "SDD", actuel: "SDD" });
    expect(d).toEqual({ nom: "SDD", confirme: true });
  });

  it("accepte la graphie du serveur à la confirmation", () => {
    /* Espaces en trop tapés à la volée : c'est la version enregistrée qui
       fait foi une fois qu'elle est là. */
    const d = deciderNomLot({ idx0: 0, voulu: " sdd ", serveur: "SDD", actuel: " sdd " });
    expect(d).toEqual({ nom: "SDD", confirme: true });
  });

  it("laisse revenir au nom par défaut quand c'est demandé", () => {
    const d = deciderNomLot({ idx0: 2, voulu: "Cabine 3", serveur: "", actuel: "Cabine 3" });
    expect(d).toEqual({ nom: "Cabine 3", confirme: true });
  });

  it("sans souhait en cours, un nom choisi côté serveur s'applique", () => {
    /* Un collègue renomme depuis son téléphone : on doit le voir. */
    const d = deciderNomLot({ idx0: 1, serveur: "SDB", actuel: "Cabine 2" });
    expect(d).toEqual({ nom: "SDB", confirme: false });
  });

  it("sans souhait et sans nom choisi, l'écran ne bouge pas", () => {
    expect(deciderNomLot({ idx0: 1, serveur: "Cabine 2", actuel: "SDB" }))
      .toEqual({ nom: "SDB", confirme: false });
    expect(deciderNomLot({ idx0: 1, serveur: "", actuel: "SDB" }))
      .toEqual({ nom: "SDB", confirme: false });
  });

  it("tombe sur le nom par défaut quand il n'y a rien du tout", () => {
    expect(deciderNomLot({ idx0: 6, actuel: "" })).toEqual({ nom: "Cabine 7", confirme: false });
  });

  it("une frappe lettre par lettre n'est jamais rattrapée par le serveur", () => {
    /* Le serveur est resté à « S » ; l'écran suit la frappe sans perdre
       un seul caractère. */
    let ecran = "";
    for (const voulu of ["S", "SD", "SDD", "SDD p", "SDD pa"]) {
      ecran = deciderNomLot({ idx0: 0, voulu, serveur: "S", actuel: ecran }).nom;
      expect(ecran).toBe(voulu);
    }
  });
});

describe("memeNom", () => {
  it("ignore les espaces de bord et la casse", () => {
    expect(memeNom(" SDD ", "sdd")).toBe(true);
    expect(memeNom("SDD", "SDB")).toBe(false);
    expect(memeNom(undefined, "")).toBe(true);
  });
});

describe("nomParDefautLot", () => {
  it("numérote à partir de 1", () => {
    expect(nomParDefautLot(0)).toBe("Cabine 1");
    expect(nomParDefautLot(8)).toBe("Cabine 9");
  });
});
