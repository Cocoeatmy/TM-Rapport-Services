"use client";

import { useEffect, useRef, useState } from "react";
import { reseauDegrade } from "@/lib/reseau";
import { WifiOff, CloudUpload, RefreshCw, AlertTriangle, ChevronDown, X } from "lucide-react";
import { isOnline, getQueue, removeFromQueue, warmOfflineCache, getLastCacheWarmTs, getAbandons, clearAbandons, rejouerAbandon } from "@/lib/offline";
import type { Abandon } from "@/lib/offline";
import type { QueueItem } from "@/lib/offline";
import {
  countPendingUploads,
  countPermanentlyFailed,
  retryAllFailedUploads,
  processPendingUploads,
  getPendingUploads,
} from "@/lib/idb-uploads";
import type { PendingUpload } from "@/lib/idb-uploads";
import {
  projetsConnus, referenceProjet, natureDePhoto, natureDeSaisie, projetDeSaisie,
  lireHistorique, noterDansHistorique, type LigneHistorique, type EntreePhoto, type EntreeSaisie,
} from "@/lib/libelles-synchro";

/**
 * Bannière globale qui prévient l'utilisateur quand l'app est hors
 * ligne ou quand des opérations attendent d'être synchronisées.
 *
 * - Hors ligne avec écritures en attente : bandeau orange "Hors
 *   ligne — N opération(s) en attente, synchro auto au retour".
 * - Hors ligne sans queue : bandeau gris "Hors ligne — vous pouvez
 *   continuer à travailler".
 * - En ligne avec queue (par ex. après un offline → retour réseau) :
 *   bandeau bleu "Synchronisation de N opération(s)…", qui disparaît
 *   automatiquement quand la queue est vide.
 *
 * Au survol du bandeau → tooltip avec le détail de chaque opération.
 *
 * Rendu en `position: sticky` au-dessus du contenu, sous le header.
 * Réagit aux événements `online`/`offline` du navigateur et à
 * l'événement custom `tm-offline-queued` envoyé par offlineFetch.
 */

/** « TM-2600825 — Heures d'intervention » : le projet d'abord, puis ce qui part. */
function describeQueueItem(item: QueueItem): string {
  const projets = projetsConnus();
  const e: EntreeSaisie = { url: item.url, method: item.method, body: item.body, type: item.type };
  const ref = referenceProjet(projetDeSaisie(e), projets);
  return ref ? `${ref} — ${natureDeSaisie(e)}` : natureDeSaisie(e);
}

/** « TM-2600825 — Photo montage gauche 2 · lot 1 ». */
function describePendingUpload(up: PendingUpload): string {
  const ref = referenceProjet(up.projectId, projetsConnus());
  return `${ref} — ${natureDePhoto(up as unknown as EntreePhoto)}`;
}

/** L'état d'une opération, tel que l'annonce la file. */
type EtatOperation = { etat: "en-cours" | "octets-envoyes" | "envoyee" | "echec"; pct?: number; nouvelEssai?: number; reason?: string };

function texteEtat(e: EtatOperation | undefined, nextAttemptAt: number | undefined, reason: string | undefined, enLigne = true): { texte: string; ton: string } {
  /* Sans réseau, rien n'a « échoué » : tout attend, en sûreté sur l'appareil. */
  if (!enLigne && e?.etat !== "envoyee") return { texte: "En attente du réseau — gardée sur l'appareil", ton: "text-gray-500 dark:text-gray-400" };
  const prevu = e?.etat === "echec" ? e.nouvelEssai : (nextAttemptAt && nextAttemptAt > Date.now() ? nextAttemptAt : undefined);
  if (e?.etat === "en-cours") return { texte: `Envoi en cours${typeof e.pct === "number" ? ` · ${e.pct} %` : ""}`, ton: "text-blue-600 dark:text-blue-300" };
  if (e?.etat === "octets-envoyes") return { texte: "Envoyée · enregistrement dans le projet…", ton: "text-blue-600 dark:text-blue-300" };
  if (e?.etat === "envoyee") return { texte: "Synchronisée", ton: "text-emerald-600 dark:text-emerald-400" };
  if (prevu) {
    /* Une coupure se dit « nouvel essai » ; le motif n'est montré que pour
       une vraie erreur (refus du serveur, fichier illisible…). */
    const brut = e?.reason || reason || "";
    const motif = /^Réseau/i.test(brut) ? "" : brut;
    return { texte: `Échec — nouvel essai à ${new Date(prevu).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${motif ? ` (${motif})` : ""}`, ton: "text-amber-600 dark:text-amber-400" };
  }
  return { texte: "En attente", ton: "text-gray-500 dark:text-gray-400" };
}

