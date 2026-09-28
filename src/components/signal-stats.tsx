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

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, FileText, ChevronDown, ChevronUp, X, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { cantonLabel, regionLabel } from "@/lib/swiss-cantons";
import { conformitePhotos, totalPhotos } from "@/lib/photos-stats";
import { filterByStatsDate, describeStatsRange, getRolling12Range, type StatsDateState, DEFAULT_STATS_DATE_STATE } from "@/components/stats-date-filter";

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

/**
 * Tableau d'analyse.
 *
 * En vrai <table> et non en grille CSS : une grille dont le nombre de colonnes
 * doit coïncider à la main entre l'en-tête et chaque ligne finit toujours par
 * se décaler — c'est ce qui s'est produit. Le navigateur dimensionne les
 * colonnes d'un tableau tout seul, et ne se trompe jamais.
 */
function Tableau({ cols, children }: {
  cols: { titre: string; num?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <div className="sgs-t-wrap">
      <table className="sgs-t">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.titre + i} className={c.num ? "num" : undefined}>{c.titre}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Barre de proportion, pour lire une part sans lire un chiffre. */
function Part({ valeur, sur, ton }: { valeur: number; sur: number; ton?: string }) {
  const p = sur > 0 ? Math.min(100, Math.round((valeur / sur) * 100)) : 0;
  return (
    <span className="sgs-part" aria-hidden="true">
      <i className={ton ? `is-${ton}` : undefined} style={{ width: `${p}%` }} />
    </span>
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

/**
 * Période propre à une carte, dans son en-tête.
 *
 * Le filtre de la page vaut pour tout le tableau de bord : y toucher pour
 * examiner un seul indicateur déplace tout le reste. Ce sélecteur reprend les
 * mêmes modes — mois, année, douze mois glissants, plage de dates — mais ne
 * commande que sa carte, et il la remet à « Tout » par défaut.
 */
function PeriodeCarte({ etat, onChange }: {
  etat: StatsDateState; onChange: (e: StatsDateState) => void;
}) {
  const modes: { k: StatsDateState["mode"]; label: string }[] = [
    { k: "all", label: "Tout" }, { k: "month", label: "Mois" },
    { k: "year", label: "Année" }, { k: "rolling12", label: "12 mois" },
    { k: "range", label: "Période" },
  ];
  const annees: number[] = [];
  for (let y = 2024; y <= new Date().getFullYear(); y++) annees.push(y);

  return (
    <div className="sgs-periode">
      <div className="sgs-seg">
        {modes.map((m) => (
          <button key={m.k} type="button" className={etat.mode === m.k ? "is-on" : ""}
            onClick={() => onChange({ ...etat, mode: m.k })}>{m.label}</button>
        ))}
      </div>
      {etat.mode === "month" && (
        <input type="month" className="sgs-date" value={etat.month}
          onChange={(e) => onChange({ ...etat, month: e.target.value })} />
      )}
      {etat.mode === "year" && (
        <select className="sgs-date" value={etat.year}
          onChange={(e) => onChange({ ...etat, year: e.target.value })}>
          {annees.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      )}
      {etat.mode === "range" && (
        <>
          <input type="date" className="sgs-date" value={etat.from}
            onChange={(e) => onChange({ ...etat, from: e.target.value })} />
          <span className="sgs-date-sep">→</span>
          <input type="date" className="sgs-date" value={etat.to}
            onChange={(e) => onChange({ ...etat, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

/** Minutes en « 7h45 » — la lecture naturelle d'une durée de travail. */
function hm(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
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
  projectsAll,
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
  /** Tous les projets, AVANT le filtre de période de la page : permet à une
   *  carte de porter sa propre période sans dépendre de celle de la page. */
  projectsAll?: any[];
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
  const [tab, setTab] = useState<"activite" | "equipes" | "repartition" | "qualite" | "clients">("activite");
  /** Vue géographique : par localité ou par canton. */
  const [geoMode, setGeoMode] = useState<"npa" | "canton" | "region">("npa");
  /** Groupe sélectionné : ouvre la liste des projets qui le composent. */
  const [pick, setPick] = useState<BarRow | null>(null);
  /* Signalements saisis DANS l'app (pièces manquantes, défauts). Ils vivent
     hors Notion : on les lit à part, et ils complètent les indicateurs
     historiques sans les modifier — ceux-ci reposent sur d'anciennes colonnes
     Notion qu'on laisse telles quelles. */
  const [sig, setSig] = useState<{ pieces: any[]; defauts: any[] } | null>(null);
  useEffect(() => {
    let vivant = true;
    Promise.all([
      fetch("/api/pieces").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/defauts").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([pieces, defauts]) => {
      if (vivant) setSig({
        pieces: Array.isArray(pieces) ? pieces : [],
        defauts: Array.isArray(defauts) ? defauts : [],
      });
    });
    return () => { vivant = false; };
  }, []);

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

  /* ── Délais réels ───────────────────────────────────────────────────────
     Toutes ces dates sont saisies depuis toujours ; personne ne les croisait.
     On raisonne en MÉDIANE et non en moyenne : une commande oubliée six mois
     dans un coin décalerait une moyenne au point de la rendre inutilisable,
     alors que la médiane dit ce qui se passe réellement une fois sur deux. */
  const jourDe = (v: any): number | null => {
    if (!v) return null;
    const t = Date.parse(String(v).length <= 10 ? `${v}T12:00:00` : String(v));
    return Number.isNaN(t) ? null : t;
  };
  const ecart = (a: any, b: any): number | null => {
    const d1 = jourDe(a), d2 = jourDe(b);
    if (d1 === null || d2 === null) return null;
    const j = Math.round((d2 - d1) / 86400000);
    // Au-delà d'un an, c'est une erreur de saisie plutôt qu'un délai.
    return j >= 0 && j <= 365 ? j : null;
  };
  const mediane = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const t = [...xs].sort((a, b) => a - b);
    const m = Math.floor(t.length / 2);
    return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
  };
  const centile = (xs: number[], q: number): number => {
    if (xs.length === 0) return 0;
    const t = [...xs].sort((a, b) => a - b);
    return t[Math.min(t.length - 1, Math.floor(q * t.length))];
  };

  const dateCommande = (p: any) => p.dateCMDUsine || p.dateCMDRecue;
  const dateLivraison = (p: any) => p.arrivageTM || p.arrivageGrossiste;

  /** Délai commande → livraison, par fournisseur. */
  const delaisFournisseur = useMemo(() => {
    const m = new Map<string, { jours: number[]; items: any[] }>();
    P.forEach((p: any) => {
      const j = ecart(dateCommande(p), dateLivraison(p));
      if (j === null) return;
      const marques: string[] = (p.fournisseurs || []).length ? p.fournisseurs : ["Sans marque"];
      marques.forEach((f: string) => {
        const cur = m.get(f) || { jours: [], items: [] };
        cur.jours.push(j); cur.items.push(p);
        m.set(f, cur);
      });
    });
    return [...m.entries()]
      // Sous cinq commandes, une médiane ne veut rien dire.
      .filter(([, v]) => v.jours.length >= 5)
      .map(([label, v]) => ({
        label,
        value: mediane(v.jours),
        color: hueFor(label),
        sub: `${v.jours.length} cmd · 9/10 sous ${centile(v.jours, 0.9)} j`,
        items: v.items,
      }))
      .sort((a, b) => a.value - b.value);
  }, [P]);

  /** Les quatre étapes du cycle, en médiane sur la période affichée. */
  const cycle = useMemo(() => {
    const etapes: { label: string; sens: string; jours: number[] }[] = [
      { label: "Mesures → offre", sens: "notre réactivité", jours: [] },
      { label: "Offre → commande", sens: "décision du client", jours: [] },
      { label: "Commande → livraison", sens: "délai fournisseur", jours: [] },
      { label: "Livraison → pose", sens: "notre planification", jours: [] },
    ];
    P.forEach((p: any) => {
      const paires: [any, any][] = [
        [p.dateMesuresRecue, p.dateOffre],
        [p.dateOffre, dateCommande(p)],
        [dateCommande(p), dateLivraison(p)],
        [dateLivraison(p), p.dateMontage],
      ];
      paires.forEach(([a, b], i) => {
        const j = ecart(a, b);
        if (j !== null) etapes[i].jours.push(j);
      });
    });
    return etapes.map((e) => ({
      ...e,
      n: e.jours.length,
      med: mediane(e.jours),
      haut: centile(e.jours, 0.9),
    }));
  }, [P]);

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

  /* « Aucun SAV » est une VALEUR du champ État - SAV, pas une absence : tester
     seulement que le champ est rempli comptait donc 100 % des projets. Même
     règle que partout ailleurs dans l'app (page.tsx : hasSAV). */
  const hasSav = (p: any) =>
    p?.sav === true || (String(p?.etatSAV || "").trim() && String(p.etatSAV).trim() !== "Aucun SAV");

  const quality = useMemo(() => {
    const total = P.length || 0;
    /* On conserve les PROJETS et non un simple compte : chaque indicateur doit
       pouvoir s'ouvrir sur la liste de ce qu'il recouvre. */
    const soucis = P.filter((p) => p.soucisMontage === true || String(p.etatCMD || "") === "Soucis montage");
    const pieces = P.filter((p) => String(p.infoPiecesManquantes || "").trim());
    const defauts = P.filter((p) => String(p.infoDefautsSignale || "").trim());
    const sav = P.filter(hasSav);
    const rate = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return { total, soucis, pieces, defauts, sav, rate };
  }, [P]);

  /** Les quatre indicateurs qualité, avec leurs projets — cliquables. */
  const qualRows: BarRow[] = [
    { label: "Soucis de montage", value: quality.soucis.length, sub: `${quality.rate(quality.soucis.length)}%`, color: "#f43f5e", items: quality.soucis },
    { label: "Pièces manquantes", value: quality.pieces.length, sub: `${quality.rate(quality.pieces.length)}%`, color: "#f59e0b", items: quality.pieces },
    { label: "Défauts signalés", value: quality.defauts.length, sub: `${quality.rate(quality.defauts.length)}%`, color: "#dc2626", items: quality.defauts },
    { label: "Projets avec SAV", value: quality.sav.length, sub: `${quality.rate(quality.sav.length)}%`, color: "#a855f7", items: quality.sav },
  ];

  /** Signalements rattachés aux projets de la période affichée. */
  const sigStats = useMemo(() => {
    if (!sig) return null;
    const ids = new Set(P.map((p: any) => p.id));
    const pieces = sig.pieces.filter((s) => ids.has(s.projectId));
    const defauts = sig.defauts.filter((s) => ids.has(s.projectId));
    // Une pièce est close quand elle est reçue ; un défaut quand il est résolu.
    const piecesClose = pieces.filter((s) => s.status === "recu" || s.resolved === true);
    const defautsClose = defauts.filter((s) => s.status === "resolu" || s.resolved === true);
    const projetsTouches = new Set([...pieces, ...defauts].map((s) => s.projectId));
    const parProjet = (() => {
      const m = new Map<string, any[]>();
      [...pieces, ...defauts].forEach((s) => {
        const proj = P.find((p: any) => p.id === s.projectId);
        if (!proj) return;
        const label = proj.projet || proj.ofrTM || "Sans nom";
        if (!m.has(label)) m.set(label, []);
        if (!m.get(label)!.some((x: any) => x.id === proj.id)) m.get(label)!.push(proj);
        (m.get(label) as any).count = ((m.get(label) as any).count || 0) + 1;
      });
      return [...m.entries()]
        .map(([label, items]) => ({ label, value: (items as any).count || items.length, sub: `${items.length} proj.`, color: hueFor(label), items }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);
    })();
    /* Projets derrière une liste de signalements : chaque compteur doit
       pouvoir s'ouvrir sur ce qu'il recouvre, comme les autres. */
    const projetsDe = (list: any[]) => {
      const vus = new Set<string>();
      return list.flatMap((s) => {
        if (vus.has(s.projectId)) return [];
        vus.add(s.projectId);
        const p = P.find((x: any) => x.id === s.projectId);
        return p ? [p] : [];
      });
    };
    const piecesOuvertesList = pieces.filter((s) => !(s.status === "recu" || s.resolved === true));
    const defautsOuvertsList = defauts.filter((s) => !(s.status === "resolu" || s.resolved === true));
    return {
      pieces, defauts, piecesClose, defautsClose,
      piecesOuvertes: piecesOuvertesList.length,
      defautsOuverts: defautsOuvertsList.length,
      projetsTouches: projetsTouches.size,
      parProjet,
      projetsDe,
      piecesOuvertesList, defautsOuvertsList,
      tousProjets: projetsDe([...pieces, ...defauts]),
    };
  }, [sig, P]);

  /* ── Responsabilité par monteur ───────────────────────────────────────────
     Qui a posé la cabine qui pose problème ? La source est l'attribution PAR
     CABINE (« Cab1:Micael | Cab2:Claudio & Jacobo ») : chaque monteur coche
     son nom sur SON montage, donc sur un projet multi-cabine on ne met pas
     tout le monde dans le même sac. Sans attribution (ancien projet, cabine
     unique), on retombe sur le champ « Collaborateurs montage ». */
  const parseCabMap = (raw: string): Map<number, string> => {
    const map = new Map<number, string>();
    const re = /Cab(\d+)\s*:([^|]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw || ""))) {
      const v = m[2].trim();
      if (v) map.set(parseInt(m[1], 10), v);
    }
    return map;
  };
  const splitNames = (raw: string) => String(raw || "").split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);

  /** Monteurs d'une cabine précise, ou de tout le projet si l'index manque. */
  const monteursOf = (p: any, cab?: number | null): string[] => {
    const attr = parseCabMap(p?.attributionCabines || "");
    if (attr.size > 0) {
      if (cab != null && attr.has(cab)) return splitNames(attr.get(cab)!);
      const tous = new Set<string>();
      attr.forEach((v) => splitNames(v).forEach((n) => tous.add(n)));
      if (tous.size) return [...tous];
    }
    return splitNames(p?.collaborateurs || "");
  };

  /** Libellé d'ÉQUIPE d'une cabine : « Claudio & Micael », tel que saisi.
   *  Un binôme se juge comme un binôme — imputer deux cas à Micael sans dire
   *  qu'il était accompagné de Claudio donnait une lecture fausse. */
  const equipeOf = (p: any, cab?: number | null): string => {
    const noms = monteursOf(p, cab);
    return noms.length ? [...noms].sort((a, b) => a.localeCompare(b)).join(" & ") : "Non attribué";
  };

  /** Cause du SAV d'une cabine, sinon celle du projet. */
  const causeSavOf = (p: any, cab?: number | null): string => {
    const map = parseCabMap(p?.causeSavCabines || "");
    if (cab != null && map.has(cab)) return map.get(cab)!;
    return String(p?.causeSAV || "");
  };
  /** Un SAV n'est imputable au monteur que si la cause est une erreur TM. */
  const estErreurTM = (cause: string) => /\btm\b/i.test(cause || "");

  /** Index de cabine d'un signalement, via son libellé et les noms de cabines. */
  const cabIndexOf = (p: any, label?: string): number | null => {
    if (!label) return null;
    const direct = label.match(/cab(?:ine)?\s*(\d+)/i);
    if (direct) return Number(direct[1]);
    const noms = parseCabMap(p?.nomsCabines || "");
    let found: number | null = null;
    noms.forEach((v, k) => {
      if (found == null && v.trim().toLowerCase() === label.trim().toLowerCase()) found = k;
    });
    return found;
  };

  /** Cabines concernées par un SAV, d'après les colonnes encodées par cabine. */
  const cabinesSavOf = (p: any): number[] => {
    const keys = new Set<number>();
    [p?.causeSavCabines, p?.savRetouchesCabines, p?.collaborateursSavCabines, p?.datesRdvSavCabines]
      .forEach((raw) => parseCabMap(raw || "").forEach((_v, k) => keys.add(k)));
    return [...keys];
  };

  const [qualFocus, setQualFocus] = useState<"sav" | "soucis" | "pieces" | "defauts">("sav");

  /** Répartition par monteur d'un indicateur qualité. */
  const blameBy = useMemo(() => {
    const build = (entries: { p: any; cab: number | null }[]) => {
      const m = new Map<string, { n: number; items: any[] }>();
      entries.forEach(({ p, cab }) => {
        /* Une seule liste : le montage solo porte le nom du monteur, le
           binôme porte le sien. Classée du plus grand nombre de cas au plus
           petit. */
        [equipeOf(p, cab)].forEach((n) => {
          const cur = m.get(n) || { n: 0, items: [] as any[] };
          cur.n += 1;
          if (!cur.items.some((x) => x.id === p.id)) cur.items.push(p);
          m.set(n, cur);
        });
      });
      return [...m.entries()]
        .map(([label, v]) => ({
          label, value: v.n, sub: `${v.items.length} proj.`, items: v.items,
          color: label === "Non attribué" ? "#cbd5e1"
            : label.includes("&") ? getTeamColor(label).dot
            : getCollaboratorColor(label).dot,
        }))
        .sort((a, b) => b.value - a.value);
    };

    const savEntries: { p: any; cab: number | null }[] = [];
    P.forEach((p: any) => {
      if (!hasSav(p)) return;
      /* Un SAV dû au client ou au fournisseur n'est pas la faute du monteur :
         seule une cause « Erreur TM » lui est imputée. */
      const cabs = cabinesSavOf(p);
      if (cabs.length) {
        cabs.forEach((c) => { if (estErreurTM(causeSavOf(p, c))) savEntries.push({ p, cab: c }); });
      } else if (estErreurTM(causeSavOf(p, null))) {
        savEntries.push({ p, cab: null });
      }
    });

    const soucisEntries = P
      .filter((p: any) => p.soucisMontage === true || String(p.etatCMD || "") === "Soucis montage")
      .map((p: any) => ({ p, cab: null }));

    const fromSig = (list: any[]) => (list || []).flatMap((s) => {
      const p = P.find((x: any) => x.id === s.projectId);
      return p ? [{ p, cab: cabIndexOf(p, s.cabineLabel) }] : [];
    });

    return {
      sav: build(savEntries),
      soucis: build(soucisEntries),
      pieces: build(fromSig(sig?.pieces || [])),
      defauts: build(fromSig(sig?.defauts || [])),
    };
  }, [P, sig]);

  /** Marques d'un projet, enseigne TM Douche regroupée avec la marque réelle. */
  const marquesOf = (p: any): string[] => {
    const arr: string[] = Array.isArray(p?.fournisseurs) ? p.fournisseurs : [];
    if (arr.some((f) => /tm\s*douche/i.test(f || ""))) {
      const autres = arr.filter((f) => !/tm\s*douche/i.test(f || ""));
      return [autres.length ? `TM Douche / ${autres.join(", ")}` : "TM Douche"];
    }
    return arr.length ? arr : ["Non renseigné"];
  };

  /** SAV répartis par CAUSE : erreur fournisseur, client, TM… avec leur part. */
  const savByCause = useMemo(() => {
    const m = new Map<string, any[]>();
    let total = 0;
    P.forEach((p: any) => {
      if (!hasSav(p)) return;
      const cabs = cabinesSavOf(p);
      const causes = cabs.length ? cabs.map((c) => causeSavOf(p, c)) : [causeSavOf(p, null)];
      causes.forEach((raw) => {
        const label = String(raw || "").trim() || "Cause non renseignée";
        if (!m.has(label)) m.set(label, []);
        const items = m.get(label)!;
        if (!items.some((x) => x.id === p.id)) items.push(p);
        (items as any).count = ((items as any).count || 0) + 1;
        total += 1;
      });
    });
    return [...m.entries()]
      .map(([label, items]) => {
        const n = (items as any).count || items.length;
        return {
          label, value: n, items,
          sub: total ? `${Math.round((n / total) * 1000) / 10}%` : "—",
          color: /\btm\b/i.test(label) ? "#dc2626" : hueFor(label),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [P]);

  /** Axe d'analyse des signalements : marque ou série de cabine. */
  const [sigAxis, setSigAxis] = useState<"marque" | "serie">("marque");
  const [sigKind, setSigKind] = useState<"tout" | "pieces" | "defauts">("tout");

  /** Signalements répartis par marque ou par série, pour cibler les récurrences. */
  const sigByProduit = useMemo(() => {
    if (!sig) return [];
    const source = sigKind === "pieces" ? sig.pieces
      : sigKind === "defauts" ? sig.defauts
      : [...sig.pieces, ...sig.defauts];
    const m = new Map<string, any[]>();
    source.forEach((s) => {
      const p = P.find((x: any) => x.id === s.projectId);
      if (!p) return;
      const cles = sigAxis === "marque"
        ? marquesOf(p)
        : (Array.isArray(p.seriesCabines) && p.seriesCabines.length ? p.seriesCabines : ["Non renseignée"]);
      cles.forEach((k: string) => {
        if (!m.has(k)) m.set(k, []);
        const items = m.get(k)!;
        if (!items.some((x) => x.id === p.id)) items.push(p);
        (items as any).count = ((items as any).count || 0) + 1;
      });
    });
    /* Taux d'incident PROPRE à la marque (ou à la série) : le signalement est
       rapporté aux cabines de cette même marque posées sur la période, et non
       à l'ensemble du parc. « 28 défauts Duka » ne veut rien dire tant qu'on
       ne sait pas sur combien de cabines Duka. Même base que la répartition
       « Cabines par fournisseur / par série » : projets terminés, services
       purs exclus. */
    const base = new Map<string, number>(
      (sigAxis === "marque" ? byFournisseur : bySerie).map((r) => [r.label, r.value])
    );
    return [...m.entries()]
      .map(([label, items]) => {
        const n = (items as any).count || items.length;
        const cab = base.get(label) || 0;
        return {
          label, value: n, items, color: hueFor(label),
          sub: cab > 0
            ? `${Math.round((n / cab) * 1000) / 10}% de ${fmt(cab)} cab.`
            : `${items.length} proj.`,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [sig, P, sigAxis, sigKind, byFournisseur, bySerie]);

  /** Récurrence SAV : chantiers qui reviennent plusieurs fois en SAV. */
  const savRecurrence = useMemo(() => {
    const m = new Map<string, any[]>();
    P.filter(hasSav).forEach((p: any) => {
      const cle = String(p.nomChantier || p.projet || "Sans nom").trim();
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle)!.push(p);
    });
    return [...m.entries()]
      .filter(([, items]) => items.length > 1) // un SAV isolé n'est pas une récurrence
      .map(([label, items]) => ({
        label, value: items.length, items,
        sub: `${items.length} SAV`, color: "#ea580c",
      }))
      .sort((a, b) => b.value - a.value);
  }, [P]);

  /* ── Analyses calculées par le serveur ──────────────────────────────────
     Elles portent sur des projets que cette page n'a pas : les offres sans
     commande n'y figurent pas, et le coût de trajet demande le cache de
     géocodage. On les demande pour la période RÉELLEMENT affichée, celle des
     mois retenus, pour que les chiffres se lisent ensemble. */
  const [analyses, setAnalyses] = useState<any | null>(null);
  /* Famille de clients affichée. « Tous » par défaut : c'est la lecture qui
     correspond à la réalité de la facturation, toutes familles confondues. */
  const [axeClient, setAxeClient] = useState("tous");
  const [familles, setFamilles] = useState<string[]>([]);
  /* Le taux de transformation porte sa propre période et son propre tri : on y
     cherche un client précis sur un mois précis, sans déplacer le reste. */
  const [dateTransfo, setDateTransfo] = useState<StatsDateState>(DEFAULT_STATS_DATE_STATE);
  const [triTransfo, setTriTransfo] = useState<"mesures" | "taux" | "client">("mesures");
  const [triTransfoAsc, setTriTransfoAsc] = useState(false);
  const [transfo, setTransfo] = useState<any | null>(null);
  const [axeSav, setAxeSav] = useState<"marque" | "serie">("marque");
  const [axeRendement, setAxeRendement] = useState<"marque" | "serie">("serie");
  const [axeDegats, setAxeDegats] = useState<"marque" | "grossiste">("marque");
  const [axeReprise, setAxeReprise] = useState<"fournisseur" | "serie" | "cause">("fournisseur");
  /** Fournisseur dont on déplie le détail des étapes. */
  const [delaiOuvert, setDelaiOuvert] = useState<string | null>("Ensemble");
  const [axePhotos, setAxePhotos] = useState<"monteur" | "equipe">("monteur");

  /* La conformité photo porte sa PROPRE période, indépendante de celle de la
     page : on y cherche la dérive d'un monteur sur un mois précis, sans avoir
     à déplacer tout le reste du tableau de bord pour aller la voir. */
  const [datePhotos, setDatePhotos] = useState<StatsDateState>(DEFAULT_STATS_DATE_STATE);

  /* Conformité photo — calculée ici, sur les projets déjà en main : la règle
     vit dans photo-buckets, la même qui bloque l'envoi d'un rapport incomplet. */
  const projetsPhotos = useMemo(() => {
    const base = Array.isArray(projectsAll) && projectsAll.length ? projectsAll : P;
    return filterByStatsDate(base as never[], datePhotos.mode,
      datePhotos.from, datePhotos.to, datePhotos.month, datePhotos.year);
  }, [projectsAll, P, datePhotos]);
  /* Toutes les lignes, y compris les monteurs seuls : elles servent au total
     d'ensemble, qui doit couvrir chaque cabine posée. */
  const photosBrut = useMemo(() => conformitePhotos(projetsPhotos as never, axePhotos), [projetsPhotos, axePhotos]);
  const photos = useMemo(
    () => (axePhotos === "equipe" ? photosBrut.filter((l) => l.estEquipe) : photosBrut),
    [photosBrut, axePhotos],
  );
  const photosTotal = useMemo(() => totalPhotos(photosBrut, axePhotos), [photosBrut, axePhotos]);
  /* Vide pour « Tout » : rappeler la période n'a de sens que si l'on en a
     choisi une. `describeStatsRange` ne nomme pas les douze mois glissants. */
  const libellePhotos = datePhotos.mode === "all" ? ""
    : datePhotos.mode === "rolling12" ? "12 derniers mois"
    : describeStatsRange(datePhotos);

  const fenetre = useMemo(() => {
    const vus = picked.size > 0 ? monthKeys.filter((k) => picked.has(k)) : monthKeys.slice(-14);
    if (vus.length === 0) return null;
    const premier = vus[0], dernier = vus[vus.length - 1];
    const [y, m] = dernier.split("-").map(Number);
    const fin = new Date(y, m, 0);
    return {
      de: `${premier}-01`,
      a: `${dernier}-${String(fin.getDate()).padStart(2, "0")}`,
    };
  }, [monthKeys, picked]);

  useEffect(() => {
    if (!fenetre) return;
    let vivant = true;
    fetch(`/api/stats/analyses?de=${fenetre.de}&a=${fenetre.a}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivant && d && !d.error) setAnalyses(d); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [fenetre?.de, fenetre?.a]);

  /* Le taux de transformation se redemande seul quand SA période change. La
     lecture Notion est mutualisée côté serveur ; seul ce calcul est refait. */
  useEffect(() => {
    let vivant = true;
    const q = new URLSearchParams({ only: "transformation", type: axeClient });
    const r12 = dateTransfo.mode === "rolling12" ? getRolling12Range() : null;
    if (r12) { q.set("de", r12.from); q.set("a", r12.to); }
    else if (dateTransfo.mode === "range" && dateTransfo.from && dateTransfo.to) {
      q.set("de", dateTransfo.from); q.set("a", dateTransfo.to);
    } else if (dateTransfo.mode === "month" && dateTransfo.month) {
      const [y, mo] = dateTransfo.month.split("-").map(Number);
      q.set("de", `${dateTransfo.month}-01`);
      q.set("a", `${dateTransfo.month}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`);
    } else if (dateTransfo.mode === "year" && dateTransfo.year) {
      q.set("de", `${dateTransfo.year}-01-01`); q.set("a", `${dateTransfo.year}-12-31`);
    }
    setTransfo(null);
    fetch(`/api/stats/analyses?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivant || !d || d.error) return;
        setTransfo(d.transformation);
        if (Array.isArray(d.familles)) setFamilles(d.familles);
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [dateTransfo, axeClient]);

  /** Lignes du taux de transformation, dans l'ordre demandé. */
  const lignesTransfo = useMemo(() => {
    const src: any[] = Array.isArray(transfo) ? transfo : [];
    const sens = triTransfoAsc ? 1 : -1;
    return [...src].sort((a, b) => {
      if (triTransfo === "client") return a.client.localeCompare(b.client, "fr") * sens;
      if (triTransfo === "taux") return (a.taux - b.taux) * sens || a.client.localeCompare(b.client, "fr");
      return (a.mesures - b.mesures) * sens || a.client.localeCompare(b.client, "fr");
    });
  }, [transfo, triTransfo, triTransfoAsc]);

  /* Le recul se calcule toutes familles confondues — il porte sur douze mois
     glissants, indépendants de tout filtre. Le tri par famille se fait donc
     ici, sans redemander le serveur. */
  const reculFiltre = useMemo(() => {
    const src: any[] = analyses?.recul || [];
    return axeClient === "tous" ? src : src.filter((l) => l.type === axeClient);
  }, [analyses, axeClient]);

  const TABS = [
    { id: "activite" as const, label: "Activité" },
    { id: "equipes" as const, label: "Équipes & monteurs", n: byCollab.length },
    { id: "repartition" as const, label: "Répartition", n: byFournisseur.length + bySerie.length },
    { id: "qualite" as const, label: "Qualité", n: quality.soucis.length + quality.defauts.length },
    { id: "clients" as const, label: "Clients", n: Array.isArray(transfo) ? transfo.length : 0 },
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
    /* Mois ÉPINGLÉS : les indicateurs doivent porter sur ces mois-là, pas sur
       toute la période. Sans ça, épingler août à octobre affichait le graphe
       des trois mois au-dessus des totaux de l'historique complet — d'où des
       chiffres sans rapport avec ce qu'on regarde. */
    if (picked.size > 0) {
      const t: Record<string, number> = {};
      rows.forEach((r) => {
        (Object.keys(r.v) as SerieId[]).forEach((id) => { t[id] = (t[id] || 0) + (r.v[id] || 0); });
      });
      return t;
    }
    // Sinon, priorité aux totaux fournis par la page (lignes brutes).
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
  }, [monthKeys, byMonth, totalsProp, picked, rows]);

  /* Prix moyen d'un montage sur la période : le seul prix dont on dispose,
     Notion ne portant pas de montant par projet. Le dénominateur est le
     nombre de MONTAGES, pas les cabines mesurées. */
  const caParCabine = useMemo(() => {
    const ca = Number(totals?.ca) || 0;
    const n = Number(totals?.montages) || 0;
    return ca > 0 && n > 0 ? ca / n : null;
  }, [totals]);

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
              {/* Base de comparaison écrite sous le chiffre.
                  La valeur de la période courante n'est REPETEE que si elle
                  differe du grand chiffre : le pourcentage porte sur les mois
                  complets, tandis que le chiffre affiche inclut le mois en
                  cours, et sans cette precision l'ecart passerait pour une
                  erreur de calcul. Sur une periode close — une annee passee —
                  les deux sont identiques, et la repeter n'apprend rien. */}
              {d !== null && cmp && (() => {
                const courant = fmt(cmp.sum(cmp.cur, k.id), k.money);
                const affiche = fmt(totals[k.id] || 0, k.money);
                return (
                  <span className="sgs-kpi-vs">
                    {courant === affiche ? cmp.curLabel : `${courant} sur ${cmp.curLabel}`}
                    {" · "}
                    {fmt(cmp.sum(cmp.prev, k.id), k.money)} sur {cmp.prevLabel}
                  </span>
                );
              })()}
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
          <Fold className="sgs-span2" defaultOpen title="Le temps que ça prend"
            meta="jours médians à chaque étape, de la demande de mesure à la pose · au moins 5 dossiers par étape">
            {analyses?.delais?.length ? (
              <>
                <div className="sgs-delais">
                  {analyses.delais.map((l: any) => {
                    const ouvert = delaiOuvert === l.cle;
                    return (
                      <div key={l.cle} className={`sgs-delai${ouvert ? " is-on" : ""}`}>
                        <button type="button" className="sgs-delai-tete"
                          onClick={() => setDelaiOuvert(ouvert ? null : l.cle)}>
                          <b>{l.cle}</b>
                          <span className="sgs-delai-total">
                            {l.total !== null ? `${l.total} j` : "—"}
                            <em>demande → pose</em>
                          </span>
                          {/* La dérive ne porte que sur l'étape que le
                              fournisseur maîtrise seul. */}
                          {l.derive !== null && (
                            <span className={`sgs-delai-derive${l.derive > 3 ? " is-mauvais" : l.derive < -3 ? " is-bon" : ""}`}>
                              {l.derive > 0 ? "+" : ""}{l.derive} j
                              <em>sur 6 mois</em>
                            </span>
                          )}
                        </button>
                        {ouvert && (
                          <div className="sgs-delai-etapes">
                            {l.etapes.map((e: any) => {
                              const max = Math.max(1, ...l.etapes.map((x: any) => x.jours));
                              return (
                                <div key={e.nom} className="sgs-delai-etape">
                                  <span>{e.nom}</span>
                                  <i><b style={{ width: `${Math.round((e.jours / max) * 100)}%` }} /></i>
                                  <b>{e.jours} j</b>
                                  <em>{e.cas} dossiers</em>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="sgs-note">
                  Des MÉDIANES, pas des moyennes : un chantier reporté d&apos;un an écraserait
                  tout le reste. Un écart négatif ou supérieur à deux ans est écarté — c&apos;est
                  une saisie incohérente ou une fiche reprise longtemps après, ni l&apos;une ni
                  l&apos;autre ne disant quoi que ce soit du rythme habituel. La <b>dérive</b>
                  {" "}compare les six derniers mois aux six précédents sur la seule étape
                  « commande → arrivage » : c&apos;est la seule que le fournisseur maîtrise
                  seul. Lui reprocher un retard d&apos;offre ou de rendez-vous serait injuste,
                  ces étapes dépendent de nous ou du client.
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {analyses ? "Pas assez de dossiers datés sur la période." : "Calcul en cours…"}
              </p>
            )}
          </Fold>
          <Fold className="sgs-span2" defaultOpen title="La journée type"
            meta="sur une journée payée, ce qui se passe réellement — moyennes par monteur et par jour travaillé">
            {analyses?.journee?.ensemble ? (
              <>
                {(() => {
                  const e = analyses.journee.ensemble;
                  const blocs = [
                    { label: "Journée", min: e.minutesJournee, ton: "" },
                    { label: "Sur chantier", min: e.minutesChantier, ton: "is-bon" },
                    { label: "Route (estimée)", min: e.minutesRoute, ton: "" },
                    { label: "Le reste", min: e.minutesReste, ton: "is-faible" },
                  ];
                  return (
                    <>
                      <div className="sgs-jbande">
                        {blocs.map((b) => (
                          <span key={b.label} className={`sgs-jcase ${b.ton}`}>
                            <b>{hm(b.min)}</b>
                            <em>{b.label}</em>
                          </span>
                        ))}
                        <span className="sgs-jcase">
                          <b>{e.partChantier} %</b>
                          <em>de la journée sur un chantier</em>
                        </span>
                      </div>
                      <p className="sgs-note" style={{ marginTop: 0 }}>
                        Sur <b>{e.jours}</b> journées-monteur observées :
                        {" "}{e.chantiersParJour} chantier{e.chantiersParJour > 1 ? "s" : ""} et
                        {" "}{e.cabinesParJour} cabine{e.cabinesParJour > 1 ? "s" : ""} par jour.
                      </p>
                    </>
                  );
                })()}
                {analyses.journee.parMonteur.length > 0 && (
                  <Tableau cols={[
                    { titre: "Monteur" }, { titre: "Jours", num: true },
                    { titre: "Journée", num: true }, { titre: "Sur chantier", num: true },
                    { titre: "Route", num: true }, { titre: "Le reste", num: true },
                    { titre: "Part chantier", num: true },
                  ]}>
                    {analyses.journee.parMonteur.map((l: any) => (
                      <tr key={l.nom}>
                        <td className="cle">{l.nom}</td>
                        <td className="num doux">{l.jours}</td>
                        <td className="num">{hm(l.minutesJournee)}</td>
                        <td className="num fort">{hm(l.minutesChantier)}</td>
                        <td className="num doux">{hm(l.minutesRoute)}</td>
                        <td className="num doux">{hm(l.minutesReste)}</td>
                        <td className="num fort avec-part">
                          <span className={l.partChantier >= 70 ? "sgs-pct is-bon" : l.partChantier < 50 ? "sgs-pct is-faible" : "sgs-pct"}>
                            {l.partChantier} %
                          </span>
                          <Part valeur={l.partChantier} sur={100} />
                        </td>
                      </tr>
                    ))}
                  </Tableau>
                )}
                <p className="sgs-note">
                  Une seule de ces grandeurs est MESURÉE : le temps sur chantier, lu sur les
                  heures pointées. La <b>route est estimée</b> depuis les adresses — le GPS a
                  été retiré de l&apos;application — et sert donc à comparer des journées entre
                  elles, pas à établir une vérité. « Le reste » est ce que l&apos;amplitude de la
                  journée ne couvre ni par la présence ni par la route : pauses, attentes,
                  imprévus. Un binôme compte pour deux journées sur la même amplitude — on
                  décrit la journée d&apos;une personne, pas celle d&apos;un chantier. Les
                  montages « Team » sont écartés, leur effectif étant inconnu, et un monteur
                  sous cinq journées n&apos;est pas affiché.
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {analyses ? "Aucune journée avec heures pointées sur la période." : "Calcul en cours…"}
              </p>
            )}
          </Fold>
          <Fold className="sgs-span2" defaultOpen title="Seul ou à deux"
            meta="temps de présence et temps-homme par cabine · les montages « Team » sont écartés">
            {analyses?.equipage?.length ? (
              <>
                <Tableau cols={[
                  { titre: "Composition" }, { titre: "Chantiers", num: true },
                  { titre: "Cabines", num: true }, { titre: "Présence / cabine", num: true },
                  { titre: "Temps-homme / cabine", num: true },
                ]}>
                  {analyses.equipage.map((l: any) => (
                    <tr key={l.forme}>
                      <td className="cle">{l.forme}</td>
                      <td className="num">{l.projets}</td>
                      <td className="num">{l.cabines}</td>
                      <td className="num fort">{Math.floor(l.minutesParCabine / 60)}h{String(l.minutesParCabine % 60).padStart(2, "0")}</td>
                      <td className="num fort">{Math.floor(l.minutesHommeParCabine / 60)}h{String(l.minutesHommeParCabine % 60).padStart(2, "0")}</td>
                    </tr>
                  ))}
                </Tableau>
                <p className="sgs-note">
                  Deux mesures, et c&apos;est la seconde qui tranche : la <b>présence</b> dit si
                  le chantier avance plus vite, le <b>temps-homme</b> dit s&apos;il coûte moins.
                  Un binôme qui divise la présence par deux fait match nul ; en dessous il est
                  gagnant, au-dessus c&apos;est un confort qui se paie. Les montages attribués à
                  « Team » sont écartés : on ne sait pas combien de personnes s&apos;y trouvaient.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Pas assez de chantiers avec heures pointées et monteur identifié.</p>
            )}
          </Fold>
          <Fold className="sgs-span2" title="Ce que deviennent les mesures"
            meta="par personne ayant relevé · mesures reçues sur la période">
            {analyses?.mesures?.length ? (
              <>
                <Tableau cols={[
                  { titre: "Relevé par" }, { titre: "Mesures", num: true },
                  { titre: "Commandées", num: true }, { titre: "Ouvertes", num: true },
                  { titre: "Annulées", num: true }, { titre: "Transformation", num: true },
                ]}>
                  {analyses.mesures.map((l: any) => {
                    /* Chaque chiffre s'ouvre sur les projets qu'il recouvre :
                       « sept annulées » ne se vérifie qu'en les lisant. */
                    const pj = l.projets || { commandees: [], ouvertes: [], annulees: [] };
                    const lien = (n: number, items: any[], quoi: string, couleur: string) =>
                      n > 0 && items?.length ? (
                        <button type="button" className="sgs-lien"
                          title={`Voir les ${n} mesures ${quoi} de ${l.personne}`}
                          onClick={() => setPick({
                            label: `${l.personne} — mesures ${quoi}`,
                            value: n, color: couleur, items: items as never[],
                          })}>{n}</button>
                      ) : (n || "—");
                    return (
                    <tr key={l.personne}>
                      <td className="cle">{l.personne}</td>
                      <td className="num">
                        {lien(l.prises,
                          [...(pj.commandees || []), ...(pj.ouvertes || []), ...(pj.annulees || [])],
                          "relevées", "#06b6d4")}
                      </td>
                      <td className="num">{lien(l.commandees, pj.commandees, "commandées", "#16a34a")}</td>
                      <td className="num doux">{lien(l.ouvertes, pj.ouvertes, "encore ouvertes", "#3b82f6")}</td>
                      <td className={`num${l.annulees > 0 ? " alerte" : " doux"}`}>
                        {lien(l.annulees, pj.annulees, "annulées", "#dc2626")}
                      </td>
                      <td className="num fort">
                        <span className={l.taux >= 70 ? "sgs-pct is-bon" : l.taux < 40 ? "sgs-pct is-faible" : "sgs-pct"}>
                          {l.taux} %
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </Tableau>
                <p className="sgs-note">
                  À lire avec précaution : une annulation est le plus souvent la décision du
                  client, pas une erreur de relevé. Ce qui s&apos;interprète ici, c&apos;est
                  l&apos;<b>écart</b> entre personnes sur des chantiers comparables — jamais le
                  taux absolu de l&apos;une d&apos;elles. Un relevé fait à deux compte pour chacun.
                  Chaque chiffre s&apos;ouvre sur la liste des projets qu&apos;il recouvre.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Aucune mesure relevée et attribuée sur la période.</p>
            )}
          </Fold>
          <Fold className="sgs-span2" title="Photos obligatoires"
            meta="2 avant intervention · 3 montage · 2 après — par cabine posée · QR code et garantie non comptés"
            right={
              <div className="sgs-head-ctrl" onClick={(e) => e.stopPropagation()}>
                <div className="sgs-seg">
                  <button type="button" className={axePhotos === "monteur" ? "is-on" : ""} onClick={() => setAxePhotos("monteur")}>Monteur</button>
                  <button type="button" className={axePhotos === "equipe" ? "is-on" : ""} onClick={() => setAxePhotos("equipe")}>Équipe</button>
                </div>
                <PeriodeCarte etat={datePhotos} onChange={setDatePhotos} />
              </div>
            }>
            {photos.length ? (
              <>
                {photosTotal && (
                  <p className="sgs-note" style={{ marginTop: 0, marginBottom: 8 }}>
                    Sur l&apos;ensemble{libellePhotos ? ` — ${libellePhotos}` : ""} :
                    {" "}<b>{photosTotal.manquantes}</b> photos manquantes sur
                    {" "}{photosTotal.attendues} demandées ({photosTotal.tauxManquant} %),
                    et {photosTotal.tauxCabinesCompletes} % des cabines au complet.
                    {" "}Ce total couvre TOUTES les cabines de la période, y compris celles
                    posées en solo, qui ne figurent pas dans le tableau ci-dessous.
                  </p>
                )}
                <Tableau cols={[
                  { titre: "" }, { titre: axePhotos === "monteur" ? "Monteur" : "Équipe" },
                  { titre: "Cabines", num: true }, { titre: "Manquantes", num: true },
                  { titre: "Photos manquantes", num: true }, { titre: "Cabines complètes", num: true },
                  { titre: "Projets à revoir", num: true },
                ]}>
                  {photos.map((l, i) => (
                    <tr key={l.nom}>
                      <td className="num doux" style={{ paddingLeft: 0, width: 22 }}>{i + 1}</td>
                      <td className="cle">{l.nom}</td>
                      <td className="num doux">{l.cabines}</td>
                      <td className="num doux">{l.manquantes} <em>/ {l.attendues}</em></td>
                      <td className="num fort avec-part">
                        <span className={l.tauxManquant === 0 ? "sgs-pct is-bon" : l.tauxManquant >= 20 ? "sgs-pct is-faible" : "sgs-pct"}>
                          {l.tauxManquant} %
                        </span>
                        <Part valeur={l.tauxManquant} sur={100} ton={l.tauxManquant >= 20 ? "chaud" : undefined} />
                      </td>
                      <td className="num">{l.tauxCabinesCompletes} %</td>
                      <td className="num fort">
                        {l.projetsIncomplets.length > 0 ? (
                          <button type="button" className="sgs-lien"
                            title={`Voir les ${l.projetsIncomplets.length} projets à revoir`}
                            onClick={() => setPick({
                              label: `${l.nom} — projets à revoir`,
                              value: l.projetsIncomplets.length,
                              color: "#b45309",
                              items: l.projetsIncomplets as never[],
                            })}>
                            {l.projetsIncomplets.length}
                          </button>
                        ) : <span className="sgs-pct is-bon">0</span>}
                      </td>
                    </tr>
                  ))}
                </Tableau>
                <p className="sgs-note">
                  Le classement va du plus rigoureux au moins : c&apos;est la comparaison
                  entre monteurs, sans colonne supplémentaire. Sur un projet à plusieurs
                  cabines, chacune est imputée à SON monteur d&apos;après l&apos;attribution
                  cochée sur place — personne ne répond des lots d&apos;un autre. Un binôme
                  engage en revanche ses deux monteurs sur les mêmes cabines : la règle
                  était respectée pour les deux, ou pour aucun. Les cabines sous-traitées,
                  les services purs et les projets sans responsable identifié ne comptent
                  contre personne.
                  {axePhotos === "equipe" && (
                    <> L&apos;axe « Équipe » ne retient que les montages faits à
                    PLUSIEURS — binômes, trinômes et « Team ». Un monteur seul y
                    répéterait sa ligne de l&apos;autre onglet sans rien apprendre de
                    la composition, qui est la question posée ici.</>
                  )}
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {axePhotos === "equipe"
                  ? "Aucun montage à plusieurs sur cette période — les montages en solo se lisent dans l'onglet « Monteur »."
                  : "Aucune cabine posée avec un responsable identifié sur cette période."}
              </p>
            )}
          </Fold>
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
          <Fold title="Délais de livraison par fournisseur"
            meta="de la commande à l'arrivage · médiane en jours · au moins 5 commandes">
            <BarList rows={delaisFournisseur} unit=" j"
              empty="Pas assez de commandes datées sur la période."
              onPick={setPick} />
          </Fold>
          <Fold title="Cycle d'un projet" meta="médiane en jours sur la période affichée">
            <div className="sgs-cycle">
              {cycle.map((e) => (
                <div key={e.label} className={`sgs-cy${e.n === 0 ? " is-vide" : ""}`}>
                  <span className="sgs-cy-tete">
                    <b>{e.label}</b>
                    <em>{e.sens}</em>
                  </span>
                  <span className="sgs-cy-val">{e.n ? `${e.med} j` : "—"}</span>
                  <span className="sgs-cy-sub">
                    {e.n ? `${e.n} projets · 9/10 sous ${e.haut} j` : "aucune date exploitable"}
                  </span>
                </div>
              ))}
            </div>
          </Fold>
          <Fold className="sgs-span2" title="Temps consommé par cabine"
            meta="pose et SAV réunis · le CA moyen de la période rapporte l'un à l'autre"
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={axeRendement === "serie" ? "is-on" : ""} onClick={() => setAxeRendement("serie")}>Série</button>
                <button type="button" className={axeRendement === "marque" ? "is-on" : ""} onClick={() => setAxeRendement("marque")}>Marque</button>
              </div>
            }>
            {analyses?.rendement?.[axeRendement]?.length ? (
              <>
                <Tableau cols={[
                  { titre: axeRendement === "serie" ? "Série" : "Marque" },
                  { titre: "Cabines", num: true }, { titre: "Pose", num: true },
                  { titre: "SAV", num: true }, { titre: "Temps / cabine", num: true },
                  { titre: "CHF / heure", num: true },
                ]}>
                  {(() => {
                    const pire = Math.max(1, ...analyses.rendement[axeRendement].map((x: any) => x.minutesParCabine));
                    return analyses.rendement[axeRendement].map((l: any) => {
                      const heures = l.minutesParCabine / 60;
                      const chf = caParCabine !== null && heures > 0 ? Math.round(caParCabine / heures) : null;
                      return (
                        <tr key={l.cle}>
                          <td className="cle">{l.cle}</td>
                          <td className="num">{l.cabines}</td>
                          <td className="num doux">{Math.round(l.minutesPose / 60)} h</td>
                          <td className="num doux">{Math.round(l.minutesSav / 60) || "—"} h</td>
                          <td className="num fort avec-part">
                            {Math.floor(l.minutesParCabine / 60)}h{String(l.minutesParCabine % 60).padStart(2, "0")}
                            <Part valeur={l.minutesParCabine} sur={pire} />
                          </td>
                          <td className="num fort">{chf === null ? "—" : `${chf}`}</td>
                        </tr>
                      );
                    });
                  })()}
                </Tableau>
                <p className="sgs-note">
                  Notion ne porte pas de prix par projet, seulement un chiffre d&apos;affaires
                  mensuel : la colonne CHF/heure applique donc le MÊME prix moyen
                  {caParCabine !== null ? ` (${Math.round(caParCabine)} CHF par montage sur la période)` : ""}
                  {" "}à toutes les lignes. Ce que ce tableau compare n&apos;est donc pas le prix,
                  c&apos;est le TEMPS que chaque {axeRendement === "serie" ? "série" : "marque"} dévore —
                  pose plus SAV — pour un produit vendu au même tarif. Une série posée en
                  1 h 20 sans SAV vaut mieux qu&apos;une série 15 % plus chère qui en prend trois.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Pas assez de cabines posées avec des heures pointées sur la période.</p>
            )}
          </Fold>
          <Fold className="sgs-span2" title="Coût de trajet par région"
            meta="aller-retour depuis le dépôt, par cabine posée · chaque chantier pris isolément">
            {analyses?.route?.length ? (
              <>
                <Tableau cols={[
                  { titre: "Région" }, { titre: "Chantiers", num: true },
                  { titre: "Cabines", num: true }, { titre: "Route / cabine", num: true },
                  { titre: "Km / cabine", num: true },
                ]}>
                  {(() => {
                    const pire = Math.max(1, ...analyses.route.map((x: any) => x.minutesParCabine));
                    return analyses.route.map((r: any) => (
                      <tr key={r.region}>
                        <td className="cle">{r.region}</td>
                        <td className="num doux">{r.projets}</td>
                        <td className="num">{r.cabines}</td>
                        <td className="num fort avec-part">
                          {Math.floor(r.minutesParCabine / 60)
                            ? `${Math.floor(r.minutesParCabine / 60)}h${String(r.minutesParCabine % 60).padStart(2, "0")}`
                            : `${r.minutesParCabine} min`}
                          <Part valeur={r.minutesParCabine} sur={pire}
                            ton={r.minutesParCabine > pire * 0.6 ? "chaud" : undefined} />
                        </td>
                        <td className="num doux">{r.kmParCabine || "—"}</td>
                      </tr>
                    ));
                  })()}
                </Tableau>
                <p className="sgs-note">
                  Le trajet est compté aller-retour pour chaque chantier pris séparément :
                  volontairement pessimiste, car une tournée qui enchaîne plusieurs chantiers
                  d&apos;une même région coûte bien moins. Le chiffre ne dit pas ce qu&apos;on
                  dépense, il dit ce que coûterait chaque région si l&apos;on y allait à l&apos;unité —
                  c&apos;est la comparaison qui sert à décider.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Pas assez de montages datés et localisés sur la période.</p>
            )}
          </Fold>
          <Fold className="sgs-span2" title="Projets par statut" meta={`état CMD · ${fmt(quality.total)} projets`}>
            <BarList rows={byStatut} unit=" proj." onPick={setPick} />
          </Fold>
        </div>
      )}

      {tab === "clients" && (
        <div className="sgs-grid2">
          <Fold className="sgs-span2" defaultOpen title="Taux de transformation"
            meta="par client facturé — celui que désigne « Type de client » · mesures reçues sur la période · au moins 3 mesures"
            right={
              <div className="sgs-head-ctrl" onClick={(e) => e.stopPropagation()}>
                <div className="sgs-seg">
                  <button type="button" className={axeClient === "tous" ? "is-on" : ""}
                    onClick={() => setAxeClient("tous")}>Tous</button>
                  {familles.map((f) => (
                    <button key={f} type="button" className={axeClient === f ? "is-on" : ""}
                      onClick={() => setAxeClient(f)}>{f}</button>
                  ))}
                </div>
                <PeriodeCarte etat={dateTransfo} onChange={setDateTransfo} />
              </div>
            }>
            {lignesTransfo.length ? (
              <>
                {/* Entonnoir : trois barres emboîtées se lisent d'un coup d'œil
                    là où six colonnes de chiffres demandaient un effort. */}
                <div className="sgs-entonnoir-legende">
                  <span><i className="is-mesure" /> Mesures prises</span>
                  <span><i className="is-offre" /> Offres établies</span>
                  <span><i className="is-commande" /> Commandes obtenues</span>
                  {/* Tri : le classement par volume répond à « qui pèse le
                      plus » ; par taux à « qui transforme le mieux » ; par nom
                      à « où en est ce client-là ». Trois questions, trois
                      ordres. */}
                  <span className="sgs-tri">
                    Trier par
                    <span className="sgs-seg">
                      {([
                        { k: "mesures" as const, l: "Volume" },
                        { k: "taux" as const, l: "Taux" },
                        { k: "client" as const, l: "Client" },
                      ]).map((t) => (
                        <button key={t.k} type="button" className={triTransfo === t.k ? "is-on" : ""}
                          onClick={() => {
                            // Reclic sur le critère actif : on inverse le sens.
                            if (triTransfo === t.k) setTriTransfoAsc((v) => !v);
                            else { setTriTransfo(t.k); setTriTransfoAsc(t.k === "client"); }
                          }}>
                          {t.l}
                          {triTransfo === t.k && (triTransfoAsc ? " ↑" : " ↓")}
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
                <div className="sgs-entonnoir">
                  {lignesTransfo.map((l: any) => {
                    const pj: any[] = l.projets || [];
                    const ouvrir = (label: string, items: any[], color: string) =>
                      items.length > 0 && setPick({ label: `${l.client} — ${label}`, value: items.length, color, items: items as never[] });
                    const perdues = pj.filter((x) => x.perdue);
                    return (
                    <div key={l.client} className="sgs-ent-ligne">
                      <span className="sgs-ent-nom">
                        {l.client}
                        {/* La famille sous le nom : elle dit POURQUOI cette
                            entreprise est le client, et distingue un Duka
                            fournisseur d'un Gétaz grossiste. */}
                        {axeClient === "tous" && l.type && l.type !== "Non renseigné" && (
                          <i className="sgs-ent-type">{l.type}</i>
                        )}
                        {l.perdues > 0 && (
                          <em>
                            <button type="button" className="sgs-lien-nu"
                              title={`${l.perdues} mesures de plus de 60 jours restées sans commande`}
                              onClick={() => ouvrir("mesures perdues", perdues, "#b45309")}>
                              {l.perdues} perdue{l.perdues > 1 ? "s" : ""}
                            </button>
                          </em>
                        )}
                      </span>
                      <span className="sgs-ent-barres">
                        <i className="is-mesure" style={{ width: "100%" }} />
                        <i className="is-offre" style={{ width: `${Math.round((l.offres / l.mesures) * 100)}%` }} />
                        <i className="is-commande" style={{ width: `${Math.round((l.commandes / l.mesures) * 100)}%` }} />
                        {/* Chaque étape de l'entonnoir s'ouvre sur ses projets :
                            « 74 → 63 → 42 » ne se vérifie qu'en les lisant. */}
                        <b>
                          <button type="button" className="sgs-lien-nu"
                            title={`Voir les ${l.mesures} mesures`}
                            onClick={() => ouvrir("mesures prises", pj, "#06b6d4")}>{l.mesures}</button>
                          {" → "}
                          <button type="button" className="sgs-lien-nu"
                            title={`Voir les ${l.offres} offres`}
                            onClick={() => ouvrir("offres établies", pj.filter((x) => x.offre), "#3b82f6")}>{l.offres}</button>
                          {" → "}
                          <button type="button" className="sgs-lien-nu"
                            title={`Voir les ${l.commandes} commandes`}
                            onClick={() => ouvrir("commandes obtenues", pj.filter((x) => x.commande), "#16a34a")}>{l.commandes}</button>
                        </b>
                      </span>
                      <span className={`sgs-ent-taux${l.taux >= 70 ? " is-bon" : l.taux < 40 ? " is-faible" : ""}`}>
                        {l.taux} <em>%</em>
                      </span>
                      <span className="sgs-ent-cab">
                        <button type="button" className="sgs-lien-nu"
                          title={`Voir les ${l.commandes} projets commandés (${l.cabines} cabines)`}
                          onClick={() => ouvrir("projets commandés", pj.filter((x) => x.commande), "#16a34a")}>
                          {l.cabines} cab.
                        </button>
                      </span>
                    </div>
                    );
                  })}
                </div>
                <p className="sgs-note">
                  Une mesure est un déplacement de deux heures : ce tableau compte par MESURE,
                  et non par projet, parce que c&apos;est le déplacement qu&apos;il s&apos;agit de
                  rentabiliser. « Perdues » compte les mesures de plus de soixante jours restées
                  sans commande — elles ne reviendront probablement pas. Chaque chiffre s&apos;ouvre
                  sur la liste des projets qu&apos;il recouvre.
                  {" "}Le client retenu est celui À QUI L&apos;ON FACTURE, désigné par
                  « Type de client » : un chantier chez un sanitaire mais commandé par un
                  fournisseur compte pour le fournisseur, et non pour le sanitaire — lequel
                  ne nous a rien commandé.
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {transfo ? "Aucune mesure reçue sur la période choisie." : "Calcul en cours…"}
              </p>
            )}
          </Fold>

          <Fold className="sgs-span2" title="Clients qui décrochent"
            meta="par client facturé · douze mois glissants comparés aux douze précédents · recul d'au moins 40 %"
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={axeClient === "tous" ? "is-on" : ""}
                  onClick={() => setAxeClient("tous")}>Tous</button>
                {familles.map((f) => (
                  <button key={f} type="button" className={axeClient === f ? "is-on" : ""}
                    onClick={() => setAxeClient(f)}>{f}</button>
                ))}
              </div>
            }>
            {reculFiltre.length ? (
              <>
                <Tableau cols={[
                  { titre: "Client facturé" },
                  { titre: "12 mois précédents", num: true }, { titre: "12 derniers mois", num: true },
                  { titre: "Écart", num: true }, { titre: "Dernier montage", num: true },
                ]}>
                  {reculFiltre.map((l: any) => (
                    <tr key={l.client}>
                      <td className="cle">{l.client}</td>
                      <td className="num doux">{l.avant}</td>
                      <td className="num avec-part">
                        {l.recent}
                        <Part valeur={l.recent} sur={l.avant} />
                      </td>
                      <td className="num fort"><span className="sgs-pct is-faible">{l.variation} %</span></td>
                      <td className="num doux">
                        {l.derniereCommande || "—"}
                        {l.joursDepuis !== null && (
                          <em className={l.joursDepuis > 180 ? "alerte" : undefined}>il y a {l.joursDepuis} j</em>
                        )}
                      </td>
                    </tr>
                  ))}
                </Tableau>
                <p className="sgs-note">
                  Cette comparaison ignore la période affichée : deux trimestres ne se
                  comparent pas, la saisonnalité dominerait le signal. Une année entière de
                  chaque côté l&apos;annule. Un client qui pesait moins de cinq cabines l&apos;an
                  passé n&apos;est pas retenu — il n&apos;a pas « décroché », il n&apos;a jamais décollé.
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {analyses ? "Aucun client en recul marqué : le portefeuille tient." : "Calcul en cours…"}
              </p>
            )}
          </Fold>
        </div>
      )}

      {tab === "qualite" && (
        <>
          <Fold className="sgs-span2" defaultOpen title="Ce que coûte de repasser"
            meta="chantiers où l'on est retourné une seconde fois · heures sur place et route estimée"
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                {([["fournisseur", "Fournisseur"], ["serie", "Série"], ["cause", "Cause"]] as const).map(([k, l]) => (
                  <button key={k} type="button" className={axeReprise === k ? "is-on" : ""}
                    onClick={() => setAxeReprise(k)}>{l}</button>
                ))}
              </div>
            }>
            {analyses?.reprises?.[axeReprise]?.length ? (
              <>
                <Tableau cols={[
                  { titre: axeReprise === "cause" ? "Cause" : axeReprise === "serie" ? "Série" : "Fournisseur" },
                  ...(axeReprise === "cause" ? [] : [{ titre: "Chantiers", num: true }]),
                  { titre: "Reprises", num: true },
                  ...(axeReprise === "cause" ? [] : [{ titre: "Taux", num: true }]),
                  { titre: "Sur place", num: true }, { titre: "Route", num: true },
                  { titre: "Total", num: true }, { titre: "Dont erreur TM", num: true },
                ]}>
                  {analyses.reprises[axeReprise].map((l: any) => (
                    <tr key={l.cle}>
                      <td className="cle">{l.cle}</td>
                      {axeReprise !== "cause" && <td className="num doux">{l.chantiers}</td>}
                      <td className="num">{l.reprises}</td>
                      {axeReprise !== "cause" && (
                        <td className="num fort">
                          <span className={l.taux >= 15 ? "sgs-pct is-faible" : l.taux <= 5 ? "sgs-pct is-bon" : "sgs-pct"}>
                            {l.taux} %
                          </span>
                        </td>
                      )}
                      <td className="num doux">{l.heuresSurPlace} h</td>
                      <td className="num doux">{l.heuresRoute} h</td>
                      <td className="num fort">{l.heuresTotal} h</td>
                      <td className={`num${l.erreursTM > 0 ? " alerte" : " doux"}`}>{l.erreursTM || "—"}</td>
                    </tr>
                  ))}
                </Tableau>
                <p className="sgs-note">
                  Un chantier refait n&apos;apparaît nulle part comme tel : les heures du SAV
                  sont pointées, mais personne ne les rapporte aux chantiers posés. Ne sont
                  comptées ici que les reprises PROUVÉES — un SAV avec des heures saisies sur
                  place, ou un montage partiel, qui se termine forcément par une seconde
                  visite. Un SAV ouvert sans déplacement ne coûte rien en pose. La
                  <b> route est estimée</b>, aller-retour depuis le dépôt : aucun kilomètre
                  n&apos;est mesuré depuis le retrait du GPS. Sur l&apos;axe « Cause », le taux
                  n&apos;a pas de sens — une cause n&apos;existe que sur un chantier repris.
                </p>
              </>
            ) : (
              <p className="sgs-empty">
                {analyses ? "Aucune reprise sur la période — ou aucune heure pointée qui la prouve." : "Calcul en cours…"}
              </p>
            )}
          </Fold>
          <div className="sgs-kpis">
            {qualRows.map((k, i) => (
              <button key={k.label} type="button"
                className="sgs-kpi is-click" style={{ animationDelay: `${i * 45}ms` }}
                disabled={!k.items?.length}
                title={k.items?.length ? `Voir les ${k.items.length} projets concernés` : undefined}
                onClick={() => setPick(k)}>
                <div className="sgs-kpi-top">
                  <span className="sgs-kpi-label">{k.label}</span>
                  <span className="sgs-delta flat">{k.sub}</span>
                </div>
                <span className="sgs-kpi-value" style={{ color: k.color }}>{fmt(k.value)}</span>
                <span className="sgs-kpi-foot">sur {fmt(quality.total)} projets</span>
              </button>
            ))}
          </div>
          <div className="sgs-card">
            <div className="sgs-card-head">
              <div>
                <h2 className="sgs-card-title">Taux par indicateur</h2>
                <p className="sgs-card-meta">part des projets concernés sur la période</p>
              </div>
            </div>
            <BarList rows={qualRows} unit=" proj." onPick={setPick} />
          </div>

          {/* Qui a posé la cabine qui pose problème ? */}
          <Fold defaultOpen title="Responsabilité par monteur ou binôme"
            meta={qualFocus === "sav"
              ? "attribution PAR CABINE · seuls les SAV dont la cause est une erreur TM sont imputés"
              : "attribution PAR CABINE : sur un projet multi-cabine, seule l'équipe de la cabine concernée est comptée"}
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                {([["sav", "SAV"], ["soucis", "Soucis"], ["pieces", "Pièces"], ["defauts", "Défauts"]] as const).map(([v, lbl]) => (
                  <button key={v} type="button" className={qualFocus === v ? "is-on" : ""}
                    onClick={() => setQualFocus(v)}>{lbl}</button>
                ))}
              </div>
            }>
            <BarList rows={blameBy[qualFocus]} unit=" cas" onPick={setPick}
              empty="Aucun cas sur cette période." />
          </Fold>

          {/* Signalements saisis dans l'app — bloc AJOUTÉ, les indicateurs
              ci-dessus restent inchangés (ils reposent sur les anciennes
              colonnes Notion, renseignées autrement). */}
          <div className="sgs-kpis">
            {[
              { label: "Pièces signalées", n: sigStats?.pieces.length ?? 0, foot: `${sigStats?.piecesOuvertes ?? 0} en attente`, color: "#f59e0b", items: sigStats?.projetsDe(sigStats.pieces) },
              { label: "Pièces reçues", n: sigStats?.piecesClose.length ?? 0, foot: "signalements clos", color: "#16a34a", items: sigStats?.projetsDe(sigStats.piecesClose) },
              { label: "Défauts signalés", n: sigStats?.defauts.length ?? 0, foot: `${sigStats?.defautsOuverts ?? 0} non résolus`, color: "#dc2626", items: sigStats?.projetsDe(sigStats.defauts) },
              { label: "Projets concernés", n: sigStats?.projetsTouches ?? 0, foot: `sur ${fmt(quality.total)} projets`, color: "#6366f1", items: sigStats?.tousProjets },
            ].map((k, i) => (
              <button key={k.label} type="button"
                className="sgs-kpi is-click" style={{ animationDelay: `${i * 45}ms` }}
                disabled={!k.items?.length}
                title={k.items?.length ? `Voir les ${k.items.length} projets concernés` : undefined}
                onClick={() => setPick({ label: k.label, value: k.n, color: k.color, items: k.items })}>
                <div className="sgs-kpi-top">
                  <span className="sgs-kpi-label">{k.label}</span>
                </div>
                <span className="sgs-kpi-value" style={{ color: k.color }}>
                  {sig ? fmt(k.n) : "…"}
                </span>
                <span className="sgs-kpi-foot">{k.foot}</span>
              </button>
            ))}
          </div>

          <Fold title="Livraisons abîmées"
            meta="d'après les photos de dégâts prises à la réception des cartons"
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={axeDegats === "marque" ? "is-on" : ""} onClick={() => setAxeDegats("marque")}>Marque</button>
                <button type="button" className={axeDegats === "grossiste" ? "is-on" : ""} onClick={() => setAxeDegats("grossiste")}>Grossiste</button>
              </div>
            }>
            {analyses?.degats?.[axeDegats]?.length ? (
              <>
                <Tableau cols={[
                  { titre: axeDegats === "marque" ? "Marque" : "Grossiste" },
                  { titre: "Livraisons vues", num: true }, { titre: "Abîmées", num: true },
                  { titre: "Taux", num: true }, { titre: "Couverture", num: true },
                ]}>
                  {analyses.degats[axeDegats].map((l: any) => (
                    <tr key={l.cle}>
                      <td className="cle">{l.cle}</td>
                      <td className="num doux">{l.documentees}</td>
                      <td className="num">{l.abimees}</td>
                      <td className="num fort avec-part">
                        <span className={l.taux >= 10 ? "sgs-pct is-faible" : "sgs-pct"}>{l.taux} %</span>
                        <Part valeur={l.taux} sur={100} ton={l.taux >= 10 ? "chaud" : undefined} />
                      </td>
                      <td className={`num${l.couverture < 60 ? " alerte" : " doux"}`}>{l.couverture} %</td>
                    </tr>
                  ))}
                </Tableau>
                <p className="sgs-note">
                  Le SAV met en cause le produit ; les cartons mettent en cause le transport
                  et l&apos;emballage — d&apos;où deux responsables distincts, et deux axes de
                  lecture. La colonne <b>Couverture</b> dit quelle part des livraisons a
                  effectivement été photographiée : en dessous de 60 %, le taux est faux vers
                  le bas et ne doit pas servir d&apos;argument. C&apos;est alors la couverture
                  qu&apos;il faut corriger avant le fournisseur.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Pas assez de livraisons photographiées sur la période.</p>
            )}
          </Fold>
          <Fold title="Ce que coûte le SAV, en heures"
            meta="heures pointées sur les SAV, rapportées à 100 cabines posées de la même origine"
            right={
              <div className="sgs-seg" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={axeSav === "marque" ? "is-on" : ""} onClick={() => setAxeSav("marque")}>Marque</button>
                <button type="button" className={axeSav === "serie" ? "is-on" : ""} onClick={() => setAxeSav("serie")}>Série</button>
              </div>
            }>
            {analyses?.sav?.[axeSav]?.length ? (
              <>
                <Tableau cols={[
                  { titre: axeSav === "marque" ? "Marque" : "Série" },
                  { titre: "Cabines posées", num: true }, { titre: "SAV", num: true },
                  { titre: "Heures / 100 cab.", num: true }, { titre: "Erreur TM", num: true },
                ]}>
                  {(() => {
                    const pire = Math.max(1, ...analyses.sav[axeSav].map((x: any) => x.heuresPour100));
                    return analyses.sav[axeSav].map((l: any) => (
                      <tr key={l.cle}>
                        <td className="cle">{l.cle}</td>
                        <td className="num doux">{l.cabinesPosees}</td>
                        <td className="num">{l.interventions}</td>
                        <td className="num fort avec-part">
                          {l.heuresPour100} h
                          <Part valeur={l.heuresPour100} sur={pire}
                            ton={l.heuresPour100 > pire * 0.6 ? "chaud" : undefined} />
                        </td>
                        <td className={`num${l.erreursTM > 0 ? " alerte" : " doux"}`}>{l.erreursTM || "—"}</td>
                      </tr>
                    ));
                  })()}
                </Tableau>
                <p className="sgs-note">
                  Le dénominateur est le nombre de cabines posées de la même origine sur la
                  période : sans lui, le plus gros fournisseur paraîtrait toujours le pire.
                  Une origine sous dix cabines posées n&apos;est pas affichée. La colonne
                  « Erreur TM » compte les cabines dont la cause du SAV nous est imputée.
                </p>
              </>
            ) : (
              <p className="sgs-empty">Aucune heure pointée sur les SAV de la période.</p>
            )}
          </Fold>
          <Fold title="Récurrence SAV"
            meta="chantiers revenus plusieurs fois en SAV · un cas isolé n'y figure pas">
            <BarList rows={savRecurrence} unit=" SAV" onPick={setPick}
              empty="Aucun chantier n'est revenu plusieurs fois en SAV sur cette période." />
          </Fold>

          <Fold title="SAV par cause"
            meta="part de chaque cause sur l'ensemble des SAV de la période · erreur fournisseur, client ou TM">
            <BarList rows={savByCause} unit=" SAV" onPick={setPick}
              empty="Aucun SAV sur cette période." />
          </Fold>

          <Fold title={sigAxis === "marque" ? "Signalements par marque" : "Signalements par série"}
            meta="taux rapporté aux cabines de cette marque ou série posées sur la période, pas à l'ensemble du parc"
            right={
              <div className="sgs-blame-ctl" onClick={(e) => e.stopPropagation()}>
                <div className="sgs-seg">
                  {([["marque", "Marque"], ["serie", "Série"]] as const).map(([v, lbl]) => (
                    <button key={v} type="button" className={sigAxis === v ? "is-on" : ""}
                      onClick={() => setSigAxis(v)}>{lbl}</button>
                  ))}
                </div>
                <div className="sgs-seg">
                  {([["tout", "Tout"], ["pieces", "Pièces"], ["defauts", "Défauts"]] as const).map(([v, lbl]) => (
                    <button key={v} type="button" className={sigKind === v ? "is-on" : ""}
                      onClick={() => setSigKind(v)}>{lbl}</button>
                  ))}
                </div>
              </div>
            }>
            <BarList rows={sigByProduit} unit=" signal." onPick={setPick}
              empty="Aucun signalement sur cette période." />
          </Fold>

          <Fold title="Signalements par état"
            meta="pièces manquantes et défauts saisis dans l'app, sur la période">
            <BarList
              rows={[
                { label: "Pièces en attente", value: sigStats?.piecesOuvertes ?? 0, color: "#f59e0b", items: sigStats?.projetsDe(sigStats.piecesOuvertesList) },
                { label: "Pièces reçues", value: sigStats?.piecesClose.length ?? 0, color: "#16a34a", items: sigStats?.projetsDe(sigStats.piecesClose) },
                { label: "Défauts non résolus", value: sigStats?.defautsOuverts ?? 0, color: "#dc2626", items: sigStats?.projetsDe(sigStats.defautsOuvertsList) },
                { label: "Défauts résolus", value: sigStats?.defautsClose.length ?? 0, color: "#0f766e", items: sigStats?.projetsDe(sigStats.defautsClose) },
              ]}
              unit=" signal."
              empty="Aucun signalement sur cette période."
              onPick={setPick}
            />
          </Fold>

          <Fold title="Projets les plus signalés"
            meta="nombre de signalements par projet · cliquez pour ouvrir le projet">
            <BarList rows={sigStats?.parProjet ?? []} unit=" signal."
              empty="Aucun signalement sur cette période." onPick={setPick} />
          </Fold>
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
