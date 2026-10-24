import { describe, it, expect } from "vitest";
import type { Project } from "@/lib/notion";
import { constatsSante, comparer, messageSante, lotsSansPhotoApres } from "@/lib/sante-hebdo";

const MAINTENANT = new Date("2026-10-26T06:00:00+01:00");
const f = (name: string) => ({ name, url: "https://x/" + name });

function projet(o: Partial<Project> & Record<string, unknown> = {}): Project {
  return {
    id: "aaaa-1", projet: "Villa Test", ofrTM: "TM-1", etatCMD: "Terminé", dateMontage: "2026-10-20",
    nbCabines: 1, typeServices: ["Montages"], rapportDeMontage: "A traiter",
    heureArrivee: "08:00", heureDepart: "11:00", collaborateurs: "Jacobo",
    photosMontage: [f("Montage centre.1.jpg")],
    ...o,
  } as unknown as Project;
}
const cats = (p: Project[], envoyes = new Set<string>()) => constatsSante(p, envoyes, MAINTENANT).map((c) => c.categorie);

describe("rapport non envoyé", () => {
  it("terminé depuis 2 jours, ni envoyé ni traité → signalé", () => {
    expect(cats([projet()])).toEqual(["rapport"]);
  });
  it("envoyé (journal ou trace serveur) ou « Rapport traité » → rien", () => {
    expect(cats([projet()], new Set(["aaaa1"]))).toEqual([]);
    expect(cats([projet({ rapportDeMontage: "Rapport traité" })])).toEqual([]);
  });
  it("moins de 2 jours, ou hors des 60 derniers jours → rien", () => {
    expect(cats([projet({ dateMontage: "2026-10-25" })])).toEqual([]);
    expect(cats([projet({ dateMontage: "2026-07-01" })])).toEqual([]);
  });
  it("mesures ou services seuls, ou annulé → rien", () => {
    expect(cats([projet({ typeServices: ["Mesures"] })])).toEqual([]);
    expect(cats([projet({ etatCMD: "Annulé" })])).toEqual([]);
  });
});

describe("photos d'après", () => {
  it("lot sans photo montage terminé, lots sous-traités exclus", () => {
    const p = projet({ nbCabines: 3, monteursSousTraitance: "Cab3:Sous-traitant SA",
      photosMontage: [f("Montage gauche.Cab1.1.jpg")] });
    expect(lotsSansPhotoApres(p)).toEqual([2]);
  });
  it("chantier simple sans photo", () => {
    expect(lotsSansPhotoApres(projet({ photosMontage: [] }))).toEqual([1]);
    expect(cats([projet({ photosMontage: [], rapportDeMontage: "Rapport traité" })])).toEqual(["photos"]);
  });
});

describe("heures et SAV", () => {
  it("heures manquantes sur un montage récent", () => {
    expect(cats([projet({ heureArrivee: "", rapportDeMontage: "Rapport traité" })])).toEqual(["heures"]);
  });
  it("SAV ouvert depuis plus d'un mois, quelle que soit la date de montage", () => {
    expect(cats([projet({ dateMontage: "2025-01-01", dateSAVRecu: "2026-09-01", etatSAV: "En cours" })])).toEqual(["sav"]);
    expect(cats([projet({ dateMontage: "2025-01-01", dateSAVRecu: "2026-10-10", etatSAV: "En cours" })])).toEqual([]);
    expect(cats([projet({ dateMontage: "2025-01-01", dateSAVRecu: "2026-09-01", savCloture: true })])).toEqual([]);
  });
});

describe("comparer et message", () => {
  const c = constatsSante([projet(), projet({ id: "bbbb-2", ofrTM: "TM-2", photosMontage: [] })], new Set(), MAINTENANT);
  it("nouveau, toujours ouvert, réglé", () => {
    const b = comparer(c, ["rapport:aaaa-1", "sav:zzzz"]);
    expect(b.toujours.map((x) => x.cle)).toEqual(["rapport:aaaa-1"]);
    expect(b.nouveaux.length).toBe(c.length - 1);
    expect(b.regles).toBe(1);
  });
  it("message lisible, lien vers la fiche, Telegram sous la limite", () => {
    const m = messageSante(comparer(c, []), "https://app.test");
    expect(m.html).toContain("https://app.test/projet/aaaa-1");
    expect(m.html).toContain("Rapports non envoyés au client");
    expect(m.telegram.length).toBeLessThanOrEqual(3950);
    const beaucoup = Array.from({ length: 300 }, (_, i) => projet({ id: `id-${i}`, ofrTM: `TM-${i}` }));
    const long = messageSante(comparer(constatsSante(beaucoup, new Set(), MAINTENANT), []), "https://app.test");
    expect(long.telegram.length).toBeLessThanOrEqual(3950);
    expect(long.telegram).toMatch(/voir l'e-mail|suite dans l'e-mail/);
  });
});
