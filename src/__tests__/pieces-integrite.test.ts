/**
 * TESTS E et F — les pièces manquantes ne doivent plus se multiplier.
 *
 * Les défauts ont reçu leurs protections après l'incident TM-2600825 ; les
 * pièces manquantes partageaient la même architecture sans partager la parade
 * (audit A3 du 17.10.2026). Ces tests vérifient que les deux listes se
 * comportent désormais à l'identique face aux mêmes mauvaises surprises.
 *
 * Ils portent sur les règles — `signalement-integrite` — et non sur la route :
 * ce sont elles qui décident, la route ne fait que les appliquer.
 */
import { describe, it, expect } from "vitest";
import {
  empreinteSignalement, rejeuDe, pierreTombaleDe, purgerPierresTombales,
  doublonsAvere, FENETRE_REJEU_MS, DUREE_PIERRE_TOMBALE_MS,
  type PierreTombale,
} from "../lib/signalement-integrite";

const MAINTENANT = Date.parse("2026-10-17T14:00:00Z");

/** Une pièce manquante telle que la route la range. */
function piece(p: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    projectId: "proj-825",
    projectName: "TM-2600825",
    user: "Miguel",
    description: "Profil mural manquant",
    reference: "PR-4421",
    photoUrls: [] as string[],
    status: "demande",
    timestamp: MAINTENANT,
    comments: [],
    ...p,
  };
}

describe("TEST E — rejouer une création n'en crée qu'une", () => {
  it("reconnaît le rejeu par identifiant", () => {
    const liste = [piece()];
    const r = rejeuDe(liste, piece({ timestamp: MAINTENANT + 30_000 }), MAINTENANT + 30_000);
    expect(r).not.toBeNull();
    expect(r?.existant.id).toBe("p1");
  });

  it("reconnaît le rejeu au contenu, même sans identifiant", () => {
    /* Le cas qui manquait aux pièces : un client qui n'envoie pas d'id.
       La requête aboutit côté serveur, le téléphone ne reçoit pas la
       confirmation, la file rejoue. */
    const liste = [piece()];
    const entrant = piece({ id: undefined, timestamp: MAINTENANT + 20_000 });
    const r = rejeuDe(liste, entrant, MAINTENANT + 20_000);
    expect(r).not.toBeNull();
  });

  it("reconnaît le rejeu par photos identiques", () => {
    const liste = [piece({ photoUrls: ["https://x/a.jpg", "https://x/b.jpg"] })];
    const entrant = piece({ id: undefined, photoUrls: ["https://x/a.jpg", "https://x/b.jpg"] });
    expect(rejeuDe(liste, entrant, MAINTENANT + 5_000)).not.toBeNull();
  });

  it("laisse passer une VRAIE seconde pièce, différente", () => {
    const liste = [piece()];
    const autre = piece({ id: undefined, description: "Joint de bas de porte" });
    expect(rejeuDe(liste, autre, MAINTENANT + 1_000)).toBeNull();
  });

  it("laisse passer la même description signalée bien plus tard", () => {
    /* Deux semaines après, « profil mural manquant » est un nouveau problème,
       pas un rejeu. La fenêtre de rejeu a une fin. */
    const liste = [piece()];
    const tard = MAINTENANT + FENETRE_REJEU_MS + 60_000;
    expect(rejeuDe(liste, piece({ id: undefined, timestamp: tard }), tard)).toBeNull();
  });
});

describe("TEST F — une pièce supprimée ne revient pas", () => {
  const supprimee = piece();
  const tombes: PierreTombale[] = [{
    id: supprimee.id,
    empreinte: empreinteSignalement(supprimee),
    quand: MAINTENANT,
    par: "Micael",
  }];

  it("reconnaît le rejeu d'une création déjà effacée, par identifiant", () => {
    expect(pierreTombaleDe(tombes, piece())).not.toBeNull();
  });

  it("le reconnaît sans identifiant QUAND il y a des photos", () => {
    const avecPhotos = piece({ photoUrls: ["https://x/a.jpg"] });
    const tombesPhotos: PierreTombale[] = [{
      id: avecPhotos.id as string,
      empreinte: empreinteSignalement(avecPhotos),
      quand: MAINTENANT,
      par: "Micael",
    }];
    expect(pierreTombaleDe(tombesPhotos, piece({ id: undefined, photoUrls: ["https://x/a.jpg"] })))
      .not.toBeNull();
  });

  /* LIMITE ASSUMÉE, et c'est le bon arbitrage.
     Sans identifiant ET sans photo, on ne bloque pas : l'empreinte se
     réduirait alors au texte, et deux pièces réellement distinctes portant
     la même description — « joint manquant », sur deux lots — seraient
     refusées à tort. Perdre une vraie saisie est pire que laisser revenir
     une ligne qu'on voit et qu'on efface. En pratique les deux clients de
     l'application envoient toujours un identifiant. */
  it("ne bloque PAS sans identifiant ni photo — refuser une vraie saisie serait pire", () => {
    expect(pierreTombaleDe(tombes, piece({ id: undefined }))).toBeNull();
  });

  it("ne bloque pas une pièce différente", () => {
    expect(pierreTombaleDe(tombes, piece({ id: "p2", description: "Autre chose" }))).toBeNull();
  });

  it("oublie les suppressions très anciennes, pour ne pas bloquer à vie", () => {
    const vieilles = purgerPierresTombales(
      [{ ...tombes[0], quand: MAINTENANT - DUREE_PIERRE_TOMBALE_MS - 1000 }],
      MAINTENANT,
    );
    expect(vieilles).toHaveLength(0);
  });

  it("garde les suppressions récentes", () => {
    expect(purgerPierresTombales(tombes, MAINTENANT + 60_000)).toHaveLength(1);
  });
});

describe("les doublons déjà là se repèrent sans être touchés", () => {
  const PH = ["https://x/a.jpg"];

  it("regroupe les copies d'un même signalement, et désigne l'original", () => {
    const liste = [
      piece({ id: "a", photoUrls: PH }),
      piece({ id: "b", photoUrls: PH, timestamp: MAINTENANT + 1000 }),
      piece({ id: "c", photoUrls: ["https://x/z.jpg"] }),
    ];
    const groupes = doublonsAvere(liste);
    expect(groupes).toHaveLength(1);
    /* Le plus ancien est l'original : ce sont les suivants qu'on effacerait. */
    expect(groupes[0].original.id).toBe("a");
    expect(groupes[0].rejeux.map((r) => r.id)).toEqual(["b"]);
  });

  it("ne voit pas de doublon là où il n'y en a pas", () => {
    expect(doublonsAvere([piece({ id: "a", photoUrls: PH })])).toHaveLength(0);
  });

  it("ne se prononce pas sur les signalements sans photo", () => {
    /* Deux pièces sans photo et de même texte peuvent être deux vraies
       pièces. L'outil de repérage s'abstient plutôt que d'accuser. */
    expect(doublonsAvere([piece({ id: "a" }), piece({ id: "b" })])).toHaveLength(0);
  });
});

describe("l'empreinte", () => {
  it("ignore ce qui n'identifie pas le signalement", () => {
    expect(empreinteSignalement(piece({ id: "x", timestamp: 1 })))
      .toBe(empreinteSignalement(piece({ id: "y", timestamp: 2 })));
  });

  it("distingue deux lots du même chantier", () => {
    expect(empreinteSignalement(piece({ cabineIdx: 1 })))
      .not.toBe(empreinteSignalement(piece({ cabineIdx: 2 })));
  });
});
