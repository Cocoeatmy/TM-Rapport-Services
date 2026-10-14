import { describe, it, expect } from "vitest";
import {
  refusFichier,
  dureeLisible,
  moLisible,
  VIDEO_TAILLE_MAX,
  IMAGE_TAILLE_MAX,
} from "@/lib/video-limites";

const Mo = (n: number) => n * 1024 * 1024;

describe("refusFichier — vidéos", () => {
  it("laisse passer une minute de film de 60 Mo (le cas qui échouait)", () => {
    expect(refusFichier({ taille: Mo(60), type: "video/quicktime", duree: 59 })).toBeNull();
  });

  it("tolère les quelques secondes de trop d'un déclenchement à la main", () => {
    expect(refusFichier({ taille: Mo(40), type: "video/mp4", duree: 63 })).toBeNull();
  });

  it("refuse un film de trois minutes, et le dit en clair", () => {
    const r = refusFichier({ taille: Mo(50), type: "video/mp4", duree: 185 });
    expect(r).toContain("3 min 5");
    expect(r).toContain("une minute au maximum");
  });

  it("refuse au-delà du plafond Cloudinary et indique quoi changer", () => {
    const r = refusFichier({ taille: VIDEO_TAILLE_MAX + 1, type: "video/mp4", duree: 55 });
    expect(r).toContain("1080p");
  });

  it("laisse passer quand la durée est illisible — la taille protège déjà", () => {
    expect(refusFichier({ taille: Mo(20), type: "video/mp4", duree: null })).toBeNull();
    expect(refusFichier({ taille: Mo(20), type: "video/mp4" })).toBeNull();
    expect(refusFichier({ taille: Mo(20), type: "video/mp4", duree: Infinity })).toBeNull();
  });
});

describe("refusFichier — images et documents", () => {
  it("ne refuse plus une photo de 3 Mo (ancien plafond de 4 Mo, devenu sans objet)", () => {
    expect(refusFichier({ taille: Mo(3), type: "image/jpeg" })).toBeNull();
    expect(refusFichier({ taille: Mo(6), type: "application/pdf" })).toBeNull();
  });

  it("refuse au-delà des 10 Mo du compte", () => {
    expect(refusFichier({ taille: IMAGE_TAILLE_MAX + 1, type: "image/jpeg" })).toContain("10 Mo");
    expect(refusFichier({ taille: Mo(11), type: "application/pdf" })).toContain("10 Mo");
  });

  it("traite un type inconnu comme un document", () => {
    expect(refusFichier({ taille: Mo(11), type: "" })).toContain("10 Mo");
    expect(refusFichier({ taille: Mo(2), type: "" })).toBeNull();
  });
});

describe("lisibilité", () => {
  it("écrit les durées comme on les dit", () => {
    expect(dureeLisible(48)).toBe("48 s");
    expect(dureeLisible(60)).toBe("1 min");
    expect(dureeLisible(72)).toBe("1 min 12");
  });

  it("écrit les poids à la française", () => {
    expect(moLisible(Mo(1.5))).toBe("1,5 Mo");
  });
});
