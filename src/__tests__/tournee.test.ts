/**
 * Assistant de tournée.
 *
 * Le cœur du sujet n'est pas la géométrie mais la CONFIANCE : la journée doit
 * partir et revenir au dépôt, tenir les heures imposées, et ne jamais rendre
 * une tournée incomplète sans dire pourquoi. Ces trois promesses sont ici.
 */
import { describe, it, expect } from "vitest";
import {
  preparerCandidats, construireTournee, enMinutes, enHeure, formatMinutes,
  JOURNEE_MINUTES, type CandidatSource, type Position,
} from "../lib/tournee";

/* Quatre points réels, pour que les distances aient un sens :
   le dépôt d'Yverdon, deux chantiers à Peseux (même rue) et un à Genève. */
const POS: Record<string, Position> = {
  "1400 Yverdon-les-Bains": { lat: 46.778, lng: 6.641 },
  "Rue de Corcelles 12, 2034 Peseux": { lat: 46.991, lng: 6.887 },
  "Rue de Corcelles 14, 2034 Peseux": { lat: 46.991, lng: 6.888 },
  "Rue du Lac 5, 1400 Yverdon-les-Bains": { lat: 46.780, lng: 6.640 },
  "Rue du Rhône 1, 1201 Genève": { lat: 46.204, lng: 6.143 },
};

const projet = (id: string, adresse: string, cabines = 1): CandidatSource => ({
  id, ofrTM: `TM-${id}`, projet: `AC Energies SA - Lot ${id} - ${adresse}`,
  adresseChantier: adresse, nbCabines: cabines, nbCartons: 2, fournisseurs: ["Duka"],
});

/** Historique : deux heures par cabine, pour un barème prévisible. */
const HISTORIQUE: CandidatSource[] = [
  { id: "h1", nbCabines: 1, fournisseurs: ["Duka"], heureArrivee: "08:00", heureDepart: "10:00" },
  { id: "h2", nbCabines: 1, fournisseurs: ["Duka"], heureArrivee: "08:00", heureDepart: "10:00" },
  { id: "h3", nbCabines: 1, fournisseurs: ["Duka"], heureArrivee: "08:00", heureDepart: "10:00" },
];

const PROJETS = [
  projet("L", "Rue de Corcelles 12, 2034 Peseux"),
  projet("M", "Rue de Corcelles 12, 2034 Peseux"),
  projet("O", "Rue de Corcelles 14, 2034 Peseux"),
  projet("Y", "Rue du Lac 5, 1400 Yverdon-les-Bains"),
  projet("G", "Rue du Rhône 1, 1201 Genève"),
];

const candidats = () => preparerCandidats(PROJETS, HISTORIQUE, POS);
const depot = POS["1400 Yverdon-les-Bains"];

describe("heures", () => {
  it("convertit dans les deux sens", () => {
    expect(enMinutes("07:30")).toBe(450);
    expect(enHeure(450)).toBe("07:30");
    expect(enMinutes("nimporte")).toBeNull();
  });

  it("formate une durée", () => {
    expect(formatMinutes(510)).toBe("8h30");
    expect(formatMinutes(120)).toBe("2h");
  });
});

describe("complétion autour des chantiers imposés", () => {
  it("ajoute un troisième montage quand on en a coché deux", () => {
    const t = construireTournee(candidats(), {
      nombre: 3, imposes: ["L", "M"], minutesMax: JOURNEE_MINUTES, departHeure: "07:30",
    }, depot);
    expect(t).not.toBeNull();
    expect(t!.etapes).toHaveLength(3);
    expect(t!.etapes.map((e) => e.id)).toEqual(expect.arrayContaining(["L", "M"]));
    expect(t!.manquants).toBe(0);
  });

  it("choisit le plus proche, pas le premier venu", () => {
    const t = construireTournee(candidats(), {
      nombre: 3, imposes: ["L", "M"], minutesMax: JOURNEE_MINUTES,
    }, depot)!;
    const ajoute = t.etapes.find((e) => e.id !== "L" && e.id !== "M");
    // Genève est à trois heures : seul un voisin de Peseux peut entrer.
    expect(ajoute!.id).not.toBe("G");
  });

  it("garde tous les chantiers imposés, même s'ils débordent la journée", () => {
    const t = construireTournee(candidats(), {
      nombre: 2, imposes: ["L", "G"], minutesMax: JOURNEE_MINUTES,
    }, depot)!;
    expect(t.etapes.map((e) => e.id).sort()).toEqual(["G", "L"]);
    expect(t.heuresSupp).toBe(true);
  });

  it("annonce ce qui manque et propose les plus proches", () => {
    const t = construireTournee(candidats(), {
      nombre: 5, imposes: ["L", "M"], minutesMax: JOURNEE_MINUTES,
    }, depot)!;
    expect(t.manquants).toBeGreaterThan(0);
    expect(t.suggestions.length).toBeGreaterThan(0);
    // Les suggestions vont du moins coûteux au plus coûteux.
    const couts = t.suggestions.map((s) => s.minutesAjoutees);
    expect([...couts].sort((a, b) => a - b)).toEqual(couts);
  });
});

describe("journée", () => {
  it("part du dépôt et y revient, trajets compris", () => {
    const t = construireTournee(candidats(), {
      nombre: 2, imposes: ["L", "M"], departHeure: "07:30",
    }, depot)!;
    expect(t.minutesTrajet).toBeGreaterThan(0);
    expect(t.minutesTotal).toBeGreaterThan(t.minutesPose);
    expect(t.retourDepot).toMatch(/^\d{2}:\d{2}$/);
    expect(t.horaires).toHaveLength(2);
  });

  it("respecte une heure d'arrivée imposée, en attendant s'il le faut", () => {
    const t = construireTournee(candidats(), {
      nombre: 2, imposes: ["L", "M"], departHeure: "07:30",
      heures: { M: "13:00" },
    }, depot)!;
    const m = t.horaires.find((h) => h.id === "M")!;
    expect(m.impose).toBe("13:00");
    expect(m.enRetard).toBe(false);
    expect(m.arrivee).toBe("13:00");
  });

  it("signale un rendez-vous intenable plutôt que de le taire", () => {
    const t = construireTournee(candidats(), {
      nombre: 2, imposes: ["G", "L"], departHeure: "07:30",
      heures: { L: "08:00" },
    }, depot)!;
    // Genève puis Peseux à 8 h du matin : impossible, et l'app doit le dire.
    const enRetard = t.horaires.some((h) => h.enRetard);
    expect(enRetard || t.retardMax > 0).toBe(true);
  });

  it("respecte le plafond de cartons", () => {
    const t = construireTournee(candidats(), {
      nombre: 4, cartonsMax: 4, minutesMax: 600,
    }, depot)!;
    expect(t.cartons).toBeLessThanOrEqual(4);
  });

  it("ne rend rien quand il n'y a aucun candidat", () => {
    expect(construireTournee([], { nombre: 3 }, depot)).toBeNull();
  });
});
