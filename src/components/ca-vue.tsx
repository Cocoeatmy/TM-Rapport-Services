"use client";

/**
 * Chiffre d'affaires — onglet de la page Indicateurs financiers.
 *
 * Il vit ici plutôt que dans une page à lui : les indicateurs financiers
 * posaient déjà les mêmes questions, en attendant des chiffres qu'on n'avait
 * pas. Les voici.
 *
 * Une distinction gouverne tout l'écran : TM vend du SERVICE — le client
 * achète sa cabine, TM la pose — et parfois du CLÉ EN MAIN, marchandise
 * comprise. Les additionner dans un prix moyen donnerait un chiffre qui ne
 * décrit ni l'un ni l'autre. Le prix par cabine ne porte donc QUE sur le
 * service ; le clé en main est compté, mais à part.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, TrendingUp, Package, Wrench } from "lucide-react";

interface LigneCA {
  cle: string;
  total: number;
  service: number;
  cleEnMain: number;
  projets: number;
  cabines: number;
  parCabine: number | null;
}

interface CA {
  projets: number;
  chiffres: number;
  sansMontant: number;
  total: number;
  service: number;
  cleEnMain: number;
  cabines: number;
  medianeParCabine: number | null;
  parMois: { mois: string; total: number; service: number; cleEnMain: number }[];
  parClient: LigneCA[];
  parFournisseur: LigneCA[];
  parRegion: LigneCA[];
}

const chf = (n: number) => `${Math.round(n).toLocaleString("fr-CH")} .-`;
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function moisLisible(m: string): string {
  const [a, mo] = m.split("-").map(Number);
  return `${MOIS_COURT[mo - 1]} ${String(a).slice(2)}`;
}

/** Une année, ou toutes. Le filtre porte sur la date de montage. */
function bornes(annee: string): { de?: string; a?: string } {
  return annee === "tout" ? {} : { de: `${annee}-01-01`, a: `${annee}-12-31` };
}

