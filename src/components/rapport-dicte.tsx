"use client";

/**
 * Le rapport dicté — une seule dictée pour toute la visite (24.10.2026).
 *
 * EN PLUS de la saisie manuelle et de la dictée simple, jamais à leur place.
 * Le monteur parle librement ; l'IA range (lib/rapport-dicte) ; le monteur
 * RELIT et corrige avant que rien ne soit ajouté : lot, cases cochées, texte,
 * note interne. Les pièces et défauts repérés sont proposés : un appui ouvre
 * le formulaire de signalement déjà rempli, rien n'est créé tout seul.
 *
 * Aucune perte possible : l'audio est gardé sur l'appareil (lib/dictees)
 * jusqu'à l'ajout effectif au rapport. Sans réseau, il attend ; fermée en
 * pleine relecture, la dictée revient à la prochaine ouverture.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, CloudOff, Loader2, Lock, Package, ShieldAlert, Sparkles, Square, Trash2 } from "lucide-react";
import {
  garderDictee, noterTexte, oublierDictee, transcrire, dicteesEnAttente, prendreEnCharge,
  type Dictee, type EtatAjout,
} from "@/lib/dictees";
import { analyseDeSecours, type AnalyseDictee, type LotDictee, type PartieDictee, type SignalementPropose } from "@/lib/rapport-dicte";

type Etape = "repos" | "enregistrement" | "transcription" | "analyse" | "relecture" | "garde" | "fait" | "erreur";

interface Props {
  projetId: string;
  lots: LotDictee[];
  /** Le lot où se trouve le monteur (0 = chantier simple ou général). */
  numeroCourant: number;
  /** Ajoute la relecture au rapport ET l'enregistre. */
  onAppliquer: (a: AnalyseDictee) => Promise<EtatAjout>;
  /** Ouvre le formulaire de signalement prérempli (lot courant seulement). */
  onSignaler: (s: SignalementPropose) => void;
}

const MESSAGES: Record<EtatAjout, string> = {
  enregistre: "Ajouté au rapport et enregistré",
  "en-attente": "Ajouté au rapport — sera envoyé dès le retour du réseau",
  ajoute: "Ajouté au rapport",
  echec: "Ajouté à l'écran, mais PAS encore enregistré — appuyez sur Enregistrer",
};

