import { describe, it, expect } from "vitest";
import {
  estOuvert, estConstat, prioriteSelonAge, ageEnJours, dateSuisse,
  photosDe, jetonProjet, enRappel, listeDesRappels,
  type SignalementBrut,
} from "@/lib/rappels-signalements";

const ORIGINE = "https://tm-rapport-services.vercel.app";
/** 11 octobre 2026, 12:00 — horloge figée pour que les âges soient stables. */
const MAINTENANT = Date.UTC(2026, 9, 11, 10, 0, 0);
const JOUR = 86400000;

const defaut = (p: Partial<SignalementBrut> = {}): SignalementBrut => ({
  id: "d1",
  projectId: "3291895b-9179-8010-be0e-f998c30ad52a",
  projectName: "M-Rénovation Sàrl - Sunset, Schindellegi",
  user: "Claudio Zanutto",
  typesLabel: "Défaut d'usine",
  description: "Joint d'étanchéité entre porte et partie fixe trop court.",
  photoUrls: ["https://img/1.jpg"],
  status: "signale",
  timestamp: MAINTENANT - 40 * JOUR,
  comments: [],
  ...p,
});

describe("ce qui mérite un rappel", () => {
  it("ferme sur le statut comme sur le drapeau réglé", () => {
    expect(estOuvert(defaut({ status: "signale" }))).toBe(true);
    expect(estOuvert(defaut({ status: "en-cours" }))).toBe(true);
    expect(estOuvert(defaut({ status: "resolu" }))).toBe(false);
    expect(estOuvert(defaut({ status: "signale", resolved: true }))).toBe(false);
    expect(estOuvert({ id: "p", projectId: "x", status: "recu" })).toBe(false);
    expect(estOuvert({ id: "p", projectId: "x", status: "demande" })).toBe(true);
  });

  /* Les constats d'avant-intervention entrent aussi dans la liste : ce sont
     des engagements pris vis-à-vis du client. Seul leur type les distingue
     d'un défaut à réparer. */
  it("garde les constats d'avant-intervention, en les nommant", () => {
    expect(estConstat(defaut({ phase: "avant-intervention" }))).toBe(true);
    expect(estConstat(defaut())).toBe(false);
    const l = listeDesRappels([], [defaut(), defaut({ id: "d2", phase: "avant-intervention" })],
      new Map(), { origine: ORIGINE, maintenant: MAINTENANT });
    expect(l).toHaveLength(2);
    expect(l.find((r) => r.cle === "tm:defaut:d2")!.titre).toContain("Constat avant intervention");
    expect(l.find((r) => r.cle === "tm:defaut:d1")!.titre).not.toContain("Constat");
  });
});

describe("urgence", () => {
  it("monte avec l'ancienneté, et pas autrement", () => {
    expect(prioriteSelonAge(0)).toBe(9);
    expect(prioriteSelonAge(21)).toBe(9);
    expect(prioriteSelonAge(22)).toBe(5);
    expect(prioriteSelonAge(60)).toBe(5);
    expect(prioriteSelonAge(61)).toBe(1);
  });

  it("compte les jours depuis le signalement", () => {
    expect(ageEnJours(MAINTENANT - 3 * JOUR, MAINTENANT)).toBe(3);
    expect(ageEnJours(undefined, MAINTENANT)).toBe(0);
    expect(ageEnJours(MAINTENANT + JOUR, MAINTENANT)).toBe(0);
  });
});

