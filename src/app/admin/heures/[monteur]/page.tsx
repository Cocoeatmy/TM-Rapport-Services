"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollaboratorColor } from "@/lib/collaborators";
import type { Project } from "@/lib/notion";

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
  arrivee: string;
  depart: string;
  minutes: number;
}

/** Extrait les entrées (une par cabine) attribuées à `monteur` pour un projet. */
function entriesForMonteur(p: Project, monteur: string): Entry[] {
  const target = normName(monteur);
  const matches = (raw: string) =>
    raw.split(/\s*&\s*/).some((n) => normName(n) === target);
  const marque = (p.fournisseurs || []).join(", ");
  const serie = (p.seriesCabines || []).join(", ");

  const out: Entry[] = [];
  const attrMap = parseCabMap(p.attributionCabines || "");

  if (attrMap.size > 0) {
    // Multi-cabine (ou mono avec responsable) : attribution par cabine.
    const nomsMap = parseCabMap(p.nomsCabines || "");
    const arrMap = parseCabMap(p.heureArrivee || "");
    const depMap = parseCabMap(p.heureDepart || "");
    const dateMap = parseCabDates(p.heureArrivee || "");
    attrMap.forEach((monteurRaw, cabNum) => {
      if (!matches(monteurRaw)) return;
      const arrSlot = arrMap.get(cabNum) || "";
      const depSlot = depMap.get(cabNum) || "";
      out.push({
        date: dateMap.get(cabNum) || p.dateMontage?.slice(0, 10) || "",
        projectName: p.projet,
        projectId: p.id,
        cabineLabel: nomsMap.get(cabNum) || `Cabine ${cabNum}`,
        marque,
        serie,
        arrivee: slotHHMM(arrSlot),
        depart: slotHHMM(depSlot),
        minutes: durMinutes(arrSlot, depSlot),
      });
    });
    return out;
  }

  // Mono-cabine sans responsable → fallback "Collaborateurs montages".
  const isMono = (p.nbCabines || 1) <= 1;
  if (!isMono) return out;
  if (!matches(p.collaborateurs || "")) return out;
  out.push({
    date: p.dateMontage?.slice(0, 10) || "",
    projectName: p.projet,
    projectId: p.id,
    cabineLabel: "—",
    marque,
    serie,
    arrivee: slotHHMM(p.heureArrivee || ""),
    depart: slotHHMM(p.heureDepart || ""),
    minutes: durMinutes(p.heureArrivee || "", p.heureDepart || ""),
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

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") { router.push("/"); return; }
        setIsAdmin(true);
      });

    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/cmd-termine").then((r) => r.json()),
    ]).then(([enCours, termines]) => {
      setProjects([
        ...(Array.isArray(enCours) ? enCours : []),
        ...(Array.isArray(termines) ? termines : []),
      ]);
    }).finally(() => setLoading(false));
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
  const entries = projects
    .flatMap((p) => entriesForMonteur(p, decoded))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  const totalMin = entries.reduce((s, e) => s + e.minutes, 0);
  const totalCab = entries.length;
  const cabAvecHeures = entries.filter((e) => e.minutes > 0).length;

  // Groupe par jour de montage.
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.date || "";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"));

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-4 pb-8">
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{decoded}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Heures par cabine & projet
          </p>
        </div>
      </div>

      {/* Total */}
      <div className="glass-card rounded-2xl p-4 mb-6 flex items-center justify-around text-center">
        <div>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-300">{fmtMin(totalMin)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total heures</p>
        </div>
        <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">{totalCab}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cabines</p>
        </div>
        <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">
            {cabAvecHeures > 0 ? fmtMin(Math.round(totalMin / cabAvecHeures)) : "—"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Moy. / cabine</p>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune heure attribuée à ce monteur.</p>
        </div>
      )}

      {/* Une carte par jour de montage */}
      {days.map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((s, e) => s + e.minutes, 0);
        return (
          <Card key={day || "no-date"} className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="capitalize text-[#1e3a5f] dark:text-blue-300">{formatDay(day)}</span>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-300 shrink-0">{fmtMin(dayTotal)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-1.5 pr-2">Projet</th>
                      <th className="text-left py-1.5 pr-2">Cabine</th>
                      <th className="text-left py-1.5 pr-2">Marque</th>
                      <th className="text-left py-1.5 pr-2">Série</th>
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
                        <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100 text-[11px] leading-tight max-w-[180px]">
                          <span className="line-clamp-2">{e.projectName}</span>
                        </td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{e.cabineLabel}</td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{e.marque || "-"}</td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{e.serie || "-"}</td>
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
