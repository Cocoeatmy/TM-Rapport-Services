/**
 * Ce que le compte connecté a le droit de faire.
 *
 * L'interface s'en sert pour ne pas proposer un bouton qui mènera à un refus.
 * Ce n'est qu'un confort d'affichage : la décision appartient aux contrôles
 * posés devant chaque opération, jamais à cette réponse.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { droitsDe } from "@/lib/droits-serveur";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const d = await droitsDe(user);
  return NextResponse.json({
    email: user.email,
    nom: user.name,
    profil: d.profil,
    perimetre: d.perimetre,
    droits: Object.fromEntries(Object.entries(d.droits).map(([id, v]) => [id, v.niveau])),
  });
}