describe("fiche de rappel", () => {
  const fiche = { ofrTM: "TM-2600829", projet: "Nelo — Plan-les-Ouates" };

  it("met le n° de projet en tête du titre", () => {
    const r = enRappel(defaut(), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.titre.startsWith("TM-2600829 · Défaut d'usine — Joint")).toBe(true);
  });

  it("dit qui a signalé, quand, et depuis combien de temps", () => {
    const r = enRappel(defaut(), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes).toContain("Signalé par Claudio Zanutto le 01.09.2026 à 12:00 (il y a 40 jours)");
  });

  it("porte les photos et le rapport PDF, qui s'ouvre sans se connecter", () => {
    const r = enRappel(defaut({ photoUrls: ["https://img/1.jpg", "https://img/2.jpg"] }),
      "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes).toContain("Photos (2) :");
    expect(r.notes).toContain("https://img/2.jpg");
    expect(r.notes).toContain(`${ORIGINE}/sig/${jetonProjet(defaut().projectId)}`);
  });

  /* Le champ « URL » de Rappels n'est accessible ni à EventKit ni à
     AppleScript : le lien doit donc être lisible et cliquable dans la note,
     et en premier — pas au fond. */
  it("ouvre la note par le lien du chantier", () => {
    const r = enRappel(defaut(), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes.split("\n")[0]).toBe(`→ Ouvrir le chantier : ${r.url}`);
  });

  it("mène au lot concerné, et au projet quand le lot est inconnu", () => {
    const avec = enRappel(defaut({ cabineLabel: "7ème étage - droite" }), "defaut", fiche,
      { origine: ORIGINE, maintenant: MAINTENANT });
    expect(avec.url).toContain("?signalement=7%C3%A8me%20%C3%A9tage%20-%20droite");
    const sans = enRappel(defaut(), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(sans.url).toBe(`${ORIGINE}/projet/${defaut().projectId}?signalement=1`);
  });

  /* Le marqueur est le seul lien entre un signalement et son rappel : sans
     lui, chaque passage de l'agent créerait des doublons. */
  it("porte un marqueur stable en fin de notes", () => {
    const r = enRappel(defaut(), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.cle).toBe("tm:defaut:d1");
    expect(r.notes.trimEnd().endsWith("[tm:defaut:d1]")).toBe(true);
  });

  it("ne garde que le dernier échange", () => {
    const r = enRappel(defaut({
      comments: [
        { user: "Micael", message: "vu avec le fournisseur", timestamp: MAINTENANT - 30 * JOUR },
        { user: "Claudio", message: "pièce commandée", timestamp: MAINTENANT - 2 * JOUR },
      ],
    }), "defaut", fiche, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.notes).toContain("Dernier échange — Claudio, 09.10.2026 : pièce commandée");
    expect(r.notes).not.toContain("vu avec le fournisseur");
  });

  it("porte la référence d'une pièce manquante", () => {
    const r = enRappel({
      id: "p1", projectId: "abc", projectName: "Ronal — Chavannes",
      description: "Pièces d'angle", reference: "81164;81163",
      status: "demande", user: "Jacobo", timestamp: MAINTENANT - JOUR,
    }, "piece", { ofrTM: "TM-2600111", projet: "Ronal — Chavannes" },
      { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.titre).toContain("Pièce manquante");
    expect(r.notes).toContain("Référence : 81164;81163");
    expect(r.notes).toContain("Statut : demandée");
    expect(r.priorite).toBe(9);
  });

  it("se rabat sur le nom du chantier quand le n° OFR manque", () => {
    const r = enRappel(defaut(), "defaut", {}, { origine: ORIGINE, maintenant: MAINTENANT });
    expect(r.titre.startsWith("M-Rénovation Sàrl")).toBe(true);
    expect(r.notes).not.toContain("N° OFR");
  });
});

describe("liste complète", () => {
  it("met le plus ancien en premier — c'est lui qu'on oublie", () => {
    const l = listeDesRappels(
      [{ id: "p1", projectId: "a", status: "demande", timestamp: MAINTENANT - 5 * JOUR }],
      [defaut({ id: "d1", timestamp: MAINTENANT - 100 * JOUR }),
       defaut({ id: "d2", timestamp: MAINTENANT - JOUR })],
      new Map(), { origine: ORIGINE, maintenant: MAINTENANT },
    );
    expect(l.map((r) => r.cle)).toEqual(["tm:defaut:d1", "tm:piece:p1", "tm:defaut:d2"]);
    expect(l[0].priorite).toBe(1);
    expect(l[2].priorite).toBe(9);
  });

  it("dédoublonne les photos d'une pièce", () => {
    expect(photosDe({ id: "x", projectId: "y", photoUrl: "https://a.jpg", photoUrls: ["https://a.jpg", "https://b.jpg"] }))
      .toEqual(["https://a.jpg", "https://b.jpg"]);
  });

  it("écrit les dates à l'heure suisse", () => {
    expect(dateSuisse(Date.UTC(2026, 0, 15, 7, 5))).toBe("15.01.2026 à 08:05");
    expect(dateSuisse(undefined)).toBe("");
  });
});
