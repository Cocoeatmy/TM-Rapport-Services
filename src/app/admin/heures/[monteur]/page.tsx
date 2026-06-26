"use client";

import { Fragment, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollaboratorColor } from "@/lib/collaborators";
import { COLLABORATEURS_LIST } from "@/lib/constants";
import type { Project } from "@/lib/notion";
import { isMultiDayHours, parsePointages } from "@/lib/pointages";

// ── Helpers de parsing par cabine (alignés sur le calcul du tableau de bord) ──

/** Parse "Cab1:valeur | Cab2:valeur" → Map<numéro cabine, valeur>. */
function parseCabMap(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) return map;
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const val = m[2].trim();
    if (val) map.set(parseInt(m[1], 10), val);
  }
  return map;
}

/** Date YYYY-MM-DD d'un slot cabine "Cab1:2026-05-07:08:30". */
function parseCabDates(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) return map;
  const re = /Cab(\d+)\s*:(\d{4}-\d{2}-\d{2}):/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) map.set(parseInt(m[1], 10), m[2]);
  return map;
}

/**
 * Heure HH:MM d'un slot, en sautant un éventuel préfixe date "YYYY-MM-DD:".
 * Aligné EXACTEMENT sur le parseCabineTimes de la page projet pour que les
 * valeurs coïncident. Bug corrigé : l'ancienne version prenait le dernier
 * motif \d{1,2}:\d{2}, ce qui sur "2026-06-10:10:13" capturait "10:10"
 * (jour:heure) au lieu de "10:13".
 */
