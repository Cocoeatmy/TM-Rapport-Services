import { describe, it, expect } from "vitest";
import { fileDEnvoi } from "@/lib/envoi-en-serie";

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fileDEnvoi", () => {
  it("le dernier parti est le dernier écrit, même si le premier traîne", async () => {
    const ecrits: string[] = [];
    const envoyer = fileDEnvoi();
    // « S » met 50 ms, « SD » 30, « SDB » 1 : sans file, l'ordre d'arrivée
    // serait SDB, SD, S — et le nom finirait à « S ».
    const p1 = envoyer("nom", async () => { await attendre(50); ecrits.push("S"); });
    const p2 = envoyer("nom", async () => { await attendre(30); ecrits.push("SD"); });
    const p3 = envoyer("nom", async () => { await attendre(1); ecrits.push("SDB"); });
    await Promise.all([p1, p2, p3]);
    expect(ecrits).toEqual(["S", "SD", "SDB"]);
  });

  it("un envoi raté ne bloque pas les suivants", async () => {
    const ecrits: string[] = [];
    const envoyer = fileDEnvoi();
    const rate = envoyer("nom", async () => { throw new Error("réseau coupé"); });
    const apres = envoyer("nom", async () => { ecrits.push("suivant"); });
    await expect(rate).rejects.toThrow("réseau coupé");
    await apres;
    expect(ecrits).toEqual(["suivant"]);
  });

  it("deux champs différents n'attendent pas l'un l'autre", async () => {
    const ordre: string[] = [];
    const envoyer = fileDEnvoi();
    const lent = envoyer("nom", async () => { await attendre(40); ordre.push("nom"); });
    const rapide = envoyer("heures", async () => { ordre.push("heures"); });
    await Promise.all([lent, rapide]);
    expect(ordre).toEqual(["heures", "nom"]);
  });
});