/** Formate un timestamp en heure lisible. */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export function OfflineBanner() {
  const [online, setOnline]               = useState(true);
  const [queueCount, setQueueCount]       = useState(0);
  const [queueItems, setQueueItems]       = useState<QueueItem[]>([]);
  const [pendingUps, setPendingUps]       = useState<PendingUpload[]>([]);
  const [warming, setWarming]             = useState(false);
  const [lastWarm, setLastWarm]           = useState(0);
  const [showWarmOk, setShowWarmOk]       = useState(false);
  const [failedCount, setFailedCount]     = useState(0);
  const [failedReason, setFailedReason]   = useState("");
  const [retrying, setRetrying]           = useState(false);
  const [showDetails, setShowDetails]     = useState(false);
  const [abandons, setAbandons]           = useState<Abandon[]>([]);
  /** Vrai quand une saisie n'a PAS pu être rangée faute de place. */
  const [stockagePlein, setStockagePlein]  = useState(false);
  /* Réseau présent mais qui ne passe pas : l'état le plus courant sur un
     chantier, et le seul qui n'était signalé nulle part. */
  const [faible, setFaible]               = useState(false);
  /* Où en est chaque opération (annoncé par les files), combien de photos
     sont arrivées pendant cette synchronisation, et ce qui est parti. */
  const [etats, setEtats]                 = useState<Record<string, EtatOperation>>({});
  const [envoyeesSession, setEnvoyeesSession] = useState(0);
  const [historique, setHistorique]       = useState<LigneHistorique[]>([]);
  const [ouverte, setOuverte]             = useState<string | null>(null);
  const [voirHistorique, setVoirHistorique] = useState(false);
  /** Instant où la file s'est vidée en ligne : un « tout est synchronisé » visible. */
  const [toutEnvoyeA, setToutEnvoyeA]     = useState(0);
  const precedentRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const upCount = await countPendingUploads();
      const failCount = await countPermanentlyFailed();
      const uploads = await getPendingUploads({ status: "pending" });
      const items = getQueue();
      if (cancelled) return;
      setOnline(isOnline());
      setFaible(reseauDegrade());
      setQueueCount(items.length + upCount);
      const restant = items.length + upCount;
      /* « Tout est synchronisé » seulement si TOUT est confirmé : aucune photo
         en échec, aucune saisie mise de côté ou abandonnée. Une photo qui
         passe en échec définitif quitte la file des envois — sans cette
         condition, la file vide aurait annoncé un faux succès. */
      const toutConfirme = restant === 0 && failCount === 0 && getAbandons().length === 0;
      if (toutConfirme && precedentRef.current > 0 && isOnline()) {
        setToutEnvoyeA(Date.now());
        setTimeout(() => { if (!cancelled) setToutEnvoyeA(0); }, 12_000);
      }
      precedentRef.current = restant;
      if (restant === 0) { setEnvoyeesSession(0); setEtats({}); }
      setQueueItems(items);
      setPendingUps(uploads);
      setLastWarm(getLastCacheWarmTs());
      setFailedCount(failCount);
      setAbandons(getAbandons());
      // Récupère le motif d'échec le plus récent pour diagnostic visible.
      if (failCount > 0) {
        try {
          const failed = await getPendingUploads({ status: "permanently-failed" });
          if (!cancelled) {
            const reasons = failed.map((f) => f.reason).filter(Boolean) as string[];
            setFailedReason(reasons[0] || "");
          }
        } catch {}
      } else if (!cancelled) {
        setFailedReason("");
      }
    };
    refresh();

    // Préchauffage automatique au chargement (silencieux, cooldown 15 min)
    warmOfflineCache().catch(() => {});

    const handleOnline = () => {
      refresh();
      // Quand le réseau revient, on réchauffe immédiatement
      warmOfflineCache(true).then((n) => {
        if (n > 0 && !cancelled) { setLastWarm(getLastCacheWarmTs()); setShowWarmOk(true); setTimeout(() => setShowWarmOk(false), 4000); }
      }).catch(() => {});
    };

    const handleWarmed = () => { setLastWarm(getLastCacheWarmTs()); };
    /* Le pire des cas : la saisie n'est même pas en file. Il ne s'efface pas
       tout seul — le monteur doit le voir et agir. */
    const surStockagePlein = () => setStockagePlein(true);

    setHistorique(lireHistorique());
    const surPhoto = (ev: Event) => {
      const d = (ev as CustomEvent).detail as EtatOperation & { id: string; entree?: EntreePhoto };
      if (!d?.id) return;
      setEtats((prev) => ({ ...prev, [d.id]: { etat: d.etat, pct: d.pct, nouvelEssai: d.nouvelEssai, reason: d.reason } }));
      if (d.etat === "envoyee") {
        setEnvoyeesSession((n) => n + Math.max(1, d.entree?.files?.length ?? 1));
        if (d.entree) {
          noterDansHistorique({ libelle: `${referenceProjet(d.entree.projectId, projetsConnus())} — ${natureDePhoto(d.entree)}`, quand: Date.now(), genre: "photo" });
          setHistorique(lireHistorique());
        }
      }
    };
    const surSaisie = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { id: string; etat: EtatOperation["etat"]; nouvelEssai?: number; entree?: EntreeSaisie };
      if (!d?.id) return;
      setEtats((prev) => ({ ...prev, [d.id]: { etat: d.etat, nouvelEssai: d.nouvelEssai } }));
      if (d.etat === "envoyee" && d.entree) {
        const ref = referenceProjet(projetDeSaisie(d.entree), projetsConnus());
        noterDansHistorique({ libelle: `${ref ? `${ref} — ` : ""}${natureDeSaisie(d.entree)}`, quand: Date.now(), genre: "saisie" });
        setHistorique(lireHistorique());
        refresh();
      }
    };
    window.addEventListener("tm-envoi-progression", surPhoto);
    window.addEventListener("tm-saisie-progression", surSaisie);
    window.addEventListener("tm-reseau", refresh);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("tm-offline-queued",             refresh);
    window.addEventListener("tm-pending-upload-added",       refresh);
    window.addEventListener("tm-pending-upload-removed",     refresh);
    window.addEventListener("tm-cache-warmed",               handleWarmed);
    window.addEventListener("tm-upload-permanently-failed",  refresh);
    window.addEventListener("tm-abandon",                    refresh);
    window.addEventListener("tm-offline-queue-pleine",       surStockagePlein);

    // Poll de sécurité (l'essentiel passe par les events online/offline/upload
    // ci-dessus) : 20 s au lieu de 5 s, et rien quand l'app est en arrière-plan
    // → économise la batterie.
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, 20000);

    return () => {
      cancelled = true;
      window.removeEventListener("tm-envoi-progression", surPhoto);
      window.removeEventListener("tm-saisie-progression", surSaisie);
      window.removeEventListener("tm-reseau", refresh);
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tm-offline-queued",             refresh);
      window.removeEventListener("tm-pending-upload-added",       refresh);
      window.removeEventListener("tm-pending-upload-removed",     refresh);
      window.removeEventListener("tm-cache-warmed",               handleWarmed);
      window.removeEventListener("tm-upload-permanently-failed",  refresh);
      window.removeEventListener("tm-abandon",                    refresh);
      window.removeEventListener("tm-offline-queue-pleine",       surStockagePlein);
      clearInterval(interval);
    };
  }, []);

  const handleRetryFailed = async () => {
    if (!isOnline()) return;
    setRetrying(true);
    try {
      await retryAllFailedUploads();
      await processPendingUploads();
      setFailedCount(await countPermanentlyFailed());
    } finally {
      setRetrying(false);
    }
  };

  /** Abandonne manuellement un item de synchro coincé. */
  const handleRemoveItem = (id: string) => {
    removeFromQueue(id);
    const items = getQueue();
    setQueueItems(items);
    countPendingUploads().then((up) => setQueueCount(items.length + up));
  };

  const handleManualWarm = async () => {
    setWarming(true);
    try {
      await warmOfflineCache(true);
      setLastWarm(getLastCacheWarmTs());
      setShowWarmOk(true);
      setTimeout(() => setShowWarmOk(false), 3000);
    } finally {
      setWarming(false);
    }
  };

  /* LE PIRE DES CAS : le stockage de l'appareil est saturé et la saisie
     n'est nulle part. Avant le 17 octobre 2026, l'application répondait
     « enregistré » dans cette situation (audit A4). Elle le dit maintenant,
     en premier et sans fioriture. */
  if (stockagePlein) {
    return (
      <div role="alert" aria-live="assertive"
        className="w-full px-3 py-2 text-xs flex items-center justify-center gap-2 shadow-md bg-red-800 text-white">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight font-semibold">
          Mémoire de l&apos;appareil saturée — votre dernière saisie n&apos;a PAS été enregistrée
          <span className="block text-[10px] font-normal opacity-90">
            Synchronisez ce qui attend, puis recommencez. Ne quittez pas le chantier sans l&apos;avoir fait.
          </span>
        </span>
        <button
          onClick={() => setStockagePlein(false)}
          className="ml-2 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors font-semibold whitespace-nowrap"
        >
          J&apos;ai compris
        </button>
      </div>
    );
  }

  /* Saisies abandonnées par la file d'attente. Elles l'étaient en silence :
     le collaborateur croyait avoir enregistré, et seule la console du
     navigateur en gardait trace. Tant qu'il n'a pas acquitté, on le dit. */
  if (abandons.length > 0) {
    const plusAncien = abandons[abandons.length - 1];
    const motifs: Record<Abandon["raison"], string> = {
      "trop-ancien": "en attente depuis plus de deux semaines",
      "refus-serveur": "refusée par le serveur",
      "trop-d-essais": "huit tentatives sans succès",
    };
    return (
      <div role="alert" aria-live="assertive"
      className="w-full px-3 py-2 text-xs flex items-center justify-center gap-2 shadow-md bg-red-700 text-white">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">
          {abandons.length} modification{abandons.length > 1 ? "s" : ""} n&apos;{abandons.length > 1 ? "ont" : "a"} pas pu être enregistrée{abandons.length > 1 ? "s" : ""} — à ressaisir
          <span className="block text-[10px] font-normal opacity-90">
            {describeQueueItem({ ...plusAncien, type: "update", timestamp: plusAncien.saisiLe } as unknown as QueueItem)}
            {" · "}{motifs[plusAncien.raison]}
            {" · saisie le "}{new Date(plusAncien.saisiLe).toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
        {/* Le contenu est désormais conservé : on peut le renvoyer, et non
            seulement constater sa perte (audit A5). */}
        <button
          onClick={() => {
            let renvoyes = 0;
            for (const a of abandons) if (rejouerAbandon(a.id)) renvoyes += 1;
            setAbandons(getAbandons());
            if (renvoyes > 0) window.dispatchEvent(new CustomEvent("tm-offline-queued", { detail: { reason: "rejeu" } }));
          }}
          className="ml-2 px-2 py-0.5 rounded bg-white/25 hover:bg-white/35 transition-colors font-semibold whitespace-nowrap"
        >
          Renvoyer
        </button>
        <button
          onClick={() => { clearAbandons(); setAbandons([]); }}
          className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors font-semibold whitespace-nowrap"
        >
          J&apos;ai compris
        </button>
      </div>
    );
  }

  // Alerte critique : photos bloquées en échec permanent — affiché en priorité absolue.
  if (failedCount > 0) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full px-3 py-2 text-xs flex items-center justify-center gap-2 shadow-md bg-red-600 text-white"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">
          {failedCount} photo{failedCount > 1 ? "s" : ""} n&apos;ont pas pu être envoyées — données conservées localement
          {failedReason && (
            <span className="block text-[10px] font-normal opacity-90">motif&nbsp;: {failedReason}</span>
          )}
        </span>
        {online && (
          <button
            onClick={handleRetryFailed}
            disabled={retrying}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors font-semibold whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} aria-hidden />
            {retrying ? "Envoi…" : "Renvoyer"}
          </button>
        )}
      </div>
    );
  }

  // En ligne, réseau correct, queue vide, aucun échec : rien à afficher —
  // sauf, quelques secondes, la confirmation que tout est arrivé.
  if (online && !faible && queueCount === 0) {
    if (!toutEnvoyeA || failedCount > 0 || abandons.length > 0) return null;
    return (
      <div className="w-full shadow-md bg-emerald-600 text-white">
        <button type="button" role="status" aria-live="polite" onClick={() => setVoirHistorique((v) => !v)}
          className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-2">
          <CloudUpload className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="text-center leading-tight">Tout est synchronisé — voir ce qui est parti</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${voirHistorique ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {voirHistorique && (
          <div className="bg-white dark:bg-slate-900 px-4 py-2 max-h-[50vh] overflow-y-auto">
            {historique.slice(0, 20).map((h, i) => (
              <p key={`${h.quand}-${i}`} className="py-0.5 text-[11px] text-gray-600 dark:text-gray-300 break-words leading-snug">
                <span className="text-emerald-600 dark:text-emerald-400">✓</span> {h.libelle}
                <span className="text-gray-400"> · {formatTime(h.quand)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  let cls = "";
  let Icon = WifiOff;
  let label = "";

  if (online && faible) {
    /* Le téléphone se croit connecté, mais rien ne passe. Le dire évite le
       pire des ressentis : « j'ai enregistré et il ne s'est rien passé ». */
    cls = "bg-amber-600 text-white";
    Icon = WifiOff;
    label = queueCount > 0
      ? `Réseau trop faible — ${queueCount} opération${queueCount > 1 ? "s" : ""} gardée${queueCount > 1 ? "s" : ""}, elles partiront dès que ça repasse`
      : "Réseau trop faible — continuez, tout est gardé et partira dès que ça repasse";
  } else if (!online && queueCount > 0) {
    cls = "bg-orange-500 text-white";
    Icon = WifiOff;
    label = `Hors ligne — ${queueCount} opération${queueCount > 1 ? "s" : ""} en attente, synchro automatique au retour du réseau`;
  } else if (!online) {
    cls = "bg-slate-700 text-white";
    Icon = WifiOff;
    label = "Hors ligne — vous pouvez continuer à travailler, tout sera synchronisé au retour du réseau";
  } else {
    // online && queueCount > 0 : affiche pendant que la queue se vide.
    // Message explicite ET exact : distinguer photos et mises à jour de données
    // (sinon une simple synchro de données s'affichait à tort comme "photo").
    cls = "bg-blue-500 text-white";
    Icon = CloudUpload;
    const nbPhotos = pendingUps.reduce((s, u) => s + (u.files?.length || 0), 0);
    const nbData = queueItems.length;
    const totalPhotos = nbPhotos + envoyeesSession;
    const photos = totalPhotos > 0
      ? `${envoyeesSession} photo${envoyeesSession > 1 ? "s" : ""} sur ${totalPhotos} envoyée${envoyeesSession > 1 ? "s" : ""}`
      : "";
    if (nbPhotos > 0 && nbData > 0) {
      label = `Synchronisation — ${photos} · ${nbData} mise${nbData > 1 ? "s" : ""} à jour — garde l'app ouverte`;
    } else if (nbPhotos > 0) {
      label = `Synchronisation — ${photos} — garde l'app ouverte jusqu'à la fin`;
    } else {
      label = `Synchronisation de ${nbData} mise${nbData > 1 ? "s" : ""} à jour…`;
    }
  }

  const hasDetails = queueItems.length > 0 || pendingUps.length > 0;

  return (
    <div className={`w-full shadow-md ${cls}`}>
      {/* Ligne principale cliquable */}
      <button
        type="button"
        role="status"
        aria-live="polite"
        onClick={() => hasDetails && setShowDetails((v) => !v)}
        className={`w-full px-3 py-1.5 text-xs flex items-center justify-center gap-2 ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-center leading-tight">{label}</span>
        {hasDetails && (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>

      {/* Panneau de détail : le projet et la nature de chaque opération, son
          état ; les identifiants techniques au toucher. */}
      {showDetails && hasDetails && (
        <div className="bg-white dark:bg-slate-900 border-t border-blue-200 dark:border-slate-700 px-4 py-3 max-h-[60vh] overflow-y-auto overscroll-contain shadow-lg">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Opérations en attente
          </p>

          {/* Photos d'abord : ce sont elles qui permettent de finaliser. */}
          {pendingUps.map((up) => {
            const et = texteEtat(etats[up.id], up.nextAttemptAt, up.reason, online);
            const ouverteIci = ouverte === up.id;
            return (
              <div key={up.id} className="py-1.5 border-b border-gray-100 dark:border-slate-800 last:border-0">
                <button type="button" onClick={() => setOuverte(ouverteIci ? null : up.id)} className="w-full flex items-start gap-2 text-left">
                  <span className="shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    photo
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-800 dark:text-gray-100 break-words leading-snug">
                      {describePendingUpload(up)}
                    </span>
                    <span className={`block text-[10px] leading-snug ${et.ton}`}>
                      {et.texte} · prise à {formatTime(up.createdAt)}
                    </span>
                  </span>
                </button>
                {ouverteIci && (
                  <p className="mt-1 ml-12 text-[10px] text-gray-400 break-all leading-snug">
                    {up.files.map((f) => f.name).join(", ")} · {up.notionField || up.champTexte || up.category} · projet {up.projectId} · {up.id}
                    {up.retryCount > 0 ? ` · ${up.retryCount} essai(s)` : ""}
                  </p>
                )}
              </div>
            );
          })}

          {/* Saisies (heures, rapport, champs) */}
          {queueItems.map((item) => {
            const et = texteEtat(etats[item.id], item.nextAttemptAt, undefined, online);
            const ouverteIci = ouverte === item.id;
            return (
              <div key={item.id} className="py-1.5 border-b border-gray-100 dark:border-slate-800 last:border-0">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setOuverte(ouverteIci ? null : item.id)} className="min-w-0 flex-1 flex items-start gap-2 text-left">
                    <span className={`shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                      item.type === "pdf"
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    }`}>
                      {item.type === "pdf" ? "pdf" : "saisie"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-gray-800 dark:text-gray-100 break-words leading-snug">
                        {describeQueueItem(item)}
                      </span>
                      <span className={`block text-[10px] leading-snug ${item.statut === "echec" ? "text-red-600 dark:text-red-400" : et.ton}`}>
                        {item.statut === "echec" ? "Mise de côté — sera relancée" : et.texte} · saisie à {formatTime(item.timestamp)}
                      </span>
                    </span>
                  </button>
                  {item.type !== "upload" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                      title="Abandonner cette opération coincée"
                      className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {ouverteIci && (
                  <p className="mt-1 ml-14 text-[10px] text-gray-400 break-all leading-snug">
                    {item.method} {item.url} · {Object.keys((item.body as Record<string, unknown>) || {}).join(", ") || "sans contenu"} · {item.id}
                    {item.retryCount ? ` · ${item.retryCount} essai(s)` : ""}
                  </p>
                )}
              </div>
            );
          })}

          {/* Ce qui est parti : sorti de la liste, mais traçable. */}
          {historique.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800">
              <button type="button" onClick={() => setVoirHistorique((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Envoyées récemment ({historique.length})
                <ChevronDown className={`w-3 h-3 transition-transform ${voirHistorique ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {voirHistorique && historique.slice(0, 20).map((h, i) => (
                <p key={`${h.quand}-${i}`} className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 break-words leading-snug">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span> {h.libelle}
                  <span className="text-gray-400"> · {formatTime(h.quand)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
