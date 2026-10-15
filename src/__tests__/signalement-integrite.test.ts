import { describe, it, expect } from "vitest";
import {
  empreinteSignalement, rejeuDe, pierreTombaleDe, purgerPierresTombales,
  doublonsAvere, FENETRE_REJEU_MS, DUREE_PIERRE_TOMBALE_MS,
  type SoumissionSignalement, type PierreTombale,
} from "@/lib/signalement-integrite";

/**
 * UN SIGNALEMENT CRÉÉ = UN SEUL SIGNALEMENT ENREGISTRÉ.
 *
 * Le 15 octobre 2026, un constat de Jean-Marc s'est inscrit douze fois, et
 * en effacer un en faisait revenir un autre. Ces tests reprennent le trajet
 * réel d'un signalement — envoi coupé, file qui rejoue, téléphone resté sur
 * l'ancienne version, suppression — et vérifient qu'à chaque étape le compte
 * est celui des actions, pas celui des tentatives.
 */

const T0 = Date.parse("2026-10-15T12:00:00Z");
const PHOTOS = ["https://res.cloudinary.com/a/1.jpg", "https://res.cloudinary.com/a/2.jpg"];

const envoi = (p: Partial<SoumissionSignalement> = {}): SoumissionSignalement => ({
  projectId: "projet-A",
  user: "Jean-Marc Nelzi",
  description: "Aimant cassé",
  types: ["usine"],
  photoUrls: PHOTOS,
  timestamp: T0,
  ...p,
});

describe("reconnaître le même envoi", () => {
  it("rend le même enregistrement quand l'identifiant revient", () => {
    const deja = [envoi({ id: "abc" })];
    const r = rejeuDe(deja, envoi({ id: "abc", timestamp: T0 + 60_000 }), T0 + 60_000);
    expect(r?.motif).toBe("identifiant");
  });

  it("reconnaît un rejeu par l'identifiant même des jours plus tard", () => {
    const deja = [envoi({ id: "abc" })];
    const tard = T0 + 10 * 24 * 3600_000;
    expect(rejeuDe(deja, envoi({ id: "abc" }), tard)?.motif).toBe("identifiant");
  });

  it("LE CAS RÉEL : un ancien téléphone, sans identifiant, qui rejoue", () => {
    /* Douze inscriptions pour un constat : la file rejouait, et rien côté
       serveur ne permettait de reconnaître la même demande. */
    const deja = [envoi({ id: "htv6y9eq34" })];
    const rejeu = envoi({ id: undefined, timestamp: T0 + 3 * 3600_000 });
    const r = rejeuDe(deja, rejeu, T0 + 3 * 3600_000);
    expect(r?.motif).toBe("photos-identiques");
  });

  it("des photos identiques trahissent le même envoi, même très vieux", () => {
    const deja = [envoi({ id: "abc" })];
    const tard = T0 + 30 * 24 * 3600_000;
    expect(rejeuDe(deja, envoi({ id: undefined }), tard)?.motif).toBe("photos-identiques");
  });

  it("un envoi sans photo est reconnu sur son contenu, dans la fenêtre", () => {
    const deja = [envoi({ id: "abc", photoUrls: [] })];
    const dans = T0 + FENETRE_REJEU_MS - 1000;
    expect(rejeuDe(deja, envoi({ id: undefined, photoUrls: [] }), dans)?.motif).toBe("contenu-recent");
  });

  it("… et plus au-delà : passé deux heures, c'est un nouveau constat", () => {
    const deja = [envoi({ id: "abc", photoUrls: [] })];
    const apres = T0 + FENETRE_REJEU_MS + 1000;
    expect(rejeuDe(deja, envoi({ id: undefined, photoUrls: [] }), apres)).toBeNull();
  });
});

describe("ne JAMAIS confondre deux constats légitimes", () => {
  it("garde les deux quand un monteur saisit deux fois, avec ses propres photos", () => {
    /* Deux douches, le même aimant cassé : deux envois, deux séries de
       photos, deux signalements. */
    const deja = [envoi({ id: "un" })];
    const second = envoi({
      id: "deux",
      photoUrls: ["https://res.cloudinary.com/a/9.jpg"],
      timestamp: T0 + 60_000,
    });
    expect(rejeuDe(deja, second, T0 + 60_000)).toBeNull();
  });

  it("garde les deux quand les lots diffèrent", () => {
    const deja = [envoi({ id: "un", cabineIdx: 1, photoUrls: [] })];
    const autre = envoi({ id: undefined, cabineIdx: 2, photoUrls: [] });
    expect(rejeuDe(deja, autre, T0 + 1000)).toBeNull();
  });

  it("garde les deux quand un client à jour renvoie un identifiant neuf", () => {
    /* Une version à jour envoie TOUJOURS un identifiant : la règle « contenu
       récent » ne s'applique pas à elle, et une saisie volontairement
       répétée est conservée. */
    const deja = [envoi({ id: "un", photoUrls: [] })];
    const second = envoi({ id: "deux", photoUrls: [], timestamp: T0 + 60_000 });
    expect(rejeuDe(deja, second, T0 + 60_000)).toBeNull();
  });

  it("ne confond pas deux projets différents", () => {
    const deja = [envoi({ id: "un" })];
    expect(rejeuDe(deja, envoi({ id: undefined, projectId: "projet-B" }), T0)).toBeNull();
  });
});

