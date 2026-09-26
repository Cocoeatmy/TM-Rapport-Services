"use client";

/**
 * Page Statistiques du thème « Signal ».
 *
 * Rendue UNIQUEMENT quand data-ui="signal" : les autres thèmes conservent la
 * page statistiques historique, inchangée. Ce composant ne calcule aucune
 * donnée métier — il reçoit les agrégats déjà produits par la page et se
 * limite à la présentation.
 *
 * Graphiques : SVG maison (aucune dépendance ajoutée), avec courbes lissées,
 * dégradés, tracé animé, curseur de survol et infobulle. Chaque série est
 * activable / désactivable depuis la légende, et l'échelle se recalcule sur
 * les seules séries visibles.
 */

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, FileText, ChevronDown, ChevronUp, X, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { cantonLabel, regionLabel } from "@/lib/swiss-cantons";

import { getTeamColor, getCollaboratorColor } from "@/lib/collaborators";

export type SignalStatsMonth = {
  mesures: number; cabines: number; montages: number; demontages: number;
  services: number; sav: number; ofr: number; ca: number;
};

type SerieId = keyof SignalStatsMonth;

const SERIES: { id: SerieId; label: string; color: string; unit?: string }[] = [
  { id: "montages",   label: "Montages",   color: "#3b82f6" },
  { id: "cabines",    label: "Cabines",    color: "#22c55e" },
  { id: "mesures",    label: "Mesures",    color: "#06b6d4" },
  { id: "services",   label: "Services",   color: "#a855f7" },
  { id: "sav",        label: "SAV",        color: "#f59e0b" },
  { id: "demontages", label: "Démontages", color: "#f43f5e" },
  { id: "ofr",        label: "OFR",        color: "#94a3b8" },
];

const KPIS: { id: SerieId; label: string; color: string; money?: boolean }[] = [
  { id: "montages", label: "Montages", color: "#3b82f6" },
  { id: "cabines",  label: "Cabines mesurées", color: "#22c55e" },
  { id: "mesures",  label: "Mesures", color: "#06b6d4" },
  { id: "ca",       label: "Chiffre d'affaires", color: "#0f766e", money: true },
  { id: "services", label: "Services", color: "#a855f7" },
  { id: "sav",      label: "SAV", color: "#f59e0b" },
  { id: "ofr",      label: "Offres", color: "#64748b" },
  { id: "demontages", label: "Démontages", color: "#f43f5e" },
];

