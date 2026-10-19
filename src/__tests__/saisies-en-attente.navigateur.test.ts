/**
 * Une fiche rouverte affiche les corrections encore en file, pas la copie du
 * matin — sinon l'enregistrement automatique suivant renvoie l'ancien texte
 * par-dessus la correction (scénario 60, test 5, 19.10.2026).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { avecSaisiesEnAttente } from "@/lib/offline";

const file = (items: unknown[]) => localStorage.setItem("tm-rapport-queue", JSON.stringify(items));
const PATCH = (id: string, body: unknown, n: number) =>
  ({ id: `q${n}`, type: "update", url: `/api/projects/${id}`, method: "PATCH", body, timestamp: n });

beforeEach(() => localStorage.clear());

describe("les saisies en attente reportées sur la fiche", () => {
  it("la dernière correction en file l'emporte sur la copie", () => {
    file([PATCH("A", { rapportMonteur: "V1" }, 1), PATCH("A", { rapportMonteur: "V2", commentairesMontages: "note" }, 2)]);
    const p = avecSaisiesEnAttente({ id: "A", rapportMonteur: "ancien", commentairesMontages: "" });
    expect(p.rapportMonteur).toBe("V2");
    expect(p.commentairesMontages).toBe("note");
  });

  it("ne touche pas aux autres fiches", () => {
    file([PATCH("B", { rapportMonteur: "pour B", heureArrivee: "Cab1:09:00" }, 1)]);
    const original = { id: "A", rapportMonteur: "ancien", heureArrivee: "Cab1:06:00" };
    expect(avecSaisiesEnAttente(original)).toBe(original);
  });

  it("colonnes par lot : la fusion du serveur, sans rien perdre des autres lots (cas TEST 5 du 19.10.2026)", () => {
    // La file réellement relevée en production, lot 4 rempli hors ligne.
    file([
      PATCH("A", { attributionCabines: "Cab4:Micael" }, 1),
      PATCH("A", { interventionsMontageCabines: "Cab4:2026-10-19~Micael", heureArrivee: "Cab4:", heureDepart: "Cab4:", attributionCabines: "Cab4:Micael" }, 2),
      PATCH("A", { interventionsMontageCabines: "Cab4:2026-10-19~Micael~13:30", heureArrivee: "Cab4:2026-10-19:13:30", heureDepart: "Cab4:", attributionCabines: "Cab4:Micael" }, 3),
    ]);
    const p = avecSaisiesEnAttente({
      id: "A",
      heureArrivee: "Cab1:2026-10-14:21:27 | Cab2:2026-10-16:22:03 | Cab3:2026-10-18:22:35",
      heureDepart: "Cab1:2026-10-14: | Cab2:2026-10-16:22:05 | Cab3:2026-10-18:22:37",
      attributionCabines: "Cab1:Micael | Cab2:Micael | Cab3:Micael",
      interventionsMontageCabines: "Cab1:2026-10-14~Micael~21:27 | Cab2:2026-10-16~Micael~22:03~22:05 | Cab3:2026-10-18~Micael~22:35~22:37",
    });
    expect(p.heureArrivee).toBe("Cab1:2026-10-14:21:27 | Cab2:2026-10-16:22:03 | Cab3:2026-10-18:22:35 | Cab4:2026-10-19:13:30");
    expect(p.heureDepart).toBe("Cab1:2026-10-14: | Cab2:2026-10-16:22:05 | Cab3:2026-10-18:22:37");
    expect(p.attributionCabines).toBe("Cab1:Micael | Cab2:Micael | Cab3:Micael | Cab4:Micael");
    expect(p.interventionsMontageCabines).toContain("Cab4:2026-10-19~Micael~13:30");
    expect(p.interventionsMontageCabines).toContain("Cab1:2026-10-14~Micael~21:27");
  });

  it("sans file, rend la fiche telle quelle", () => {
    const original = { id: "A", rapportMonteur: "x" };
    expect(avecSaisiesEnAttente(original)).toBe(original);
  });
});
