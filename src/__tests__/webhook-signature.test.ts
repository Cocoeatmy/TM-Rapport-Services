import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

/** Même extraction que la route du webhook : on enlève ce qui précède le
 *  premier « = », quel que soit le nom du préfixe. */
function hexDeSignature(signature: string): string {
  return signature.includes("=") ? signature.slice(signature.indexOf("=") + 1) : signature;
}

describe("signature du webhook Notion", () => {
  const secret = "secret_exemple";
  const corps = JSON.stringify({ type: "page.properties_updated" });
  const attendu = createHmac("sha256", secret).update(corps, "utf8").digest("hex");

  it("accepte le préfixe « sha256= », celui que Notion envoie vraiment", () => {
    expect(hexDeSignature(`sha256=${attendu}`)).toBe(attendu);
  });

  it("accepte encore l'ancien préfixe « v0= »", () => {
    expect(hexDeSignature(`v0=${attendu}`)).toBe(attendu);
  });

  it("accepte une signature nue", () => {
    expect(hexDeSignature(attendu)).toBe(attendu);
  });

  it("l'ancienne extraction laissait « sha256= » collé — la comparaison ne pouvait que rater", () => {
    const ancienne = `sha256=${attendu}`.startsWith("v0=") ? attendu : `sha256=${attendu}`;
    expect(ancienne).not.toBe(attendu);
  });
});
