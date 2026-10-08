import { describe, it, expect } from "vitest";
import { etatLot } from "@/lib/etat-lot";

describe("etatLot", () => {
  it("un souci de montage non clôturé passe avant tout", () => {
    expect(etatLot({ etatCMD: "Soucis montage", nbCabines: 2 }, false)).toBe("souci");
    expect(etatLot({ soucisMontage: true, nbCabines: 2 }, true)).toBe("souci");
  });

  it("un souci clôturé garde son icône, mais cède le pas à un signalement ouvert", () => {
    expect(etatLot({ soucisMontage: true, soucisMontageCloture: true, nbCabines: 1 }, false)).toBe("souci-regle");
    expect(etatLot({ soucisMontage: true, soucisMontageCloture: true, nbCabines: 1 }, true)).toBe("signale");
  });

  it("un signalement réglé reste visible, au lieu de disparaître", () => {
    expect(etatLot({ nbCabines: 1 }, false, true)).toBe("signale-regle");
  });

  it("le réglé passe devant l'avancement de pose — c'est l'information rare", () => {
    const pose = { nbCabines: 1, nbCabinesInstallees: 1 };
    expect(etatLot(pose, false)).toBe("pose");
    expect(etatLot({ ...pose, soucisMontage: true, soucisMontageCloture: true }, false)).toBe("souci-regle");
    expect(etatLot(pose, false, true)).toBe("signale-regle");
  });

  it("sans rien à signaler, l'avancement parle", () => {
    expect(etatLot({ nbCabines: 2, nbCabinesInstallees: 2 }, false)).toBe("pose");
    expect(etatLot({ nbCabines: 2, nbCabinesInstallees: 1 }, false)).toBe("encours");
    expect(etatLot({ nbCabines: 2 }, false)).toBeNull();
  });
});
