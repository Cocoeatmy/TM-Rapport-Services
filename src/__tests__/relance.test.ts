import { describe, it, expect } from "vitest";
import {
  destinataireRelance, redigerRelance, lienMailto, dateSuisse, salutation,
  relanceApplicable, nettoyerLieu, type ContactsDuProjet, type ProjetARelancer,
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
  it("n'essaie pas de deviner le prénom", () => {
    /* Les fiches ne tiennent pas le même ordre : « Dylan Emonin » à côté
       d'« Oppizzi Sylvain ». Le premier échantillon réel donnait « Bonjour
       Dylan et Oppizzi » — adressé au client, c'est pire qu'un « Bonjour »
       tout court. */
    expect(salutation([{ name: "Dylan Emonin", email: "a@b.ch" },
                       { name: "Oppizzi Sylvain", email: "c@d.ch" }])).toBe("Bonjour,");
    expect(salutation([jean])).toBe("Bonjour,");
    expect(salutation([])).toBe("Bonjour,");
  });
});

describe("nettoyerLieu", () => {
  it("retire le pays, de trop entre Suisses", () => {
    expect(nettoyerLieu("Rue Jacques-Gachoud, 1700 Fribourg, Suisse"))
      .toBe("Rue Jacques-Gachoud, 1700 Fribourg");
  });

  it("retire le canton qui suit la localité", () => {
    expect(nettoyerLieu("Rue des Alpes 9, 1023 Crissier Vaud, Suisse"))
      .toBe("Rue des Alpes 9, 1023 Crissier");
  });

  it("garde une ville qui porte le nom de son canton", () => {
    /* « 1700 Fribourg » : Fribourg est ici la VILLE. La retirer laisserait
       une adresse sans localité. */
    expect(nettoyerLieu("1700 Fribourg, Suisse")).toBe("1700 Fribourg");
    expect(nettoyerLieu("Rte. de Berne 9, 1700 Fribourg")).toBe("Rte. de Berne 9, 1700 Fribourg");
  });

  it("laisse intacte une adresse déjà propre", () => {
    expect(nettoyerLieu("Ch. du Lac 4, 1800 Vevey")).toBe("Ch. du Lac 4, 1800 Vevey");
  });

  it("supporte le vide", () => {
    expect(nettoyerLieu(null)).toBe("");
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

  it("nomme le chantier et son adresse dans le corps", () => {
    const m = redigerRelance(
      { ...projet, nomChantier: "Villa Rossi", adresseChantier: "Ch. du Lac 4, 1800 Vevey Vaud, Suisse" },
      destinataireRelance("Grossistes", { grossiste: [jean] }),
    );
    expect(m.corps).toContain("Villa Rossi, Ch. du Lac 4, 1800 Vevey");
    expect(m.corps).not.toContain("Suisse");
  });

  it("garde un objet court : la localité, pas l'adresse entière", () => {
    /* L'objet complet dépassait la centaine de caractères et se faisait
       couper en plein milieu de l'adresse. */
    const m = redigerRelance(
      { ...projet, nomChantier: "Villa Rossi", adresseChantier: "Ch. du Lac 4, 1800 Vevey Vaud, Suisse" },
      destinataireRelance("Grossistes", { grossiste: [jean] }),
    );
    expect(m.objet).toBe("Relance — offre TM-2600975 — Villa Rossi, 1800 Vevey");
  });

  it("tronque un nom de chantier à rallonge plutôt que de laisser filer l'objet", () => {
    const m = redigerRelance(
      { ...projet, nomChantier: "Scala - îlot Gachoud Lot I.01 & K.01 bâtiment nord entrée B", adresseChantier: "1700 Fribourg, Suisse" },
      destinataireRelance("Grossistes", { grossiste: [jean] }),
    );
    expect(m.objet.length).toBeLessThan(100);
    expect(m.objet).toContain("…");
  });

  it("tient debout sans date d'offre — quatre dossiers sur quatre-vingt-onze", () => {
    const m = redigerRelance({ ...projet, dateOffre: null }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).toContain("est restée sans réponse");
    expect(m.corps).not.toContain("du ,");
  });

  it("tait la date du relevé plutôt que d'en annoncer une vide", () => {
    const m = redigerRelance({ ...projet, dateMesures: null }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).not.toContain("Le relevé de mesures a été effectué");
    /* La proposition de commander le seul relevé, elle, tient toujours : le
       déplacement a bien eu lieu, même sans date au dossier. */
    expect(m.corps).toContain("uniquement le service de relevé de mesures");
  });

  it("ne signe pas : la messagerie ajoute déjà la signature maison", () => {
    /* Deux signatures l'une sous l'autre font plus négligé qu'aucune. */
    expect(mail.corps).not.toContain("TM Douche Montage");
    expect(mail.corps).not.toContain("douche-montage.ch");
    expect(mail.corps.trimEnd().endsWith("En vous remerciant par avance,")).toBe(true);
  });

  it("demande au GROSSISTE un numéro de commande pour le seul relevé", () => {
    /* Il émet des commandes, c'est son métier : il peut le faire dans la
       foulée sans rien décider d'autre. */
    expect(mail.corps).toContain("Si ces 3 cabines n'ont finalement pas été commandées par votre client");
    expect(mail.corps).toContain("uniquement le service de relevé de mesures");
  });

  it("accorde la phrase au nombre de cabines", () => {
    const une = redigerRelance({ ...projet, nbCabines: 1 }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(une.corps).toContain("Si cette cabine n'a finalement pas été commandée");
    const zero = redigerRelance({ ...projet, nbCabines: 0 }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(zero.corps).toContain("Si les cabines n'ont finalement pas été commandées");
  });

  it("ne réclame AUCUN numéro aux autres types — beaucoup n'en émettent pas", () => {
    for (const type of ["Sanitaires", "Client finaux", "Architecte", "Gérances Immo"]) {
      const m = redigerRelance({ ...projet, typeClient: type, nbCabines: 1 },
        destinataireRelance(type, { grossiste: [jean] }));
      expect(m.corps, type).not.toContain("numéro de commande");
      expect(m.corps, type).toContain("si cette cabine a été ou sera commandée");
      expect(m.corps, type).toContain("patienter, ou clore le dossier");
    }
  });

  it("ne pose la question qu'une fois", () => {
    /* « Quelle suite donnez-vous à ce dossier ? » en plus du paragraphe
       ci-dessus faisait deux demandes pour une. */
    expect(mail.corps).not.toContain("la suite que vous souhaitez donner");
    expect((mail.corps.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
  });
});

describe("référence du grossiste", () => {
  const avecRef: ProjetARelancer = { ...projet, typeClient: "Grossistes", ofrGrossiste: "01020900" };

  it("porte le N° OFR Grossiste dans le corps et dans l'objet", () => {
    /* C'est par ce numéro que le grossiste retrouve l'affaire dans SON
       système ; le nôtre ne lui dit rien. */
    const m = redigerRelance(avecRef, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).toContain("référencée chez vous sous 01020900");
    expect(m.objet).toContain("votre réf. 01020900");
  });

  it("se passe d'incise quand le champ est vide — 27 grossistes sur 34", () => {
    const m = redigerRelance({ ...projet, ofrGrossiste: "" }, destinataireRelance("Grossistes", { grossiste: [jean] }));
    expect(m.corps).not.toContain("référencée chez vous");
    expect(m.corps).toContain("du 02.09.2026, concernant");
    expect(m.objet).not.toContain("votre réf.");
  });

  it("ne sort que pour un grossiste", () => {
    const m = redigerRelance(
      { ...projet, typeClient: "Sanitaires", ofrGrossiste: "01020900" },
      destinataireRelance("Sanitaires", { sanitaire: [marie] }),
    );
    expect(m.corps).not.toContain("01020900");
    expect(m.objet).not.toContain("01020900");
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
