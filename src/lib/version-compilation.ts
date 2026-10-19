/**
 * Ce que l'historique Git dit de la version compilée — relevé UNE fois, au
 * démarrage de la compilation (next.config.ts), puis figé dans le code sous
 * `process.env.TM_VERSION_COMPILATION`. N'échoue jamais : une valeur que Git
 * ne peut pas fournir vaut `null`, jamais une invention.
 */
import { execFileSync } from "node:child_process";

export interface VersionCompilation {
  sha: string | null;
  env: string;
  branche: string | null;
  deploiement: string | null;
  clonePartiel: boolean | null;
  profondeur: number | null;
  commitsPremierParent: number | null;
  dateCommit: string | null;
  compile: string;
}

function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export function releverVersionCompilation(): VersionCompilation {
  const partiel = git("rev-parse", "--is-shallow-repository");
  const nombre = (s: string | null) => (s && /^\d+$/.test(s) ? Number(s) : null);
  return {
    sha: process.env.VERCEL_GIT_COMMIT_SHA || git("rev-parse", "HEAD"),
    env: process.env.VERCEL_ENV || "local",
    branche: process.env.VERCEL_GIT_COMMIT_REF || git("rev-parse", "--abbrev-ref", "HEAD"),
    deploiement: process.env.VERCEL_DEPLOYMENT_ID || null,
    clonePartiel: partiel === null ? null : partiel === "true",
    profondeur: nombre(git("rev-list", "--count", "HEAD")),
    commitsPremierParent: partiel === "false" ? nombre(git("rev-list", "--count", "--first-parent", "HEAD")) : null,
    dateCommit: git("log", "-1", "--format=%cI"),
    compile: new Date().toISOString(),
  };
}
