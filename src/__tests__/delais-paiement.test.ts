import { describe, it, expect } from "vitest";
import { delaisParClient } from "@/lib/delais-paiement";

const f = (id: number, client: string, date: string, echeance: string, total: number, restant: number) =>
  ({ id, nr: String(id), titre: "", total, restant, contactId: 1, date, reference: null, client, echeance });

describe("délais de paiement par client", () => {
  it("délai médian, part payée en retard, dû et échu", () => {
    const [l] = delaisParClient([
      f(1, "Dubat", "2026-08-01", "2026-08-31", 1000, 0),
      f(2, "Dubat", "2026-09-01", "2026-10-01", 2000, 0),
      f(3, "Dubat", "2026-09-10", "2026-10-10", 500, 500),
    ], { "1": "2026-08-21", "2": "2026-10-15" }, "2026-10-23");
    expect(l).toMatchObject({ client: "Dubat", factures: 3, delaiMedian: 32, partEnRetard: 50, retardMedian: 14, restant: 500, echu: 500, plusVieuxImpaye: 43 });
  });
});
