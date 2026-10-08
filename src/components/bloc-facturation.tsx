"use client";

/**
 * Facturation du chantier, sur sa fiche.
 *
 * Invisible pour tout le monde sauf le propriétaire des accès bexio : la
 * route répond 403 aux autres et le bloc ne se dessine pas. Un monteur qui
 * ouvre la même fiche ne voit ni prix, ni facture, ni l'emplacement vide
 * d'un bloc qu'on lui cacherait.
 */

import { useEffect, useState } from "react";

interface Etat {
  etat: "facturee" | "retrouvee" | "probable" | "mensuel" | "sans" | "inconnue" | "regle";
  reglage: { motif: string; libelle: string; detail: string } | null;
  offre: { nr: string; total: number; date: string } | null;
  factures: { nr: string; total: number; restant: number; date: string }[];
  facture: number;
  restant: number;
}

const FRANCS = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const francs = (n: number) => FRANCS.format(n || 0);

const MOT: Record<Etat["etat"], string> = {
  facturee: "Facturé",
  retrouvee: "Facturé",
  probable: "Facture probable",
  mensuel: "Forfait mensuel",
  sans: "Aucune facture",
  inconnue: "Hors bexio",
  regle: "Réglé",
};

export function BlocFacturation({ projectId, ofrTM }: { projectId: string; ofrTM?: string | null }) {
  const [d, setD] = useState<Etat | null>(null);

  useEffect(() => {
    if (!ofrTM) return;
    let vivant = true;
    fetch(`/api/bexio/projet?ofr=${encodeURIComponent(ofrTM)}&id=${encodeURIComponent(projectId)}`,
      { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivant && j && !j.error) setD(j as Etat); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [projectId, ofrTM]);

  // Pas d'accès, pas de numéro, ou rien à dire : le bloc n'existe pas.
  if (!d || d.etat === "inconnue") return null;

  const alerte = d.etat === "sans";
  const impaye = d.restant > 0;

  return (
    <div className={`sg-bfact${alerte ? " is-alerte" : ""}`}>
      <span className="sg-bfact-t">Facturation</span>
      <div className="sg-bfact-l">
        {d.offre && (
          <span className="sg-bfact-c">
            <i>Offre {d.offre.nr}</i>
            <b>CHF {francs(d.offre.total)}</b>
          </span>
        )}
        <span className="sg-bfact-c">
          <i>{MOT[d.etat]}</i>
          <b className={alerte ? "is-alerte" : impaye ? "is-attente" : "is-ok"}>
            {d.factures.length > 0
              ? d.factures.map((f) => `n° ${f.nr}`).join(" · ")
              : d.reglage
                ? d.reglage.libelle + (d.reglage.detail ? ` — ${d.reglage.detail}` : "")
                : d.etat === "mensuel" ? "facture globale du mois" : "—"}
          </b>
        </span>
        {d.factures.length > 0 && (
          <span className="sg-bfact-c">
            <i>{impaye ? "Reste à encaisser" : "Encaissé"}</i>
            <b className={impaye ? "is-attente" : "is-ok"}>
              CHF {francs(impaye ? d.restant : d.facture)}
            </b>
          </span>
        )}
      </div>
    </div>
  );
}
