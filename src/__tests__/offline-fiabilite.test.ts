/**
 * TESTS G et H — l'application ne doit jamais mentir sur ce qu'elle a gardé.
 *
 * Deux promesses sont vérifiées ici, et ce sont les deux qui manquaient :
 *   — si la saisie n'a pas pu être rangée, on le DIT (audit A4) ;
 *   — si elle est abandonnée après trop d'essais, son CONTENU reste
 *     récupérable (audit A5).
 *
 * Un faux `localStorage` sert de stockage, avec un interrupteur « plein »
 * pour reproduire le quota saturé d'un iPhone de fin de chantier.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Un localStorage de laboratoire ─────────────────────────────────────────
   Il se comporte comme le vrai : un BUDGET total partagé. Dépasser lève
   QuotaExceededError, et effacer une entrée rend la place — c'est
   exactement ce qui permet au code de sacrifier le cache pour sauver une
   saisie. Un faux qui refuserait tout une fois « plein » ne testerait rien
   d'utile. */
const donnees = new Map<string, string>();
/** Budget en caractères. Baissé par les tests pour simuler la saturation. */
let budget = 10_000_000;

function occupe(sauf?: string): number {
  let n = 0;
  for (const [k, v] of donnees) if (k !== sauf) n += k.length + v.length;
  return n;
}

const faux: Storage = {
  get length() { return donnees.size; },
  clear: () => donnees.clear(),
  key: (i: number) => [...donnees.keys()][i] ?? null,
  getItem: (k: string) => donnees.get(k) ?? null,
  removeItem: (k: string) => { donnees.delete(k); },
  setItem: (k: string, v: string) => {
    if (occupe(k) + k.length + v.length > budget) {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    }
    donnees.set(k, v);
  },
};

vi.stubGlobal("localStorage", faux);
vi.stubGlobal("window", {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});
vi.stubGlobal("navigator", { onLine: true });

const {
  addToQueue, getQueue, clearQueue, getAbandons, clearAbandons,
  rejouerAbandon, projetDeLUrl, suiteApresEchec, saveToCache,
} = await import("../lib/offline");

beforeEach(() => {
  budget = 10_000_000;
  donnees.clear();
  clearQueue();
  clearAbandons();
});

describe("TEST G — stockage saturé : aucun faux succès", () => {
  it("range l'écriture et le dit quand il y a de la place", () => {
    expect(addToQueue({ type: "update", url: "/api/projects/abc", method: "PATCH", body: { rapport: "ok" } })).toBe(true);
    expect(getQueue()).toHaveLength(1);
  });

  it("rend FAUX quand il n'y a vraiment plus un octet", () => {
    budget = 10; // plus petit que la moindre écriture
    const range = addToQueue({ type: "update", url: "/api/projects/abc", method: "PATCH", body: { rapport: "perdu ?" } });
    expect(range).toBe(false);
    expect(getQueue()).toHaveLength(0);
  });

  it("sacrifie le cache plutôt que la saisie du monteur", () => {
    /* Le cache des listes se reconstruit au prochain chargement ; ce que le
       monteur a tapé ne se reconstruit pas. */
    budget = 6_000;
    saveToCache("projects", [{ gros: "x".repeat(5000) }]);
    expect(localStorage.getItem("tm-rapport-cache")).toBeTruthy();

    /* Il ne reste plus la place pour la file : le cache doit céder. */
    const range = addToQueue({ type: "update", url: "/api/projects/abc", method: "PATCH", body: { rapport: "important" } });

    expect(range).toBe(true);
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].body).toEqual({ rapport: "important" });
  });

  it("ne perd pas les écritures déjà en file quand une nouvelle échoue", () => {
    addToQueue({ type: "update", url: "/api/projects/a", method: "PATCH", body: { n: 1 } });
    budget = occupe() + 5; // juste trop peu pour une ligne de plus
    addToQueue({ type: "update", url: "/api/projects/b", method: "PATCH", body: { n: 2 } });
    const q = getQueue();
    expect(q.length).toBeGreaterThanOrEqual(1);
    expect(q.some((x) => (x.body as { n: number })?.n === 1)).toBe(true);
  });
});

describe("TEST H — une écriture abandonnée reste récupérable", () => {
  it("conserve le contenu, le projet et la raison", () => {
    addToQueue({
      type: "update",
      url: "/api/projects/3cf1895b-aaaa-bbbb-cccc-000000000000",
      method: "PATCH",
      body: { rapportMonteur: "Pose terminée, joint refait" },
    });
    /* On rejoue la mise de côté telle que `processQueue` la produit. */
    const item = getQueue()[0];
    const liste = [{
      id: item.id, url: item.url, method: item.method,
      raison: "trop-d-essais" as const,
      saisiLe: item.timestamp, abandonneLe: Date.now(),
      corps: item.body, projet: projetDeLUrl(item.url),
    }];
    localStorage.setItem("tm-offline-abandons", JSON.stringify(liste));

    const a = getAbandons()[0];
    expect(a.corps).toEqual({ rapportMonteur: "Pose terminée, joint refait" });
    expect(a.projet).toBe("3cf1895b-aaaa-bbbb-cccc-000000000000");
    expect(a.raison).toBe("trop-d-essais");
  });

  it("se renvoie dans la file d'un seul appel", () => {
    const abandon = {
      id: "ab1", url: "/api/projects/xyz", method: "PATCH",
      raison: "trop-d-essais" as const, saisiLe: 1, abandonneLe: 2,
      corps: { commentairesMontages: "à renvoyer" },
    };
    localStorage.setItem("tm-offline-abandons", JSON.stringify([abandon]));
    clearQueue();

    expect(rejouerAbandon("ab1")).toBe(true);
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].body).toEqual({ commentairesMontages: "à renvoyer" });
    /* Et il quitte la liste des abandons : il n'est plus abandonné. */
    expect(getAbandons()).toHaveLength(0);
  });

  it("ne prétend pas renvoyer ce qu'il ne trouve pas", () => {
    expect(rejouerAbandon("inexistant")).toBe(false);
  });

  it("lit le projet dans l'adresse", () => {
    expect(projetDeLUrl("/api/projects/3cf1895b-9179-8002-8fae-d0746feb4995")).toBe("3cf1895b-9179-8002-8fae-d0746feb4995");
    expect(projetDeLUrl("/api/defauts")).toBeUndefined();
  });
});

describe("la règle des réessais n'a pas changé", () => {
  it("met de côté sur un refus définitif du serveur", () => {
    expect(suiteApresEchec(1, 400)).toEqual({ action: "mettre-de-cote", motif: "refus-serveur" });
  });

  it("réessaie sur 429 et 408, qui sont temporaires", () => {
    expect(suiteApresEchec(1, 429).action).toBe("reessayer");
    expect(suiteApresEchec(1, 408).action).toBe("reessayer");
  });

  it("réessaie sur 5xx", () => {
    expect(suiteApresEchec(1, 503).action).toBe("reessayer");
  });

  it("finit par mettre de côté, sans jamais supprimer", () => {
    const s = suiteApresEchec(99);
    expect(s).toEqual({ action: "mettre-de-cote", motif: "trop-d-essais" });
  });
});
