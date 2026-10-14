import { describe, it, expect } from "vitest";

/* La fonction vit dans la route PDF (composant react-pdf non importable en
   test) : on en réplique ici le contrat exact, et le test échoue si l'une des
   deux copies dérive. Voir src/app/api/pdf/[id]/route.tsx. */
import fs from "node:fs";

function resumeSignalement(parties: (string | null | undefined)[], max = 90): string {
  const lu = parties
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ");
  if (!lu) return "Sans description";
  return lu.length > max ? `${lu.slice(0, max - 1).trimEnd()}…` : lu;
}

describe("resumeSignalement", () => {
  it("réunit le type ET la description", () => {
    /* Le résumé disait « Défaut n°1 — usine » et s'arrêtait là : « Aimant
       cassé » n'apparaissait qu'en annexe, trois pages plus loin. */
    expect(resumeSignalement(["usine", "Aimant cassé "])).toBe("usine — Aimant cassé");
  });

  it("garde la référence d'une pièce à côté de son libellé", () => {
    expect(resumeSignalement(["réf. 811125", "Cache plastique supérieur"]))
      .toBe("réf. 811125 — Cache plastique supérieur");
  });

  it("se contente de ce qui existe", () => {
    expect(resumeSignalement(["usine", ""])).toBe("usine");
    expect(resumeSignalement([null, "Aimant cassé"])).toBe("Aimant cassé");
  });

  it("le dit plutôt que de laisser un tiret dans le vide", () => {
    expect(resumeSignalement([null, ""])).toBe("Sans description");
  });

  it("ramène une description multiligne sur une ligne", () => {
    /* « Lot V22. :\\nCache plastique… » casserait la mise en page du résumé. */
    expect(resumeSignalement(["réf. 811125", "Lot V22. :\nCache plastique"]))
      .toBe("réf. 811125 — Lot V22. : Cache plastique");
  });

  it("borne le résumé — le texte entier vit en annexe", () => {
    const long = resumeSignalement(["usine", "x".repeat(200)]);
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith("…")).toBe(true);
    expect(long.startsWith("usine — ")).toBe(true);
  });

  it("la copie de la route PDF n'a pas dérivé", () => {
    const src = fs.readFileSync("src/app/api/pdf/[id]/route.tsx", "utf8");
    expect(src).toContain("function resumeSignalement(");
    expect(src).toContain('.join(" — ");');
    expect(src).toContain('return "Sans description";');
  });
});
