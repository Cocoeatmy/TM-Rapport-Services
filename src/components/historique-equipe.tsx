"use client";

/**
 * « Équipe » de la fiche projet (23.10.2026) : qui a travaillé sur le
 * chantier et quand, qui est prévu, les SAV (prévus, ouverts, clôturés) et
 * qui a signalé quoi — tout au même endroit. Voir lib/historique-equipe.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Hammer, Loader2, Ruler, ShieldAlert, Users, Wrench } from "lucide-react";
import { historiqueDuChantier, intervenants, type Evenement, type SignalementHisto, type SourceHistorique } from "@/lib/historique-equipe";
import { RondsEquipe } from "@/components/ronds-equipe";

const ICONES: Record<Evenement["genre"], typeof Hammer> = {
  mesures: Ruler, demontage: Wrench, montage: Hammer, sav: ShieldAlert, signalement: AlertTriangle,
};
const TEINTE: Record<Evenement["genre"], string> = {
  mesures: "text-teal-600 bg-teal-50 dark:bg-teal-900/30",
  demontage: "text-slate-600 bg-slate-100 dark:bg-slate-800",
  montage: "text-blue-600 bg-blue-50 dark:bg-blue-900/30",
  sav: "text-amber-600 bg-amber-50 dark:bg-amber-900/30",
  signalement: "text-rose-600 bg-rose-50 dark:bg-rose-900/30",
};
const STATUT: Record<Evenement["statut"], { lib: string; cls: string }> = {
  fait: { lib: "Fait", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  prevu: { lib: "Prévu", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  cloture: { lib: "Clôturé", cls: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300" },
  ouvert: { lib: "Ouvert", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};
const date = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Sans date");

export function HistoriqueEquipe({ projectId, projet }: { projectId: string; projet: SourceHistorique }) {
  const [signalements, setSignalements] = useState<SignalementHisto[] | null>(null);

  useEffect(() => {
    let vivant = true;
    const q = `?projectId=${encodeURIComponent(projectId)}`;
    Promise.all([
      fetch(`/api/defauts${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/pieces${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([d, p]) => {
      if (!vivant) return;
      const pieces = (Array.isArray(p) ? p : []).map((x: SignalementHisto) => ({ ...x, typesLabel: "Pièce manquante" }));
      setSignalements([...(Array.isArray(d) ? d : []), ...pieces]);
    });
    return () => { vivant = false; };
  }, [projectId]);

  const ev = useMemo(() => historiqueDuChantier(projet, signalements || []), [projet, signalements]);
  const qui = useMemo(() => intervenants(ev), [ev]);

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-4 sm:p-5 space-y-4">
      <header className="flex items-center gap-2">
        <Users className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-[15px]">Équipe & historique</h2>
        {signalements === null && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </header>

      {qui.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Ont travaillé sur ce chantier</p>
          <div className="flex flex-wrap gap-2">
            {qui.map((q) => (
              <span key={q.nom} className="inline-flex items-center gap-2 rounded-full bg-gray-50 dark:bg-slate-800 pl-1 pr-3 py-1 text-[13px]">
                <RondsEquipe noms={[q.nom]} taille={24} />
                <b className="font-semibold">{q.nom}</b>
                <span className="text-gray-500">{q.fois} fois · dernier le {date(q.dernier)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {ev.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune intervention, aucun SAV ni signalement enregistré pour l&apos;instant.</p>
      ) : (
        <ol className="space-y-1.5">
          {ev.map((e, i) => {
            const I = ICONES[e.genre];
            const st = STATUT[e.statut];
            return (
              <li key={i} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${e.statut === "prevu" ? "bg-blue-50/50 dark:bg-blue-950/20" : "bg-gray-50/70 dark:bg-slate-800/50"}`}>
                <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TEINTE[e.genre]}`}><I className="w-4 h-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                    <span className="font-semibold text-[13.5px]">{e.titre}</span>
                    <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.lib}</span>
                  </div>
                  {e.detail && <p className="text-[12.5px] text-gray-500 mt-0.5 break-words">{e.detail}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[12px] font-mono text-gray-500 inline-flex items-center gap-1">
                    {e.statut === "prevu" ? <CalendarClock className="w-3 h-3" /> : e.statut === "cloture" ? <CheckCircle2 className="w-3 h-3" /> : null}
                    {date(e.quand)}
                  </span>
                  {e.noms.length > 0
                    ? <span className="inline-flex items-center gap-1.5"><RondsEquipe noms={e.noms} taille={20} /><span className="text-[12px] text-gray-600 dark:text-gray-300 max-w-[180px] truncate">{e.noms.join(" & ")}</span></span>
                    : <span className="text-[12px] text-gray-400">—</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
