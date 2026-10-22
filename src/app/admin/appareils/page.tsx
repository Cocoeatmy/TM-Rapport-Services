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
  ArrowLeft, Smartphone, Tablet, Laptop, Monitor, RefreshCw, Loader2, AlertTriangle, CheckCircle2,
  Image as ImageIcon, FileText, Pencil, ChevronDown,
} from "lucide-react";
import type { VersionWeb } from "@/lib/version-web";

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
  versionWeb?: VersionWeb | null;
  natif?: { coque: string | null; build: string | null; systeme: string | null; versionSysteme: string | null; modele: string | null } | null;
  plateforme?: string;
  systemeNavigateur?: string | null;
  maj?: { etat: string; verifieLe: number | null } | null;
  statutVersion: "a-jour" | "web-en-retard" | "natif-ancien" | "inconnu";
  dernierEtatConnu: boolean;
  logiciel?: string | null;
  /** Le nom donné à cet accès par l'administrateur. */
  surnom?: string | null;
}
interface Reponse {
  maintenant: number;
  derniereDisponible: VersionWeb | null;
  coqueAppleMinimum: string;
  resume: {
    appareils: number; photosEnAttente: number; photosEnEchec: number;
    requetesEnAttente: number; rapportsNonEnvoyes: number;
    bloques: { appareil: string; nom: string; projectId: string; depuis: number }[];
  };
  appareils: Appareil[];
}

const JOUR_MS = 24 * 3600_000;
/** Au-delà de trois jours sans nouvelles, un accès passe dans « Anciens accès ». */
const ANCIEN_MS = 3 * JOUR_MS;

