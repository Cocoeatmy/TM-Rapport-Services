/**
 * Ce que le navigateur fournit et que jsdom ne fournit pas.
 *
 * `fake-indexeddb` donne une VRAIE implémentation d'IndexedDB en mémoire :
 * les transactions, les index, les versions et les migrations s'y comportent
 * comme dans Safari. C'est ce qui permet de tester la file des photos et de
 * la signature pour de bon, et non d'en relire le code source.
 */
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
