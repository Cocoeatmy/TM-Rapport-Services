import { describe, it, expect, beforeEach } from "vitest";
process.env.JWT_SECRET = process.env.JWT_SECRET || "cle-de-test-sessions";
import { idSession, _definirSessionsRevoquees, _definirComptesDesactives } from "@/lib/revocation";
import { createToken, verifyToken, sessionDuJeton } from "@/lib/auth";

const user = { email: "jean-marc@test.ch", name: "Jean-Marc", role: "monteur" as const };

describe("retirer l'accès d'un seul appareil", () => {
  beforeEach(() => { _definirSessionsRevoquees([]); _definirComptesDesactives([]); });

  it("chaque connexion a sa session ; la révoquer coupe CET appareil seulement", async () => {
    const telephone = await createToken(user);
    const ipad = await createToken(user);
    const sTel = await sessionDuJeton(telephone);
    expect(sTel).toBeTruthy();
    expect(sTel).not.toBe(await sessionDuJeton(ipad));
    _definirSessionsRevoquees([sTel!]);
    expect(await verifyToken(telephone)).toBeNull();
    expect(await verifyToken(ipad)).toMatchObject({ email: user.email });
  });

  it("le renouvellement garde la session : la révocation suit l'appareil", async () => {
    const t = await createToken(user);
    const sid = (await sessionDuJeton(t))!;
    const renouvele = await createToken(user, sid);
    expect(await sessionDuJeton(renouvele)).toBe(sid);
  });

  it("anciennes sessions (sans sid) : identifiées par l'instant de connexion", () => {
    expect(idSession({ email: "A@b.ch", iat: 1700000000 })).toBe("v1:a@b.ch:1700000000");
    expect(idSession({ sid: "abc", email: "a@b.ch", iat: 1 })).toBe("abc");
  });
});
