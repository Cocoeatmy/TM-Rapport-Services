import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Garde-fou de source : effacer la version précédente doit coûter UN appel.
 *
 * La liste des signalements fait 70 000 caractères, soit 36 blocs Notion.
 * L'écriture les supprimait un par un, à la cadence tolérée par Notion :
 * douze secondes, pour une écriture qui en prenait dix-huit en tout. Le
 * téléphone, lui, renonce à vingt-cinq — il croyait l'envoi perdu et le
 * rejouait, d'où les doublons. Et deux effacements lancés coup sur coup se
 * disputaient si longtemps le verrou que l'un des deux était refusé.
 *
 * Ce test échoue si l'on revient aux tranches posées à plat.
 */
const SRC = fs.readFileSync("src/lib/kv-store.ts", "utf8");

describe("kv-store — la version précédente part en un appel", () => {
  it("les listes vivantes écrivent sous un conteneur", () => {
    expect(SRC).toContain("CLES_CONTENEUR");
    const m = SRC.match(/const CLES_CONTENEUR = new Set\(\[([^\]]*)\]\)/);
    expect(m, "liste des clés introuvable").toBeTruthy();
    for (const cle of ["defauts", "defauts-supprimes", "pieces"]) {
      expect(m![1], cle).toContain(`"${cle}"`);
    }
  });

  it("la LECTURE accepte les deux formes — sinon les anciennes pages sont perdues", () => {
    /* C'est la condition pour changer d'écriture sans migration : une page
       déjà écrite à plat doit rester lisible telle quelle. */
    expect(SRC).toMatch(/b\.type === "paragraph"/);
    expect(SRC).toMatch(/b\.type === "toggle"/);
    expect(SRC).toContain("lireTranchesDe");
  });

  it("les anciens blocs sont relevés AVANT d'écrire, et supprimés APRÈS", () => {
    /* Ordre inverse = perte de données si le serveur est tué au milieu. */
    const i = SRC.indexOf("async function writeToNotion");
    const corps = SRC.slice(i, SRC.indexOf("\n}\n", i));
    const releve = corps.indexOf("oldBlockIds.push");
    const ecriture = corps.indexOf("blocks.children.append");
    const suppression = corps.indexOf("blocks.delete");
    expect(releve).toBeGreaterThan(-1);
    expect(releve).toBeLessThan(ecriture);
    expect(ecriture).toBeLessThan(suppression);
  });

  it("le relevé des anciens blocs est paginé", () => {
    /* Sans pagination, au-delà de 100 blocs les anciens survivaient et la
       page finissait par contenir un mélange illisible. */
    const i = SRC.indexOf("async function writeToNotion");
    expect(SRC.slice(i, i + 1400)).toContain("start_cursor: listCursor");
  });
});