const MONTH_ABBR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function fmt(n: number, money?: boolean): string {
  if (money) {
    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString("fr-CH")}k`;
    return Math.round(n).toLocaleString("fr-CH");
  }
  return Math.round(n).toLocaleString("fr-CH");
}

/** Minutes -> « 8 h 45 ». */
function fmtH(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const i = Number(m) - 1;
  return `${MONTH_ABBR[i] ?? m} ${(y || "").slice(2)}`;
}

/** Courbe lissée (Catmull-Rom converti en cubiques) — rendu moderne sans dépendance. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

type BarRow = { label: string; value: number; sub?: string; color: string; items?: any[] };

/** Liste de barres horizontales — brique commune aux analyses par groupe.
 *  Une ligne porteuse de projets devient cliquable : elle ouvre la liste des
 *  projets qui la composent. */
function BarList({ rows, unit, empty, onPick }: {
  rows: BarRow[]; unit?: string; empty?: string; onPick?: (r: BarRow) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="sgs-empty">{empty || "Aucune donnée."}</p>;
  return (
    <div className="sgs-barlist">
      {rows.map((r, i) => {
        const clickable = !!onPick && !!r.items?.length;
        const Inner = (
          <>
            <span className="sgs-bl-label" title={r.label}>{r.label}</span>
            <span className="sgs-bl-track">
              <i className="sgs-bl-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
            </span>
            <span className="sgs-bl-value">{fmt(r.value)}{unit ? <em>{unit}</em> : null}</span>
            {r.sub ? <span className="sgs-bl-sub">{r.sub}</span> : <span className="sgs-bl-sub" />}
          </>
        );
        return clickable ? (
          <button key={r.label} type="button" className="sgs-bl-row is-click"
            style={{ animationDelay: `${i * 35}ms` }}
            title={`Voir les ${r.items!.length} projet${r.items!.length > 1 ? "s" : ""} de « ${r.label} »`}
            onClick={() => onPick!(r)}>
            {Inner}
          </button>
        ) : (
          <div key={r.label} className="sgs-bl-row" style={{ animationDelay: `${i * 35}ms` }}>
            {Inner}
          </div>
        );
      })}
    </div>
  );
}

/** Carte d'analyse repliable. Fermée par défaut : la page s'ouvre sur une vue
 *  d'ensemble, on déplie ce qu'on veut vraiment lire. */
function Fold({ title, meta, right, children, defaultOpen = false, className = "" }: {
  title: string; meta?: string; right?: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`sgs-card${open ? "" : " is-folded"} ${className}`}>
      <div className="sgs-card-head">
        <div>
          <h2 className="sgs-card-title">{title}</h2>
          {meta && <p className="sgs-card-meta">{meta}</p>}
        </div>
        {open ? right : null}
        <button type="button" className="sgs-fold" aria-expanded={open}
          title={open ? "Replier" : "Déplier"} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {open && children}
    </div>
  );
}

/** Palette stable : la même chaîne donne toujours la même teinte. */
const HUES = ["#3b82f6", "#22c55e", "#06b6d4", "#a855f7", "#f59e0b", "#f43f5e", "#0f766e", "#6366f1", "#84cc16", "#e11d48"];
function hueFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function SignalStats({
  projects,
  byMonth,
  monthKeys,
  allByMonth,
  totals: totalsProp,
  rangeLabel,
  filter,
  onRefresh,
}: {
  /** Projets de la période (déjà filtrés par la page) — analyses par groupe. */
  projects?: any[];
  byMonth: Record<string, SignalStatsMonth>;
  monthKeys: string[];
  /** TOUS les mois disponibles, hors filtre de période : nécessaire pour
   *  comparer la période affichée à celle qui la précède. */
  allByMonth?: Record<string, SignalStatsMonth>;
  /** Totaux calculés sur les lignes brutes par la page (source de vérité). */
  totals?: Partial<Record<SerieId, number>>;
  rangeLabel?: string;
  filter?: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
}) {
  const [hidden, setHidden] = useState<Set<SerieId>>(() => new Set<SerieId>(["ofr", "demontages"]));
  const [shape, setShape] = useState<"line" | "area" | "bar">("area");
  const [hover, setHover] = useState<number | null>(null);
  /** Mois épinglés pour comparaison. Vide = tous les mois de la période. */
  const [picked, setPicked] = useState<Set<string>>(() => new Set<string>());
  const [refreshing, setRefreshing] = useState(false);
  const [making, setMaking] = useState(false);
  /** Onglet d'analyse : rien n'est affiché en vrac, on choisit son angle. */
  const [tab, setTab] = useState<"activite" | "equipes" | "repartition" | "qualite">("activite");
  /** Vue géographique : par localité ou par canton. */
  const [geoMode, setGeoMode] = useState<"npa" | "canton" | "region">("npa");
  /** Groupe sélectionné : ouvre la liste des projets qui le composent. */
  const [pick, setPick] = useState<BarRow | null>(null);

  /* ── Analyses par groupe, calculées depuis les projets de la période ──── */
  const P = useMemo(() => (Array.isArray(projects) ? projects : []), [projects]);
  const cabOf = (p: any) => Number(p?.nbCabines) || 0;

  const byCollab = useMemo(() => {
    const m = new Map<string, { cab: number; items: any[] }>();
    P.forEach((p) => {
      const names = String(p.collaborateurs || "").split("&").map((n: string) => n.trim()).filter(Boolean);
      if (names.length === 0) return;
      names.forEach((n: string) => {
        const cur = m.get(n) || { cab: 0, items: [] as any[] };
        // Cabines réparties entre les monteurs d'un binôme : pas de double compte.
        cur.cab += cabOf(p) / names.length;
        cur.items.push(p);
        m.set(n, cur);
      });
    });
    return [...m.entries()]
      .map(([label, v]) => ({ label, value: Math.round(v.cab), sub: `${v.items.length} proj.`, color: getCollaboratorColor(label).dot, items: v.items }))
      .sort((a, b) => b.value - a.value);
  }, [P]);

  const byTeam = useMemo(() => {
    const m = new Map<string, { cab: number; items: any[] }>();
    P.forEach((p) => {
      const label = String(p.collaborateurs || "").trim() || "Non attribué";
      const cur = m.get(label) || { cab: 0, items: [] };
      cur.cab += cabOf(p); cur.items.push(p);
      m.set(label, cur);
    });
    return [...m.entries()]
      .map(([label, v]) => ({
        label, value: v.cab, sub: `${v.items.length} proj.`, items: v.items,
        color: label === "Non attribué" ? "#cbd5e1" : getTeamColor(label).dot,
      }))
      .sort((a, b) => b.value - a.value);
  }, [P]);

  /* Un projet de SERVICE PUR (remplacement de joints, réfection des silicones…)
     ne comporte ni marque ni série de cabine : le compter faussait les deux
     répartitions avec des dizaines de lignes « Non renseigné ». On l'écarte
     quand « Type de services » vaut UNIQUEMENT « Services » — dès qu'il porte
     aussi Mesures ou Montage, une cabine est bien en jeu et il compte. */
  const isServicePur = (p: any) => {
    const t: string[] = Array.isArray(p?.typeServices) ? p.typeServices : [];
    return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
  };

  const byList = (field: string) => {
    const m = new Map<string, { cab: number; items: any[] }>();
    P.filter((p) => !isServicePur(p)).forEach((p) => {
      let arr: string[] = Array.isArray(p[field]) ? p[field] : [];
      /* « TM Douche » est notre propre enseigne : le client ne doit pas voir la
         marque réelle, mais nous si. Le projet forme donc UNE seule entrée
         « TM Douche / Bernstein » — et non deux lignes qui compteraient ses
         cabines deux fois. */
      if (field === "fournisseurs" && arr.some((f) => /tm\s*douche/i.test(f || ""))) {
        const autres = arr.filter((f) => !/tm\s*douche/i.test(f || ""));
        arr = [autres.length ? `TM Douche / ${autres.join(", ")}` : "TM Douche"];
      }
      (arr.length ? arr : ["Non renseigné"]).forEach((k: string) => {
        const cur = m.get(k) || { cab: 0, items: [] };
        cur.cab += cabOf(p); cur.items.push(p);
        m.set(k, cur);
      });
    });
    return [...m.entries()]
      .map(([label, v]) => ({ label, value: v.cab, sub: `${v.items.length} proj.`, color: hueFor(label), items: v.items }))
      .sort((a, b) => b.value - a.value);
  };
  const byFournisseur = useMemo(() => byList("fournisseurs"), [P]);
  const bySerie = useMemo(() => byList("seriesCabines"), [P]);

  const byStatut = useMemo(() => {
    const m = new Map<string, any[]>();
    P.forEach((p) => {
      const k = String(p.etatCMD || "—");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    });
    return [...m.entries()]
      .map(([label, items]) => ({ label, value: items.length, color: hueFor(label), items }))
      .sort((a, b) => b.value - a.value);
  }, [P]);

  /* ── Heures & temps moyen ─────────────────────────────────────────────
     Mêmes sources que la page d'administration : heureArrivee / heureDepart
     sur le projet. Pour un binôme, CHAQUE monteur a passé la durée complète
     sur place — on ne divise donc pas (contrairement aux cabines). */
  const timeStats = useMemo(() => {
    const parseTime = (raw?: string): number | null => {
      if (!raw || !raw.trim()) return null;
      const m = raw.match(/(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    let totalMin = 0, totalCab = 0;
    const byC = new Map<string, { min: number; cab: number }>();
    P.forEach((p) => {
      const a = parseTime(p.heureArrivee);
      const b = parseTime(p.heureDepart);
      if (a === null || b === null || b <= a) return;
      const dur = b - a;
      const cab = cabOf(p);
      totalMin += dur; totalCab += cab;
      String(p.collaborateurs || "").split("&").map((n: string) => n.trim()).filter(Boolean)
        .forEach((n: string) => {
          const cur = byC.get(n) || { min: 0, cab: 0 };
          cur.min += dur; cur.cab += cab;
          byC.set(n, cur);
        });
    });
    const hours = [...byC.entries()]
      .map(([label, v]) => ({ label, value: Math.round(v.min / 6) / 10, sub: `${v.cab} cab.`, color: getCollaboratorColor(label).dot }))
      .sort((a, b) => b.value - a.value);
    const avgPerCab = [...byC.entries()]
      .filter(([, v]) => v.cab > 0)
      .map(([label, v]) => ({ label, value: Math.round(v.min / v.cab), sub: fmtH(Math.round(v.min / v.cab)), color: getCollaboratorColor(label).dot }))
      .sort((a, b) => a.value - b.value);
    return { totalMin, totalCab, globalAvg: totalCab ? Math.round(totalMin / totalCab) : 0, hours, avgPerCab };
  }, [P]);

  /** Répartition géographique : par localité (NPA) ou par canton. */
  const geoBy = (mode: "npa" | "canton" | "region") => {
    const m = new Map<string, { cab: number; items: any[] }>();
    P.forEach((p) => {
      const addr = String(p.adresseChantier || p.projet || "");
      let label: string;
      if (mode === "canton") {
        label = cantonLabel(addr);
      } else if (mode === "region") {
        label = regionLabel(addr);
      } else {
        const mm = addr.match(/\b(\d{4})\s+([^,]+)/);
        label = mm ? `${mm[1]} ${mm[2].trim()}` : "Sans adresse";
      }
      const cur = m.get(label) || { cab: 0, items: [] };
      cur.cab += cabOf(p); cur.items.push(p);
      m.set(label, cur);
    });
    return [...m.entries()]
      .map(([label, v]) => ({ label, value: v.cab, sub: `${v.items.length} proj.`, color: hueFor(label), items: v.items }))
      .sort((a, b) => b.value - a.value);
  };
  const byGeoNpa = useMemo(() => geoBy("npa").slice(0, 20), [P]);
  const byGeoCanton = useMemo(() => geoBy("canton"), [P]);
  const byGeoRegion = useMemo(() => geoBy("region"), [P]);

  const quality = useMemo(() => {
    const total = P.length || 0;
    const soucis = P.filter((p) => p.soucisMontage === true || String(p.etatCMD || "") === "Soucis montage").length;
    const pieces = P.filter((p) => String(p.infoPiecesManquantes || "").trim()).length;
    const defauts = P.filter((p) => String(p.infoDefautsSignale || "").trim()).length;
    const sav = P.filter((p) => String(p.etatSAV || "").trim() || String(p.commentairesSav || "").trim()).length;
    const rate = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return { total, soucis, pieces, defauts, sav, rate };
  }, [P]);

  const TABS = [
    { id: "activite" as const, label: "Activité" },
    { id: "equipes" as const, label: "Équipes & monteurs", n: byCollab.length },
    { id: "repartition" as const, label: "Répartition", n: byFournisseur.length + bySerie.length },
    { id: "qualite" as const, label: "Qualité", n: quality.soucis + quality.defauts },
  ];

  const keys = useMemo(
    () => (picked.size > 0 ? monthKeys.filter((k) => picked.has(k)) : monthKeys.slice(-14)),
    [monthKeys, picked]
  );
  const rows = useMemo(
    () => keys.map((k) => ({ key: k, label: monthLabel(k), v: byMonth[k] })).filter((r) => !!r.v),
    [keys, byMonth]
  );

  const totals = useMemo(() => {
    // Priorité aux totaux fournis par la page (calculés sur les lignes brutes).
    if (totalsProp) return totalsProp as Record<string, number>;
    const t: Record<string, number> = {};
    (Object.keys(SERIES.reduce((a, s) => ({ ...a, [s.id]: 1 }), { ca: 1 } as Record<string, number>)) as string[])
      .forEach((id) => { t[id] = 0; });
    monthKeys.forEach((k) => {
      const v = byMonth[k];
      if (!v) return;
      (Object.keys(v) as SerieId[]).forEach((id) => { t[id] = (t[id] || 0) + (v[id] || 0); });
    });
    return t;
  }, [monthKeys, byMonth, totalsProp]);

  /* ── Comparaison « à date » ───────────────────────────────────────────────
     L'ancien badge comparait les deux derniers mois de la période : sur une
     année passée cela revenait à comparer novembre et décembre, ce qui ne
     voulait rien dire. On compare désormais la période affichée à la période
     de MÊME DURÉE qui la précède — et on écarte le mois en cours, forcément
     incomplet, des deux côtés, pour que la comparaison reste honnête au jour
     du jour. */
  const cmp = useMemo(() => {
    const nowKey = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    })();
    // Mois complets de la période affichée (le mois courant est exclu).
    const cur = rows.map((r) => r.key).filter((k) => k < nowKey).sort();
    if (cur.length === 0) return null;
    /* Période de référence : LES MÊMES MOIS, un an plus tôt.
       Prendre « les N mois qui précèdent » comparait 2026 (janvier→août) à
       mai→décembre 2025, deux saisons différentes : le pourcentage n'avait
       aucun sens. Un décalage d'exactement douze mois donne toujours la
       comparaison attendue — année contre année, mois contre même mois. */
    const prev = cur.map((k) => {
      const [y, m] = k.split("-");
      return `${Number(y) - 1}-${m}`;
    });
    const src = allByMonth || byMonth;
    const sum = (keys: string[], id: SerieId) =>
      keys.reduce((s2, k) => s2 + ((src[k]?.[id] as number) || 0), 0);
    const label = (keys: string[]) => {
      if (keys.length === 0) return "—";
      return keys.length === 1 ? monthLabel(keys[0]) : `${monthLabel(keys[0])} – ${monthLabel(keys[keys.length - 1])}`;
    };
    return { cur, prev, sum, curLabel: label(cur), prevLabel: label(prev) };
  }, [rows, allByMonth, byMonth]);

  /** Variation de la période affichée face à la précédente, de même durée. */
  const delta = (id: SerieId): number | null => {
    if (!cmp) return null;
    const a = cmp.sum(cmp.prev, id);
    const b = cmp.sum(cmp.cur, id);
    if (a === 0) return null; // rien à comparer : pas de badge trompeur
    return ((b - a) / a) * 100;
  };

  /** Texte de survol : les deux périodes et leurs valeurs, en toutes lettres. */
  const deltaTitle = (id: SerieId, label: string): string => {
    if (!cmp) return "";
    const a = cmp.sum(cmp.prev, id);
    const b = cmp.sum(cmp.cur, id);
    return `${label} — ${cmp.curLabel} : ${b}  ·  ${cmp.prevLabel} : ${a}`;
  };

  const visible = SERIES.filter((s) => !hidden.has(s.id));
  const max = Math.max(1, ...rows.flatMap((r) => visible.map((s) => r.v[s.id] || 0)));

  // Géométrie du graphe
  const W = 1000, H = 340, PL = 44, PR = 16, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i: number) => (rows.length <= 1 ? PL + iw / 2 : PL + (i / (rows.length - 1)) * iw);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  const toggle = (id: SerieId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (rows.length === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const ratio = Math.max(0, Math.min(1, (px - PL) / iw));
    setHover(Math.round(ratio * (rows.length - 1)));
  };

  return (
    <div className="sgs">
      <div className="sgs-head">
        <div>
          <h1 className="sgs-h1">Statistiques</h1>
          {rangeLabel && <p className="sgs-sub">{rangeLabel}</p>}
          {/* Sans cette ligne, personne ne sait à quoi se rapportent les
              pourcentages affichés sur les indicateurs. */}
          {cmp && (
            <p className="sgs-sub sgs-cmp">
              Évolution&nbsp;: {cmp.curLabel} comparé à {cmp.prevLabel}
              <span className="sgs-cmp-hint"> · mêmes mois un an plus tôt, mois en cours exclu</span>
            </p>
          )}
        </div>
        <div className="sgs-head-actions">
          <button
            type="button"
            className="sgs-report"
            disabled={making}
            onClick={async () => {
              setMaking(true);
              try {
                const res = await fetch("/api/rapport-stats", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    periodLabel: rangeLabel || "Tout",
                    months: rows.map((r) => ({ label: r.label, ...r.v })),
                    totals,
                    series: visible.map((v) => v.id),
                    comparedLabels: picked.size >= 2 ? rows.map((r) => r.label) : [],
                  }),
                });
                if (!res.ok) throw new Error("PDF");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              } catch {
                // silencieux : l'utilisateur peut réessayer
              } finally {
                setMaking(false);
              }
            }}
          >
            <FileText className={`w-3.5 h-3.5${making ? " sgs-spin" : ""}`} />
            {making ? "Génération…" : "Rapport PDF"}
          </button>
          {onRefresh && (
          <button
            type="button"
            className="sgs-refresh"
            disabled={refreshing}
            onClick={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }}
            title="Relit Notion en direct — la journée en cours n'est pas encore dans le snapshot nocturne"
          >
            <RefreshCw className={`w-3.5 h-3.5${refreshing ? " sgs-spin" : ""}`} />
            {refreshing ? "Actualisation…" : "Actualiser"}
          </button>
          )}
        </div>
      </div>

      {/* Onglets d'analyse : on choisit son angle, rien n'est déversé en vrac */}
      <div className="sgs-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`sgs-tab${tab === t.id ? " is-on" : ""}`} aria-pressed={tab === t.id}>
            {t.label}
            {typeof t.n === "number" && t.n > 0 && <span className="sgs-tab-n">{t.n}</span>}
          </button>
        ))}
      </div>

      {filter && <div className="sgs-filter">{filter}</div>}

      {/* Sélection de mois : cliquez pour épingler, comparez-en plusieurs */}
      {tab === "activite" && monthKeys.length > 1 && (
        <div className="sgs-months">
          <span className="sgs-months-k">Mois</span>
          {monthKeys.slice(-18).map((k) => {
            const on = picked.has(k);
            return (
              <button key={k} type="button" aria-pressed={on}
                className={`sgs-month${on ? " is-on" : ""}`}
                onClick={() => setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k); else next.add(k);
                  return next;
                })}
              >
                {monthLabel(k)}
              </button>
            );
          })}
          {picked.size > 0 && (
            <button type="button" className="sgs-month sgs-month-clear" onClick={() => setPicked(new Set())}>
              Tout afficher ({monthKeys.length})
            </button>
          )}
        </div>
      )}

      {/* Indicateurs clés */}
      {tab === "activite" && (<>
      <div className="sgs-kpis">
        {KPIS.map((k, i) => {
          const d = delta(k.id);
          const spark = rows.map((r) => r.v[k.id] || 0);
          const sMax = Math.max(1, ...spark);
          const sPts = spark.map((v, idx) => ({
            x: spark.length <= 1 ? 50 : (idx / (spark.length - 1)) * 100,
            y: 26 - (v / sMax) * 22,
          }));
          return (
            <div key={k.id} className="sgs-kpi" style={{ animationDelay: `${i * 45}ms` }}>
              <div className="sgs-kpi-top">
                <span className="sgs-kpi-label">{k.label}</span>
                {d !== null && (
                  <span className={`sgs-delta ${d > 0.5 ? "up" : d < -0.5 ? "down" : "flat"}`}
                    title={deltaTitle(k.id, k.label)}>
                    {d > 0.5 ? <TrendingUp className="w-3 h-3" /> : d < -0.5 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {Math.abs(Math.round(d))}%
                  </span>
                )}
              </div>
              <span className="sgs-kpi-value" style={{ color: k.color }}>{fmt(totals[k.id] || 0, k.money)}</span>
              <svg className="sgs-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                <path d={smoothPath(sPts)} fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Graphe principal */}
      <div className="sgs-card">
        <div className="sgs-card-head">
          <div>
            <h2 className="sgs-card-title">Tendance mensuelle</h2>
            <p className="sgs-card-meta">{rows.length} mois · cliquez une série pour l'afficher ou la masquer</p>
          </div>
          <div className="sgs-seg">
            {([["area", "Aires"], ["line", "Lignes"], ["bar", "Barres"]] as const).map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setShape(v)} className={shape === v ? "is-on" : ""}>{lbl}</button>
            ))}
          </div>
        </div>

        <div className="sgs-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="sgs-svg" onMouseMove={onMove} role="img" aria-label="Tendance mensuelle">
            <defs>
              {visible.map((s) => (
                <linearGradient key={s.id} id={`sgs-g-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>

            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} className="sgs-grid" />
                <text x={PL - 10} y={y(t) + 4} textAnchor="end" className="sgs-axis">{fmt(t)}</text>
              </g>
            ))}

            {shape === "bar" && rows.map((r, i) => {
              const bw = Math.max(2, (iw / Math.max(1, rows.length)) / Math.max(1, visible.length) - 2);
              return visible.map((s, si) => {
                const v = r.v[s.id] || 0;
                const bx = x(i) - (visible.length * (bw + 2)) / 2 + si * (bw + 2);
                const bh = Math.max(0, PT + ih - y(v));
                return (
                  <rect key={`${r.key}-${s.id}`} x={bx} y={y(v)} width={bw} height={bh} rx="2"
                    fill={s.color} className="sgs-bar" style={{ animationDelay: `${i * 22 + si * 8}ms` }} />
                );
              });
            })}

            {shape !== "bar" && visible.map((s, si) => {
              const pts = rows.map((r, i) => ({ x: x(i), y: y(r.v[s.id] || 0) }));
              const d = smoothPath(pts);
              return (
                <g key={s.id}>
                  {shape === "area" && pts.length > 1 && (
                    <path d={`${d} L ${pts[pts.length - 1].x} ${PT + ih} L ${pts[0].x} ${PT + ih} Z`}
                      fill={`url(#sgs-g-${s.id})`} className="sgs-area" style={{ animationDelay: `${si * 70}ms` }} />
                  )}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className="sgs-line" style={{ animationDelay: `${si * 70}ms` }} />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="var(--sg-paper)" stroke={s.color} strokeWidth="2.5" className="sgs-dot" />
                  ))}
                </g>
              );
            })}

            {hover !== null && rows[hover] && (
              <line x1={x(hover)} y1={PT} x2={x(hover)} y2={PT + ih} className="sgs-cursor" />
            )}

            {rows.map((r, i) => (
              <text key={r.key} x={x(i)} y={H - 10} textAnchor="middle"
                className={`sgs-axis${hover === i ? " is-on" : ""}`}>{r.label}</text>
            ))}
          </svg>

          {hover !== null && rows[hover] && (
            <div className="sgs-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <span className="sgs-tip-title">{rows[hover].label}</span>
              {visible.map((s) => (
                <span key={s.id} className="sgs-tip-row">
                  <i style={{ background: s.color }} />
                  <span className="sgs-tip-k">{s.label}</span>
                  <span className="sgs-tip-v">{fmt(rows[hover].v[s.id] || 0)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Légende cliquable */}
        <div className="sgs-legend">
          {SERIES.map((s) => {
            const off = hidden.has(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={!off}
                className={`sgs-leg${off ? " is-off" : ""}`}>
                <i style={{ background: off ? "transparent" : s.color, borderColor: s.color }} />
                {s.label}
                <span className="sgs-leg-v">{fmt(totals[s.id] || 0)}</span>
              </button>
            );
          })}
          <button type="button" className="sgs-leg sgs-leg-all" onClick={() => setHidden(new Set())}>Tout afficher</button>
        </div>
      </div>

      {/* Comparaison VS — dès que 2 mois ou plus sont épinglés */}
      {rows.length >= 2 && picked.size >= 2 && (
        <div className="sgs-card">
          <div className="sgs-card-head">
            <div>
              <h2 className="sgs-card-title">
                Comparaison <span className="sgs-vs">VS</span>
              </h2>
              <p className="sgs-card-meta">
                {rows.map((r) => r.label).join("  ·  ")} — évolution du premier au dernier mois épinglé
              </p>
            </div>
          </div>
          <div className="sgs-vs-table">
            <div className="sgs-vs-tr sgs-vs-th">
              <span>Série</span>
              {rows.map((r) => <span key={r.key} className="sgs-right">{r.label}</span>)}
              <span className="sgs-right">Évolution</span>
            </div>
            {visible.map((s) => {
              const first = rows[0].v[s.id] || 0;
              const last = rows[rows.length - 1].v[s.id] || 0;
              const pct = first === 0 ? (last === 0 ? 0 : null) : ((last - first) / first) * 100;
              const vMax = Math.max(1, ...rows.map((r) => r.v[s.id] || 0));
              return (
                <div key={s.id} className="sgs-vs-tr">
                  <span className="sgs-vs-serie">
                    <i style={{ background: s.color }} />
                    {s.label}
                  </span>
                  {rows.map((r) => {
                    const v = r.v[s.id] || 0;
                    return (
                      <span key={r.key} className="sgs-cell">
                        <i className="sgs-cell-bar" style={{ width: `${(v / vMax) * 100}%`, background: s.color }} />
                        <span className="sgs-cell-v">{fmt(v)}</span>
                      </span>
                    );
                  })}
                  <span className="sgs-right">
                    {pct === null ? (
                      <span className="sgs-delta flat">—</span>
                    ) : (
                      <span className={`sgs-delta ${pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat"}`}>
                        {pct > 0.5 ? <TrendingUp className="w-3 h-3" /> : pct < -0.5 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {Math.abs(Math.round(pct))}%
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Détail mensuel */}
      <div className="sgs-card">
        <div className="sgs-card-head">
          <h2 className="sgs-card-title">Détail mensuel</h2>
          <span className="sgs-card-meta">séries visibles uniquement</span>
        </div>
        <div className="sgs-table" role="table">
          <div className="sgs-tr sgs-th" role="row">
            <span role="columnheader">Mois</span>
            {visible.map((s) => <span key={s.id} role="columnheader" className="sgs-right">{s.label}</span>)}
          </div>
          {/* Ordre chronologique : janvier en haut, décembre en bas — on lit
              l'année dans le même sens que le graphique juste au-dessus. */}
          {rows.map((r) => (
            <div key={r.key} className="sgs-tr" role="row">
              <span role="cell" className="sgs-tr-m">{r.label}</span>
              {visible.map((s) => {
                const v = r.v[s.id] || 0;
                return (
                  <span key={s.id} role="cell" className="sgs-cell">
                    <i className="sgs-cell-bar" style={{ width: `${(v / max) * 100}%`, background: s.color }} />
                    <span className="sgs-cell-v">{fmt(v)}</span>
                  </span>
                );
              })}
            </div>
          ))}
          {rows.length === 0 && <p className="sgs-empty">Aucune donnée sur cette période.</p>}
        </div>
      </div>
      </>)}

      {tab === "equipes" && (
        <div className="sgs-grid2">
          <Fold title="Montage par monteur" meta="cabines posées · binômes répartis à parts égales">
            <BarList rows={byCollab} unit=" cab." empty="Aucun montage attribué sur cette période." onPick={setPick} />
          </Fold>
          <Fold title="Cabines par équipe" meta="solo, binôme ou team, tels que saisis">
            <BarList rows={byTeam} unit=" cab." empty="Aucune équipe sur cette période." onPick={setPick} />
          </Fold>
          <Fold title="Heures par monteur" meta="temps sur site · un binôme compte la durée pour chacun"
            right={<span className="sgs-card-meta">{fmtH(timeStats.totalMin)} au total</span>}>
            <BarList rows={timeStats.hours} unit=" h" empty="Aucune heure saisie sur cette période." />
          </Fold>
          <Fold title="Temps moyen par cabine" meta="du plus rapide au plus long"
            right={<span className="sgs-kpi-value" style={{ fontSize: 22, color: "#0f766e" }}>
              {timeStats.globalAvg ? fmtH(timeStats.globalAvg) : "—"}
            </span>}>
            <BarList rows={timeStats.avgPerCab} empty="Pas assez de données horaires." />
          </Fold>
        </div>
      )}

      {tab === "repartition" && (
        <div className="sgs-grid2">
          <Fold title="Cabines par fournisseur" meta="cabines des projets terminés · services purs exclus · cliquez une ligne pour voir les projets">
            <BarList rows={byFournisseur} unit=" cab." onPick={setPick} />
          </Fold>
          <Fold title="Cabines par série" meta="cabines des projets terminés · services purs exclus · cliquez une ligne pour voir les projets">
            <BarList rows={bySerie} unit=" cab." onPick={setPick} />
          </Fold>
          <Fold className="sgs-span2" title="Répartition géographique"
            meta={geoMode === "canton"
              ? "par canton · déduit du code postal et de l'adresse"
              : geoMode === "region"
                ? "par région de travail · approximation par code postal"
                : "par localité (NPA) · 20 premières"}
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={geoMode === "npa" ? "is-on" : ""} onClick={() => setGeoMode("npa")}>Localité</button>
                <button type="button" className={geoMode === "region" ? "is-on" : ""} onClick={() => setGeoMode("region")}>Région</button>
                <button type="button" className={geoMode === "canton" ? "is-on" : ""} onClick={() => setGeoMode("canton")}>Canton</button>
              </div>
            }>
            <BarList rows={geoMode === "canton" ? byGeoCanton : geoMode === "region" ? byGeoRegion : byGeoNpa}
              unit=" cab." empty="Aucune adresse exploitable." onPick={setPick} />
          </Fold>
          <Fold className="sgs-span2" title="Projets par statut" meta={`état CMD · ${fmt(quality.total)} projets`}>
            <BarList rows={byStatut} unit=" proj." onPick={setPick} />
          </Fold>
        </div>
      )}

      {tab === "qualite" && (
        <>
          <div className="sgs-kpis">
            {[
              { label: "Soucis de montage", n: quality.soucis, color: "#f43f5e" },
              { label: "Pièces manquantes", n: quality.pieces, color: "#f59e0b" },
              { label: "Défauts signalés", n: quality.defauts, color: "#dc2626" },
              { label: "Projets avec SAV", n: quality.sav, color: "#a855f7" },
            ].map((k, i) => (
              <div key={k.label} className="sgs-kpi" style={{ animationDelay: `${i * 45}ms` }}>
                <div className="sgs-kpi-top">
                  <span className="sgs-kpi-label">{k.label}</span>
                  <span className="sgs-delta flat">{quality.rate(k.n)}%</span>
                </div>
                <span className="sgs-kpi-value" style={{ color: k.color }}>{fmt(k.n)}</span>
                <span className="sgs-kpi-foot">sur {fmt(quality.total)} projets</span>
              </div>
            ))}
          </div>
          <div className="sgs-card">
            <div className="sgs-card-head">
              <div>
                <h2 className="sgs-card-title">Taux par indicateur</h2>
                <p className="sgs-card-meta">part des projets concernés sur la période</p>
              </div>
            </div>
            <BarList
              rows={[
                { label: "Soucis de montage", value: quality.soucis, sub: `${quality.rate(quality.soucis)}%`, color: "#f43f5e" },
                { label: "Pièces manquantes", value: quality.pieces, sub: `${quality.rate(quality.pieces)}%`, color: "#f59e0b" },
                { label: "Défauts signalés", value: quality.defauts, sub: `${quality.rate(quality.defauts)}%`, color: "#dc2626" },
                { label: "Projets avec SAV", value: quality.sav, sub: `${quality.rate(quality.sav)}%`, color: "#a855f7" },
              ]}
              unit=" proj."
            />
          </div>
        </>
      )}

      {/* Liste des projets d'un groupe : un chiffre de statistique doit
          pouvoir être ouvert pour voir ce qu'il recouvre. */}
      {pick && (
        <div className="sgs-drawer" role="dialog" aria-label={`Projets — ${pick.label}`}>
          <div className="sgs-drawer-head">
            <div>
              <h2 className="sgs-card-title">{pick.label}</h2>
              <p className="sgs-card-meta">
                {pick.items!.length} projet{pick.items!.length > 1 ? "s" : ""}
                {" · "}{fmt(pick.items!.reduce((s2: number, x: any) => s2 + cabOf(x), 0))} cab.
              </p>
            </div>
            <button type="button" className="sg-unpin" aria-label="Fermer" onClick={() => setPick(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="sgs-drawer-body">
            {pick.items!.map((p: any) => (
              <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`} className="sgc-row" onClick={() => setPick(null)}>
                {/* Pas de pastille d'état : dans les statistiques, un projet
                    est forcément terminé — elle ne disait rien et rognait le
                    nom du projet. */}
                <span className="sg-mono sgc-row-tm">{p.ofrTM || "—"}</span>
                <span className="sgc-row-name">{p.projet}</span>
                <span className="sg-place"><MapPin className="w-3 h-3" /><span>{p.adresseChantier || "—"}</span></span>
                <span className="sg-mono sgc-row-cab">{cabOf(p)} cab.</span>
                <ChevronRight className="w-4 h-4 sg-plist-chev" />
              </Link>
            ))}
          </div>
        </div>
      )}
      {pick && <div className="sgs-drawer-veil" onClick={() => setPick(null)} aria-hidden="true" />}
    </div>
  );
}
