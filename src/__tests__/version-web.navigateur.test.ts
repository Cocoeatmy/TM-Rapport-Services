/**
 * La version Web : un libellé fixé à la compilation, une identité comparée
 * par égalité — jamais par ordre, jamais inventée.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  identite, libelleVersion, memeVersion, normaliserVersion, numeroDepuisCompilation,
  versionAppDepuisAgent, versionCompilee, versionDuDocument, versionNativePlusAncienne, type VersionWeb,
} from "@/lib/version-web";

const prod = (x: Partial<VersionWeb> = {}): VersionWeb => ({
  numero: "2026.10.19-174552", sha: "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0", deploiement: "dpl_A",
  env: "production", compile: "2026-10-19T17:45:52.123Z", dateCommit: "2026-10-19T17:40:00+02:00", ...x,
});

describe("libellé de compilation", () => {
  it("UTC à la seconde, au format AAAA.MM.JJ-HHMMSS", () => {
    expect(numeroDepuisCompilation("2026-10-19T17:45:52.123Z")).toBe("2026.10.19-174552");
    expect(numeroDepuisCompilation("2026-01-02T03:04:05Z")).toBe("2026.01.02-030405");
  });
  it("rien d'inventé : null si absent ou illisible", () => {
    expect(numeroDepuisCompilation(null)).toBeNull();
    expect(numeroDepuisCompilation("")).toBeNull();
    expect(numeroDepuisCompilation("hier")).toBeNull();
    expect(numeroDepuisCompilation("2026-13-45T99:99:99Z")).toBeNull();
  });
  it("normaliser dérive le libellé de l'instant de compilation et rejette un libellé fantaisiste", () => {
    const v = normaliserVersion({ sha: "abc1234", deploiement: "dpl_X", env: "production", compile: "2026-10-19T08:00:00Z" });
    expect(v?.numero).toBe("2026.10.19-080000");
    expect(normaliserVersion({ numero: "42", compile: "2026-10-19T08:00:00Z", sha: "abc1234" })?.numero).toBe("2026.10.19-080000");
    expect(normaliserVersion({ numero: "42", sha: "abc1234" })?.numero).toBeNull();
  });
  it("chaque champ à son format : rien de libre n'est recopié", () => {
    const v = normaliserVersion({ sha: "<script>", deploiement: "dpl_X", env: "pirate", compile: "hier", dateCommit: "n'importe" });
    expect(v).toMatchObject({ sha: null, deploiement: "dpl_X", env: "local", compile: null, dateCommit: null, numero: null });
    expect(normaliserVersion({ sha: "zz", deploiement: "pas-un-dpl" })).toBeNull();
  });
  it("une version sans aucune identité ni libellé n'en est pas une", () => {
    expect(normaliserVersion({ env: "production" })).toBeNull();
    expect(normaliserVersion(null)).toBeNull();
    expect(normaliserVersion("x")).toBeNull();
  });
});

describe("identité et comparaison", () => {
  it("compare par déploiement, pas par libellé", () => {
    /* Deux compilations dans la même seconde : même libellé, déploiements différents. */
    expect(memeVersion(prod(), prod({ deploiement: "dpl_B" }))).toBe(false);
    /* Libellés différents, même déploiement : c'est la même version. */
    expect(memeVersion(prod(), prod({ numero: "2020.01.01-000000" }))).toBe(true);
  });
  it("un retour arrière (libellé plus ancien) est simplement « différent », jamais « plus récent »", () => {
    const ancien = prod({ deploiement: "dpl_OLD", numero: "2026.10.01-090000" });
    expect(memeVersion(prod(), ancien)).toBe(false);
  });
  it("repli sur le commit quand le déploiement manque d'un côté", () => {
    expect(memeVersion(prod({ deploiement: null }), prod())).toBe(true);
    expect(memeVersion(prod({ deploiement: null }), prod({ sha: "b0b0b0b" }))).toBe(false);
  });
  it("impossible à dire → null, jamais un faux « à jour »", () => {
    expect(memeVersion(null, prod())).toBeNull();
    expect(memeVersion(prod({ sha: null, deploiement: null }), prod())).toBeNull();
    expect(identite(null)).toBeNull();
  });
});

describe("affichage", () => {
  it("production : libellé à la minute + commit abrégé", () => {
    expect(libelleVersion(prod())).toBe("Version Web 2026.10.19-1745 · a1b2c3d");
  });
  it("aperçu : jamais présenté comme une version de production", () => {
    expect(libelleVersion(prod({ env: "preview" }))).toBe("Aperçu · a1b2c3d");
  });
  it("poste local", () => {
    expect(libelleVersion(prod({ env: "local" }))).toBe("Développement · a1b2c3d");
  });
  it("rien de connu → null (la page écrit « Non disponible »)", () => {
    expect(libelleVersion(null)).toBeNull();
    expect(libelleVersion(prod({ numero: null, sha: null }))).toBeNull();
  });
});

describe("version compilée", () => {
  const avant = process.env.TM_VERSION_COMPILATION;
  afterEach(() => { process.env.TM_VERSION_COMPILATION = avant; });
  it("lit la variable figée par next.config.ts", () => {
    process.env.TM_VERSION_COMPILATION = JSON.stringify({ sha: "abc1234", env: "production", deploiement: "dpl_Z", compile: "2026-10-19T17:45:52Z", clonePartiel: true });
    expect(versionCompilee()).toMatchObject({ numero: "2026.10.19-174552", deploiement: "dpl_Z", sha: "abc1234" });
  });
  it("variable absente ou illisible → null", () => {
    process.env.TM_VERSION_COMPILATION = "";
    expect(versionCompilee()).toBeNull();
    process.env.TM_VERSION_COMPILATION = "{pas du json";
    expect(versionCompilee()).toBeNull();
  });
});

describe("balise de la page", () => {
  const doc = (html: string) => new DOMParser().parseFromString(`<html><head>${html}</head></html>`, "text/html");
  it("lit tm-version", () => {
    const d = doc(`<meta name="tm-version" content='${JSON.stringify(prod())}'>`);
    expect(versionDuDocument(d)?.deploiement).toBe("dpl_A");
  });
  it("page ancienne : seulement le commit de tm-build, sans libellé", () => {
    const v = versionDuDocument(doc(`<meta name="tm-build" content="abcdef1234">`));
    expect(v).toMatchObject({ sha: "abcdef1234", numero: null, deploiement: null });
  });
  it("poste de développement : rien", () => {
    expect(versionDuDocument(doc(`<meta name="tm-build" content="dev">`))).toBeNull();
  });
});

describe("application native", () => {
  it("lit la version dans l'identité du navigateur", () => {
    expect(versionAppDepuisAgent("Mozilla/5.0 (iPhone) AppleWebKit TMRapportApp/1.0 (iOS)")).toBe("1.0");
    expect(versionAppDepuisAgent("Mozilla/5.0 Safari")).toBeNull();
  });
  it("compare les numéros composante par composante", () => {
    expect(versionNativePlusAncienne("1.0", "1.0")).toBe(false);
    expect(versionNativePlusAncienne("1.9", "1.10")).toBe(true);
    expect(versionNativePlusAncienne("2.0", "1.10")).toBe(false);
    expect(versionNativePlusAncienne(null, "1.0")).toBeNull();
  });
});