export function CaVue() {
  const [ca, setCa] = useState<CA | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annee, setAnnee] = useState("tout");
  const [axe, setAxe] = useState<"parClient" | "parFournisseur" | "parRegion">("parClient");

  useEffect(() => {
    let vivant = true;
    setCa(null);
    setErreur(null);
    const { de, a } = bornes(annee);
    const q = new URLSearchParams();
    if (de) q.set("de", de);
    if (a) q.set("a", a);
    fetch(`/api/stats/ca?${q}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error("réservé");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (vivant) setCa(d); })
      .catch((e) => { if (vivant) setErreur(String(e.message || e)); });
    return () => { vivant = false; };
  }, [annee]);

  /** Années présentes dans les données, pour ne proposer que du réel. */
  const [annees, setAnnees] = useState<string[]>([]);
  useEffect(() => {
    if (!ca || annee !== "tout") return;
    setAnnees([...new Set(ca.parMois.map((m) => m.mois.slice(0, 4)))].sort().reverse());
  }, [ca, annee]);

  const max = useMemo(() => Math.max(1, ...(ca?.parMois || []).map((m) => m.total)), [ca]);

  if (erreur === "réservé") {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-start gap-3">
        <Lock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Réservé au propriétaire</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Le chiffre d&apos;affaires n&apos;est accessible qu&apos;à un seul compte, pas à tous
            les administrateurs.
          </p>
        </div>
      </div>
    );
  }
  if (erreur) return <p className="text-sm text-rose-600 py-6">Chargement impossible — {erreur}</p>;
  if (!ca) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-400 py-10">
        <Loader2 className="w-4 h-4 animate-spin" /> Calcul du chiffre d&apos;affaires…
      </p>
    );
  }

  const lignes = ca[axe];

  return (
    <div className="space-y-4">
      {/* Période */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Année</span>
        {[{ k: "tout", l: "Tout" }, ...annees.map((a) => ({ k: a, l: a }))].map((x) => (
          <button key={x.k} onClick={() => setAnnee(x.k)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              annee === x.k ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
            }`}>{x.l}</button>
        ))}
      </div>

      {/* Les trois chiffres qui comptent */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Chiffre d&apos;affaires
          </p>
          <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-200 mt-1">{chf(ca.total)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {ca.chiffres} montages terminés · {ca.cabines} cabines
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Wrench className="w-3 h-3" /> Service
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{chf(ca.service)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {ca.total > 0 ? Math.round((ca.service / ca.total) * 100) : 0} % du total — la pose seule
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Package className="w-3 h-3" /> Clé en main
          </p>
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-300 mt-1">{chf(ca.cleEnMain)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">marchandise fournie par TM, comprise</p>
        </div>
      </div>

      {/* Prix d'une cabine posée */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Prix d&apos;une cabine posée</p>
          <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-200">
            {ca.medianeParCabine !== null ? chf(ca.medianeParCabine) : "—"}
          </p>
          <span className="text-[11px] text-gray-400">médiane, service seul</span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
          Une MÉDIANE, pas une moyenne : un chantier de vingt cabines écraserait tous les
          petits. Et le <b>service seul</b> — un clé en main comprend le prix d&apos;une cabine,
          qui n&apos;est pas une prestation mais un achat revendu. Les mélanger donnerait un
          chiffre qui ne décrit ni l&apos;un ni l&apos;autre.
        </p>
      </div>

      {/* Par mois */}
      {ca.parMois.length > 1 && (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Par mois de montage</p>
          <div className="flex items-end gap-1 h-36">
            {ca.parMois.map((m) => (
              <div key={m.mois} className="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
                title={`${moisLisible(m.mois)} — ${chf(m.total)}${m.cleEnMain > 0 ? ` (dont ${chf(m.cleEnMain)} clé en main)` : ""}`}>
                {m.cleEnMain > 0 && (
                  <div className="bg-violet-400 rounded-t" style={{ height: `${(m.cleEnMain / max) * 100}%` }} />
                )}
                <div className={`bg-emerald-500 ${m.cleEnMain > 0 ? "" : "rounded-t"}`}
                  style={{ height: `${(m.service / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> service</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-violet-400 inline-block" /> clé en main</span>
            <span className="ml-auto">{moisLisible(ca.parMois[0].mois)} → {moisLisible(ca.parMois[ca.parMois.length - 1].mois)}</span>
          </div>
        </div>
      )}

      {/* Répartition */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">Qui rapporte quoi</p>
          {([["parClient", "Client facturé"], ["parFournisseur", "Fournisseur"], ["parRegion", "Région"]] as const)
            .map(([k, l]) => (
              <button key={k} onClick={() => setAxe(k)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  axe === k ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
                }`}>{l}</button>
            ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 text-left">
                <th className="py-1.5 font-medium">{axe === "parRegion" ? "Région" : axe === "parFournisseur" ? "Fournisseur" : "Client"}</th>
                <th className="py-1.5 font-medium text-right">CA</th>
                <th className="py-1.5 font-medium text-right">Projets</th>
                <th className="py-1.5 font-medium text-right">Cabines</th>
                <th className="py-1.5 font-medium text-right">CHF / cabine</th>
              </tr>
            </thead>
            <tbody>
              {lignes.slice(0, 25).map((l) => (
                <tr key={l.cle} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 pr-2">
                    <span className="font-medium text-gray-800 dark:text-gray-100">{l.cle}</span>
                    {l.cleEnMain > 0 && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                        dont {chf(l.cleEnMain)} clé en main
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{chf(l.total)}</td>
                  <td className="py-2 text-right text-gray-400 tabular-nums">{l.projets}</td>
                  <td className="py-2 text-right text-gray-400 tabular-nums">{l.cabines}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {l.parCabine !== null ? chf(l.parCabine) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
          Le <b>client facturé</b> est celui que désigne « Type de client » dans Notion, et non
          le sanitaire inscrit à côté : on n&apos;a jamais travaillé en direct pour MMT, ces
          chantiers étaient payés par Duka. Le prix par cabine reste vide au-dessous de trois
          chantiers — il ne se comparerait à rien.
          {ca.sansMontant > 0 && (
            <> {" "}<b>{ca.sansMontant} montages terminés n&apos;ont pas de montant</b> : le total
            est donc inférieur à la réalité.</>
          )}
        </p>
      </div>
    </div>
  );
}
