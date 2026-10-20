/**
 * Le moteur de recherche de l'assistant IA (sans réseau). Les essais sur les
 * données Notion réelles se font à part, en lecture seule.
 */
import { describe, it, expect } from "vitest";
import { normaliserTelephone, telephonesDans, afficherTelephone, telephonesVoisins } from "@/lib/recherche-ia/telephone";
import { analyserQuestion, chercher, preparer, normaliser, type DocRecherche } from "@/lib/recherche-ia/moteur";
import { pageEnDocument } from "@/lib/recherche-ia/index-notion";
import { reponseTelephone } from "@/lib/recherche-ia/reponses";

describe("téléphones : une seule forme pour toutes les écritures", () => {
  it.each(["079 123 45 67", "0791234567", "+41 79 123 45 67", "+41791234567", "0041 79 123 45 67", "+41 (0)79 123 45 67", "079/123.45.67"])(
    "%s → +41791234567", (s) => expect(normaliserTelephone(s)).toBe("+41791234567"));
  it("refuse ce qui n'est pas un numéro", () => {
    expect(normaliserTelephone("2026-10-20")).toBeNull();
    expect(normaliserTelephone("TM-2600825")).toBeNull();
  });
  it("trouve les numéros dans un texte libre", () => {
    expect(telephonesDans("Appeler M. Rossier au 079 123 45 67 ou 021/444.55.66 avant 8h").sort())
      .toEqual(["+41214445566", "+41791234567"]);
  });
  it("affiche à la suisse, et repère le chiffre de différence", () => {
    expect(afficherTelephone("+41788185556")).toBe("078 818 55 56");
    expect(telephonesVoisins("+41768185556", "+41788185556")).toBe(true);
    expect(telephonesVoisins("+41768185556", "+41788185557")).toBe(false);
  });
});

const contact = (id: string, titre: string, extra: Partial<DocRecherche> = {}): DocRecherche => ({
  id, source: "Contacts", titre, champs: [], tels: [], emails: [], liens: [], ...extra,
});
const thierry = contact("c1", "Thierry Jacquaz", {
  tels: [{ e164: "+41788185556", colonne: "Portable" }], emails: ["thierry@exemple.ch"],
  champs: [["Poste", "Fondateur"]], liens: ["e1"],
});
const societe: DocRecherche = { id: "e1", source: "Entreprises", titre: "T. Jacquaz Sanitech", champs: [["Étiquettes", "Sanitaires"]], tels: [], emails: [], liens: ["c1", "p1"] };
const projet: DocRecherche = {
  id: "p1", source: "Projets", titre: "TM-2600797 — Dubat Yverdon - Elezov, Rte. de Premier 1 à 1337 Vallorbe",
  champs: [["Adresse du chantier", "Rte. de Premier 1, 1337 Vallorbe"], ["Collaborateurs", "Claudio & Jacobo"], ["Contacts pour RDV", "M. Elezov 079 111 22 33"]],
  tels: [{ e164: "+41791112233", colonne: "Contacts pour RDV" }], emails: [], liens: ["e1"], refs: ["2600797", "00970216"],
};
const index = preparer([thierry, societe, projet, contact("c2", "Jean Rossier")]);

describe("moteur de recherche", () => {
  it("un numéro, quelle que soit son écriture → la bonne fiche, EXACT", () => {
    for (const q of ["à qui appartient le 078 818 55 56 ?", "+41788185556", "0041 78 818 55 56", "0788185556"]) {
      const r = chercher(index, analyserQuestion(q));
      expect(r[0].doc.id, q).toBe("c1");
      expect(r[0].exact).toBe(true);
    }
  });
  it("un chiffre de différence → APPROCHÉ, jamais exact", () => {
    const r = chercher(index, analyserQuestion("à qui appartient le 076 818 55 56 ?"));
    expect(r[0].doc.id).toBe("c1");
    expect(r[0].exact).toBe(false);
    expect(r[0].approche).toBe(true);
    expect(r[0].voisin).toEqual({ demande: "+41768185556", trouve: "+41788185556" });
  });
  it("nom dans le désordre, sans majuscules ni accents", () => {
    expect(chercher(index, analyserQuestion("le contact jacquaz thierry"))[0].doc.id).toBe("c1");
    expect(normaliser("Étiquettes — Sanitaires")).toBe("etiquettes sanitaires");
  });
  it("référence de projet avec ou sans séparateurs, numéro de commande", () => {
    for (const q of ["TM-2600797", "tm 2600797", "TM2600797", "où en est la commande 00970216 ?"]) {
      const r = chercher(index, analyserQuestion(q));
      expect(r[0].doc.id, q).toBe("p1");
      expect(r[0].exact).toBe(true);
    }
  });
  it("un chantier par son adresse, une intervention par son collaborateur", () => {
    expect(chercher(index, analyserQuestion("le chantier rte de premier vallorbe"))[0].doc.id).toBe("p1");
    expect(chercher(index, analyserQuestion("les chantiers de Jacobo")).map((r) => r.doc.id)).toContain("p1");
  });
  it("un numéro noté sur un dossier", () => {
    const r = chercher(index, analyserQuestion("qui est le 079 111 22 33"));
    expect(r[0].doc.id).toBe("p1");
  });
  it("rien qui ressemble → rien", () => {
    expect(chercher(index, analyserQuestion("Zwingli Oberholzer"))).toEqual([]);
    expect(chercher(index, analyserQuestion("qui est le 021 999 88 77"))).toEqual([]);
  });
});

