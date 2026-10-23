"use client";

/**
 * Onglet « Paiements » d'Indicateurs financiers (23.10.2026) : combien de
 * temps chaque client met à payer, et ce qu'il doit encore. Propriétaire seul
 * (le serveur refuse tout autre compte). Voir lib/delais-paiement.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { LigneDelaiClient } from "@/lib/delais-paiement";

const chf = (n: number) => `CHF ${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n))}`;

export function DelaisPaiementVue() {
  const [d, setD] = useState<{ lignes: LigneDelaiClient[]; couverture: { payees: number; datees: number }; copieLe: string | null } | null>(null);
  const [erreur, setErreur] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/bexio/delais", { credentials: "include", cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json(); })
      .then(setD)
      .catch((e) => setErreur(e.message || "Indisponible"));
  }, []);

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.lignes || []).filter((l) => !t || l.client.toLowerCase().includes(t));
  }, [d, q]);

  if (erreur) return <p className="text-sm text-red-600 p-4">Délais de paiement indisponibles : {erreur}</p>;
  if (!d) return <p className="text-sm text-gray-500 p-4 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture de bexio…</p>;

  const ton = (j: number | null) => (j === null ? "text-gray-400" : j > 45 ? "text-red-600 font-semibold" : j > 30 ? "text-amber-600 font-semibold" : "text-emerald-700");

  return (
    <div className="space-y-3">
      <div className="glass-card rounded-2xl p-4 space-y-1">
        <h2 className="font-bold text-[15px]">Délais de paiement par client</h2>
        <p className="text-xs text-gray-500">
          Délai = de la date de la facture à son paiement (médiane). « En retard » = payée après l&apos;échéance.
          Dates de paiement connues pour {d.couverture.datees} des {d.couverture.payees} factures payées
          {d.couverture.datees < d.couverture.payees ? " — le reste est complété chaque nuit" : ""}.
        </p>
        <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-3 h-9 max-w-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un client…" className="flex-1 bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div className="glass-card rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
              <th className="px-4 py-2.5">Client</th>
              <th className="px-2 py-2.5 text-right">Factures</th>
              <th className="px-2 py-2.5 text-right">Délai médian</th>
              <th className="px-2 py-2.5 text-right">Payées en retard</th>
              <th className="px-2 py-2.5 text-right">Retard médian</th>
              <th className="px-2 py-2.5 text-right">Encore dû</th>
              <th className="px-2 py-2.5 text-right">Dont échu</th>
              <th className="px-4 py-2.5 text-right">Plus vieil impayé</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.client} className="border-t border-gray-100 dark:border-slate-800">
                <td className="px-4 py-2 font-medium">{l.client}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{l.factures}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${ton(l.delaiMedian)}`}>{l.delaiMedian === null ? "—" : `${l.delaiMedian} j`}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${l.partEnRetard !== null && l.partEnRetard >= 50 ? "text-red-600 font-semibold" : "text-gray-600"}`}>{l.partEnRetard === null ? "—" : `${l.partEnRetard} %`}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{l.retardMedian === null ? "—" : `+${l.retardMedian} j`}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.restant > 0 ? chf(l.restant) : "—"}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${l.echu > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{l.echu > 0 ? chf(l.echu) : "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{l.plusVieuxImpaye === null ? "—" : `${l.plusVieuxImpaye} j`}</td>
              </tr>
            ))}
            {lignes.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Aucun client.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
