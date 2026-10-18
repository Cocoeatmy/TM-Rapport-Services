"use client";

/**
 * Page « Appareils » — ce qui dort encore sur les téléphones des monteurs.
 *
 * « Il n'a pas pu envoyer ses photos » s'apprenait le lendemain, par le
 * client. Les téléphones rendent désormais compte toutes les trente secondes
 * quand l'application est ouverte : photos en attente, photos en échec,
 * écritures en file, rapports finalisés dont le PDF n'est pas parti.
 *
 * Le bouton « Relancer » pose un signal que l'appareil lira à son prochain
 * battement, et envoie en même temps une notification à son propriétaire —
 * sur iOS, c'est le seul fil qui atteigne une application web fermée. Il
 * raccourcit le délai ; il ne fait pas passer des octets là où il n'y a pas
 * de réseau, et la page le dit.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Smartphone, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, FileText,
} from "lucide-react";

interface RapportNonEnvoye { projectId: string; depuis: number; client: boolean; retenuPar: number }
interface Appareil {
  appareil: string;
  nom: string;
  email: string;
  role: string;
  navigateur: string;
  enLigne: boolean;
  photosEnAttente: number;
  photosEnEchec: number;
  requetesEnAttente: number;
  rapportsNonEnvoyes: RapportNonEnvoye[];
  preparesHorsLigne: number;
  preparesQuand: number;
  build: string;
  vu: number;
  signalEnAttente: { requestedAt: number; par: string } | null;
}
interface Reponse {
  maintenant: number;
  resume: {
    appareils: number; photosEnAttente: number; photosEnEchec: number;
    requetesEnAttente: number; rapportsNonEnvoyes: number;
    bloques: { appareil: string; nom: string; projectId: string; depuis: number }[];
  };
  appareils: Appareil[];
}

const JOUR_MS = 24 * 3600_000;

/** « il y a 3 min », « il y a 2 h », « il y a 4 j ». */
function ilYA(t: number, maintenant: number): string {
  if (!t) return "jamais";
  const min = Math.max(0, Math.round((maintenant - t) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** Un nom d'appareil lisible, tiré du navigateur. */
function typeAppareil(ua: string): string {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Appareil";
}

/** Les noms de chantiers que ce poste connaît déjà, pour ne pas afficher des identifiants. */
function nomsDeProjets(): Record<string, string> {
  try {
    const brut = localStorage.getItem("tm-projects-cache");
    if (!brut) return {};
    const out: Record<string, string> = {};
    for (const liste of Object.values(JSON.parse(brut) as Record<string, { id?: string; projet?: string; ofrTM?: string }[]>)) {
      if (!Array.isArray(liste)) continue;
      for (const p of liste) if (p?.id) out[p.id] = [p.ofrTM, p.projet].filter(Boolean).join(" · ");
    }
    return out;
  } catch {
    return {};
  }
}

export default function AppareilsPage() {
  const router = useRouter();
  const [autorise, setAutorise] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role !== "admin") { router.replace("/"); setAutorise(false); }
        else setAutorise(true);
      })
      .catch(() => { router.replace("/"); setAutorise(false); });
  }, [router]);

  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [relance, setRelance] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(() => {
    fetch("/api/admin/appareils")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Reponse) => { setDonnees(d); setErreur(null); })
      .catch((e) => setErreur(String(e.message || e)));
  }, []);

  useEffect(() => {
    if (!autorise) return;
    setNoms(nomsDeProjets());
    charger();
    /* Les téléphones battent toutes les trente secondes : relire au même
       rythme suffit à voir l'effet d'une relance sans recharger la page. */
    const t = setInterval(() => { if (!document.hidden) charger(); }, 30_000);
    return () => clearInterval(t);
  }, [autorise, charger]);

  async function relancer(a: Appareil) {
    setRelance(a.appareil); setMessage(null); setErreur(null);
    try {
      const r = await fetch("/api/admin/appareils", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appareil: a.appareil, action: "relancer" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMessage(
        d.push === "envoyee"
          ? `Relance envoyée à ${a.nom} : notification partie. Le téléphone enverra dès qu'il sera ouvert avec du réseau.`
          : `Relance posée pour ${a.nom}. Pas de notification possible (aucun abonnement sur ce téléphone) : elle partira à la prochaine ouverture de l'application.`,
      );
      charger();
    } catch (e) {
      setErreur(`Relance impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRelance(null);
    }
  }

  if (autorise === false) return null;

  const maintenant = donnees?.maintenant || Date.now();
  const r = donnees?.resume;
  const totalEnAttente = r ? r.photosEnAttente + r.photosEnEchec + r.requetesEnAttente + r.rapportsNonEnvoyes : 0;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" /> Appareils
        </h2>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Ce que chaque téléphone a signalé à son dernier passage en ligne. Un
        téléphone ne rend compte que lorsque l&apos;application est ouverte :
        « vu il y a 2 h » veut dire qu&apos;on ne sait rien de plus récent.
      </p>

      {erreur && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{erreur}</span>
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-300 flex gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> <span>{message}</span>
        </div>
      )}

      {!donnees ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture…
        </p>
      ) : (
        <>
          <section className="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><div className="text-2xl font-bold">{r!.photosEnAttente}</div><div className="text-xs text-gray-500">photos en attente</div></div>
            <div><div className={`text-2xl font-bold ${r!.photosEnEchec > 0 ? "text-red-600" : ""}`}>{r!.photosEnEchec}</div><div className="text-xs text-gray-500">photos en échec</div></div>
            <div><div className="text-2xl font-bold">{r!.requetesEnAttente}</div><div className="text-xs text-gray-500">écritures en file</div></div>
            <div><div className={`text-2xl font-bold ${r!.bloques.length > 0 ? "text-red-600" : ""}`}>{r!.rapportsNonEnvoyes}</div><div className="text-xs text-gray-500">rapports non envoyés{r!.bloques.length > 0 ? ` · ${r!.bloques.length} > 24 h` : ""}</div></div>
          </section>

          {donnees.appareils.length === 0 && (
            <p className="text-sm text-gray-500">
              Aucun appareil n&apos;a encore rendu compte. Ils apparaîtront ici dès
              que les monteurs ouvriront la nouvelle version de l&apos;application.
            </p>
          )}

          {totalEnAttente === 0 && donnees.appareils.length > 0 && (
            <p className="mb-4 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Rien n&apos;attend sur aucun téléphone.
            </p>
          )}

          <div className="space-y-3">
            {donnees.appareils.map((a) => {
              const enAttente = a.photosEnAttente + a.photosEnEchec + a.requetesEnAttente + a.rapportsNonEnvoyes.length;
              const ancien = maintenant - a.vu > 2 * 3600_000;
              return (
                <section key={a.appareil} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{a.nom}</div>
                      <div className="text-xs text-gray-500">
                        {typeAppareil(a.navigateur)} · vu{" "}
                        <span className={ancien ? "text-amber-600 dark:text-amber-400" : ""}>{ilYA(a.vu, maintenant)}</span>
                        {a.preparesQuand > 0 && <> · {a.preparesHorsLigne} chantier{a.preparesHorsLigne > 1 ? "s" : ""} prêt{a.preparesHorsLigne > 1 ? "s" : ""} hors ligne ({ilYA(a.preparesQuand, maintenant)})</>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => relancer(a)}
                      disabled={relance === a.appareil}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {relance === a.appareil ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Relancer
                    </button>
                  </div>

                  {a.signalEnAttente && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                      Relance demandée {ilYA(a.signalEnAttente.requestedAt, maintenant)} — en attente de la prochaine ouverture du téléphone.
                    </p>
                  )}

                  {enAttente === 0 ? (
                    <p className="text-sm text-green-700 dark:text-green-400">Rien en attente.</p>
                  ) : (
                    <div className="text-sm space-y-1">
                      {(a.photosEnAttente + a.photosEnEchec) > 0 && (
                        <p className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                          {a.photosEnAttente} envoi{a.photosEnAttente > 1 ? "s" : ""} de photos en attente
                          {a.photosEnEchec > 0 && <span className="text-red-600 font-semibold">· {a.photosEnEchec} en échec</span>}
                        </p>
                      )}
                      {a.requetesEnAttente > 0 && (
                        <p className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-gray-400" />
                          {a.requetesEnAttente} écriture{a.requetesEnAttente > 1 ? "s" : ""} en file (heures, rapports, signalements)
                        </p>
                      )}
                      {a.rapportsNonEnvoyes.map((rp) => {
                        const bloque = maintenant - rp.depuis > JOUR_MS;
                        return (
                          <p key={rp.projectId} className={`flex items-start gap-2 ${bloque ? "text-red-600 font-semibold" : ""}`}>
                            <FileText className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                            <span>
                              Rapport{" "}
                              <Link href={`/projet/${rp.projectId}`} className="underline">
                                {noms[rp.projectId] || rp.projectId.slice(0, 8)}
                              </Link>{" "}
                              finalisé {ilYA(rp.depuis, maintenant)}, PDF non envoyé
                              {rp.retenuPar > 0 ? ` — attend encore ${rp.retenuPar} envoi${rp.retenuPar > 1 ? "s" : ""}` : ""}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
