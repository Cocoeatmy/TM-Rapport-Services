import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ email: "ferreira.micael@gmail.com", name: "Micael", role: "admin" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("40m").sign(secret);
const h = { cookie: `auth-token=${token}`, "Content-Type": "application/json" };
const base = "https://tm-rapport-services.vercel.app";
if (process.argv[2] === "creer") {
  for (let i = 0; i < 60; i++) {
    const v = await fetch(`${base}/api/build`, { headers: h }).then((r) => r.ok ? r.json() : null).catch(() => null);
    if (v?.build === process.argv[3]) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  const r = await fetch(`${base}/api/users`, { method: "POST", headers: h,
    body: JSON.stringify({ email: "verif-charge2@tm.local", name: "Vérif charge", password: process.argv[4], role: "admin" }) });
  console.log("déployé + compte :", r.status);
} else {
  await fetch(`${base}/api/users`, { method: "PATCH", headers: h, body: JSON.stringify({ email: "verif-charge2@tm.local", role: "monteur" }) });
  const r = await fetch(`${base}/api/users`, { method: "DELETE", headers: h, body: JSON.stringify({ email: "verif-charge2@tm.local" }) });
  const d = await (await fetch(`${base}/api/users`, { headers: h })).json();
  console.log("compte supprimé :", r.status, "| comptes :", d.length);
}
