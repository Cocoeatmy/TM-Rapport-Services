"use client";

/**
 * Page « Devis en attente » — les offres restées sans réponse.
 *
 * Le signal du tableau de bord ouvrait une fiche latérale : bonne pour jeter
 * un œil, inutilisable pour travailler deux cents dossiers. Ici la liste est
 * entière, et surtout rapprochée des dossiers Notion — parce que la question
 * devant une offre sans réponse n'est pas « combien » mais « lesquels
 * relancer », et que la réponse dépend de ce qu'on a déjà fait : un devis
 * dont le relevé de mesures est pris n'est pas un devis envoyé sur plan.
 *
 * Page et non panneau, comme le carnet de commandes : le rapprochement porte
 * sur TOUS les projets, terminés compris, et se calcule côté serveur.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, RefreshCw, Mail, Check, AlertTriangle, Ruler } from "lucide-react";
import { toast } from "sonner";
import {
  correspondMesures, dossierClos, FILTRES_MESURES,
  type FiltreMesures, type LigneDevis,
} from "@/lib/devis-attente";
import {
  correspondAuFiltre, dateSuisse, lienMailto, FILTRES_RELANCE,
  type FiltreRelance, type MailRelance,
} from "@/lib/relance";

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-CH")} CHF`;

/** Teinte de l'âge : à six mois, un devis ne se relance plus, il se range. */
function tonAge(jours: number): string {
  if (jours >= 180) return "text-red-600 dark:text-red-400";
  if (jours >= 60) return "text-orange-600 dark:text-orange-400";
  if (jours >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-gray-500 dark:text-gray-400";
}

export default function DevisAttentePage() {
  const [lignes, setLignes] = useState<LigneDevis[] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fMesures, setFMesures] = useState<FiltreMesures>("");
  const [fRelance, setFRelance] = useState<FiltreRelance>("");
  /* Les dossiers annulés ou terminés chez nous sont MASQUÉS par défaut : ce
     sont des offres que bexio croit vivantes parce que personne ne les y a
     déclinées, et les relancer serait une faute. On peut les montrer — pour
     aller les classer dans bexio, justement. */
  const [montrerClos, setMontrerClos] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    fetch("/api/bexio/devis")
      .then((r) => {
        /* Tout ce qui vient de bexio est réservé au propriétaire des accès.
           Un collaborateur qui tomberait sur l'adresse doit lire une phrase,
           pas un code d'erreur — et ne rien voir des montants. */
        if (r.status === 403) throw new Error("réservé à l'administrateur");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setLignes(Array.isArray(d.lignes) ? d.lignes : []))
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const toutes = lignes || [];
  const clos = useMemo(() => toutes.filter(dossierClos).length, [toutes]);

  /* Les comptes de chaque filtre se calculent sur ce que les AUTRES filtres
     laissent passer : une option qui annoncerait des devis qu'un autre filtre
     masque ne se lirait plus. */
  const base = useMemo(
    () => (montrerClos ? toutes : toutes.filter((l) => !dossierClos(l))),
    [toutes, montrerClos],
  );
  const apresMesures = useMemo(
    () => base.filter((l) => correspondMesures(l, fMesures)),
    [base, fMesures],
  );
  const visibles = useMemo(
    () => apresMesures.filter((l) => correspondAuFiltre(l.relance, fRelance, aujourdhui)),
    [apresMesures, fRelance, aujourdhui],
  );

  const comptesMesures = FILTRES_MESURES.map((f) => ({
    ...f,
    n: base.filter((l) => correspondMesures(l, f.valeur)
      && correspondAuFiltre(l.relance, fRelance, aujourdhui)).length,
  }));
  const comptesRelance = FILTRES_RELANCE.map((f) => ({
    ...f,
    n: apresMesures.filter((l) => correspondAuFiltre(l.relance, f.valeur, aujourdhui)).length,
  }));

  const montant = visibles.reduce((s, l) => s + (l.total || 0), 0);

  const relancer = async (l: LigneDevis) => {
    if (enCours) return;
    if (dossierClos(l) && !window.confirm(
      `Le dossier de ce devis est « ${l.etatCMD} » chez nous.\n\n` +
      `Relancer un client sur un chantier annulé ou terminé se remarque. ` +
      `Préparer le courrier quand même ?`,
    )) return;

    setEnCours(l.nr);
    try {
      const r = await fetch("/api/relance/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nr: l.nr }),
      });
      if (!r.ok) { toast.error("La relance n'a pas pu être préparée."); return; }
      const m = (await r.json()) as MailRelance & { sourceBexio?: boolean };

      const lien = document.createElement("a");
      lien.href = lienMailto(m);
      lien.style.display = "none";
      document.body.appendChild(lien);
      lien.click();
      lien.remove();

      const jour = new Date().toISOString().slice(0, 10);
      setLignes((prev) => (prev || []).map((x) => (x.nr === l.nr
        ? { ...x, relance: { derniere: jour, nombre: x.relance.nombre + 1 } } : x)));

      fetch("/api/relance/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [`devis:${l.nr.toUpperCase()}`], jour, sansNotion: true }),
      }).catch(() => {});

      const details = [
        m.sansDestinataire && "sans destinataire — à compléter à la main",
        m.sourceBexio && "adresse prise sur la fiche bexio",
        m.repli && !m.sourceBexio && "adressé à un contact de repli",
      ].filter(Boolean).join(" · ");
      if (m.sansDestinataire) toast.warning("Relance préparée", { description: details });
      else toast.success("Relance préparée", details ? { description: details } : undefined);
    } catch {
      toast.error("La relance n'a pas pu être préparée.");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#1e3a5f] dark:text-blue-300">
            <FileText className="w-5 h-5" /> Devis en attente
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
            Les offres bexio envoyées et restées sans réponse depuis au moins sept jours,
            rapprochées des dossiers Notion par le numéro d&apos;offre. Les devis confirmés
            ou déclinés n&apos;y sont pas.
          </p>
        </div>
        <button type="button" onClick={charger} disabled={chargement}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-cyan-300 disabled:opacity-50">
          {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualiser
        </button>
      </div>

      {erreur && (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">Chargement impossible — {erreur}</p>
      )}
      {chargement && !lignes && (
        <p className="text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Lecture de bexio et rapprochement…
        </p>
      )}

      {lignes && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select value={fMesures} onChange={(e) => setFMesures(e.target.value as FiltreMesures)}
              className={`text-[11px] px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-700 ${fMesures
                ? "border-cyan-400 text-cyan-700 dark:text-cyan-300 font-semibold"
                : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"}`}>
              {comptesMesures.map((f) => (
                <option key={f.valeur} value={f.valeur}>{f.label} ({f.n})</option>
              ))}
            </select>

            <select value={fRelance} onChange={(e) => setFRelance(e.target.value as FiltreRelance)}
              className={`text-[11px] px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-700 ${fRelance
                ? "border-amber-400 text-amber-700 dark:text-amber-300 font-semibold"
                : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"}`}>
              {comptesRelance.map((f) => (
                <option key={f.valeur} value={f.valeur}>{f.label} ({f.n})</option>
              ))}
            </select>

            {clos > 0 && (
              <button type="button" onClick={() => setMontrerClos((v) => !v)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${montrerClos
                  ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300"}`}
                title="Chantiers annulés ou terminés chez nous, dont l'offre est restée « en attente » dans bexio">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                {montrerClos ? "Masquer" : "Montrer"} les dossiers clos ({clos})
              </button>
            )}

            {(fMesures || fRelance) && (
              <button type="button" onClick={() => { setFMesures(""); setFRelance(""); }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">
                Effacer
              </button>
            )}

            <span className="ml-auto text-xs font-semibold text-amber-700 dark:text-amber-300">
              {visibles.length} devis · {francs(montant)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 px-2 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 pb-1.5">
            <span className="w-20 shrink-0">Envoyé le</span>
            <span className="w-16 shrink-0 text-right">Âge</span>
            <span className="w-24 shrink-0">N° devis</span>
            <span className="flex-1">Objet</span>
            <span className="w-24 shrink-0 text-right">Montant</span>
            <span className="w-44 shrink-0">Relance</span>
          </div>

          <div className="space-y-0.5 mt-1">
            {visibles.map((l, i) => {
              const closDossier = dossierClos(l);
              const relanceLe = dateSuisse(l.relance.derniere);
              const fond = closDossier
                ? "bg-red-50/60 dark:bg-red-950/20"
                : i % 2 === 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : "bg-amber-100/40 dark:bg-amber-900/10";
              return (
                <div key={l.nr} className={`block sm:flex sm:items-center sm:gap-3 px-2 py-1.5 rounded-lg ${fond}`}>
                  <span className="w-20 shrink-0 text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                    {dateSuisse(l.date) || "—"}
                  </span>
                  <span className={`w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums ${tonAge(l.jours)}`}>
                    {l.jours} j
                  </span>
                  <span className="w-24 shrink-0 font-mono text-[10px] text-gray-600 dark:text-gray-300">
                    {l.nr || "—"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
                      {l.projet || l.titre || "—"}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {l.dateMesures ? (
                        <em className="not-italic text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                          <Ruler className="w-2.5 h-2.5 inline mr-0.5" />
                          Relevé du {dateSuisse(l.dateMesures)}
                        </em>
                      ) : l.projetId ? (
                        <em className="not-italic text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                          Pas encore de relevé
                        </em>
                      ) : (
                        <em className="not-italic text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"
                          title="Aucun dossier Notion ne porte ce numéro d'offre">
                          Sans dossier
                        </em>
                      )}
                      {closDossier && (
                        <em className="not-italic text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Dossier {l.etatCMD?.toLowerCase()}
                        </em>
                      )}
                      {l.client && (
                        <em className="not-italic text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1">{l.client}</em>
                      )}
                    </span>
                  </span>
                  <span className="w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                    {francs(l.total || 0)}
                  </span>
                  <span className="w-44 shrink-0 flex items-center gap-1.5">
                    {l.projetId && (
                      <Link href={`/projet/${l.projetId}?mode=dashboard`}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 shrink-0"
                        title="Ouvrir le dossier">Dossier</Link>
                    )}
                    <button type="button" disabled={enCours === l.nr}
                      onClick={() => relancer(l)}
                      title={relanceLe ? "Relancer de nouveau ce devis" : "Préparer le courrier de relance"}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold transition-colors disabled:opacity-50 ${relanceLe
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200"}`}>
                      {enCours === l.nr ? <Loader2 className="w-3 h-3 animate-spin" />
                        : relanceLe ? <Check className="w-3 h-3" strokeWidth={3} /> : <Mail className="w-3 h-3" />}
                      {relanceLe
                        ? `Relancé${l.relance.nombre > 1 ? ` ${l.relance.nombre}×` : ""} — ${relanceLe}`
                        : "Relancer"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          {visibles.length === 0 && !chargement && (
            <p className="text-sm text-gray-400 py-6 text-center">
              Aucun devis ne correspond à ces filtres.
            </p>
          )}
        </>
      )}
    </div>
  );
}
