import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Garde-fou de source : le verrou doit ATTENDRE, jamais renoncer.
 *
 * La première version demandait le verrou une fois et, s'il était déjà
 * pris, continuait quand même. Elle ne protégeait donc que lorsqu'il n'y
 * avait rien à protéger. Micael supprimait ses doublons à la chaîne, deux
 * effacements partaient ensemble, relisaient la même liste, et le second
 * réécrivait le premier : la ligne revenait. Huit tours de ménage.
 *
 * Chaque écriture de la liste des signalements relit puis réécrit TOUT :
 * sans exclusion réelle, une opération sur deux se perd.
 */
const SRC = fs.readFileSync("src/app/api/defauts/route.ts", "utf8");

describe("défauts — exclusion mutuelle des écritures", () => {
  it("les trois écritures passent par le verrou", () => {
    for (const handler of ["enregistrer", "effacer", "modifier"]) {
      expect(SRC, handler).toMatch(new RegExp(`avecVerrou\\(\\(\\) => ${handler}\\(`));
    }
  });

  it("le verrou réessaie au lieu de passer outre", () => {
    /* Une boucle d'acquisition, et un abandon qui se VOIT. */
    expect(SRC).toContain("VerrouIndisponible");
    const bloc = SRC.slice(SRC.indexOf("async function avecVerrou"));
    const corps = bloc.slice(0, bloc.indexOf("\n}\n") + 3);
    expect(corps).toMatch(/for \(;;\)|while \(/);
    expect(corps).toContain("throw new VerrouIndisponible()");
  });

  it("ne pas obtenir le verrou se solde par un 503, jamais par une écriture", () => {
    /* 503 : le navigateur remet la ligne et le dit. Travailler sans le
       verrou laisserait croire que c'est fait, et la ligne reviendrait. */
    expect(SRC).toContain("instanceof VerrouIndisponible");
    expect(SRC).toMatch(/status: 503/);
  });

  it("le verrou vit PLUS LONGTEMPS que l'écriture qu'il protège", () => {
    /* Il expirait en 30 s alors qu'une écriture en prenait 19 : la
       protection lâchait en cours de route, un second serveur prenait le
       verrou, et les deux réécrivaient la liste. Une ligne effacée, une
       autre ressuscitee — constaté en production le 16 octobre. */
    const ttl = Number(SRC.match(/const DUREE_VERROU_MS = ([\d_]+)/)?.[1].replace(/_/g, ""));
    const attente = Number(SRC.match(/const ATTENTE_VERROU_MS = ([\d_]+)/)?.[1].replace(/_/g, ""));
    expect(ttl).toBeGreaterThanOrEqual(60_000);
    /* Et celui qui attend renonce AVANT que le détenteur ne perde le sien :
       sinon deux écrivains se croiraient seuls au même instant. */
    expect(attente).toBeLessThan(ttl);
  });

  it("le verrou est relâché quoi qu'il arrive", () => {
    const bloc = SRC.slice(SRC.indexOf("async function avecVerrou"));
    expect(bloc.slice(0, 1200)).toMatch(/finally\s*{[\s\S]*redisLockRelease/);
  });
});

/**
 * Et côté navigateur : un effacement à la fois.
 *
 * Le serveur peut bien se protéger, si l'écran tire quatre requêtes en
 * même temps il les fait patienter pour rien — ou les refuse. On les met
 * à la queue leu leu à la source.
 */
describe("défauts — le navigateur n'efface qu'une ligne à la fois", () => {
  const PAGE = fs.readFileSync("src/app/projet/[id]/page.tsx", "utf8");

  it("les suppressions s'enchaînent au lieu de se chevaucher", () => {
    expect(PAGE).toContain("fileEffacements");
    /* Ancré sur la confirmation, qui ne sert qu'à cet effacement-là. */
    const i = PAGE.indexOf("Supprimer le Défaut n°");
    expect(i).toBeGreaterThan(0);
    const corps = PAGE.slice(i, i + 2500);
    expect(corps).toContain("fileEffacements.current");
    expect(corps).toMatch(/method: "DELETE"/);
  });

  it("un « occupé » est réessayé, pas transformé en échec", () => {
    const i = PAGE.indexOf("Supprimer le Défaut n°");
    expect(PAGE.slice(i, i + 2500)).toContain("503");
  });
});
