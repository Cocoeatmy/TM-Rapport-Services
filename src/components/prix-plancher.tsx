"use client";

/**
 * Le prix plancher à l'écran (24.10.2026) — PROPRIÉTAIRE SEUL.
 *
 *   - CalculateurPrixPlancher : dans Finances, série + cabines + adresse ;
 *   - PrixPlancherProjet       : sur la fiche, face à l'offre bexio ;
 *   - BadgePlancher            : sur « Devis en attente », par offre.
 *
 * Chaque chiffre est détaillé (pose, route, véhicule, achats, marge) et la
 * fiabilité est dite : sur combien de chantiers, et à quel niveau de
 * comparaison (série, fournisseur, ou tous). Ce qui manque est affiché.
 */

import { useEffect, useState } from "react";
import { Calculator, Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { PrixPlancher } from "@/lib/prix-plancher";

const chf = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")} CHF`;
const BASE: Record<string, string> = {
  serie: "chantiers de la même série",
  fournisseur: "chantiers du même fournisseur",
  tous: "tous les chantiers (trop peu de comparables)",
};

export interface Options {
  series: { nom: string; n: number }[];
  fournisseurs: { nom: string; n: number }[];
  serieFournisseur: Record<string, string>;
}

export function useOptionsPlancher(): Options | null {
  const [o, setO] = useState<Options | null>(null);
  useEffect(() => {
    fetch("/api/prix-plancher?options=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null)).then(setO).catch(() => {});
  }, []);
  return o;
}

function Detail({ r, offreHT }: { r: PrixPlancher; offreHT?: number | null }) {
  const d = r.detail;
  const lignes: [string, string, number][] = [
    ["Pose", `${d.heuresPose} h-homme`, d.coutPose],
    ["Route", `${d.passages} passage${d.passages > 1 ? "s" : ""} × ${d.personnes} pers. · ${d.heuresRoute} h`, d.coutRoute],
    ["Véhicule", "", d.coutVehicule],
    ["Achats", "cabines, accessoires, consommables", d.achats],
  ];
  const sous = typeof offreHT === "number" && offreHT < r.plancher;
  return (
    <div className="space-y-3" data-prix-plancher={r.plancher}>
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl p-3 ${sous ? "bg-red-50 dark:bg-red-900/20" : "bg-emerald-50 dark:bg-emerald-900/20"}`}>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Prix plancher (HT)</p>
          <p className={`text-xl font-bold tabular-nums ${sous ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{chf(r.plancher)}</p>
          <p className="text-[10px] text-gray-500">coût {chf(r.cout)}{r.margeCible !== null ? ` + marge ${r.margeCible} %` : " · sans marge cible"}</p>
        </div>
        <div className="rounded-xl p-3 bg-white/70 dark:bg-white/5">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Prix habituel (facturé HT)</p>
          {r.habituel ? (
            <>
              <p className="text-xl font-bold tabular-nums text-[#1e3a5f] dark:text-blue-200">{chf(r.habituel.median)}</p>
              <p className="text-[10px] text-gray-500">de {chf(r.habituel.bas)} à {chf(r.habituel.haut)} · {r.habituel.n} chantiers</p>
            </>
          ) : <p className="text-xs text-gray-400 mt-1">pas assez de chantiers facturés comparables</p>}
        </div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {lignes.map(([nom, sousTitre, v]) => (
            <tr key={nom} className="border-b border-gray-100 dark:border-gray-700/50">
              <td className="py-1.5 text-gray-700 dark:text-gray-200">{nom}<span className="block text-[10px] text-gray-400">{sousTitre}</span></td>
              <td className="py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100">{chf(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-500 flex items-start gap-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
        Basé sur {r.fiabilite.chantiers} {BASE[r.fiabilite.base]}{r.fiabilite.chantiers < 5 ? " — à prendre avec prudence" : ""}.
      </p>
      {r.manques.length > 0 && (
        <ul className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
          {r.manques.map((m) => <li key={m} className="flex gap-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{m}</li>)}
        </ul>
      )}
    </div>
  );
}

export function CalculateurPrixPlancher() {
  const options = useOptionsPlancher();
  const [fournisseur, setFournisseur] = useState("");
  const [serie, setSerie] = useState("");
  const [cabines, setCabines] = useState("1");
  const [adresse, setAdresse] = useState("");
  const [r, setR] = useState<PrixPlancher | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [erreur, setErreur] = useState("");

  const lancer = async () => {
    setCalcul(true); setErreur("");
    try {
      const q = new URLSearchParams({ fournisseur, serie, cabines, adresse });
      const res = await fetch(`/api/prix-plancher?${q}`, { credentials: "include" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Calcul impossible");
      setR(d.resultat);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setCalcul(false);
    }
  };
  const seriesFiltrees = (options?.series || []).filter((s) => !fournisseur || options?.serieFournisseur[s.nom] === fournisseur);
  const champ = "h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-3 text-sm";

  return (
    <div className="glass-card rounded-2xl p-5 mb-4" id="prix-plancher">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Calculator className="w-4 h-4" /> Prix plancher d&apos;un chantier
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        avant d&apos;envoyer une offre : le prix sous lequel le chantier ne couvre plus ses coûts et votre marge cible · d&apos;après les chantiers déjà posés
      </p>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <select value={fournisseur} onChange={(e) => { setFournisseur(e.target.value); setSerie(""); }} className={champ} aria-label="Fournisseur">
          <option value="">Fournisseur…</option>
          {(options?.fournisseurs || []).map((f) => <option key={f.nom} value={f.nom}>{f.nom} ({f.n})</option>)}
        </select>
        <select value={serie} onChange={(e) => setSerie(e.target.value)} className={champ} aria-label="Série">
          <option value="">Série (facultatif)…</option>
          {seriesFiltrees.map((s) => <option key={s.nom} value={s.nom}>{s.nom} ({s.n})</option>)}
        </select>
        <input type="number" min={1} inputMode="numeric" value={cabines} onChange={(e) => setCabines(e.target.value)} className={champ} aria-label="Nombre de cabines" placeholder="Cabines" />
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={champ} aria-label="Adresse du chantier" placeholder="Adresse ou NPA localité" />
      </div>
      <button type="button" onClick={lancer} disabled={calcul}
        className="h-10 px-4 rounded-lg bg-[#1e3a5f] hover:bg-[#2a4a73] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 mb-4">
        {calcul ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calculer
      </button>
      {erreur && <p className="text-xs text-red-600 mb-2">{erreur}</p>}
      {r && <Detail r={r} />}
    </div>
  );
}

/** Sur la fiche : le plancher du dossier, face à son offre bexio. */
export function PrixPlancherProjet({ projetId }: { projetId: string }) {
  const [d, setD] = useState<{ resultat: PrixPlancher; offres: { nr: string; ht: number; verdict: string }[] } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/prix-plancher?projet=${encodeURIComponent(projetId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null)).then((x) => { if (vivant && x?.resultat) setD(x); }).catch(() => {});
    return () => { vivant = false; };
  }, [projetId]);
  if (!d) return null;
  const offre = d.offres[0];
  const sous = offre?.verdict === "sous-plancher";
  const basse = offre?.verdict === "sous-habituel";
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2" data-plancher-projet={offre?.verdict || "sans-offre"}>
      <button type="button" onClick={() => setOuvert((v) => !v)} className="w-full flex items-center gap-2 text-left">
        {sous ? <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          : basse ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
        <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">
          {offre
            ? <>Offre {chf(offre.ht)} HT · plancher {chf(d.resultat.plancher)}{sous ? " — en dessous !" : basse ? " — sous le prix habituel" : ""}</>
            : <>Prix plancher : {chf(d.resultat.plancher)} HT</>}
        </span>
        <span className="text-[11px] text-gray-400">{ouvert ? "masquer" : "détail"}</span>
      </button>
      {ouvert && <Detail r={d.resultat} offreHT={offre?.ht} />}
    </div>
  );
}

/** Une pastille par offre, sur « Devis en attente ». */
export function BadgePlancher({ info }: { info?: { plancher: number; verdict: string; offreHT: number } }) {
  if (!info || info.verdict === "ok") return null;
  const sous = info.verdict === "sous-plancher";
  return (
    <em title={`Offre ${chf(info.offreHT)} HT · plancher ${chf(info.plancher)} HT`}
      className={`not-italic text-[9px] font-semibold px-1.5 py-0.5 rounded ${sous
        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
      {sous ? `Sous le plancher (${chf(info.plancher)})` : "Sous le prix habituel"}
    </em>
  );
}
