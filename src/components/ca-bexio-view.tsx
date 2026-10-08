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
 * Trois sources se rejoignent pourtant ici : bexio donne les francs, Notion
 * les chantiers et leurs marques, l'app le lien entre les deux (le numéro
 * d'offre). C'est ce croisement qui permet de dire un CA « par fournisseur »
 * ou « par série », qui n'existe nulle part ailleurs.
 *
 * Réservée au propriétaire des accès bexio.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, ArrowLeft, ExternalLink } from "lucide-react";
import { smoothPath } from "@/lib/courbe";

interface Part { nom: string; total: number; nb: number }
interface Mois { mois: string; total: number; nb: number; encaisse: number; restant: number; achats: number }
interface ClientLigne { id: number; nom: string; total: number; nb: number; restant: number }
interface Impaye {
  nr: string; titre: string; client: string; total: number; restant: number;
  date: string; jours: number; chantier: string | null; ofrTM: string;
}

interface Donnees {
  le: string | null;
  de: string; a: string;
  annees: string[];
  total: number; restant: number; encaisse: number;
  factures: number; clientsActifs: number;
  offres: number; totalOffres: number; transformation: number | null;
  parMois: Mois[];
  parAnnee: Part[];
  parClient: Part[];
  clients: ClientLigne[];
  parFournisseur: Part[];
  parSerie: Part[];
  impayes: { parAge: Part[]; total: number; lignes: Impaye[] };
  depenses: {
    total: number; nb: number; marge: number; margePct: number | null;
    parFournisseur: Part[]; parCompte: Part[];
    du: number; duNb: number; enRetard: { nb: number; total: number };
    lignes: { no: string; fournisseur: string; titre: string; ttc: number; du: number; date: string; enRetard: boolean; compte: string }[];
  };
  nonRattache: { nb: number; total: number };
}

interface FicheClient {
  client: { id: number; nom: string };
  total: number; restant: number; encaisse: number;
  nbFactures: number; nbOffres: number; nbChantiers: number; cabines: number;
  parAnnee: Part[];
  factures: { nr: string; titre: string; total: number; restant: number; date: string }[];
  chantiers: {
    id: string; ofrTM: string; projet: string; adresseChantier: string;
    nbCabines: number; dateMontage: string | null; etatCMD: string;
    fournisseurs: string[]; series: string[];
  }[];
}

const FR = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 });
const FR2 = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const francs = (n: number) => FR.format(Math.round(n || 0));
const francs2 = (n: number) => FR2.format(n || 0);

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const nomMois = (k: string) => MOIS[parseInt(k.slice(5, 7), 10) - 1] || k;
const jour = (d: string) => (d ? d.split("-").reverse().join(".") : "—");

/* ── Graphique de tendance ─────────────────────────────────────────────── */

type SerieId = "total" | "encaisse" | "restant" | "achats";
const SERIES: { id: SerieId; label: string; color: string }[] = [
  { id: "total", label: "Facturé", color: "#1b63ff" },
  { id: "achats", label: "Dépenses", color: "#dc2626" },
  { id: "encaisse", label: "Encaissé", color: "#15803d" },
  { id: "restant", label: "Reste à encaisser", color: "#b45309" },
];

/**
 * Mêmes gestes que la page Statistiques : aires, lignes ou barres, séries
 * masquables d'un clic, détail du mois au survol. Reprendre les mêmes codes
 * évite d'avoir à réapprendre un graphique parce qu'il parle d'argent.
 */
