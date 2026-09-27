"use client";

/**
 * « Journée prête hors ligne » — l'état du travail sans réseau.
 *
 * Un monteur passe sa journée dans des sous-sols sans couverture. Tout est
 * prévu pour cela : les fiches sont pré-téléchargées le matin, les heures et
 * les photos saisies hors réseau partent en file d'attente et s'envoient au
 * retour. Mais rien ne le DISAIT : impossible de vérifier, avant de partir,
 * que la journée était bien chargée — or c'est le seul moment où l'on peut
 * encore y remédier, tant qu'on a du réseau.
 *
 * Ce bloc répond à trois questions, dans l'ordre où elles se posent : mes
 * chantiers sont-ils téléchargés, quand l'ont-ils été, et reste-t-il quelque
 * chose à envoyer.
 */

import { useCallback, useEffect, useState } from "react";
import { CloudOff, CloudCheck, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { lireEtat, prefetchTodaysProjects } from "@/lib/offline-prefetch";
import { countPendingUploads, countPermanentlyFailed } from "@/lib/idb-uploads";
import { getQueue } from "@/lib/offline";
import type { Project } from "@/lib/notion";

function quandLisible(t: number): string {
  if (!t) return "jamais";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(t).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

export function PreteHorsLigne({ projets, nom }: { projets: Project[]; nom: string }) {
  const [etat, setEtat] = useState(() => lireEtat());
  const [enAttente, setEnAttente] = useState(0);
  const [bloques, setBloques] = useState(0);
  const [travaille, setTravaille] = useState(false);

  const relire = useCallback(async () => {
    setEtat(lireEtat());
    try {
      setEnAttente(getQueue().length + (await countPendingUploads()));
      setBloques(await countPermanentlyFailed());
    } catch { /* stockage indisponible : on n'affiche simplement rien */ }
  }, []);

  useEffect(() => {
    relire();
    const evts = [
      "tm-offline-ready", "tm-pending-upload-added", "tm-pending-upload-removed",
      "tm-offline-queued", "online",
    ];
    evts.forEach((e) => window.addEventListener(e, relire));
    return () => evts.forEach((e) => window.removeEventListener(e, relire));
  }, [relire]);

  const preparer = async () => {
    setTravaille(true);
    try {
      await prefetchTodaysProjects(projets, nom, true);
    } finally {
      await relire();
      setTravaille(false);
    }
  };

  const pret = etat.projets > 0;
  const vieux = etat.quand > 0 && Date.now() - etat.quand > 12 * 3600_000;

  return (
    <div className={`sgo${pret && !vieux ? " is-pret" : ""}`}>
      <span className="sgo-chip">
        {pret && !vieux ? <CloudCheck className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
      </span>
      <span className="sgo-txt">
        <b>
          {pret
            ? `${etat.projets} chantier${etat.projets > 1 ? "s" : ""} disponible${etat.projets > 1 ? "s" : ""} hors réseau`
            : "Aucun chantier téléchargé"}
        </b>
        <em>
          {pret
            ? `préparé ${quandLisible(etat.quand)}${vieux ? " — à rafraîchir avant de partir" : ""}`
            : "touchez « Préparer » pendant que vous avez du réseau"}
          {enAttente > 0 && ` · ${enAttente} envoi${enAttente > 1 ? "s" : ""} en attente`}
        </em>
      </span>
      {bloques > 0 && (
        <span className="sgo-bloque" title="Envois qui n'aboutissent pas — à vérifier">
          <AlertTriangle className="w-3.5 h-3.5" /> {bloques}
        </span>
      )}
      <button type="button" className="sgo-btn" onClick={preparer} disabled={travaille}>
        {travaille ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Préparer
      </button>
    </div>
  );
}
