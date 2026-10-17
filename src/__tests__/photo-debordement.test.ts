/**
 * TEST J — au-delà de cent photos, aucune ne doit disparaître.
 *
 * Notion refuse plus de cent fichiers par propriété. Les suivantes vont dans
 * un débordement, relu et refusionné à la lecture. Une erreur d'un cran dans
 * cette répartition ferait perdre la centième photo d'un gros chantier sans
 * le moindre message.
 */
import { describe, it, expect } from "vitest";
import { repartirFichiers, LIMITE_NOTION } from "../lib/photo-overflow";

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg` }));

describe("répartition entre Notion et le débordement", () => {
  it.each([10, 50, 99, 100])("garde tout dans Notion à %i photos", (n) => {
    const r = repartirFichiers(photos(n));
    expect(r.notion).toHaveLength(n);
    expect(r.debordement).toHaveLength(0);
  });

  it.each([101, 150, 500])("déborde proprement à %i photos", (n) => {
    const r = repartirFichiers(photos(n));
    expect(r.notion).toHaveLength(LIMITE_NOTION);
    expect(r.debordement).toHaveLength(n - LIMITE_NOTION);
  });

  it("ne perd ni ne duplique AUCUNE photo, quel que soit le volume", () => {
    for (const n of [0, 1, 99, 100, 101, 250, 1000]) {
      const tout = photos(n);
      const r = repartirFichiers(tout);
      const refait = [...r.notion, ...r.debordement];
      expect(refait, `${n} photos`).toHaveLength(n);
      expect(new Set(refait.map((f) => f.name)).size, `${n} photos distinctes`).toBe(n);
      expect(refait.map((f) => f.name)).toEqual(tout.map((f) => f.name));
    }
  });

  it("garde l'ordre : la 101ᵉ photo est la première du débordement", () => {
    const r = repartirFichiers(photos(120));
    expect(r.notion[99].name).toBe("p99.jpg");
    expect(r.debordement[0].name).toBe("p100.jpg");
  });

  it("respecte une limite plus basse si on la lui donne", () => {
    const r = repartirFichiers(photos(10), 3);
    expect(r.notion).toHaveLength(3);
    expect(r.debordement).toHaveLength(7);
  });
});
