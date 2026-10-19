/**
 * Les téléphones des monteurs, vus du bureau — et le geste pour les relancer.
 *
 * GET  : la liste des appareils qui ont battu ces quatorze derniers jours,
 *        avec leur état, et un résumé : combien de photos attendent, combien
 *        ont échoué pour de bon, quels rapports finalisés n'ont pas envoyé
 *        leur PDF depuis plus de vingt-quatre heures.
 *
 * POST : « relance tout » pour un appareil. Deux choses partent :
 *        1. un SIGNAL, que l'appareil lira à son prochain battement — donc
 *           à sa prochaine ouverture, si l'application est fermée ;
 *        2. une NOTIFICATION PUSH à son propriétaire. Touchée, elle rouvre
 *           l'application, qui bat, qui lit le signal, qui envoie. Sur iOS,
 *           c'est le seul fil qui atteigne une application web fermée.
 *
 * Ce que ce bouton ne peut pas faire, et qu'il faut savoir : forcer un
 * téléphone éteint, sans réseau, ou dont le propriétaire ignore la
 * notification. Il raccourcit le délai ; il ne supprime pas la physique.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { sendPushToUser } from "@/lib/send-push";
import {
  CLE_SIGNAUX, DERNIER_ETAT_CONNU_MS, ecrireChamp, lireHash, listerAppareils, resumer, statutVersion, type SignalAppareil,
} from "@/lib/appareils";
import { COQUE_APPLE_MINIMUM } from "@/lib/coque-apple";
import { versionCompilee } from "@/lib/version-web";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const maintenant = Date.now();
  const appareils = await listerAppareils(maintenant);
  const signaux = await lireHash(CLE_SIGNAUX);

  /* La version que sert CE déploiement : la dernière disponible. */
  const disponible = versionCompilee();
  return NextResponse.json({
    maintenant,
    derniereDisponible: disponible,
    coqueAppleMinimum: COQUE_APPLE_MINIMUM,
    resume: resumer(appareils, maintenant),
    appareils: appareils.map((a) => {
      let signal: SignalAppareil | null = null;
      try { signal = signaux[a.appareil] ? JSON.parse(signaux[a.appareil]) : null; } catch { /* ignore */ }
      return {
        ...a,
        signalEnAttente: signal && signal.requestedAt > a.vu ? signal : null,
        statutVersion: statutVersion(a, disponible, COQUE_APPLE_MINIMUM),
        dernierEtatConnu: maintenant - a.vu > DERNIER_ETAT_CONNU_MS,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  let corps: { appareil?: string; action?: string };
  try { corps = await request.json(); } catch { return NextResponse.json({ error: "Requête illisible" }, { status: 400 }); }
  const appareil = String(corps.appareil || "").slice(0, 64);
  if (!appareil || corps.action !== "relancer") {
    return NextResponse.json({ error: "appareil et action: \"relancer\" requis" }, { status: 400 });
  }

  const connu = (await listerAppareils()).find((a) => a.appareil === appareil);
  if (!connu) return NextResponse.json({ error: "Appareil inconnu ou disparu depuis plus de 14 jours" }, { status: 404 });

  const signal: SignalAppareil = { requestedAt: Date.now(), par: v.user.email };
  await ecrireChamp(CLE_SIGNAUX, appareil, JSON.stringify(signal));

  /* La notification : ce qui peut rouvrir une application fermée. Son échec
     n'annule pas le signal — le prochain battement le lira quand même. */
  const enAttente = connu.photosEnAttente + connu.photosEnEchec + connu.requetesEnAttente + connu.rapportsNonEnvoyes.length;
  let push: "envoyee" | "aucun-appareil" | "echec" = "aucun-appareil";
  try {
    await sendPushToUser(connu.email, {
      title: "Des envois attendent sur votre téléphone",
      message: enAttente > 0
        ? `${enAttente} élément${enAttente > 1 ? "s" : ""} à envoyer — touchez pour les faire partir.`
        : "Le bureau demande une synchronisation — touchez pour l'effectuer.",
      url: "/",
      urgent: true,
    });
    push = "envoyee";
  } catch (e) {
    push = /VAPID/.test(String(e)) ? "aucun-appareil" : "echec";
    console.warn(`[APPAREILS] push vers ${connu.email} non envoyée :`, e instanceof Error ? e.message : e);
  }

  console.log(`[APPAREILS] relance demandée par ${v.user.email} pour ${connu.nom} (${appareil})`);
  return NextResponse.json({ ok: true, signal, push, nom: connu.nom });
}
