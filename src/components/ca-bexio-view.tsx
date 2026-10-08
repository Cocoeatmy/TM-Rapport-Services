"use client";

/**
 * CA-Bexio — le chiffre d'affaires tel que la comptabilité le connaît.
 *
 * La page « Stats » de l'app compte des cabines, des chantiers, des heures :
 * ce que Notion sait. Celle-ci compte des francs facturés, ce que seul bexio
 * sait. Les deux restent séparées à dessein — un chiffre d'affaires qui ne
 * vient pas de la comptabilité n'est pas un chiffre d'affaires, et les
 * confondre rendrait les deux suspects.
 *
 * Réservée au propriétaire des accès bexio.
 */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { smoothPath } from "@/lib/courbe";

interface Part { nom: string; total: number; nb: number }
interface Mois { mois: string; total: number; nb: number; encaisse: number; restant: number }

interface Donnees {
  le: string | null;
  annee: string;
  annees: string[];
  total: number;
  restant: number;
  encaisse: number;
  factures: number;
  parMois: Mois[];
  parAnnee: Part[];
  parClient: Part[];
  parFournisseur: Part[];
  nonRattache: { nb: number; total: number };
}

const FR = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 });
const FR2 = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const francs = (n: number) => FR.format(Math.round(n || 0));
const francs2 = (n: number) => FR2.format(n || 0);

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const nomMois = (k: string) => {
  const m = parseInt(k.slice(5, 7), 10);
  return MOIS[m - 1] || k;
};

