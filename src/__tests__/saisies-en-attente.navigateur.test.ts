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

  it("ne touche ni aux autres fiches, ni aux colonnes « CabN: » fusionnées par le serveur", () => {
    file([
      PATCH("B", { rapportMonteur: "pour B" }, 1),
      PATCH("A", { heureArrivee: "Cab1:07:00", interventionsMontageCabines: "Cab2:x", attributionCabines: "Cab1:Javier" }, 2),
    ]);
    const original = { id: "A", rapportMonteur: "ancien", heureArrivee: "Cab1:06:00 | Cab2:08:00", interventionsMontageCabines: "Cab1:y" };
    const p = avecSaisiesEnAttente(original);
    expect(p).toBe(original); // rien à reporter : la même fiche, intacte
  });

  it("sans file, rend la fiche telle quelle", () => {
    const original = { id: "A", rapportMonteur: "x" };
    expect(avecSaisiesEnAttente(original)).toBe(original);
  });
});
