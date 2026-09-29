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
import { Loader2, Lock, TrendingUp, Package, Wrench, Search, X, ReceiptText } from "lucide-react";

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
  facture: { total: number; nombre: number; parMois: Record<string, number>; parClient: Record<string, number> } | null;
  parMois: { mois: string; total: number; service: number; cleEnMain: number; facture: number }[];
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

/**
 * La fenêtre de temps demandée, en dates ISO.
 *
 * Quatre modes, du plus large au plus précis. La plage libre attend ses deux
 * bornes : tant qu'il en manque une, on ne filtre pas — un intervalle à moitié
 * saisi donnerait un total faux sans prévenir.
 */
type Mode = "tout" | "annee" | "mois" | "plage";
interface Periode { mode: Mode; annee: string; mois: string; de: string; a: string }

function bornes(p: Periode): { de?: string; a?: string } {
  if (p.mode === "annee" && p.annee) return { de: `${p.annee}-01-01`, a: `${p.annee}-12-31` };
  if (p.mode === "mois" && p.mois) {
    const [y, m] = p.mois.split("-").map(Number);
    return { de: `${p.mois}-01`, a: `${p.mois}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
  }
  if (p.mode === "plage" && p.de && p.a) return { de: p.de, a: p.a };
  return {};
}

/** Même réduction que côté serveur : « Nelo » et « Nelo GmbH » se rejoignent. */
function cleClient(nom: string): string {
  return String(nom || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(sa|sarl|ag|gmbh|srl|se|ltd|inc)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function CaVue() {
  const [ca, setCa] = useState<CA | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode>({
    mode: "tout", annee: String(new Date().getFullYear()),
    mois: new Date().toISOString().slice(0, 7), de: "", a: "",
  });
  const [axe, setAxe] = useState<"parClient" | "parFournisseur" | "parRegion">("parClient");
  /** Recherche sur le nom : « nelo » retrouve Nelo et Nelo GmbH. */
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let vivant = true;
    setCa(null);
    setErreur(null);
    const { de, a } = bornes(periode);
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
  }, [periode]);

  /** Années présentes dans les données, pour ne proposer que du réel. */
  const [annees, setAnnees] = useState<string[]>([]);
  useEffect(() => {
    if (!ca || periode.mode !== "tout") return;
    setAnnees([...new Set(ca.parMois.map((m) => m.mois.slice(0, 4)))].sort().reverse());
  }, [ca, periode.mode]);

  /* L'échelle tient compte des deux séries : sinon la barre facturée sort du
     cadre les mois où l'on a facturé plus qu'on n'a posé. */
  const max = useMemo(
    () => Math.max(1, ...(ca?.parMois || []).flatMap((m) => [m.total, m.facture])),
    [ca],
  );

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

  /* Recherche multi-mots, insensible aux accents : « getaz nyon » trouve
     « Gétaz Nyon ». Chaque mot doit être présent, comme ailleurs dans l'app. */
  const q = sansAccents(recherche.trim());
  const mots = q ? q.split(/\s+/) : [];
  const lignes = mots.length === 0
    ? ca[axe]
    : ca[axe].filter((l) => { const n = sansAccents(l.cle); return mots.every((m) => n.includes(m)); });
  const totalFiltre = lignes.reduce((s2, l) => s2 + l.total, 0);

  return (
    <div className="space-y-4">
      {/* Période — quatre modes, du plus large au plus précis */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Période</span>
          {([["tout", "Tout"], ["annee", "Année"], ["mois", "Mois"], ["plage", "Du … au …"]] as const)
            .map(([k, l]) => (
              <button key={k} onClick={() => setPeriode((p) => ({ ...p, mode: k }))}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  periode.mode === k ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
                }`}>{l}</button>
            ))}
        </div>
        {periode.mode === "annee" && (
          <div className="flex flex-wrap gap-1.5">
            {annees.map((a) => (
              <button key={a} onClick={() => setPeriode((p) => ({ ...p, annee: a }))}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  periode.annee === a ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
                }`}>{a}</button>
            ))}
          </div>
        )}
        {periode.mode === "mois" && (
          <input type="month" value={periode.mois}
            onChange={(e) => setPeriode((p) => ({ ...p, mois: e.target.value }))}
            className="text-xs border rounded-lg px-2.5 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200" />
        )}
        {periode.mode === "plage" && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={periode.de}
              onChange={(e) => setPeriode((p) => ({ ...p, de: e.target.value }))}
              className="text-xs border rounded-lg px-2.5 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200" />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={periode.a}
              onChange={(e) => setPeriode((p) => ({ ...p, a: e.target.value }))}
              className="text-xs border rounded-lg px-2.5 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200" />
            {(!periode.de || !periode.a) && (
              <span className="text-[11px] text-amber-600">
                Les deux dates sont nécessaires — sans elles, rien n&apos;est filtré.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Les chiffres qui comptent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        {/* Le facturé ne vient pas de Notion mais des factures elles-mêmes :
            deux sources indépendantes, et c'est ce qui fait sa valeur. */}
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <ReceiptText className="w-3 h-3" /> Facturé
          </p>
          {ca.facture ? (
            <>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{chf(ca.facture.total)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {ca.facture.nombre} factures
                {ca.total > 0 && (
                  <> · {ca.facture.total >= ca.total ? "+" : ""}
                    {Math.round(((ca.facture.total - ca.total) / ca.total) * 100)} % vs offres</>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-300 mt-1">—</p>
              <p className="text-[11px] text-gray-400 mt-0.5">en attente du passage de 6 h</p>
            </>
          )}
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
                {/* Le facturé se lit EN REGARD, pas empilé : il mesure autre
                    chose — ce qui est sorti, quand les barres disent ce qui a
                    été posé. Les décalages sont l'information. */}
                {m.facture > 0 && (
                  <div className="absolute left-0 right-0 border-t-2 border-amber-500"
                    style={{ bottom: `${(m.facture / max) * 100}%` }} />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> service</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-violet-400 inline-block" /> clé en main</span>
            {ca.facture && (
              <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-amber-500 inline-block" /> facturé</span>
            )}
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un nom…"
              className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 pl-8 pr-8 py-2" />
            {recherche && (
              <button type="button" onClick={() => setRecherche("")} aria-label="Effacer"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
          {mots.length > 0 && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {lignes.length} ligne{lignes.length > 1 ? "s" : ""} · {chf(totalFiltre)}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 text-left">
                <th className="py-1.5 font-medium">{axe === "parRegion" ? "Région" : axe === "parFournisseur" ? "Fournisseur" : "Client"}</th>
                <th className="py-1.5 font-medium text-right">Offres</th>
                {axe === "parClient" && ca.facture && (
                  <th className="py-1.5 font-medium text-right">Facturé</th>
                )}
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
                  {axe === "parClient" && ca.facture && (() => {
                    const f = ca.facture!.parClient[cleClient(l.cle)];
                    return (
                      <td className="py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                        {f ? chf(f) : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })()}
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
        {axe === "parClient" && ca.facture && (() => {
          const connus = new Set(ca.parClient.map((l) => cleClient(l.cle)));
          const orphelins = Object.entries(ca.facture.parClient)
            .filter(([k]) => !connus.has(k))
            .reduce((s2, [, v]) => s2 + v, 0);
          return orphelins > 0 ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
              {chf(orphelins)} facturés à des clients qui n&apos;apparaissent dans aucune offre
              de la période — facturation d&apos;un chantier posé plus tôt, ou nom écrit
              autrement sur la facture.
            </p>
          ) : null;
        })()}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
          La colonne <b>Offres</b> vient de Notion et suit la date de MONTAGE ; la colonne
          <b> Facturé</b> vient des factures elles-mêmes et suit leur date d&apos;ÉMISSION. Un
          écart entre les deux n&apos;est pas une erreur : un chantier posé en décembre se
          facture en janvier, et certains se facturent en deux fois.
          {" "}Le <b>client facturé</b> est celui que désigne « Type de client » dans Notion, et non
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