function Tendance({ mois }: { mois: Mois[] }) {
  const [forme, setForme] = useState<"aires" | "lignes" | "barres">("aires");
  const [masquees, setMasquees] = useState<Set<SerieId>>(new Set(["restant", "encaisse"]));
  const [survol, setSurvol] = useState<number | null>(null);

  const W = 1000, H = 320, PL = 64, PR = 16, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const visibles = SERIES.filter((s) => !masquees.has(s.id));
  const maxi = Math.max(1, ...mois.flatMap((m) => visibles.map((s) => m[s.id] || 0)));
  const x = (i: number) => (mois.length <= 1 ? PL + iw / 2 : PL + (i / (mois.length - 1)) * iw);
  const y = (v: number) => PT + ih - (v / maxi) * ih;
  const pas = Math.max(1000, Math.round(maxi / 4 / 1000) * 1000);
  const graduations = [0, 1, 2, 3, 4].map((k) => k * pas).filter((v) => v <= maxi * 1.05);

  const bouger = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PL - 20 || px > W - PR + 20 || mois.length === 0) { setSurvol(null); return; }
    const i = mois.length <= 1 ? 0 : Math.round(((px - PL) / iw) * (mois.length - 1));
    setSurvol(Math.max(0, Math.min(mois.length - 1, i)));
  };

  if (mois.length === 0) return null;
  const longue = mois.length > 14;

  return (
    <div className="sgs-card">
      <div className="sgs-card-head">
        <div>
          <h2 className="sgs-card-title">Tendance mensuelle</h2>
          <p className="sgs-card-meta">{mois.length} mois · cliquez une série pour l&apos;afficher ou la masquer</p>
        </div>
        <div className="sgs-seg">
          {([["aires", "Aires"], ["lignes", "Lignes"], ["barres", "Barres"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={forme === v ? "is-on" : ""} onClick={() => setForme(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="sgs-chart" onMouseLeave={() => setSurvol(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="sgs-svg" onMouseMove={bouger} role="img"
          aria-label="Chiffre d'affaires par mois">
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
                {!longue && pts.map((pt, i) => (
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
            (!longue || i % Math.ceil(mois.length / 12) === 0) && (
              <text key={m.mois} x={x(i)} y={H - 10} textAnchor="middle"
                className={`sgs-axis${survol === i ? " is-on" : ""}`}>
                {longue ? m.mois.slice(2) : nomMois(m.mois)}
              </text>
            )
          ))}
        </svg>

        {survol !== null && mois[survol] && (
          <div className="sgs-tip" style={{ left: `${(x(survol) / W) * 100}%` }}>
            <span className="sgs-tip-title">
              {nomMois(mois[survol].mois)} {mois[survol].mois.slice(0, 4)}
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

/* ── Classement en barres ──────────────────────────────────────────────── */

function Barres({ titre, sous, lignes, onPick }: {
  titre: string; sous?: string; lignes: Part[];
  onPick?: (nom: string) => void;
}) {
  const [tout, setTout] = useState(false);
  if (lignes.length === 0) return null;
  const max = Math.max(1, ...lignes.map((l) => l.total));
  const vues = tout ? lignes : lignes.slice(0, 15);
  return (
    <div className="sg-card">
      <div className="sg-card-head">
        <div>
          <span className="sg-card-title">{titre}</span>
          {sous && <p className="sg-card-meta">{sous}</p>}
        </div>
        {lignes.length > 15 && (
          <button type="button" className="sg-fact-maj" onClick={() => setTout((v) => !v)}>
            {tout ? "Voir moins" : `Voir les ${lignes.length}`}
          </button>
        )}
      </div>
      <div className="sg-cab-liste">
        {vues.map((l) => {
          const contenu = (
            <>
              <span className="sg-cab-nom" title={l.nom}>{l.nom}</span>
              <span className="sg-cab-barre"><i style={{ width: `${Math.max(2, (l.total / max) * 100)}%` }} /></span>
              <span className="sg-cab-val">
                CHF {francs(l.total)}
                <em>{l.nb} facture{l.nb > 1 ? "s" : ""}</em>
              </span>
            </>
          );
          return onPick ? (
            <button key={l.nom} type="button" className="sg-cab-l" onClick={() => onPick(l.nom)}
              title={`Voir la fiche de ${l.nom}`}>{contenu}</button>
          ) : (
            <div key={l.nom} className="sg-cab-l">{contenu}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Fiche d'un client ─────────────────────────────────────────────────── */

function FicheDuClient({ id, onRetour }: { id: number; onRetour: () => void }) {
  const [d, setD] = useState<FicheClient | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    setD(null);
    fetch(`/api/bexio/ca?client=${id}`, { credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Lecture impossible");
        return j as FicheClient;
      })
      .then(setD)
      .catch((e) => setErreur((e as Error).message));
  }, [id]);

  const marques = useMemo(() => {
    const m = new Map<string, number>();
    (d?.chantiers || []).forEach((c) => (c.fournisseurs.length ? c.fournisseurs : ["Sans marque"])
      .forEach((f) => m.set(f, (m.get(f) || 0) + (c.nbCabines || 0))));
    return [...m.entries()].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n);
  }, [d]);

  return (
    <div className="sg-fact">
      <div className="sg-card-head">
        <div>
          <button type="button" className="sg-fact-retour" onClick={onRetour}>
            <ArrowLeft className="w-4 h-4" /> Tous les clients
          </button>
          <span className="sg-card-title">{d?.client.nom || "Client"}</span>
          <p className="sg-card-meta">
            factures bexio, chantiers de l&apos;app et marques posées — les trois sources réunies
          </p>
        </div>
      </div>

      {erreur && <p className="sg-fact-err">{erreur}</p>}
      {!d && !erreur && <p className="sg-fact-vide">Lecture…</p>}

      {d && (
        <>
          <div className="sg-fact-tete">
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facturé, tout l&apos;historique</span>
              <b>CHF {francs(d.total)}</b>
              <i>{d.nbFactures} facture{d.nbFactures > 1 ? "s" : ""}</i>
            </div>
            <div className={`sg-fact-kpi${d.restant > 0 ? " is-alerte" : ""}`}>
              <span className="sg-fact-kpi-l">Reste à encaisser</span>
              <b>CHF {francs(d.restant)}</b>
              <i>{d.total > 0 ? Math.round((d.encaisse / d.total) * 100) : 0} % déjà encaissé</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Chantiers</span>
              <b>{d.nbChantiers}</b>
              <i>{d.cabines} cabine{d.cabines > 1 ? "s" : ""} · {d.nbOffres} offre{d.nbOffres > 1 ? "s" : ""}</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facture moyenne</span>
              <b>CHF {francs(d.nbFactures ? d.total / d.nbFactures : 0)}</b>
              <i>sur toute la relation</i>
            </div>
          </div>

          {d.parAnnee.length > 0 && (
            <Barres titre="Par année" sous="toutes les factures de ce client" lignes={d.parAnnee} />
          )}

          {marques.length > 0 && (
            <div className="sg-card">
              <div className="sg-card-head">
                <div>
                  <span className="sg-card-title">Marques posées chez lui</span>
                  <p className="sg-card-meta">en cabines, d&apos;après les chantiers de l&apos;app</p>
                </div>
              </div>
              <div className="sg-cab-liste">
                {marques.map((m) => (
                  <div key={m.nom} className="sg-cab-l">
                    <span className="sg-cab-nom">{m.nom}</span>
                    <span className="sg-cab-barre">
                      <i style={{ width: `${Math.max(2, (m.n / Math.max(1, marques[0].n)) * 100)}%` }} />
                    </span>
                    <span className="sg-cab-val">{m.n}<em>cabines</em></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sg-card">
            <div className="sg-card-head">
              <div>
                <span className="sg-card-title">Chantiers</span>
                <p className="sg-card-meta">du plus récent au plus ancien · cliquez pour ouvrir</p>
              </div>
            </div>
            <div className="sg-plist">
              {d.chantiers.slice(0, 60).map((c) => (
                <div key={c.id} className="sg-plist-row group">
                  <Link href={`/projet/${c.id}?mode=ca-bexio`} className="sg-plist-link">
                    <span className="sg-plist-tm sg-refs">
                      {(c.ofrTM || "—").split(/[\n,;]+/).map((n, k) => <i key={k}>{n.trim()}</i>)}
                    </span>
                    <span className="sg-plist-main">
                      <span className="sg-plist-name">{c.projet}</span>
                      <span className="sg-plist-sub">{c.adresseChantier || "—"}</span>
                    </span>
                    <span className="sg-plist-state">{c.etatCMD || "—"}</span>
                    <span className="sg-plist-date">{(c.dateMontage || "").slice(0, 10) || "—"}</span>
                    <span className="sg-plist-cab">{c.nbCabines || "—"}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="sg-card">
            <div className="sg-card-head">
              <div>
                <span className="sg-card-title">Factures</span>
                <p className="sg-card-meta">{d.nbFactures} au total · les soixante dernières</p>
              </div>
            </div>
            <div className="sg-cab-liste">
              {d.factures.slice(0, 60).map((f) => (
                <div key={f.nr + f.date} className="sg-cab-l">
                  <span className="sg-cab-nom" title={f.titre}>
                    <b className="sg-ca-nr">n° {f.nr}</b> {f.titre}
                  </span>
                  <span className="sg-cab-nom sg-ca-date">{jour(f.date)}</span>
                  <span className="sg-cab-val">
                    CHF {francs2(f.total)}
                    {f.restant > 0 && <em className="sg-ca-du">reste {francs2(f.restant)}</em>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── La page ───────────────────────────────────────────────────────────── */

type ModePeriode = "tout" | "annee" | "mois" | "r12" | "periode";

export function CaBexioView() {
  const maintenant = new Date();
  const [modeP, setModeP] = useState<ModePeriode>("annee");
  const [annee, setAnnee] = useState(String(maintenant.getFullYear()));
  const [mois, setMois] = useState(`${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`);
  const [de, setDe] = useState("");
  const [a, setA] = useState("");
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [clientSel, setClientSel] = useState<number | null>(null);

  /** Bornes de la fenêtre demandée, selon le mode choisi. */
  const fenetre = useMemo(() => {
    const p2 = (n: number) => String(n).padStart(2, "0");
    if (modeP === "tout") return { de: "", a: "" };
    if (modeP === "annee") return { de: `${annee}-01-01`, a: `${annee}-12-31` };
    if (modeP === "mois") {
      const [y, m] = mois.split("-").map(Number);
      const fin = new Date(y, m, 0).getDate();
      return { de: `${mois}-01`, a: `${mois}-${p2(fin)}` };
    }
    if (modeP === "r12") {
      const fin = new Date(maintenant);
      const debut = new Date(maintenant);
      debut.setMonth(debut.getMonth() - 11);
      return {
        de: `${debut.getFullYear()}-${p2(debut.getMonth() + 1)}-01`,
        a: `${fin.getFullYear()}-${p2(fin.getMonth() + 1)}-${p2(new Date(fin.getFullYear(), fin.getMonth() + 1, 0).getDate())}`,
      };
    }
    return { de, a };
  }, [modeP, annee, mois, de, a]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setChargement(true);
    setErreur("");
    const q = new URLSearchParams();
    if (fenetre.de) q.set("de", fenetre.de);
    if (fenetre.a) q.set("a", fenetre.a);
    fetch(`/api/bexio/ca?${q}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Ces informations ne vous sont pas accessibles.");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Lecture impossible");
        return j as Donnees;
      })
      .then(setD)
      .catch((e) => setErreur((e as Error).message))
      .finally(() => setChargement(false));
  }, [fenetre.de, fenetre.a]);

  if (clientSel !== null) {
    return <FicheDuClient id={clientSel} onRetour={() => setClientSel(null)} />;
  }

  const parClientCliquable = (d?.clients || []).map((c) => ({ nom: c.nom, total: c.total, nb: c.nb }));
  const idParNom = new Map((d?.clients || []).map((c) => [c.nom, c.id]));

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
        {chargement && <RefreshCw className="w-4 h-4 animate-spin" />}
      </div>

      {/* Filtre de période — mêmes choix que partout ailleurs dans l'app. */}
      <div className="sg-ca-filtre">
        <div className="sg-fact-onglets">
          {([["tout", "Tout"], ["mois", "Mois"], ["annee", "Année"], ["r12", "12 mois"], ["periode", "Période"]] as const)
            .map(([k, l]) => (
              <button key={k} type="button" className={`sg-fact-ong${modeP === k ? " is-on" : ""}`}
                onClick={() => setModeP(k)}>{l}</button>
            ))}
        </div>
        {modeP === "annee" && (
          <div className="sg-fact-onglets">
            {(d?.annees || []).map((an) => (
              <button key={an} type="button" className={`sg-fact-ong${annee === an ? " is-on" : ""}`}
                onClick={() => setAnnee(an)}>{an}</button>
            ))}
          </div>
        )}
        {modeP === "mois" && (
          <input type="month" className="sg-ca-date" value={mois} onChange={(e) => setMois(e.target.value)} />
        )}
        {modeP === "periode" && (
          <span className="sg-ca-plage">
            <input type="date" className="sg-ca-date" value={de} onChange={(e) => setDe(e.target.value)} />
            <em>au</em>
            <input type="date" className="sg-ca-date" value={a} onChange={(e) => setA(e.target.value)} />
          </span>
        )}
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
              <i>sur la période affichée</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facture moyenne</span>
              <b>CHF {francs(d.factures ? d.total / d.factures : 0)}</b>
              <i>{d.clientsActifs} client{d.clientsActifs > 1 ? "s" : ""} facturé{d.clientsActifs > 1 ? "s" : ""}</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Offres émises</span>
              <b>CHF {francs(d.totalOffres)}</b>
              <i>{d.offres} offre{d.offres > 1 ? "s" : ""} sur la période</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Dépenses fournisseurs</span>
              <b>CHF {francs(d.depenses.total)}</b>
              <i>{d.depenses.nb} facture{d.depenses.nb > 1 ? "s" : ""} reçue{d.depenses.nb > 1 ? "s" : ""}</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Marge brute</span>
              <b>CHF {francs(d.depenses.marge)}</b>
              <i>{d.depenses.margePct !== null ? `${d.depenses.margePct} % du facturé` : "—"} · hors salaires et charges fixes</i>
            </div>
            <div className={`sg-fact-kpi${d.depenses.enRetard.nb > 0 ? " is-alerte" : ""}`}>
              <span className="sg-fact-kpi-l">Dû aux fournisseurs</span>
              <b>CHF {francs(d.depenses.du)}</b>
              <i>
                {d.depenses.duNb} facture{d.depenses.duNb > 1 ? "s" : ""} ouverte{d.depenses.duNb > 1 ? "s" : ""}
                {d.depenses.enRetard.nb > 0 && ` · ${d.depenses.enRetard.nb} en retard`}
              </i>
            </div>
            {d.transformation !== null && (
              <div className="sg-fact-kpi">
                <span className="sg-fact-kpi-l">Facturé / offert</span>
                <b>{d.transformation} %</b>
                <i>au-delà de 100 %, on facture des offres plus anciennes</i>
              </div>
            )}
          </div>

          <Tendance mois={d.parMois} />

          {/* L'argent qui dort. L'âge compte autant que le montant : une
              facture de la semaine n'appelle pas la même action qu'une
              facture ouverte depuis trois mois. */}
          {d.impayes.lignes.length > 0 && (
            <div className="sg-card">
              <div className="sg-card-head">
                <div>
                  <span className="sg-card-title">Impayés par ancienneté</span>
                  <p className="sg-card-meta">
                    toutes périodes confondues · CHF {francs(d.impayes.total)} ouverts sur {d.impayes.lignes.length} factures
                  </p>
                </div>
              </div>
              <div className="sg-ca-ages">
                {d.impayes.parAge.map((t) => (
                  <div key={t.nom} className={`sg-ca-age${t.nom === "90+" && t.total > 0 ? " is-alerte" : ""}`}>
                    <span>{t.nom === "90+" ? "plus de 90 j" : `${t.nom} jours`}</span>
                    <b>CHF {francs(t.total)}</b>
                    <i>{t.nb} facture{t.nb > 1 ? "s" : ""}</i>
                  </div>
                ))}
              </div>
              <div className="sg-cab-liste">
                {d.impayes.lignes.slice(0, 40).map((f) => (
                  <div key={f.nr + f.date} className={`sg-cab-l${f.jours > 90 ? " is-vieux" : ""}`}>
                    <span className="sg-cab-nom" title={f.titre}>
                      <b className="sg-ca-nr">n° {f.nr}</b> {f.client} — {f.titre}
                    </span>
                    <span className="sg-cab-nom sg-ca-date">
                      {jour(f.date)} · <b>{f.jours} j</b>
                    </span>
                    <span className="sg-cab-val">
                      CHF {francs2(f.restant)}
                      {f.chantier && (
                        <em>
                          <Link href={`/projet/${f.chantier}?mode=ca-bexio`} className="sg-ca-lien">
                            {(f.ofrTM || "chantier").split(/[\n,;]+/)[0]} <ExternalLink className="w-3 h-3" />
                          </Link>
                        </em>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Barres titre="Par client" sous="cliquez un client pour ouvrir sa fiche complète"
            lignes={parClientCliquable}
            onPick={(nom) => { const id = idParNom.get(nom); if (id !== undefined) setClientSel(id); }} />

          <Barres titre="Par fournisseur"
            sous="reconstitué en remontant de la facture à l'offre, puis au chantier et à ses marques"
            lignes={d.parFournisseur} />

          <Barres titre="Par série de cabine"
            sous="même chemin que les marques · les vingt-cinq premières"
            lignes={d.parSerie} />

          <Barres titre="Dépenses par fournisseur"
            sous="factures reçues sur la période · TTC, comme le chiffre d'affaires"
            lignes={d.depenses.parFournisseur} />

          <Barres titre="Dépenses par poste comptable"
            sous="d'après le compte imputé dans bexio — c'est là qu'une économie se repère"
            lignes={d.depenses.parCompte} />

          {d.depenses.lignes.length > 0 && (
            <div className="sg-card">
              <div className="sg-card-head">
                <div>
                  <span className="sg-card-title">Les plus grosses dépenses</span>
                  <p className="sg-card-meta">
                    soixante premières de la période · une dépense se négocie mieux quand on la voit
                  </p>
                </div>
              </div>
              <div className="sg-cab-liste">
                {d.depenses.lignes.map((b) => (
                  <div key={b.no + b.date + b.ttc} className={`sg-cab-l${b.enRetard ? " is-vieux" : ""}`}>
                    <span className="sg-cab-nom" title={`${b.titre}${b.compte ? ` — ${b.compte}` : ""}`}>
                      <b className="sg-ca-nr">{b.fournisseur}</b> {b.titre}
                    </span>
                    <span className="sg-cab-nom sg-ca-date">
                      {jour(b.date)}{b.compte ? ` · ${b.compte}` : ""}
                    </span>
                    <span className="sg-cab-val">
                      CHF {francs2(b.ttc)}
                      {b.du > 0 && <em className="sg-ca-du">dû {francs2(b.du)}</em>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d.nonRattache.nb > 0 && (
            <p className="sg-fact-note">
              <b>{d.nonRattache.nb} facture{d.nonRattache.nb > 1 ? "s" : ""}</b> (CHF {francs(d.nonRattache.total)})
              ne se rattache à aucun chantier de l&apos;app : facture groupée, prestation hors chantier, ou titre
              trop éloigné de celui de l&apos;offre. Elle compte dans le total et par client, mais figure en
              « Non rattaché » côté fournisseur et série — mieux vaut un trou visible qu&apos;une répartition inventée.
            </p>
          )}
        </>
      )}
      {chargement && !d && <p className="sg-fact-vide">Lecture des factures…</p>}
    </div>
  );
}
