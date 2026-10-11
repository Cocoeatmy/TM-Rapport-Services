import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { creerArbitreSurvol } from "@/lib/survol-apercu";

/** Un aperçu de pacotille : ce qui est affiché, et s'il est épinglé. */
function banc() {
  let affiche: string | null = null;
  let epingle = false;
  const arbitre = creerArbitreSurvol({
    survolEnCours: () => affiche !== null && !epingle,
    ferme: () => { affiche = null; },
    delaiOuverture: 150,
    delaiFermeture: 220,
  });
  return {
    arbitre,
    vu: () => affiche,
    entrer: (cle: string) => arbitre.entrer(cle, () => { affiche = cle; }),
    /* La fiche elle-même est une cible comme une autre, mais la survoler
       n'affiche rien de nouveau : elle est déjà là. */
    entrerFiche: () => arbitre.entrer("fiche", () => {}),
    epingler: () => { epingle = true; arbitre.oublier(); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("arbitre de survol", () => {
  it("n'ouvre qu'après le délai, et pas si le curseur est déjà reparti", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(100);
    expect(b.vu()).toBe(null);
    b.arbitre.sortir("a");
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe(null);
  });

  it("ouvre quand le curseur reste", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    expect(b.vu()).toBe("a");
  });

  it("bascule sans délai d'un numéro à l'autre", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.arbitre.sortir("a");
    b.entrer("b");
    expect(b.vu()).toBe("b");
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe("b");
  });

  /* Le défaut d'origine : le navigateur annonce parfois l'arrivée avant le
     départ. Le départ du numéro précédent effaçait alors l'ouverture du
     suivant, et un numéro sur deux n'affichait rien. */
  it("un départ annoncé APRÈS l'arrivée suivante ne ferme rien", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.entrer("b");            // arrivée annoncée d'abord
    b.arbitre.sortir("a");    // départ annoncé ensuite
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe("b");
  });

  it("un départ en retard, alors que le curseur est ailleurs, ne ferme rien", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.arbitre.sortir("a");
    b.entrer("b");
    b.arbitre.sortir("a");    // doublon tardif sur une cible abandonnée
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe("b");
  });

  it("referme quand le curseur part vraiment, après le délai", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.arbitre.sortir("a");
    vi.advanceTimersByTime(219);
    expect(b.vu()).toBe("a");
    vi.advanceTimersByTime(1);
    expect(b.vu()).toBe(null);
  });

  it("revenir pendant le délai de fermeture garde la fiche", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.arbitre.sortir("a");
    vi.advanceTimersByTime(100);
    b.entrerFiche();          // le curseur entre dans la fiche
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe("a");
  });

  it("une fiche épinglée échappe au survol", () => {
    const b = banc();
    b.entrer("a");
    vi.advanceTimersByTime(150);
    b.epingler();             // le clic épingle
    b.arbitre.sortirSansCle();
    vi.advanceTimersByTime(500);
    expect(b.vu()).toBe("a");
    expect(b.arbitre.cible()).toBe(null);
  });
});
