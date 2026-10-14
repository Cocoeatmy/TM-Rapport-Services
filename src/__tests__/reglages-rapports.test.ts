import { describe, it, expect } from "vitest";
import { interpreterReglages, contactsVisibles, REGLAGES_PAR_DEFAUT } from "@/lib/reglages-rapports";

describe("interpreterReglages", () => {
  it("lit la valeur enregistrée", () => {
    expect(interpreterReglages([{ contacts: false }])).toEqual({ contacts: false });
    expect(interpreterReglages([{ contacts: true }])).toEqual({ contacts: true });
  });

  it("garde le comportement d'avant quand rien n'est réglé", () => {
    /* Les contacts s'affichaient depuis toujours : une page qui perdrait ses
       contacts sans qu'on l'ait demandé mettrait des semaines à se voir. */
    expect(interpreterReglages([])).toEqual(REGLAGES_PAR_DEFAUT);
    expect(interpreterReglages(null)).toEqual(REGLAGES_PAR_DEFAUT);
    expect(interpreterReglages([{}])).toEqual(REGLAGES_PAR_DEFAUT);
    expect(interpreterReglages([{ contacts: "oui" }])).toEqual(REGLAGES_PAR_DEFAUT);
  });
});

describe("contactsVisibles", () => {
  const masque = { contacts: false };
  const affiche = { contacts: true };

  it("suit le réglage quand l'adresse ne dit rien", () => {
    expect(contactsVisibles(masque, null)).toBe(false);
    expect(contactsVisibles(affiche, null)).toBe(true);
  });

  it("le paramètre d'adresse l'emporte, dans les deux sens", () => {
    /* Pour trancher sur UN envoi sans toucher au réglage général. */
    expect(contactsVisibles(masque, "1")).toBe(true);
    expect(contactsVisibles(affiche, "0")).toBe(false);
    expect(contactsVisibles(affiche, "false")).toBe(false);
    expect(contactsVisibles(masque, "true")).toBe(true);
  });

  it("ignore un paramètre qui ne veut rien dire", () => {
    expect(contactsVisibles(affiche, "peut-être")).toBe(true);
    expect(contactsVisibles(masque, "")).toBe(false);
  });
});