describe("réponses directes aux questions de numéro", () => {
  const ctx = {
    couverture: "Contacts : 4 fiches · Projets : 1 dossiers", nonLues: [] as string[], voitCarnet: true,
    dossiersDe: (d: DocRecherche) => (d.id === "c1" || d.id === "e1" ? [projet] : []),
    resoudre: (id: string) => [thierry, societe, projet].find((d) => d.id === id),
  };
  it("une fiche : « appartient à … enregistré dans la base Contacts », entreprise reliée", () => {
    const q = analyserQuestion("à qui appartient le 0788185556");
    const t = reponseTelephone(q.telephones, chercher(index, q), ctx);
    expect(t).toMatch(/appartient à \*\*Thierry Jacquaz\*\*, enregistré dans la base Contacts/);
    expect(t).toMatch(/T\. Jacquaz Sanitech/);
    expect(t).toMatch(/Fondateur/);
  });
  it("un chiffre de différence : dit que le numéro exact n'existe pas", () => {
    const q = analyserQuestion("076 818 55 56");
    const t = reponseTelephone(q.telephones, chercher(index, q), ctx);
    expect(t).toMatch(/Aucune fiche ne porte exactement le \*\*076 818 55 56\*\*/);
    expect(t).toMatch(/un seul chiffre diffère/);
    expect(t).toMatch(/078 818 55 56.*Thierry Jacquaz/);
  });
  it("deux fiches sur le même numéro : aucun propriétaire choisi", () => {
    const doublon = preparer([thierry, contact("c9", "Anne Jacquaz", { tels: [{ e164: "+41788185556", colonne: "Téléphone" }] })]);
    const q = analyserQuestion("0788185556");
    const t = reponseTelephone(q.telephones, chercher(doublon, q), ctx);
    expect(t).toMatch(/figure sur \*\*2 fiches\*\*/);
    expect(t).not.toMatch(/appartient à/);
  });
  it("rien trouvé, mais une source non lue : ne conclut pas", () => {
    const q = analyserQuestion("021 999 88 77");
    const t = reponseTelephone(q.telephones, chercher(index, q), { ...ctx, nonLues: ["Contacts"] });
    expect(t).toMatch(/nulle part/);
    expect(t).toMatch(/je ne peux pas affirmer/);
  });
});

describe("une page Notion → un document (sans l'argent)", () => {
  it("garde les colonnes utiles, les numéros de toutes formes, écarte l'argent", () => {
    const d = pageEnDocument({ id: "aa-bb", last_edited_time: "2026-10-20T10:00:00Z", properties: {
      "Prénom et nom": { type: "title", title: [{ plain_text: "Thierry Jacquaz" }] },
      Portable: { type: "phone_number", phone_number: "+41 78 818 55 56" },
      Remarque: { type: "rich_text", rich_text: [{ plain_text: "Fixe atelier 024/441.22.33" }] },
      Poste: { type: "select", select: { name: "Fondateur" } },
      "Rabais cabines": { type: "number", number: 12 },
      "Mail de facturations": { type: "email", email: "compta@exemple.ch" },
      Entreprise: { type: "relation", relation: [{ id: "e1-xx" }] },
      Photo: { type: "files", files: [{ name: "x.jpg" }] },
    } }, "base")!;
    expect(d.id).toBe("aabb");
    expect(d.tels.map((t) => t.e164).sort()).toEqual(["+41244412233", "+41788185556"]);
    expect(d.liens).toEqual(["e1xx"]);
    expect(d.champs).toContainEqual(["Poste", "Fondateur"]);
    expect(JSON.stringify(d)).not.toMatch(/compta@|Rabais|12\b/);
  });
});
