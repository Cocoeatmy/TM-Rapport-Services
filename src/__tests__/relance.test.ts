import { describe, it, expect } from "vitest";
import {
  destinataireRelance, redigerRelance, lienMailto, dateSuisse, salutation,
  relanceApplicable, type ContactsDuProjet, type ProjetARelancer,
} from "@/lib/relance";

const jean = { name: "Jean Dupont", email: "jean@duka.ch" };
const marie = { name: "Marie Rossi", email: "marie@sanitaire.ch" };
const sansMail = { name: "Paul Muet", email: "" };

const projet: ProjetARelancer = {
  id: "p1",
  projet: "Duka - Lot 1, Wagnières Jean-Luc & Monique, Rue des Jardins 8 à 1400 Yverdon",
  ofrTM: "TM-2600975",
  dateOffre: "2026-09-02",
  dateMesures: "2026-10-12T00:00:00.000+02:00",
  nbCabines: 3,
  typeClient: "Grossistes",
};

describe("relanceApplicable", () => {
  it("écarte les clients de type Fournisseurs", () => {
    /* C'est nous qui commandons chez eux : aucune offre n'attend leur
       réponse. */
    expect(relanceApplicable("Fournisseurs")).toBe(false);
  });
  it("accepte les autres types, y compris vide", () => {
    expect(relanceApplicable("Grossistes")).toBe(true);
    expect(relanceApplicable("")).toBe(true);
    expect(relanceApplicable(null)).toBe(true);
  });
});

describe("destinataireRelance", () => {
  it("suit le type de client : un grossiste reçoit par le Contact Grossiste", () => {
    const d = destinataireRelance("Grossistes", { grossiste: [jean], sanitaire: [marie] });
    expect(d.famille).toBe("grossiste");
    expect(d.repli).toBe(false);
    expect(d.contacts).toEqual([jean]);
  });

  it("un client final passe par Contacts Clients finaux", () => {
    const d = destinataireRelance("Client finaux", { clientsFinaux: [jean], grossiste: [marie] });
    expect(d.famille).toBe("clientsFinaux");
  });

  it("se replie — et le signale — quand la famille désignée est vide", () => {
    /* Quinze des vingt-huit dossiers « Sanitaires » seulement portent un
       contact sanitaire ; sans repli, la moitié n'aurait personne. */
    const d = destinataireRelance("Sanitaires", { grossiste: [jean] });
    expect(d.famille).toBe("grossiste");
    expect(d.repli).toBe(true);
  });

  it("ignore un contact sans adresse — il ne sert à rien ici", () => {
    const d = destinataireRelance("Grossistes", { grossiste: [sansMail], sanitaire: [marie] });
    expect(d.famille).toBe("sanitaire");
    expect(d.contacts).toEqual([marie]);
  });

  it("rend personne plutôt qu'un mauvais destinataire", () => {
    const d = destinataireRelance("Grossistes", {} as ContactsDuProjet);
    expect(d.contacts).toEqual([]);
    expect(d.famille).toBeNull();
  });

  it("sans type de client, cherche dans toutes les familles", () => {
    expect(destinataireRelance("", { autres: [jean] }).famille).toBe("autres");
  });
});

describe("dateSuisse", () => {
  it("convertit une date Notion", () => {
    expect(dateSuisse("2026-09-02")).toBe("02.09.2026");
    expect(dateSuisse("2026-10-12T00:00:00.000+02:00")).toBe("12.10.2026");
  });
  it("rend une chaîne vide plutôt qu'une date fausse", () => {
    expect(dateSuisse(null)).toBe("");
    expect(dateSuisse("bientôt")).toBe("");
  });
});

describe("salutation", () => {
  it("appelle le contact par son prénom", () => {
    expect(salutation([jean])).toBe("Bonjour Jean,");
  });
  it("nomme tout le monde quand ils sont plusieurs", () => {
    expect(salutation([jean, marie])).toBe("Bonjour Jean et Marie,");
  });
  it("reste neutre faute de nom", () => {
    expect(salutation([{ name: "", email: "x@y.ch" }])).toBe("Bonjour,");
  });
});

describe("redigerRelance", () => {
  const mail = redigerRelance(projet, destinataireRelance("Grossistes", { grossiste: [jean] }));

  it("porte les deux dates — c'est tout l'argument de la relance", () => {
    expect(mail.corps).toContain("du 02.09.2026");
    expect(mail.corps).toContain("effectué le 12.10.2026");
  });

  it("rappelle le nombre de cabines relevées", () => {
    expect(mail.corps).toContain("(3 cabines)");
  });

  it("met la référence d'offre dans l'objet", () => {
    expect(mail.objet).toContain("TM-2600975");
  });

  it("ne répète pas le nom du client, qui ouvre le nom de projet", () => {
    /* « Duka - Lot 1, … » : écrire « Duka » à Duka n'apprend rien. */
    expect(mail.objet).not.toContain("Duka");
    expect(mail.objet).toContain("Lot 1, Wagnières");
  });

  it("préfère le nom et l'adresse de chantier quand ils sont renseignés", () => {
    const m = redigerRelance(
      { ...projet, nomChantier: "Villa Rossi", adresseChantier: "Ch. du Lac 4, 1800 Vevey" },
      destinataireRelance("Grossistes", { grossiste: [jean] }),
    );
    expect(m.objet).toContain("Villa Rossi, Ch. du Lac 4, 1800 Vevey");
  });

  it("tient debout sans date d'offre — quatre dossiers sur quatre-vingt-onze", () => {
    const m = redigerRelance({ ...projet, dateOffre: null }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).toContain("est restée sans réponse");
    expect(m.corps).not.toContain("du ,");
  });

  it("tait le relevé plutôt que d'annoncer une date vide", () => {
    const m = redigerRelance({ ...projet, dateMesures: null }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).not.toContain("relevé de mesures");
  });

  it("signe au nom de l'entreprise", () => {
    expect(mail.corps).toContain("TM Douche Montage Sàrl");
    expect(mail.corps).toContain("info@douche-montage.ch");
  });

  it("annonce l'absence de destinataire au lieu de la masquer", () => {
    const m = redigerRelance(projet, destinataireRelance("Grossistes", {}));
    expect(m.sansDestinataire).toBe(true);
    expect(m.destinataires).toEqual([]);
  });
});

describe("lienMailto", () => {
  const mail = redigerRelance(projet, destinataireRelance("Grossistes", { grossiste: [jean, marie] }));
  const lien = lienMailto(mail);

  it("adresse les destinataires en clair, séparés par une virgule", () => {
    expect(lien.startsWith("mailto:jean@duka.ch,marie@sanitaire.ch?")).toBe(true);
  });

  it("encode les accents et les retours à la ligne", () => {
    /* Un accent non encodé coupe le corps du message au premier caractère
       fautif, sans rien dire. */
    expect(lien).toContain("%0A");
    expect(lien).not.toMatch(/[éèàç]/);
  });

  it("n'écrit jamais l'espace en « + » — les clients l'affichent tel quel", () => {
    const q = lien.slice(lien.indexOf("?") + 1);
    expect(q).not.toContain("+");
    expect(q).toContain("%20");
  });

  it("se passe de destinataire sans casser le lien", () => {
    const vide = lienMailto(redigerRelance(projet, destinataireRelance("Grossistes", {})));
    expect(vide.startsWith("mailto:?")).toBe(true);
  });
});
