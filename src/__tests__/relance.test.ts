import { describe, it, expect } from "vitest";
import {
  destinataireRelance, redigerRelance, lienMailto, dateSuisse, salutation,
  relanceApplicable, nettoyerLieu, etatRelance, correspondAuFiltre, redigerRelanceDevis,
  type ContactsDuProjet, type ProjetARelancer,
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

describe("suivi des relances", () => {
  const AUJ = "2026-10-13";

  it("réunit la date de Notion et le compte de l'application", () => {
    /* Notion ne garde que la dernière date ; l'historique de l'app compte. */
    expect(etatRelance("2026-10-08", ["2026-09-20", "2026-10-08"]))
      .toEqual({ derniere: "2026-10-08", nombre: 2 });
  });

  it("compte au moins une relance si Notion en porte une que l'app ignore", () => {
    /* Date saisie à la main dans Notion, ou historique perdu : le dossier a
       bien été relancé, et le dire « jamais relancé » serait pire que de le
       compter une fois. */
    expect(etatRelance("2026-10-08", [])).toEqual({ derniere: "2026-10-08", nombre: 1 });
  });

  it("retient la plus récente des deux sources", () => {
    expect(etatRelance("2026-09-01", ["2026-10-08"]).derniere).toBe("2026-10-08");
    expect(etatRelance("2026-10-12", ["2026-09-01"]).derniere).toBe("2026-10-12");
  });

  it("supporte une date Notion horodatée", () => {
    expect(etatRelance("2026-10-08T00:00:00.000+02:00", []).derniere).toBe("2026-10-08");
  });

  it("dit « jamais » quand les deux sources sont vides", () => {
    expect(etatRelance(null, [])).toEqual({ derniere: "", nombre: 0 });
  });

  const jamais = etatRelance(null, []);
  const uneFois = etatRelance("2026-10-11", ["2026-10-11"]);
  const ancienne = etatRelance("2026-09-01", ["2026-09-01"]);
  const deuxFois = etatRelance("2026-10-12", ["2026-09-20", "2026-10-12"]);

  it("sans filtre, tout passe", () => {
    for (const e of [jamais, uneFois, deuxFois]) {
      expect(correspondAuFiltre(e, "", AUJ)).toBe(true);
    }
  });

  it("sépare les jamais relancés des déjà relancés", () => {
    expect(correspondAuFiltre(jamais, "jamais", AUJ)).toBe(true);
    expect(correspondAuFiltre(uneFois, "jamais", AUJ)).toBe(false);
    expect(correspondAuFiltre(uneFois, "deja", AUJ)).toBe(true);
    expect(correspondAuFiltre(jamais, "deja", AUJ)).toBe(false);
  });

  it("isole ceux qu'on a relancés plus d'une fois", () => {
    expect(correspondAuFiltre(deuxFois, "plusieurs", AUJ)).toBe(true);
    expect(correspondAuFiltre(uneFois, "plusieurs", AUJ)).toBe(false);
  });

  it("compte les jours depuis la DERNIÈRE relance", () => {
    expect(correspondAuFiltre(ancienne, "j30", AUJ)).toBe(true);   // 42 jours
    expect(correspondAuFiltre(ancienne, "j7", AUJ)).toBe(true);
    expect(correspondAuFiltre(uneFois, "j7", AUJ)).toBe(false);    // 2 jours
    expect(correspondAuFiltre(deuxFois, "j14", AUJ)).toBe(false);  // 1 jour
  });

  it("n'attend pas de réponse d'un dossier jamais relancé", () => {
    /* Il n'attend pas une réponse mais un PREMIER courrier, et il a son
       propre filtre. L'y mêler ferait dire « sans réponse depuis 30 jours »
       à des dossiers qu'on n'a jamais écrits. */
    for (const f of ["j7", "j14", "j30"] as const) {
      expect(correspondAuFiltre(jamais, f, AUJ)).toBe(false);
    }
  });
});

describe("redigerRelanceDevis", () => {
  const devis = {
    nr: "TM-2500471", titre: "Dutoit CombiTec SA - Cherbe Sandy, Ch. Ancienne Forge 2",
    date: "2025-09-20", total: 1611,
    nomChantier: "Cherbe Sandy", adresseChantier: "Ch. Ancienne Forge 2, 1040 Villars-le-Terroir Vaud, Suisse",
    dateMesures: "2025-09-24", nbCabines: 1, typeClient: "Grossistes", ofrGrossiste: "01020900",
  };
  const dest = destinataireRelance("Grossistes", { grossiste: [jean] });
  const m = redigerRelanceDevis(devis, dest);

  it("ne parle JAMAIS de facture — rien n'a encore été fait", () => {
    /* Le mot « facture » devant un client qui hésite encore le fait fuir. */
    expect(m.corps.toLowerCase()).not.toContain("factur");
    expect(m.corps.toLowerCase()).not.toContain("frais");
    expect(m.corps).not.toContain("numéro de commande");
  });

  it("rappelle le devis et sa date d'envoi", () => {
    expect(m.corps).toContain("notre devis TM-2500471 du 20.09.2025");
    expect(m.corps).toContain("pas encore eu de retour");
  });

  it("rouvre la conversation plutôt que de réclamer un oui", () => {
    expect(m.corps).toContain("où en est votre réflexion");
    expect(m.corps).toContain("une variante ou une adaptation");
  });

  it("fait du relevé déjà pris un argument de vente", () => {
    expect(m.corps).toContain("Le relevé de mesures ayant déjà été effectué le 24.09.2025 (1 cabine)");
    expect(m.corps).toContain("prêt à être lancé dès réception de votre accord");
  });

  it("se tait sur le relevé quand le devis est établi sur plan", () => {
    const sansReleve = redigerRelanceDevis({ ...devis, dateMesures: null }, dest);
    expect(sansReleve.corps).not.toContain("relevé de mesures");
  });

  it("porte la référence du grossiste, objet compris", () => {
    expect(m.objet).toContain("devis TM-2500471");
    expect(m.objet).toContain("votre réf. 01020900");
    expect(m.corps).toContain("(votre référence 01020900)");
  });

  it("nettoie l'adresse comme ailleurs", () => {
    expect(m.objet).toBe("Relance — devis TM-2500471 · votre réf. 01020900 — Cherbe Sandy, 1040 Villars-le-Terroir");
    expect(m.corps).not.toContain("Suisse");
  });

  it("tient debout sans dossier Notion : il ne reste que bexio", () => {
    const nu = redigerRelanceDevis(
      { nr: "TM-9999", titre: "Hôtel Aulac, Pl. de la Navigation 4, 1006 Lausanne", date: "2026-05-02" },
      destinataireRelance("", { autres: [marie] }),
    );
    expect(nu.corps).toContain("notre devis TM-9999 du 02.05.2026");
    expect(nu.objet).toContain("Hôtel Aulac");
    expect(nu.corps).not.toContain("undefined");
  });

  it("ne signe pas davantage que l'autre courrier", () => {
    expect(m.corps).not.toContain("TM Douche Montage");
    expect(m.corps.trimEnd().endsWith("excellente journée.")).toBe(true);
  });
});