describe("une suppression tient", () => {
  const tombe = (p: Partial<PierreTombale> = {}): PierreTombale => ({
    id: "abc",
    empreinte: empreinteSignalement(envoi({ id: "abc" })),
    quand: T0,
    par: "Micael",
    ...p,
  });

  it("refuse de recréer un signalement effacé, par son identifiant", () => {
    expect(pierreTombaleDe([tombe()], envoi({ id: "abc" }))).not.toBeNull();
  });

  it("LE CAS RÉEL : la file rejoue APRÈS la suppression, sans identifiant", () => {
    /* C'est ce qui faisait monter le compteur pendant que Micael
       supprimait : la demande revenait, et plus rien ne s'y opposait. */
    expect(pierreTombaleDe([tombe()], envoi({ id: undefined }))).not.toBeNull();
  });

  it("ne bloque PAS un constat neuf sur le même chantier", () => {
    const neuf = envoi({ id: "autre", photoUrls: ["https://res.cloudinary.com/a/9.jpg"] });
    expect(pierreTombaleDe([tombe()], neuf)).toBeNull();
  });

  it("ne bloque pas un envoi sans photo sur la seule ressemblance du texte", () => {
    /* Sans photo, l'empreinte ne prouve rien : on laisse passer plutôt que
       de perdre un constat légitime. */
    const t = tombe({ id: "x", empreinte: empreinteSignalement(envoi({ photoUrls: [] })) });
    expect(pierreTombaleDe([t], envoi({ id: undefined, photoUrls: [] }))).toBeNull();
  });

  it("oublie les suppressions trop vieilles pour être rejouées", () => {
    const vieille = tombe({ quand: T0 - DUREE_PIERRE_TOMBALE_MS - 1000 });
    expect(purgerPierresTombales([vieille, tombe()], T0)).toHaveLength(1);
  });
});

describe("empreinteSignalement", () => {
  it("ignore l'ordre des photos et les espaces en trop", () => {
    const a = envoi({ photoUrls: [PHOTOS[0], PHOTOS[1]], description: "Aimant cassé" });
    const b = envoi({ photoUrls: [PHOTOS[1], PHOTOS[0]], description: "  Aimant   cassé " });
    expect(empreinteSignalement(a)).toBe(empreinteSignalement(b));
  });

  it("ignore l'identifiant et l'heure — ce qui change à chaque rejeu", () => {
    expect(empreinteSignalement(envoi({ id: "un", timestamp: 1 })))
      .toBe(empreinteSignalement(envoi({ id: "deux", timestamp: 2 })));
  });

  it("distingue deux lots", () => {
    expect(empreinteSignalement(envoi({ cabineIdx: 1 })))
      .not.toBe(empreinteSignalement(envoi({ cabineIdx: 2 })));
  });
});

describe("doublonsAvere — pour un audit, jamais pour effacer tout seul", () => {
  it("retrouve les douze inscriptions du chantier Costa SA", () => {
    const liste = Array.from({ length: 12 }, (_, i) =>
      envoi({ id: `id-${i}`, timestamp: T0 + i * 60_000 }));
    const g = doublonsAvere(liste);
    expect(g).toHaveLength(1);
    expect(g[0].original.id).toBe("id-0");
    expect(g[0].rejeux).toHaveLength(11);
  });

  it("désigne le PLUS ANCIEN comme l'original", () => {
    const liste = [
      envoi({ id: "tard", timestamp: T0 + 5000 }),
      envoi({ id: "tot", timestamp: T0 }),
    ];
    expect(doublonsAvere(liste)[0].original.id).toBe("tot");
  });

  it("ne regroupe pas deux constats aux photos différentes", () => {
    const liste = [
      envoi({ id: "un" }),
      envoi({ id: "deux", photoUrls: ["https://res.cloudinary.com/a/9.jpg"] }),
    ];
    expect(doublonsAvere(liste)).toHaveLength(0);
  });

  it("laisse tranquilles les signalements sans photo : on ne peut pas trancher", () => {
    const liste = [
      envoi({ id: "un", photoUrls: [] }),
      envoi({ id: "deux", photoUrls: [] }),
    ];
    expect(doublonsAvere(liste)).toHaveLength(0);
  });
});

/**
 * Le cycle complet, tel qu'il se déroule sur un chantier.
 *
 * On rejoue la suite exacte qui a produit les douze inscriptions, puis la
 * suite que Micael a vécue en essayant de nettoyer, et on compte à chaque
 * étape. Le nombre doit suivre les ACTIONS, jamais les tentatives.
 */