/** « 22 oct. à 07:19 » — l'heure de mise en ligne d'une version, à l'heure suisse. */
function dateVersion(v: VersionWeb | null | undefined): string | null {
  if (!v?.compile) return null;
  const d = new Date(v.compile);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("fr-CH", { day: "numeric", month: "short" })} à ${d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Le logiciel, en clair. Les anciens battements ne le disaient pas : on le déduit. */
function logiciel(a: Appareil): string {
  const l = a.logiciel || (a.natif ? "app-apple" : null);
  if (l === "app-apple") return a.plateforme === "Mac" ? "App Apple (Mac)" : "App Apple";
  if (l === "ecran-accueil") return "App web (écran d'accueil)";
  if (l && l !== "navigateur") return l;
  const ua = a.navigateur || "";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Navigateur";
}

function plateforme(a: Appareil): string {
  return a.plateforme && a.plateforme !== "autre" ? a.plateforme : typeAppareil(a.navigateur);
}

/** L'icône de l'appareil : iPhone, iPad, Mac portable ou de bureau… */
function IconeAppareil({ a }: { a: Appareil }) {
  const p = plateforme(a);
  const nom = (a.surnom || "").toLowerCase();
  const cls = "w-5 h-5";
  if (p === "iPhone" || p === "Android") return <Smartphone className={cls} />;
  if (p === "iPad") return <Tablet className={cls} />;
  if (p === "Mac") return /studio|imac|mini|pro display|bureau/.test(nom) ? <Monitor className={cls} /> : <Laptop className={cls} />;
  return <Monitor className={cls} />;
}

/** « iOS 18.7 · App 1.0 (5) » — le détail, en petit. */
function detailTechnique(a: Appareil): string {
  const systeme = a.natif?.systeme
    ? [a.natif.systeme, a.natif.versionSysteme].filter(Boolean).join(" ")
    : a.systemeNavigateur || null;
  const app = a.natif?.coque ? `App ${a.natif.coque}${a.natif.build ? ` (${a.natif.build})` : ""}` : null;
  return [systeme, app].filter(Boolean).join(" · ");
}

const STATUT_COURT: Record<Appareil["statutVersion"], { texte: string; classe: string }> = {
  "a-jour": { texte: "À jour", classe: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
  "web-en-retard": { texte: "Ancienne version", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  "natif-ancien": { texte: "App à mettre à jour", classe: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  "inconnu": { texte: "Version inconnue", classe: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

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

  async function nommer(a: Appareil) {
    const nom = window.prompt(
      "Nom de cet accès (ex. « MacBook Pro », « Mac Studio », « iPad du dépôt »). Laisser vide pour l'effacer.",
      a.surnom || "",
    );
    if (nom === null) return;
    try {
      const r = await fetch("/api/admin/appareils", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appareil: a.appareil, action: "nommer", nom }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      charger();
    } catch (e) {
      setErreur(`Nom non enregistré : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  if (autorise === false) return null;

  const maintenant = donnees?.maintenant || Date.now();
  const r = donnees?.resume;
  const totalEnAttente = r ? r.photosEnAttente + r.photosEnEchec + r.requetesEnAttente + r.rapportsNonEnvoyes : 0;
  const derniere = dateVersion(donnees?.derniereDisponible);

  /* Un bloc par personne ; dans chaque bloc, les accès récents d'abord. */
  const groupes = (() => {
    const m = new Map<string, Appareil[]>();
    for (const a of donnees?.appareils || []) {
      const k = a.email || a.nom;
      m.set(k, [...(m.get(k) || []), a]);
    }
    return [...m.values()].map((liste) => {
      const tri = liste.slice().sort((x, y) => y.vu - x.vu);
      const recents = tri.filter((a) => maintenant - a.vu <= ANCIEN_MS);
      const anciens = tri.filter((a) => maintenant - a.vu > ANCIEN_MS);
      const enRetard = recents.filter((a) => a.statutVersion === "web-en-retard" || a.statutVersion === "natif-ancien").length;
      const attente = tri.reduce((n, a) => n + a.photosEnAttente + a.photosEnEchec + a.requetesEnAttente + a.rapportsNonEnvoyes.length, 0);
      return { nom: tri[0].nom, cle: tri[0].email || tri[0].nom, recents, anciens, enRetard, attente, vu: tri[0].vu };
    }).sort((x, y) => (y.attente - x.attente) || (y.enRetard - x.enRetard) || x.nom.localeCompare(y.nom));
  })();
  const accesRecents = groupes.reduce((n, g) => n + g.recents.length, 0);
  const accesAJour = groupes.reduce((n, g) => n + g.recents.filter((a) => a.statutVersion === "a-jour").length, 0);

  const ligne = (a: Appareil) => {
    const enAttente = a.photosEnAttente + a.photosEnEchec + a.requetesEnAttente + a.rapportsNonEnvoyes.length;
    const ancien = maintenant - a.vu > 2 * 3600_000;
    const st = STATUT_COURT[a.statutVersion] || STATUT_COURT.inconnu;
    const versionDe = dateVersion(a.versionWeb);
    const detail = detailTechnique(a);
    return (
      <li key={a.appareil} className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center">
            <IconeAppareil a={a} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-sm">{a.surnom || plateforme(a)}</span>
              <span className="text-xs text-gray-500">{a.surnom ? `${plateforme(a)} · ` : ""}{logiciel(a)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.classe}`}
                title={a.versionWeb?.sha ? `commit ${a.versionWeb.sha.slice(0, 7)}` : undefined}
                data-testid="appareil-version">
                {st.texte}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              vu <span className={ancien ? "text-amber-600 dark:text-amber-400" : ""}>{ilYA(a.vu, maintenant)}</span>
              {a.statutVersion === "web-en-retard" && versionDe && <> · version du {versionDe}{a.maj?.etat === "prete" || a.maj?.etat === "disponible" ? " — la nouvelle s'installe à la prochaine ouverture" : ""}</>}
              {a.statutVersion === "natif-ancien" && <> · mettre à jour l&apos;app depuis TestFlight</>}
              {!a.enLigne && <> · hors ligne</>}
              {a.preparesQuand > 0 && <> · {a.preparesHorsLigne} chantier{a.preparesHorsLigne > 1 ? "s" : ""} hors ligne</>}
              {detail && <span className="text-gray-400"> · {detail}</span>}
            </p>
            {a.signalEnAttente && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Relance demandée {ilYA(a.signalEnAttente.requestedAt, maintenant)} — en attente de la prochaine ouverture.
              </p>
            )}
            {enAttente > 0 && (
              <div className="text-sm space-y-1 mt-1.5">
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
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => nommer(a)} title="Nommer cet accès" aria-label="Nommer cet accès"
              className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => relancer(a)}
              disabled={relance === a.appareil}
              title="Relancer les envois de cet accès"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-2.5 h-8 text-xs font-semibold text-white disabled:opacity-50"
            >
              {relance === a.appareil ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Relancer
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-3">
        <h2 className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" /> Appareils
        </h2>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Chaque app ou navigateur compte pour un <b>accès</b> : l&apos;app Apple et Safari d&apos;un même iPhone font deux lignes.
        Le crayon permet de nommer un accès (« MacBook Pro », « Mac Studio ») pour le reconnaître.
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
          {/* La version : une seule question — tout le monde est-il à jour ? */}
          <section className={`mb-3 rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${accesAJour === accesRecents
            ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
            : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900"}`}>
            <div>
              <div className="text-sm font-semibold">
                {accesAJour === accesRecents ? "Tout le monde est sur la dernière version" : `${accesRecents - accesAJour} accès sur une ancienne version`}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Dernière version mise en ligne {derniere ? `le ${derniere}` : "— date inconnue"}</div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{accesAJour}<span className="text-sm font-medium text-gray-500"> / {accesRecents} à jour</span></div>
          </section>

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
              <CheckCircle2 className="w-4 h-4" /> Rien n&apos;attend sur aucun appareil.
            </p>
          )}

          <div className="space-y-3">
            {groupes.map((g) => {
              const initiales = g.nom.split(/\s+/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
              const voirAnciens = ouverts.has(g.cle);
              return (
                <section key={g.cle} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <header className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="w-9 h-9 rounded-full bg-[#1e3a5f] text-white text-xs font-bold flex items-center justify-center shrink-0">{initiales}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{g.nom}</div>
                      <div className="text-xs text-gray-500">
                        {g.recents.length} accès actif{g.recents.length > 1 ? "s" : ""} · vu {ilYA(g.vu, maintenant)}
                      </div>
                    </div>
                    {g.enRetard > 0
                      ? <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{g.enRetard} à mettre à jour</span>
                      : g.recents.length > 0 && <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300">Tout à jour</span>}
                    {g.attente > 0 && <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">{g.attente} en attente</span>}
                  </header>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {g.recents.map(ligne)}
                    {voirAnciens && g.anciens.map(ligne)}
                  </ul>
                  {g.anciens.length > 0 && (
                    <button type="button"
                      onClick={() => setOuverts((prev) => { const n = new Set(prev); if (n.has(g.cle)) n.delete(g.cle); else n.add(g.cle); return n; })}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${voirAnciens ? "rotate-180" : ""}`} />
                      {voirAnciens ? "Masquer" : "Voir"} {g.anciens.length} ancien{g.anciens.length > 1 ? "s" : ""} accès (sans nouvelles depuis plus de 3 jours — effacés après 14)
                    </button>
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
