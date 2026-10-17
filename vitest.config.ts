/**
 * Configuration des tests.
 *
 * Deux environnements, parce que l'application en a deux :
 *
 *   — « node » pour les règles pures et les routes d'API. C'est l'essentiel
 *     de la suite, et c'est là que tout tournait jusqu'au 17 octobre 2026.
 *
 *   — « navigateur » (jsdom) pour ce qui n'existe que côté client : les
 *     composants React, le stockage local, et surtout IndexedDB — où vivent
 *     les photos et la signature en attente d'envoi. Sans cet environnement,
 *     le parcours hors ligne ne se vérifiait que par le raisonnement.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.navigateur.test.ts", "src/**/*.test.tsx"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "navigateur",
          include: ["src/**/*.navigateur.test.ts", "src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./src/__tests__/setup-navigateur.ts"],
        },
      },
    ],
  },
});