describe("cycle de vie d'un signalement", () => {
  const PH = ["https://res.cloudinary.com/x/a.jpg"];
  const soumission = (p: Partial<SoumissionSignalement> = {}): SoumissionSignalement => ({
    id: "sig-1", projectId: "P", user: "Jean-Marc", description: "Aimant cassé",
    types: ["usine"], photoUrls: PH, ...p,
  });

  /** Le serveur, réduit à ce qui nous intéresse ici. */
  function serveur() {
    let liste: SoumissionSignalement[] = [];
    let tombes: PierreTombale[] = [];
    return {
      get n() { return liste.length; },
      poster(s: SoumissionSignalement, t: number) {
        if (rejeuDe(liste, { ...s, timestamp: t }, t)) return "deja";
        if (pierreTombaleDe(tombes, s)) return "supprime";
        liste.push({ ...s, timestamp: t });
        return "cree";
      },
      effacer(id: string, t: number) {
        const v = liste.find((x) => x.id === id);
        if (!v) return;
        liste = liste.filter((x) => x.id !== id);
        tombes = [...tombes, { id, empreinte: empreinteSignalement(v), quand: t }];
      },
      modifier(id: string, desc: string) {
        const i = liste.findIndex((x) => x.id === id);
        if (i >= 0) liste[i] = { ...liste[i], description: desc };
      },
    };
  }

  it("création → trois rejeux → une seule ligne", () => {
    const s = serveur();
    expect(s.poster(soumission(), T0)).toBe("cree");
    expect(s.poster(soumission(), T0 + 25_000)).toBe("deja");
    expect(s.poster(soumission(), T0 + 180_000)).toBe("deja");
    expect(s.n).toBe(1);
  });

  it("l'ancien téléphone, sans identifiant, ne crée pas non plus de doublon", () => {
    const s = serveur();
    s.poster(soumission(), T0);
    expect(s.poster(soumission({ id: undefined }), T0 + 3600_000)).toBe("deja");
    expect(s.n).toBe(1);
  });

  it("modifier ne crée rien", () => {
    const s = serveur();
    s.poster(soumission(), T0);
    s.modifier("sig-1", "Aimant cassé — remplacé");
    expect(s.n).toBe(1);
  });

  it("LE CAS DE MICAEL : supprimer, puis la file rejoue — rien ne revient", () => {
    const s = serveur();
    s.poster(soumission(), T0);
    s.effacer("sig-1", T0 + 1000);
    expect(s.n).toBe(0);
    expect(s.poster(soumission(), T0 + 2000)).toBe("supprime");
    expect(s.poster(soumission({ id: undefined }), T0 + 5000)).toBe("supprime");
    expect(s.n).toBe(0);
  });

  it("le cycle entier : créer, rejouer, modifier, synchroniser, supprimer, rejouer", () => {
    const s = serveur();
    s.poster(soumission(), T0);                       expect(s.n).toBe(1);
    s.poster(soumission(), T0 + 25_000);              expect(s.n).toBe(1);
    s.modifier("sig-1", "Aimant cassé — pièce commandée");
    s.poster(soumission(), T0 + 60_000);              expect(s.n).toBe(1);
    s.effacer("sig-1", T0 + 90_000);                  expect(s.n).toBe(0);
    s.poster(soumission(), T0 + 120_000);             expect(s.n).toBe(0);
  });

  it("un constat vraiment nouveau passe toujours, même après un ménage", () => {
    const s = serveur();
    s.poster(soumission(), T0);
    s.effacer("sig-1", T0 + 1000);
    const neuf = soumission({ id: "sig-2", photoUrls: ["https://res.cloudinary.com/x/z.jpg"] });
    expect(s.poster(neuf, T0 + 2000)).toBe("cree");
    expect(s.n).toBe(1);
  });

  it("LES DOUCHES 13 À 16 : quatre cabines, quatre constats, tous conservés", () => {
    /* Relevé réel du 13 septembre 2026 sur TL Lausanne V3 : même texte
       « Percement des trous du mauvais côté », à deux minutes d'intervalle,
       une photo chacun. Ce sont quatre douches, pas quatre doublons — et
       c'est précisément ce qu'une détection trop zélée détruirait. */
    const s = serveur();
    const lots = [13, 14, 15, 16];
    lots.forEach((n, i) => {
      const r = s.poster(soumission({
        id: `lot-${n}`,
        user: "Micael Ferreira",
        description: "Percement des trous du mauvais côté",
        cabineLabel: `Douche ${n}`,
        photoUrls: [`https://res.cloudinary.com/x/photo-${n}.jpg`],
      }), T0 + i * 120_000);
      expect(r, `Douche ${n}`).toBe("cree");
    });
    expect(s.n).toBe(4);
    expect(doublonsAvere([])).toHaveLength(0);
  });
});
