"use client";

/**
 * Page « Rapports » — tous les rapports de l'app réunis au même endroit.
 *
 * Les boutons restent AUSSI à leur emplacement d'origine (tableau de bord
 * d'administration, page Statistiques) : cette page les rassemble, elle ne les
 * déplace pas. Chaque rapport y est décrit — ce qu'il contient, qui le reçoit,
 * quand il part — pour qu'on sache ce qu'on déclenche avant de cliquer.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileSpreadsheet, Mail, Send, BarChart3, Loader2, Clock, CheckCircle2, AlertCircle, Truck,
} from "lucide-react";
import type { Project } from "@/lib/notion";
import { ExportExcel } from "@/components/export-excel";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

type Retour = { ok: boolean; message: string } | null;

/** Qui travaille un jour donné. */
type Cibles = { monteurs: string[]; equipes: string[] };

/** Journées déjà lues, le temps de la visite : revenir sur une date affiche
 *  sa liste aussitôt, sans attendre le réseau. */
const CIBLES_LUES = new Map<string, Cibles>();

export default function RapportsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  /* Page reservee aux administrateurs : un collaborateur qui taperait
     l'adresse est renvoye a l'accueil, le menu ne suffit pas a proteger. */
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
  const [chargement, setChargement] = useState(true);

  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [envoiMensuel, setEnvoiMensuel] = useState(false);
  const [envoiJour, setEnvoiJour] = useState(false);
  const [retourMensuel, setRetourMensuel] = useState<Retour>(null);
  const [retourJour, setRetourJour] = useState<Retour>(null);

  /* ── Feuille de route d'un monteur ────────────────────────────────────────
     Le choix se fait sur ce qui EXISTE ce jour-là : on lit d'abord la journée,
     puis on propose les monteurs et les équipes réellement concernés. Une liste
     figée de prénoms proposerait des feuilles vides. */
  const [jour, setJour] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [cibles, setCibles] = useState<Cibles | null>(null);
  const [cible, setCible] = useState("");
  const [telechargement, setTelechargement] = useState(false);

  useEffect(() => {
    let vivant = true;
    /* Journée déjà lue : on la réaffiche sans attendre le réseau. Comparer
       deux dates fait revenir sur la première, et rien n'a changé entre-temps. */
    const connu = CIBLES_LUES.get(jour);
    setCibles(connu || null);
    const poser = (d: Cibles) => {
      CIBLES_LUES.set(jour, d);
      if (!vivant) return;
      setCibles(d);
      // On reprend la sélection si elle existe encore ce jour-là.
      const tout = [...d.monteurs, ...d.equipes];
      setCible((prev) => (tout.includes(prev) ? prev : (tout[0] || "")));
    };
    if (connu) { poser(connu); return; }
    fetch(`/api/rapport-journalier/cibles?date=${jour}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) poser({ monteurs: d.monteurs || [], equipes: d.equipes || [] }); })
      .catch(() => { if (vivant) setCibles({ monteurs: [], equipes: [] }); });
    return () => { vivant = false; };
  }, [jour]);

  /* Téléchargement plutôt qu'ouverture : la feuille se prépare la veille et se
     relit le matin, souvent hors réseau. On passe par un blob pour garder un
     retour visible pendant la fabrication du PDF. */
  const telechargerFeuille = async () => {
    if (!cible || telechargement) return;
    setTelechargement(true);
    const type = cibles?.equipes.includes(cible) ? "equipe" : "monteur";
    try {
      const res = await fetch(
        `/api/rapport-journalier?date=${jour}&type=${type}&cible=${encodeURIComponent(cible)}`,
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Journee ${cible} ${jour}.pdf`.replace(/[^\w\s.-]/g, "").trim();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("La feuille de route n'a pas pu être produite.");
    } finally {
      setTelechargement(false);
    }
  };

  // Les projets alimentent l'export Excel (même source que le tableau de bord).
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  const envoyerMensuel = async () => {
    setEnvoiMensuel(true);
    setRetourMensuel(null);
    try {
      const res = await fetch("/api/rapport-mensuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: reportMonth, year: reportYear }),
      });
      const data = await res.json();
      setRetourMensuel(res.ok
        ? { ok: true, message: `Rapport ${MOIS[reportMonth - 1]} ${reportYear} envoyé par e-mail.` }
        : { ok: false, message: data.error || "Envoi impossible." });
    } catch {
      setRetourMensuel({ ok: false, message: "Erreur réseau." });
    } finally {
      setEnvoiMensuel(false);
    }
  };

  const envoyerJour = async () => {
    setEnvoiJour(true);
    setRetourJour(null);
    try {
      const res = await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      setRetourJour(res.ok
        ? {
            ok: true,
            message: data.montagesDuJour === 0
              ? "Aucun montage aujourd'hui — e-mail de test envoyé à ton adresse."
              : `Envoyé à ton adresse (${data.envoyes} montage${data.envoyes > 1 ? "s" : ""}).`,
          }
        : { ok: false, message: data.error || "Envoi impossible." });
    } catch {
      setRetourJour({ ok: false, message: "Erreur réseau." });
    } finally {
      setEnvoiJour(false);
    }
  };

  const Retour = ({ r }: { r: Retour }) => {
    if (!r) return null;
    return (
      <p className={`mt-3 text-xs flex items-center gap-1.5 ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
        {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
        {r.message}
      </p>
    );
  };

  // Rien n'est peint tant que le role n'est pas confirme : pas d'aperçu
  // fugace du contenu pour un collaborateur.
  if (autorise !== true) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-400 px-4 py-10">
        <Loader2 className="w-4 h-4 animate-spin" /> Vérification des droits…
      </p>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl glass-card flex items-center justify-center hover:bg-white/80 transition-all active:scale-95"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-200">Rapports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tous les rapports de l&apos;application, réunis ici
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Export Excel */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Export Excel</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Tous les projets en cours dans un tableur : numéros, clients, états, dates,
            cabines et collaborateurs. Le fichier se télécharge immédiatement.
          </p>
          {chargement ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement des projets…
            </span>
          ) : (
            <>
              <ExportExcel projects={projects} />
              <p className="mt-2 text-xs text-gray-400">{projects.length} projets prêts à exporter.</p>
            </>
          )}
        </div>

        {/* Rapport statistique PDF */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-[#1e3a5f] dark:text-blue-300" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Rapport statistique</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Document PDF de niveau direction : indicateurs clés, répartition de l&apos;activité,
            évolution mensuelle avec graphiques, chiffre d&apos;affaires et comparaison de périodes.
            Il reprend la période choisie dans les statistiques.
          </p>
          <Link
            href="/?mode=stats"
            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl bg-[#1e3a5f] text-white hover:bg-[#2a4f7f] transition-all active:scale-95"
          >
            <BarChart3 className="w-4 h-4" />
            Ouvrir les statistiques
          </Link>
        </div>

        {/* Rapport mensuel */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Rapport mensuel</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Bilan d&apos;un mois écoulé, envoyé par e-mail à ton adresse. Choisis le mois
            et l&apos;année, puis lance l&apos;envoi.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Mois</label>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(Number(e.target.value))}
                className="mt-1 w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-2 text-sm"
              >
                {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Année</label>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                className="mt-1 w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-2 text-sm"
              >
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={envoyerMensuel}
            disabled={envoiMensuel}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-[#1e3a5f] text-white hover:bg-[#2a4f7f] transition-all active:scale-95 disabled:opacity-60"
          >
            {envoiMensuel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {envoiMensuel ? "Envoi…" : "Recevoir par e-mail"}
          </button>
          <Retour r={retourMensuel} />
        </div>

        {/* Rapport du jour */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-5 h-5 text-sky-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Rapport du jour</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Les montages du jour et leurs collaborateurs. Il part automatiquement
            chaque matin à 6&nbsp;h&nbsp;45, du lundi au vendredi, à chaque collaborateur concerné.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            L&apos;envoi ci-dessous est un test : il n&apos;arrive qu&apos;à ton adresse.
          </p>
          <button
            onClick={envoyerJour}
            disabled={envoiJour}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-60"
          >
            {envoiJour ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {envoiJour ? "Envoi…" : "M'envoyer le rapport du jour"}
          </button>
          <Retour r={retourJour} />
        </div>

        {/* Feuille de route d'un monteur */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Feuille de route d&apos;un monteur
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Un condensé de la fiche de travail, ramené à ce qu&apos;il faut pour préparer :
            où prendre la marchandise, combien de cartons charger, quelles séries, et les
            pièces manquantes déjà signalées. Choisissez un monteur, un binôme ou l&apos;équipe.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Jour</span>
              <input
                type="date"
                value={jour}
                onChange={(e) => setJour(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monteur ou équipe</span>
              <select
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                disabled={!cibles || (cibles.monteurs.length === 0 && cibles.equipes.length === 0)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60"
              >
                {!cibles && <option>Lecture…</option>}
                {cibles && cibles.monteurs.length === 0 && cibles.equipes.length === 0 && (
                  <option>Aucun montage ce jour-là</option>
                )}
                {cibles && cibles.monteurs.length > 0 && (
                  <optgroup label="Monteurs">
                    {cibles.monteurs.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                )}
                {cibles && cibles.equipes.length > 0 && (
                  <optgroup label="Équipes et binômes">
                    {cibles.equipes.map((e) => <option key={e} value={e}>{e}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Aucun envoi : le document se télécharge, rien ne part par e-mail.
          </p>
          <button
            onClick={telechargerFeuille}
            disabled={!cible || telechargement}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-60"
          >
            {telechargement ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {telechargement ? "Préparation…" : "Télécharger la feuille de route"}
          </button>
        </div>
      </div>
    </div>
  );
}
