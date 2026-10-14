import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Garde-fou de source.
 *
 * Les routes « pièces » et « défauts » réécrivent la LISTE ENTIÈRE à chaque
 * modification. Partir du cache mémoire — soixante secondes, et propre à
 * chaque instance serverless — fait perdre en silence toute modification
 * enregistrée ailleurs dans la minute : le texte ajouté à un signalement
 * disparaissait tout seul. Ce test échoue si un handler revient au cache.
 */
const ROUTES = ["src/app/api/defauts/route.ts", "src/app/api/pieces/route.ts"];

describe("signalements — lecture fraîche", () => {
  for (const chemin of ROUTES) {
    const src = fs.readFileSync(chemin, "utf8");

    it(`${chemin} : aucun handler ne lit la liste depuis le cache`, () => {
      /* Plus aucune lecture en cache directe. */
      expect(src).not.toMatch(/await getData<\w+>\(KEY\)/);
      /* Seul repli toléré : le `.catch()` du GET, qui préfère une liste d'il
         y a une minute à pas de liste du tout. Toute autre mention du cache
         est un retour en arrière. */
      const mentions = [...src.matchAll(/getData<\w+>\(KEY\)/g)].length;
      const repliGet = [...src.matchAll(/\.catch\(\(\) => getData<\w+>\(KEY\)\)/g)].length;
      expect(mentions).toBe(repliGet);
      expect(repliGet).toBe(1);
    });

    it(`${chemin} : chaque écriture part d'une lecture fraîche`, () => {
      const ecritures = [...src.matchAll(/await setData\(KEY,/g)].length;
      const fraiches = [...src.matchAll(/await getDataFresh<\w+>\(KEY\)/g)].length;
      expect(fraiches).toBeGreaterThanOrEqual(ecritures);
    });

    it(`${chemin} : une erreur Notion n'écrit rien`, () => {
      /* Sans ce garde-fou, un échec de lecture écrirait un tableau vide —
         c'est-à-dire effacerait tous les signalements. */
      expect(src).toContain("Notion indisponible, réessayez");
    });
  }
});
