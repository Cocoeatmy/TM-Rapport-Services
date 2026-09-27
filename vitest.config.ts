/**
 * Configuration des tests.
 *
 * Seul réglage nécessaire : l'alias « @/ », que Next résout par tsconfig mais
 * que Vitest ignore. Sans lui, tout module important un autre fichier de
 * l'application est introuvable.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
