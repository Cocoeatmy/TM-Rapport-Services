/**
 * L'inventaire des droits doit refléter le code, sinon il ment.
 *
 * Ces tests ne jugent pas les droits — c'est une décision humaine — ils
 * vérifient que l'inventaire est complet et à jour. Une route ajoutée sans
 * régénérer l'inventaire fait échouer la suite, ce qui est exactement le
 * moment où l'on veut se poser la question de son accès.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import inventaire from "../lib/droits-generes.json";

function routes(dossier: string, base = "", out: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) routes(chemin, `${base}/${nom}`, out);
    else if (/^(route|page)\.tsx?$/.test(nom)) out.push(base || "/");
  }
  return out;
}

describe("inventaire des droits", () => {
  const connues = new Set(inventaire.entrees.map((e) => e.url));

  it("couvre toutes les pages et routes du dossier app", () => {
    const reelles = routes(join(process.cwd(), "src", "app"));
    const manquantes = reelles.filter((u) => !connues.has(u));
    // Si ce test échoue : `node scripts/gen-droits.mjs`, puis relire les
    // nouvelles lignes dans la page « Droits d'accès ».
    expect(manquantes).toEqual([]);
  });

  it("n'invente aucune route qui n'existe plus", () => {
    const reelles = new Set(routes(join(process.cwd(), "src", "app")));
    const fantomes = [...connues].filter((u) => !reelles.has(u));
    expect(fantomes).toEqual([]);
  });

  it("attribue un niveau connu à chaque entrée", () => {
    const niveaux = new Set([
      "ouvert", "signe", "signe-ou-connecte", "cle-secrete", "cron",
      "connecte", "connecte-middleware", "admin", "admin-ecran",
    ]);
    const inconnus = inventaire.entrees.filter((e) => !niveaux.has(e.niveau));
    expect(inconnus.map((e) => `${e.url} → ${e.niveau}`)).toEqual([]);
  });

  it("garde les pages d'administration hors de portée d'un collaborateur", () => {
    const admin = inventaire.entrees.filter((e) => e.url.startsWith("/admin/"));
    expect(admin.length).toBeGreaterThan(0);
    const sansGarde = admin.filter((e) => e.niveau !== "admin-ecran" && e.niveau !== "admin");
    expect(sansGarde.map((e) => e.url)).toEqual([]);
  });
});