function slotHHMM(slot: string): string {
  const m = (slot || "").match(/(?:\d{4}-\d{2}-\d{2}:)?(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  if (h > 23 || mn > 59) return "";
  return `${h.toString().padStart(2, "0")}:${m[2]}`;
}

/** Normalise un nom pour comparaison (sans accents, minuscule). */
function normName(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function toMin(hhmm: string): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Durée (min) entre arrivée et départ, bornée à 12h. */
function durMinutes(arr: string, dep: string): number {
  const a = toMin(slotHHMM(arr));
  const d = toMin(slotHHMM(dep));
  if (a === null || d === null) return 0;
  let diff = d - a;
  if (diff <= 0) diff += 24 * 60;
  return diff <= 12 * 60 ? diff : 0;
}

function fmtMin(m: number): string {
  if (m <= 0) return "—";
  return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`;
}

interface Entry {
  date: string; // YYYY-MM-DD
  projectName: string;
  projectId: string;
  cabineLabel: string;
  marque: string; // n8n Fournisseurs
  serie: string;  // n8n Séries Cabines
  typeService: string; // Type de services
  arrivee: string;
  depart: string;
  minutes: number;
  binome: boolean;  // travail en binôme/équipe (2+ collaborateurs)
  partner: string;  // nom(s) du/des partenaire(s)
}

const splitNames = (raw: string) =>
  (raw || "").split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);

/**
 * Extrait les entrées (1 par cabine) où `monteur` est intervenu.
 *
 * Important : l'attribution par cabine n'enregistre souvent que l'uploadeur.
 * Pour un binôme, le partenaire n'y figure pas → on le récupère via les
 * "Collaborateurs montages" du projet. Un monteur compte donc pour une cabine
 * s'il est l'attribué OU un collaborateur du projet. Une cabine est "binôme"
 * dès que l'équipe (attribution OU collaborateurs) compte 2+ personnes.
 */
function entriesForMonteur(p: Project, monteur: string): Entry[] {
  const target = normName(monteur);
  const collabs = splitNames(p.collaborateurs || "");
  const targetInCollabs = collabs.some((n) => normName(n) === target);
  const teamProject = collabs.length >= 2;
  const marque = (p.fournisseurs || []).join(", ");
  const serie = (p.seriesCabines || []).join(", ");
  const typeService = (p.typeServices || []).join(", ");

  const out: Entry[] = [];
  const base = { projectName: p.projet, projectId: p.id, marque, serie, typeService };

  const attrMap = parseCabMap(p.attributionCabines || "");
  const arrMap = parseCabMap(p.heureArrivee || "");
  const depMap = parseCabMap(p.heureDepart || "");
  const nomsMap = parseCabMap(p.nomsCabines || "");
  const dateMap = parseCabDates(p.heureArrivee || "");
  // Numéros de cabine connus : présents dans l'attribution OU les heures OU les
  // noms. (Un projet multi-cabine peut avoir des heures par cabine SANS
  // attribution enregistrée — il ne faut pas le traiter comme un mono.)
  const cabNums = [...new Set([...attrMap.keys(), ...arrMap.keys(), ...nomsMap.keys()])].sort((a, b) => a - b);
  const targetInAnyAttr = [...attrMap.values()].some((raw) =>
    splitNames(raw).some((n) => normName(n) === target)
  );

  if (cabNums.length > 0) {
    // ── Projet structuré par cabines ──
    for (const cabNum of cabNums) {
      const names = splitNames(attrMap.get(cabNum) || "");
      const inAttr = names.some((n) => normName(n) === target);
      let include = false;
      let binome = false;
      if (inAttr) {
        // Attribué explicitement à cette cabine.
        include = true;
        binome = names.length >= 2 || teamProject;
      } else if (names.length === 0 && targetInCollabs) {
        // Cabine sans responsable enregistré → l'équipe du projet l'a faite.
        include = true;
        binome = teamProject;
      } else if (names.length > 0 && targetInCollabs && !targetInAnyAttr) {
        // Partenaire binôme jamais enregistré dans l'attribution du projet.
        include = true;
        binome = true;
      }
      if (!include) continue;
      const partner = [...new Set([...names, ...collabs])]
        .filter((n) => normName(n) !== target)
        .join(", ");
      const arrSlot = arrMap.get(cabNum) || "";
      const depSlot = depMap.get(cabNum) || "";
      out.push({
        ...base,
        date: dateMap.get(cabNum) || p.dateMontage?.slice(0, 10) || "",
        cabineLabel: nomsMap.get(cabNum) || `Cabine ${cabNum}`,
        arrivee: slotHHMM(arrSlot),
        depart: slotHHMM(depSlot),
        minutes: durMinutes(arrSlot, depSlot),
        binome,
        partner,
      });
    }
    return out;
  }

  // ── Projet mono-cabine avec PLUSIEURS interventions datées ──
  // ("2026-06-09 Micael 08:30 | …") : une entrée par intervention où le
  // monteur a participé (collaborateur de l'intervention, sinon du projet).
  if (isMultiDayHours(p.heureArrivee, p.heureDepart)) {
    const pts = parsePointages(p.heureArrivee, p.heureDepart);
    for (const pt of pts) {
      const names = splitNames(pt.collaborateur || "");
      const include = names.length > 0
        ? names.some((n) => normName(n) === target)
        : targetInCollabs;
      if (!include) continue;
      const team = names.length > 0 ? names : collabs;
      out.push({
        ...base,
        date: pt.date || p.dateMontage?.slice(0, 10) || "",
        cabineLabel: "—",
        arrivee: pt.arrivee,
        depart: pt.depart,
        minutes: durMinutes(pt.arrivee, pt.depart),
        binome: team.length >= 2,
        partner: team.filter((n) => normName(n) !== target).join(", "),
      });
    }
    return out;
  }

  // ── Projet SANS structure de cabine (simple) → "Collaborateurs montages" ──
  if (!targetInCollabs) return out;
  out.push({
    ...base,
    date: p.dateMontage?.slice(0, 10) || "",
    cabineLabel: "—",
    arrivee: slotHHMM(p.heureArrivee || ""),
    depart: slotHHMM(p.heureDepart || ""),
    minutes: durMinutes(p.heureArrivee || "", p.heureDepart || ""),
    binome: teamProject,
    partner: collabs.filter((n) => normName(n) !== target).join(", "),
  });
  return out;
}

function formatDay(dateStr: string): string {
  if (!dateStr) return "Date inconnue";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default function MonteurHeuresPage({ params }: { params: Promise<{ monteur: string }> }) {
  const { monteur } = use(params);
  const decoded = decodeURIComponent(monteur);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  // Filtres
  const [fMarque, setFMarque] = useState("all");
  const [fSerie, setFSerie] = useState("all");
  const [fService, setFService] = useState("all");
  const [fYear, setFYear] = useState("all");
  const [fMonth, setFMonth] = useState("all");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  // Comparaison VS entre collaborateurs (multi-sélection)
  const [compareMode, setCompareMode] = useState(false);
  const [collabsB, setCollabsB] = useState<string[]>([]);
  // Persistance des filtres entre changements de monteur (jusqu'à reset).
  const FKEY = "tm-heures-detail-filters";
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // Au montage : restaure les filtres/VS sauvegardés.
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(FKEY) || "{}");
      if (s.fMarque) setFMarque(s.fMarque);
      if (s.fSerie) setFSerie(s.fSerie);
      if (s.fService) setFService(s.fService);
      if (s.fYear) setFYear(s.fYear);
      if (s.fMonth) setFMonth(s.fMonth);
      if (typeof s.compareMode === "boolean") setCompareMode(s.compareMode);
      if (Array.isArray(s.collabsB)) setCollabsB(s.collabsB);
    } catch {}
    setFiltersLoaded(true);
  }, []);

  // Sauvegarde à chaque changement (après chargement initial).
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      sessionStorage.setItem(FKEY, JSON.stringify({ fMarque, fSerie, fService, fYear, fMonth, compareMode, collabsB }));
    } catch {}
  }, [filtersLoaded, fMarque, fSerie, fService, fYear, fMonth, compareMode, collabsB]);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") { router.push("/"); return; }
        setIsAdmin(true);
      });

    // TOUS les projets (tous statuts : en cours, terminés, services, SAV,
    // mesures…) pour ne manquer aucun montage du monteur (mono ou multi).
    fetch("/api/projects/all")
      .then((r) => r.json())
      .then((all) => setProjects(Array.isArray(all) ? all : []))
      .finally(() => setLoading(false));
  }, [router]);

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const colors = getCollaboratorColor(decoded);

  // Toutes les entrées de ce monteur, triées par date de montage.
  const allEntries = projects
    .flatMap((p) => entriesForMonteur(p, decoded))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  // Options de filtre (depuis toutes les entrées du monteur).
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort();
  const marqueOptions = uniq(allEntries.flatMap((e) => e.marque.split(", ")));
  const serieOptions = uniq(allEntries.flatMap((e) => e.serie.split(", ")));
  const serviceOptions = uniq(allEntries.flatMap((e) => e.typeService.split(", ")));
  const yearOptions = [...new Set(allEntries.map((e) => e.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  // Prédicat de filtre réutilisable (pour le monteur courant ET la comparaison).
  const filterEntry = (e: Entry) => {
    if (fMarque !== "all" && !e.marque.split(", ").includes(fMarque)) return false;
    if (fSerie !== "all" && !e.serie.split(", ").includes(fSerie)) return false;
    if (fService !== "all" && !e.typeService.split(", ").includes(fService)) return false;
    if (fYear !== "all" && e.date.slice(0, 4) !== fYear) return false;
    if (fMonth !== "all" && e.date.slice(5, 7) !== fMonth) return false;
    return true;
  };
  const entries = allEntries.filter(filterEntry);

  const totalMin = entries.reduce((s, e) => s + e.minutes, 0);
  const totalCab = entries.length;
  const cabAvecHeures = entries.filter((e) => e.minutes > 0).length;
  // Répartition solo / binôme
  const soloEntries = entries.filter((e) => !e.binome);
  const binomeEntries = entries.filter((e) => e.binome);
  const soloMin = soloEntries.reduce((s, e) => s + e.minutes, 0);
  const binomeMin = binomeEntries.reduce((s, e) => s + e.minutes, 0);
  const soloCab = soloEntries.length;
  const binomeCab = binomeEntries.length;
  const moySolo = (() => { const n = soloEntries.filter((e) => e.minutes > 0).length; return n > 0 ? Math.round(soloMin / n) : 0; })();
  const moyBinome = (() => { const n = binomeEntries.filter((e) => e.minutes > 0).length; return n > 0 ? Math.round(binomeMin / n) : 0; })();
  const moyTotal = cabAvecHeures > 0 ? Math.round(totalMin / cabAvecHeures) : 0;

  // Stats agrégées d'un monteur (même filtre actif) — pour la comparaison VS.
  type MStats = {
    totalMin: number; soloMin: number; binomeMin: number;
    totalCab: number; soloCab: number; binomeCab: number;
    moyTotal: number; moySolo: number; moyBinome: number;
  };
  const computeStats = (name: string): MStats => {
    const es = projects.flatMap((p) => entriesForMonteur(p, name)).filter(filterEntry);
    const solo = es.filter((e) => !e.binome);
    const bin = es.filter((e) => e.binome);
    const sum = (arr: Entry[]) => arr.reduce((s, e) => s + e.minutes, 0);
    const avg = (arr: Entry[]) => { const n = arr.filter((e) => e.minutes > 0).length; return n > 0 ? Math.round(sum(arr) / n) : 0; };
    return {
      totalMin: sum(es), soloMin: sum(solo), binomeMin: sum(bin),
      totalCab: es.length, soloCab: solo.length, binomeCab: bin.length,
      moyTotal: avg(es), moySolo: avg(solo), moyBinome: avg(bin),
    };
  };
  const statsA: MStats = { totalMin, soloMin, binomeMin, totalCab, soloCab, binomeCab, moyTotal, moySolo, moyBinome };
  // Colonnes de comparaison : le monteur courant + les sélectionnés.
  const compareColumns = compareMode
    ? [{ name: decoded, stats: statsA }, ...collabsB.map((n) => ({ name: n, stats: computeStats(n) }))]
    : [];

  // Choix de monteur (sélecteur en-tête) : liste connue + le courant si absent.
  const monteurChoices = [...new Set([decoded, ...COLLABORATEURS_LIST])];

  // Libellés période + filtres pour le PDF.
  const pdfPeriodLabel =
    fYear === "all" ? "Toutes années" : fMonth === "all" ? fYear : `${MONTHS[parseInt(fMonth, 10) - 1]} ${fYear}`;
  const pdfFilterLabel = [
    fMarque !== "all" ? `Marque : ${fMarque}` : "",
    fSerie !== "all" ? `Série : ${fSerie}` : "",
    fService !== "all" ? `Service : ${fService}` : "",
  ].filter(Boolean).join(" · ");

  const handlePdf = async () => {
    if (entries.length === 0) return;
    setPdfGenerating(true);
    try {
      const { generateMonteurHeuresPdf } = await import("@/components/heures-monteur-pdf");
      const blob = await generateMonteurHeuresPdf({
        monteur: decoded,
        periodLabel: pdfPeriodLabel,
        filterLabel: pdfFilterLabel,
        entries: entries.map((e) => ({
          date: e.date, projectName: e.projectName, cabineLabel: e.cabineLabel,
          marque: e.marque, serie: e.serie, typeService: e.typeService,
          arrivee: e.arrivee, depart: e.depart, minutes: e.minutes,
          binome: e.binome, partner: e.partner,
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Heures - ${decoded} - ${pdfPeriodLabel}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF heures monteur:", err);
      alert("Erreur lors de la génération du PDF.");
    } finally {
      setPdfGenerating(false);
    }
  };

  // Groupe par jour de montage.
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.date || "";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"));

  return (
    <div className="w-full px-4 sm:px-6 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {decoded[0]}
        </div>
        <div className="min-w-0 flex-1">
          {/* Sélecteur de monteur : changer sans revenir en arrière */}
          <select
            value={decoded}
            onChange={(e) => router.push(`/admin/heures/${encodeURIComponent(e.target.value)}`)}
            className="text-xl font-bold text-gray-900 dark:text-gray-100 bg-transparent cursor-pointer focus:outline-none -ml-0.5 max-w-full"
            title="Changer de monteur"
          >
            {monteurChoices.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Heures par cabine & projet
          </p>
        </div>
        {/* Export PDF */}
        <button
          onClick={handlePdf}
          disabled={pdfGenerating || entries.length === 0}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e3a5f] hover:bg-[#163055] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
        >
          {pdfGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          PDF
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(() => {
          const cls = "text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 max-w-[160px]";
          return (
            <>
              <select value={fMarque} onChange={(e) => setFMarque(e.target.value)} className={cls}>
                <option value="all">Marque : toutes</option>
                {marqueOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={fSerie} onChange={(e) => setFSerie(e.target.value)} className={cls}>
                <option value="all">Série : toutes</option>
                {serieOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={fService} onChange={(e) => setFService(e.target.value)} className={cls}>
                <option value="all">Service : tous</option>
                {serviceOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={fYear} onChange={(e) => setFYear(e.target.value)} className={cls}>
                <option value="all">Année : toutes</option>
                {yearOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={fMonth} onChange={(e) => setFMonth(e.target.value)} className={cls}>
                <option value="all">Mois : tous</option>
                {MONTHS.map((label, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>{label}</option>
                ))}
              </select>

              {/* Comparaison VS — multi-sélection de collaborateurs */}
              <button
                onClick={() => setCompareMode((v) => !v)}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${compareMode ? "bg-[#1e3a5f] text-white" : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:text-gray-900"}`}
              >
                Comparer (VS)
              </button>
              {compareMode && COLLABORATEURS_LIST.filter((n) => n !== decoded).map((n) => {
                const sel = collabsB.includes(n);
                return (
                  <button
                    key={n}
                    onClick={() => setCollabsB((prev) => sel ? prev.filter((x) => x !== n) : [...prev, n])}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${sel ? "bg-amber-500 text-white" : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:text-gray-900"}`}
                  >
                    {sel ? "✓ " : ""}{n}
                  </button>
                );
              })}

              {(fMarque !== "all" || fSerie !== "all" || fService !== "all" || fYear !== "all" || fMonth !== "all" || compareMode) && (
                <button
                  onClick={() => { setFMarque("all"); setFSerie("all"); setFService("all"); setFYear("all"); setFMonth("all"); setCompareMode(false); setCollabsB([]); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg text-blue-600 dark:text-blue-300 hover:underline"
                >
                  Réinitialiser
                </button>
              )}
            </>
          );
        })()}
      </div>

      {/* Total */}
      <div className="glass-card rounded-2xl p-4 mb-6">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1.5 items-center">
          {/* En-têtes de colonnes */}
          <div />
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center">Heures</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center">Cabines</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center">Moy. / cabine</div>

          {/* Ligne Solo */}
          <div className="text-sm font-semibold text-[#1e3a5f] dark:text-blue-300">Solo</div>
          <div className="text-xl font-bold text-[#1e3a5f] dark:text-blue-300 text-center">{fmtMin(soloMin)}</div>
          <div className="text-xl font-bold text-[#1e3a5f] dark:text-blue-300 text-center">{soloCab}</div>
          <div className="text-xl font-bold text-[#1e3a5f] dark:text-blue-300 text-center">{moySolo > 0 ? fmtMin(moySolo) : "—"}</div>

          {/* Ligne Binôme */}
          <div className="text-sm font-semibold text-purple-600 dark:text-purple-300">Binôme</div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-300 text-center">{fmtMin(binomeMin)}</div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-300 text-center">{binomeCab}</div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-300 text-center">{moyBinome > 0 ? fmtMin(moyBinome) : "—"}</div>

          {/* Ligne Total */}
          <div className="text-sm font-semibold text-teal-600 dark:text-teal-300 border-t border-gray-200 dark:border-gray-700 pt-1.5">Total</div>
          <div className="text-2xl font-bold text-teal-600 dark:text-teal-300 text-center border-t border-gray-200 dark:border-gray-700 pt-1.5">{fmtMin(totalMin)}</div>
          <div className="text-2xl font-bold text-teal-600 dark:text-teal-300 text-center border-t border-gray-200 dark:border-gray-700 pt-1.5">{totalCab}</div>
          <div className="text-2xl font-bold text-teal-600 dark:text-teal-300 text-center border-t border-gray-200 dark:border-gray-700 pt-1.5">{moyTotal > 0 ? fmtMin(moyTotal) : "—"}</div>
        </div>
      </div>

      {/* Comparaison VS — multi-collaborateurs, breakdown Solo/Binôme */}
      {compareMode && (
        <div className="glass-card rounded-2xl p-4 mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Comparaison VS</p>
          {collabsB.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sélectionne un ou plusieurs collaborateurs à comparer (boutons en haut).</p>
          ) : (() => {
            const cols = compareColumns;
            const showEcart = cols.length === 2; // écart seulement en 1 vs 1
            const template = `minmax(110px,1.4fr) repeat(${cols.length}, 1fr)${showEcart ? " 0.9fr" : ""}`;
            const groups: { title: string; hours: boolean; rows: { label: string; get: (s: MStats) => number; strong?: boolean }[] }[] = [
              { title: "Heures", hours: true, rows: [
                { label: "Total", get: (s) => s.totalMin, strong: true },
                { label: "Solo", get: (s) => s.soloMin },
                { label: "Binôme", get: (s) => s.binomeMin },
              ] },
              { title: "Cabines", hours: false, rows: [
                { label: "Total", get: (s) => s.totalCab, strong: true },
                { label: "Solo", get: (s) => s.soloCab },
                { label: "Binôme", get: (s) => s.binomeCab },
              ] },
              { title: "Moy. / cabine", hours: true, rows: [
                { label: "Total", get: (s) => s.moyTotal, strong: true },
                { label: "Solo", get: (s) => s.moySolo },
                { label: "Binôme", get: (s) => s.moyBinome },
              ] },
            ];
            const fmtVal = (x: number, hours: boolean) => (hours ? (x > 0 ? fmtMin(x) : "—") : String(x));
            return (
              <div className="grid gap-x-3 gap-y-1.5 items-center overflow-x-auto" style={{ gridTemplateColumns: template }}>
                {/* En-tête : noms des collaborateurs */}
                <div />
                {cols.map((c, i) => (
                  <div key={c.name} className={`text-sm font-bold text-center ${i === 0 ? "text-[#1e3a5f] dark:text-blue-300" : "text-amber-600 dark:text-amber-400"}`}>{c.name}</div>
                ))}
                {showEcart && <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center">Écart</div>}

                {groups.map((g) => (
                  <Fragment key={g.title}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-2" style={{ gridColumn: "1 / -1" }}>{g.title}</div>
                    {g.rows.map((r) => (
                      <Fragment key={r.label}>
                        <div className="text-xs text-gray-600 dark:text-gray-300 pl-2">{r.label}</div>
                        {cols.map((c, i) => (
                          <div key={c.name} className={`text-center ${r.strong ? "text-base font-bold" : "text-sm font-semibold"} ${i === 0 ? "text-[#1e3a5f] dark:text-blue-300" : "text-amber-600 dark:text-amber-400"}`}>
                            {fmtVal(r.get(c.stats), g.hours)}
                          </div>
                        ))}
                        {showEcart && (() => {
                          const delta = r.get(cols[0].stats) - r.get(cols[1].stats);
                          const dstr = delta === 0 ? "—" : `${delta > 0 ? "+" : "-"}${g.hours ? fmtMin(Math.abs(delta)) : Math.abs(delta)}`;
                          return <div className={`text-xs font-semibold text-center ${delta === 0 ? "text-gray-400" : delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{dstr}</div>;
                        })()}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune heure attribuée à ce monteur.</p>
        </div>
      )}

      {/* Une carte par jour de montage */}
      {days.map(([day, rawDayEntries]) => {
        // Tri intra-jour : du plus tôt au plus tard (heure d'arrivée).
        // Les entrées sans arrivée passent en dernier.
        const dayEntries = [...rawDayEntries].sort((a, b) =>
          (a.arrivee || "99:99").localeCompare(b.arrivee || "99:99")
        );
        const dayTotal = dayEntries.reduce((s, e) => s + e.minutes, 0);
        return (
          <Card key={day || "no-date"} className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="capitalize text-[#1e3a5f] dark:text-blue-300">{formatDay(day)}</span>
                <span className="flex items-center gap-2 shrink-0 text-xs font-bold text-teal-600 dark:text-teal-300">
                  <span>{dayEntries.length} cabine{dayEntries.length > 1 ? "s" : ""}</span>
                  <span className="text-gray-300 dark:text-gray-600 font-normal">·</span>
                  <span>{fmtMin(dayTotal)}</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  {/* Largeurs fixes → colonnes alignées entre toutes les journées */}
                  <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "8%" }} />
                  </colgroup>
                  <thead>
                    <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-1.5 pr-2">Projet</th>
                      <th className="text-left py-1.5 pr-2">Cabine</th>
                      <th className="text-left py-1.5 pr-2">Marque</th>
                      <th className="text-left py-1.5 pr-2">Série</th>
                      <th className="text-left py-1.5 pr-2">Service</th>
                      <th className="text-center py-1.5 px-2">Arrivée</th>
                      <th className="text-center py-1.5 px-2">Départ</th>
                      <th className="text-right py-1.5 pl-2">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map((e, i) => (
                      <tr
                        key={`${e.projectId}-${e.cabineLabel}-${i}`}
                        onClick={() => router.push(`/projet/${e.projectId}?mode=cmd`)}
                        className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer align-top"
                      >
                        {/* Titre projet complet sur 2 lignes, police plus petite */}
                        <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100 text-[11px] leading-tight">
                          <span className="line-clamp-2">{e.projectName}</span>
                        </td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">
                          <span>{e.cabineLabel}</span>
                          {e.binome && (
                            <span
                              className="ml-1.5 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 align-middle"
                              title={e.partner ? `Binôme avec ${e.partner}` : "Binôme"}
                            >
                              Binôme{e.partner ? ` · ${e.partner}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{e.marque || "-"}</td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{e.serie || "-"}</td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{e.typeService || "-"}</td>
                        <td className="py-1.5 px-2 text-center text-gray-600 dark:text-gray-400 font-mono">{e.arrivee || "-"}</td>
                        <td className="py-1.5 px-2 text-center text-gray-600 dark:text-gray-400 font-mono">{e.depart || "-"}</td>
                        <td className="py-1.5 pl-2 text-right font-medium text-gray-900 dark:text-gray-100">{e.minutes > 0 ? fmtMin(e.minutes) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