export function RapportDicte({ projetId, lots, numeroCourant, onAppliquer, onSignaler }: Props) {
  const cle = `rapport-dicte:${projetId}`;
  const [etape, setEtape] = useState<Etape>("repos");
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState("");
  const [transcription, setTranscription] = useState("");
  const [analyse, setAnalyse] = useState<AnalyseDictee | null>(null);
  const [secours, setSecours] = useState(false);
  const [resultat, setResultat] = useState<EtatAjout | null>(null);
  const [enAttente, setEnAttente] = useState(0);
  const [voirTranscription, setVoirTranscription] = useState(false);
  const idRef = useRef<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const lotsRef = useRef(lots);
  lotsRef.current = lots;

  const nomDe = (n: number) => lotsRef.current.find((l) => l.numero === n)?.nom ?? `Lot ${n}`;

  /* Texte → proposition rangée. Réseau absent : la dictée reste gardée. */
  const analyser = useCallback(async (texte: string) => {
    setTranscription(texte);
    setEtape("analyse");
    try {
      const res = await fetch("/api/rapport-dicte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte, lots: lotsRef.current }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.analyse) throw new Error("analyse");
      setAnalyse(d.analyse as AnalyseDictee);
      setSecours(!!d.secours);
    } catch {
      if (typeof navigator !== "undefined" && navigator.onLine === false) { setEtape("garde"); return; }
      // Serveur ou IA indisponible : tout le texte au chantier, à relire.
      setAnalyse(analyseDeSecours(lotsRef.current, texte));
      setSecours(true);
    }
    setEtape("relecture");
  }, []);

  const traiter = useCallback(async (d: Pick<Dictee, "blob" | "mime" | "texte"> & { id: string | null }) => {
    idRef.current = d.id;
    setOuvert(true);
    if (d.texte) { await analyser(d.texte); return; }
    setEtape("transcription");
    const liberer = d.id ? prendreEnCharge(d.id) : () => {};
    try {
      const t = await transcrire(d.blob, d.mime);
      if (t.ok) {
        if (d.id) await noterTexte(d.id, t.texte);
        await analyser(t.texte);
      } else if (t.raison === "vide") {
        if (d.id) await oublierDictee(d.id);
        setMessage(t.message);
        setEtape("erreur");
      } else {
        setEtape(d.id ? "garde" : "erreur");
        if (!d.id) setMessage("La transcription a échoué et la dictée n'a pas pu être gardée sur l'appareil. Réessayez.");
      }
    } finally {
      liberer();
    }
  }, [analyser]);

  const compter = useCallback(async () => {
    setEnAttente((await dicteesEnAttente(cle)).length);
  }, [cle]);

  const reprendre = useCallback(async () => {
    const [premiere] = await dicteesEnAttente(cle);
    if (premiere) await traiter(premiere);
  }, [cle, traiter]);

  useEffect(() => {
    compter();
    const enLigne = () => { if (etape === "garde") reprendre(); };
    window.addEventListener("online", enLigne);
    return () => window.removeEventListener("online", enLigne);
  }, [compter, reprendre, etape]);

  const demarrer = useCallback(async () => {
    setMessage("");
    setResultat(null);
    setAnalyse(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Enregistrement non disponible sur cet appareil.");
      setEtape("erreur");
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      morceaux.current = [];
      const mr = new MediaRecorder(flux);
      mr.ondataavailable = (e) => { if (e.data.size > 0) morceaux.current.push(e.data); };
      mr.onstop = async () => {
        flux.getTracks().forEach((t) => t.stop());
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(morceaux.current, { type: mime });
        if (blob.size === 0) { setMessage("Aucun son capté. Réessayez."); setEtape("erreur"); return; }
        const id = await garderDictee(cle, blob, mime);
        await traiter({ id, blob, mime });
        compter();
      };
      mr.start();
      recRef.current = mr;
      setOuvert(true);
      setEtape("enregistrement");
    } catch {
      setMessage("Micro non autorisé. Autorisez l'accès au micro dans les réglages.");
      setEtape("erreur");
    }
  }, [cle, traiter, compter]);

  const arreter = useCallback(() => {
    const mr = recRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    recRef.current = null;
  }, []);

  const modifierPartie = (i: number, p: Partial<PartieDictee>) =>
    setAnalyse((a) => (a ? { ...a, parties: a.parties.map((x, j) => (j === i ? { ...x, ...p } : x)) } : a));

  const appliquer = async () => {
    if (!analyse) return;
    const etat = await onAppliquer(analyse);
    setResultat(etat);
    if (etat !== "echec" && idRef.current) {
      await oublierDictee(idRef.current);
      idRef.current = null;
    }
    setEtape("fait");
    compter();
  };

  const abandonner = async () => {
    if (!window.confirm("Supprimer cette dictée ? Rien ne sera ajouté au rapport.")) return;
    if (idRef.current) await oublierDictee(idRef.current);
    idRef.current = null;
    setAnalyse(null);
    setEtape("repos");
    setOuvert(false);
    compter();
  };

  const signalable = (s: SignalementPropose) => s.numero === numeroCourant;

  const bouton = "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium px-4 h-10 active:scale-[0.98] transition-all disabled:opacity-50";

  return (
    <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-800/60 bg-violet-50/60 dark:bg-violet-950/20 p-4 space-y-3" data-rapport-dicte={etape}>
      <div className="flex items-center gap-3">
        <button type="button"
          onClick={etape === "enregistrement" ? arreter : demarrer}
          disabled={etape === "transcription" || etape === "analyse"}
          aria-label={etape === "enregistrement" ? "Arrêter le rapport dicté" : "Dicter tout le rapport"}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-60 ${etape === "enregistrement"
            ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
            : "bg-violet-600 text-white hover:bg-violet-700 active:scale-95"}`}>
          {etape === "transcription" || etape === "analyse" ? <Loader2 className="w-5 h-5 animate-spin" />
            : etape === "enregistrement" ? <Square className="w-4 h-4 fill-current" /> : <Sparkles className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
            {etape === "enregistrement" ? "Racontez la visite… appuyez pour terminer"
              : etape === "transcription" ? "Transcription en cours…"
              : etape === "analyse" ? "L'IA range votre rapport par lot…"
              : "Rapport dicté complet"}
          </p>
          <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
            {etape === "enregistrement"
              ? "Parlez lot par lot : ce qui est fait, ce qui reste, ce qui manque."
              : "Dictez toute la visite : l'IA range par lot, coche les phrases et repère pièces et défauts. Vous relisez avant tout ajout."}
          </p>
        </div>
      </div>

      {enAttente > 0 && etape === "repos" && (
        <div className="flex items-start gap-2 text-sm rounded-xl p-3 border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{enAttente > 1 ? `${enAttente} dictées attendent` : "Une dictée attend"} votre relecture</p>
            <button type="button" onClick={reprendre} className="mt-1 text-xs font-semibold underline">Reprendre maintenant</button>
          </div>
        </div>
      )}

      {etape === "garde" && (
        <div data-dictee-etat="gardee" className="flex items-start gap-2 text-sm rounded-xl p-3 border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Dictée gardée sur l&apos;appareil</p>
            <p className="text-xs">Pas de réseau pour l&apos;analyser. Elle reprendra au retour du réseau, ou à la prochaine ouverture : rien n&apos;est perdu.</p>
            <button type="button" onClick={reprendre} className="mt-1 text-xs font-semibold underline">Réessayer maintenant</button>
          </div>
        </div>
      )}

      {etape === "erreur" && message && (
        <div className="flex items-start gap-2 text-sm rounded-xl p-3 border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{message}</span>
        </div>
      )}

      {ouvert && (etape === "relecture" || etape === "fait") && analyse && (
        <div className="space-y-3">
          {secours && etape === "relecture" && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
              L&apos;IA n&apos;a pas pu ranger la dictée : tout le texte est proposé ci-dessous, à répartir ou à garder tel quel.
            </p>
          )}
          {transcription && (
            <button type="button" onClick={() => setVoirTranscription((v) => !v)}
              className="flex items-center gap-1 text-xs text-violet-700 dark:text-violet-300">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${voirTranscription ? "rotate-180" : ""}`} />
              Ce que vous avez dit
            </button>
          )}
          {voirTranscription && (
            <p className="text-xs text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-slate-900/40 rounded-lg p-2 whitespace-pre-wrap">{transcription}</p>
          )}

          {analyse.parties.map((p, i) => {
            const lot = lots.find((l) => l.numero === p.numero);
            return (
              <div key={i} className="rounded-xl bg-white/80 dark:bg-slate-900/50 border border-violet-100 dark:border-violet-900/50 p-3 space-y-2" data-partie={p.numero}>
                <select value={p.numero} disabled={etape === "fait"}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const opts = lots.find((l) => l.numero === n)?.options ?? [];
                    modifierPartie(i, { numero: n, coches: p.coches.filter((c) => opts.includes(c)) });
                  }}
                  aria-label="Lot concerné"
                  className="w-full text-sm font-semibold bg-transparent text-violet-900 dark:text-violet-200 border-b border-violet-200 dark:border-violet-800 pb-1">
                  {lots.map((l) => <option key={l.numero} value={l.numero}>{l.nom}</option>)}
                </select>
                {(lot?.options ?? []).map((o) => {
                  const coche = p.coches.includes(o);
                  return (
                    <label key={o} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input type="checkbox" className="mt-1" checked={coche} disabled={etape === "fait"}
                        onChange={() => modifierPartie(i, { coches: coche ? p.coches.filter((c) => c !== o) : [...p.coches, o] })} />
                      <span>{o}</span>
                    </label>
                  );
                })}
                <textarea value={p.texte} rows={2} disabled={etape === "fait"}
                  onChange={(e) => modifierPartie(i, { texte: e.target.value })}
                  placeholder="Texte ajouté au rapport de ce lot"
                  className="w-full text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2" />
              </div>
            );
          })}

          <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <Lock className="w-3.5 h-3.5" /> Note interne — jamais envoyée au client
            </p>
            <textarea value={analyse.noteInterne} rows={2} disabled={etape === "fait"}
              onChange={(e) => setAnalyse({ ...analyse, noteInterne: e.target.value })}
              placeholder="Rien d'interne"
              className="w-full text-sm rounded-lg border border-amber-200 dark:border-amber-800/50 bg-white/80 dark:bg-slate-900/40 p-2" />
          </div>

          {analyse.signalements.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">À signaler (proposé)</p>
              {analyse.signalements.map((s, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-white/80 dark:bg-slate-900/50 p-3">
                  {s.type === "piece" ? <Package className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" /> : <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-100">{s.description}</p>
                    <p className="text-[11px] text-gray-500">{s.type === "piece" ? "Pièce manquante" : "Défaut"} · {nomDe(s.numero)}</p>
                  </div>
                  {signalable(s) ? (
                    <button type="button" onClick={() => onSignaler(s)}
                      className="shrink-0 text-xs font-semibold px-3 h-8 rounded-lg bg-red-600 text-white">Signaler</button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-gray-500 max-w-[8rem] text-right">À signaler depuis « {nomDe(s.numero)} »</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {etape === "relecture" ? (
            <div className="flex gap-2">
              <button type="button" onClick={appliquer} className={`${bouton} flex-1 bg-violet-600 text-white hover:bg-violet-700`}>
                <Check className="w-4 h-4" /> Ajouter au rapport
              </button>
              <button type="button" onClick={abandonner} aria-label="Supprimer la dictée" className={`${bouton} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : resultat && (
            <div data-dictee-etat={resultat}
              className={`flex items-start gap-2 text-sm rounded-xl p-3 border ${resultat === "echec"
                ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : resultat === "en-attente"
                  ? "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"
                  : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"}`}>
              {resultat === "echec" ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="font-medium">{MESSAGES[resultat]}</p>
                <button type="button" onClick={() => { setOuvert(false); setEtape("repos"); setAnalyse(null); }}
                  className="mt-1 text-xs font-semibold underline">Fermer</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
