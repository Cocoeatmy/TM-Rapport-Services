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

interface Part { nom: string; total: number; nb: number }
interface Mois { mois: string; total: number; nb: number }

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

          {d.parMois.length > 0 && (
            <div className="sg-card">
              <div className="sg-card-head">
                <div>
                  <span className="sg-card-title">Par mois</span>
                  <p className="sg-card-meta">
                    date de la facture · {annee === "tout" ? "toutes années" : annee}
                  </p>
                </div>
              </div>
              <div className="sg-ca-mois">
                {d.parMois.map((m) => (
                  <div key={m.mois} className="sg-ca-col" title={`${m.mois} — CHF ${francs2(m.total)} · ${m.nb} facture${m.nb > 1 ? "s" : ""}`}>
                    <span className="sg-ca-val">{francs(m.total)}</span>
                    <span className="sg-ca-barre" style={{ height: `${Math.max(2, (m.total / maxMois) * 100)}%` }} />
                    <span className="sg-ca-mois-nom">{annee === "tout" ? m.mois : nomMois(m.mois)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