function Barres({ titre, sous, lignes, unite }: { titre: string; sous?: string; lignes: Part[]; unite?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.total));
  if (lignes.length === 0) return null;
  return (
    <div className="sg-card">
      <div className="sg-card-head">
        <div>
          <span className="sg-card-title">{titre}</span>
          {sous && <p className="sg-card-meta">{sous}</p>}
        </div>
      </div>
      <div className="sg-cab-liste">
        {lignes.map((l) => (
          <div key={l.nom} className="sg-cab-l">
            <span className="sg-cab-nom" title={l.nom}>{l.nom}</span>
            <span className="sg-cab-barre">
              <i style={{ width: `${Math.max(2, (l.total / max) * 100)}%` }} />
            </span>
            <span className="sg-cab-val">
              CHF {francs(l.total)}
              <em>{l.nb} {unite || (l.nb > 1 ? "factures" : "facture")}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type SerieId = "total" | "encaisse" | "restant";
const SERIES: { id: SerieId; label: string; color: string }[] = [
  { id: "total", label: "Facturé", color: "#1b63ff" },
  { id: "encaisse", label: "Encaissé", color: "#15803d" },
  { id: "restant", label: "Reste à encaisser", color: "#b45309" },
];

/**
 * Tendance mensuelle — mêmes gestes que la page Statistiques : on bascule
 * entre aires, lignes et barres, on masque une série d'un clic sur sa
 * légende, et le survol donne le détail du mois. Reprendre les mêmes codes
 * évite d'avoir à réapprendre un graphique parce qu'il parle d'argent.
 */
function Tendance({ mois, annee }: { mois: Mois[]; annee: string }) {
  const [forme, setForme] = useState<"aires" | "lignes" | "barres">("aires");
  const [masquees, setMasquees] = useState<Set<SerieId>>(new Set(["restant"]));
  const [survol, setSurvol] = useState<number | null>(null);

  const W = 1000, H = 320, PL = 60, PR = 16, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const visibles = SERIES.filter((s) => !masquees.has(s.id));
  const maxi = Math.max(1, ...mois.flatMap((m) => visibles.map((s) => m[s.id] || 0)));
  const x = (i: number) => (mois.length <= 1 ? PL + iw / 2 : PL + (i / (mois.length - 1)) * iw);
  const y = (v: number) => PT + ih - (v / maxi) * ih;
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxi * f) / 1000) * 1000);

  const bouger = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PL - 20 || px > W - PR + 20 || mois.length === 0) { setSurvol(null); return; }
    const i = mois.length <= 1 ? 0 : Math.round(((px - PL) / iw) * (mois.length - 1));
    setSurvol(Math.max(0, Math.min(mois.length - 1, i)));
  };

  if (mois.length === 0) return null;

  return (
    <div className="sgs-card">
      <div className="sgs-card-head">
        <div>
          <h2 className="sgs-card-title">Tendance mensuelle</h2>
          <p className="sgs-card-meta">
            {mois.length} mois · {annee === "tout" ? "toutes années" : annee} · cliquez une série pour l&apos;afficher ou la masquer
          </p>
        </div>
        <div className="sgs-seg">
          {([["aires", "Aires"], ["lignes", "Lignes"], ["barres", "Barres"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={forme === v ? "is-on" : ""} onClick={() => setForme(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="sgs-chart" onMouseLeave={() => setSurvol(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="sgs-svg" onMouseMove={bouger} role="img" aria-label="Chiffre d'affaires par mois">
          <defs>
            {visibles.map((s) => (
              <linearGradient key={s.id} id={`cab-g-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>

          {graduations.map((t, i) => (
            <g key={i}>
              <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} className="sgs-grid" />
              <text x={PL - 10} y={y(t) + 4} textAnchor="end" className="sgs-axis">{francs(t)}</text>
            </g>
          ))}

          {forme === "barres" && mois.map((m, i) => {
            const bw = Math.max(2, (iw / Math.max(1, mois.length)) / Math.max(1, visibles.length) - 2);
            return visibles.map((s, si) => {
              const v = m[s.id] || 0;
              const bx = x(i) - (visibles.length * (bw + 2)) / 2 + si * (bw + 2);
              return (
                <rect key={`${m.mois}-${s.id}`} x={bx} y={y(v)} width={bw}
                  height={Math.max(0, PT + ih - y(v))} rx="2" fill={s.color} className="sgs-bar" />
              );
            });
          })}

          {forme !== "barres" && visibles.map((s) => {
            const pts = mois.map((m, i) => ({ x: x(i), y: y(m[s.id] || 0) }));
            const d = smoothPath(pts);
            return (
              <g key={s.id}>
                {forme === "aires" && pts.length > 1 && (
                  <path d={`${d} L ${pts[pts.length - 1].x} ${PT + ih} L ${pts[0].x} ${PT + ih} Z`}
                    fill={`url(#cab-g-${s.id})`} className="sgs-area" />
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" className="sgs-line" />
                {pts.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={survol === i ? 5 : 3}
                    fill="var(--sg-paper)" stroke={s.color} strokeWidth="2.5" className="sgs-dot" />
                ))}
              </g>
            );
          })}

          {survol !== null && mois[survol] && (
            <line x1={x(survol)} y1={PT} x2={x(survol)} y2={PT + ih} className="sgs-cursor" />
          )}

          {mois.map((m, i) => (
            <text key={m.mois} x={x(i)} y={H - 10} textAnchor="middle"
              className={`sgs-axis${survol === i ? " is-on" : ""}`}>
              {annee === "tout" ? m.mois.slice(2) : nomMois(m.mois)}
            </text>
          ))}
        </svg>

        {survol !== null && mois[survol] && (
          <div className="sgs-tip" style={{ left: `${(x(survol) / W) * 100}%` }}>
            <span className="sgs-tip-title">
              {annee === "tout" ? mois[survol].mois : nomMois(mois[survol].mois)}
              {" · "}{mois[survol].nb} facture{mois[survol].nb > 1 ? "s" : ""}
            </span>
            {SERIES.map((s) => (
              <span key={s.id} className="sgs-tip-row">
                <i style={{ background: s.color }} />
                <span className="sgs-tip-k">{s.label}</span>
                <span className="sgs-tip-v">CHF {francs2(mois[survol][s.id] || 0)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="sgs-legend">
        {SERIES.map((s) => {
          const off = masquees.has(s.id);
          const somme = mois.reduce((t, m) => t + (m[s.id] || 0), 0);
          return (
            <button key={s.id} type="button" aria-pressed={!off} className={`sgs-leg${off ? " is-off" : ""}`}
              onClick={() => setMasquees((prev) => {
                const next = new Set(prev);
                if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                return next;
              })}>
              <i style={{ background: off ? "transparent" : s.color, borderColor: s.color }} />
              {s.label}
              <span className="sgs-leg-v">CHF {francs(somme)}</span>
            </button>
          );
        })}
        <button type="button" className="sgs-leg sgs-leg-all" onClick={() => setMasquees(new Set())}>Tout afficher</button>
      </div>
    </div>
  );
}

export function CaBexioView() {
  const [d, setD] = useState<Donnees | null>(null);
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    setChargement(true);
    setErreur("");
    fetch(`/api/bexio/ca?annee=${encodeURIComponent(annee)}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Ces informations ne vous sont pas accessibles.");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Lecture impossible");
        return j as Donnees;
      })
      .then(setD)
      .catch((e) => setErreur((e as Error).message))
      .finally(() => setChargement(false));
  }, [annee]);

  const maxMois = Math.max(1, ...(d?.parMois || []).map((m) => m.total));

  return (
    <div className="sg-fact">
      <div className="sg-card-head">
        <div>
          <span className="sg-card-title">CA-Bexio</span>
          <p className="sg-card-meta">
            chiffre d&apos;affaires facturé, lu directement dans bexio
            {d?.le && ` · relevé du ${new Date(d.le).toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="sg-fact-onglets">
          {["tout", ...(d?.annees || [])].map((a) => (
            <button key={a} type="button"
              className={`sg-fact-ong${annee === a ? " is-on" : ""}`}
              onClick={() => setAnnee(a)}>{a === "tout" ? "Tout" : a}</button>
          ))}
          {chargement && <RefreshCw className="w-4 h-4 animate-spin" />}
        </div>
      </div>

      {erreur && <p className="sg-fact-err">{erreur}</p>}

      {d && (
        <>
          <div className="sg-fact-tete">
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facturé</span>
              <b>CHF {francs(d.total)}</b>
              <i>{d.factures} facture{d.factures > 1 ? "s" : ""}</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Encaissé</span>
              <b>CHF {francs(d.encaisse)}</b>
              <i>{d.total > 0 ? Math.round((d.encaisse / d.total) * 100) : 0} % du facturé</i>
            </div>
            <div className={`sg-fact-kpi${d.restant > 0 ? " is-alerte" : ""}`}>
              <span className="sg-fact-kpi-l">Reste à encaisser</span>
              <b>CHF {francs(d.restant)}</b>
              <i>sur les factures de la période</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facture moyenne</span>
              <b>CHF {francs(d.factures ? d.total / d.factures : 0)}</b>
              <i>toutes prestations confondues</i>
            </div>
          </div>

          <Tendance mois={d.parMois} annee={annee} />

          <Barres titre="Par client" sous="les quarante premiers, du plus gros au plus petit"
            lignes={d.parClient} />

          <Barres titre="Par fournisseur"
            sous="reconstitué en remontant de la facture à l'offre, puis au chantier et à ses marques"
            lignes={d.parFournisseur} />

          {annee !== "tout" && d.parAnnee.length > 1 && (
            <Barres titre="Par année" sous="toutes les factures, toutes périodes" lignes={d.parAnnee} />
          )}

          {d.nonRattache.nb > 0 && (
            <p className="sg-fact-note">
              <b>{d.nonRattache.nb} facture{d.nonRattache.nb > 1 ? "s" : ""}</b> (CHF {francs(d.nonRattache.total)})
              ne se rattache à aucun chantier de l&apos;app : facture groupée, prestation hors chantier, ou
              titre trop éloigné de celui de l&apos;offre. Elle compte dans le total et dans la répartition par
              client, mais figure en « Non rattaché » du côté fournisseur — mieux vaut un trou visible qu&apos;une
              répartition inventée.
            </p>
          )}
        </>
      )}
      {chargement && !d && <p className="sg-fact-vide">Lecture des factures…</p>}
    </div>
  );
}
