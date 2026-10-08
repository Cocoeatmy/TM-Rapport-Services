"use client";

/**
 * Facturation — ce qui a été posé et ce qui a été facturé.
 *
 * Aucun des deux systèmes ne peut répondre seul : Notion ignore la
 * facturation, bexio ignore qu'un chantier a eu lieu. Un montage terminé et
 * jamais facturé n'apparaît donc nulle part — sauf ici.
 *
 * L'écran ne dit pas seulement « facturé ou non » : il dit SUR QUOI il se
 * fonde. Un outil qui envoie relancer un client déjà payé perd sa crédibilité
 * à la première erreur ; les quatre niveaux de certitude sont donc affichés
 * tels quels, et les cas douteux séparés des cas sûrs.
 *
 * Réservé au propriétaire des accès bexio : le serveur refuse la requête à
 * tout autre compte, y compris administrateur.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, ChevronRight, ExternalLink } from "lucide-react";
import { openSignalPreview, survolApercu, annulerSurvol } from "@/components/signal-preview";
import { prefetchProject } from "@/lib/api-helpers";
import type { Project } from "@/lib/notion";

type Etat = "facturee" | "retrouvee" | "probable" | "mensuel" | "sans" | "inconnue" | "regle";

/** Les cas que l'automatisme ne peut pas deviner — tous rencontrés en vrai. */
const MOTIFS: { id: string; label: string; detail?: string }[] = [
  { id: "client-final", label: "Facturé au client final", detail: "Nom du client final (facultatif)" },
  { id: "main-propre", label: "Payé en main propre" },
  { id: "autre-facture", label: "Inclus dans une autre facture", detail: "N° de la facture" },
  { id: "offert", label: "Offert, pas de facture" },
  { id: "autre", label: "Autre", detail: "Précisez" },
];

interface Ligne {
  id: string;
  ofrTM: string;
  projet: string;
  nomChantier?: string;
  adresseChantier: string;
  nbCabines: number;
  dateMontage: string | null;
  collaborateurs: string;
  etatCMD: string;
  etat: Etat;
  reglage: { motif: string; libelle: string; detail: string; par: string; le: string } | null;
  offre: { nr: string; total: number; date: string } | null;
  factures: { nr: string; total: number; restant: number; date: string }[];
  facture: number;
  restant: number;
}

interface Reponse {
  le: string | null;
  offres: number;
  facturesBexio: number;
  compte: Record<Etat, number>;
  aOublier: number;
  lignes: Ligne[];
}

const FRANCS = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const francs = (n: number) => FRANCS.format(n || 0);

const HABILLAGE: Record<Etat, { titre: string; aide: string }> = {
  sans: { titre: "Aucune facture", aide: "Rien ne correspond dans bexio : à vérifier en priorité." },
  probable: { titre: "Probable", aide: "Même client, adresse concordante — à confirmer d'un coup d'œil." },
  retrouvee: { titre: "Retrouvée", aide: "Même client et même montant au centime : quasi certain." },
  mensuel: { titre: "Forfait mensuel", aide: "Ce client est facturé au mois ; le chantier y est noyé." },
  facturee: { titre: "Facturée", aide: "Une facture porte le même titre que l'offre." },
  inconnue: { titre: "Hors bexio", aide: "Aucune offre bexio ne porte ce numéro." },
  regle: { titre: "Réglé", aide: "Cas tranché à la main : refacturé, payé autrement, ou offert." },
};

const ONGLETS: { id: Etat | "tout"; label: string }[] = [
  { id: "sans", label: "Aucune facture" },
  { id: "probable", label: "À confirmer" },
  { id: "retrouvee", label: "Retrouvées" },
  { id: "mensuel", label: "Forfait mensuel" },
  { id: "regle", label: "Réglés" },
  { id: "tout", label: "Tout" },
];

/** Ce que l'aperçu latéral a besoin de savoir en attendant la fiche complète. */
function versProjet(l: Ligne): Project {
  return {
    id: l.id, projet: l.projet, ofrTM: l.ofrTM, adresseChantier: l.adresseChantier,
    nbCabines: l.nbCabines, dateMontage: l.dateMontage, collaborateurs: l.collaborateurs,
    etatCMD: l.etatCMD,
  } as unknown as Project;
}

export function FacturationView() {
  const [data, setData] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState("");
  const [onglet, setOnglet] = useState<Etat | "tout">("sans");
  const [chargement, setChargement] = useState(true);
  /* Boîte « régler » : la ligne visée, le motif choisi, la précision. */
  const [regler, setRegler] = useState<Ligne | null>(null);
  const [motif, setMotif] = useState("client-final");
  const [detail, setDetail] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = (frais = false) => {
    setChargement(true);
    setErreur("");
    fetch(`/api/bexio/facturation${frais ? "?fresh=1" : ""}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Ces informations ne vous sont pas accessibles.");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Lecture impossible");
        return j as Reponse;
      })
      .then(setData)
      .catch((e) => setErreur((e as Error).message))
      .finally(() => setChargement(false));
  };
  useEffect(() => { charger(); }, []);

  const enregistrerReglage = async () => {
    if (!regler) return;
    setEnvoi(true);
    try {
      const r = await fetch("/api/bexio/facturation", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetId: regler.id, motif, detail }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Enregistrement refusé");
      setRegler(null); setDetail(""); setMotif("client-final");
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEnvoi(false); }
  };

  const annulerReglage = async (l: Ligne) => {
    await fetch("/api/bexio/facturation", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projetId: l.id, retirer: true }),
    }).catch(() => {});
    charger();
  };

  const lignes = (data?.lignes || []).filter((l) => onglet === "tout" || l.etat === onglet);

  return (
    <div className="sg-fact">
      <div className="sg-card-head">
        <div>
          <span className="sg-card-title">Facturation</span>
          <p className="sg-card-meta">
            chantiers clôturés dans l&apos;app, confrontés aux factures bexio
            {data?.le && ` · relevé du ${new Date(data.le).toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
            {data && ` · ${data.offres} offres, ${data.facturesBexio} factures`}
          </p>
        </div>
        <button type="button" className="sg-fact-maj" onClick={() => charger(true)} disabled={chargement}
          title="Relire les offres et factures chez bexio">
          <RefreshCw className={`w-4 h-4${chargement ? " animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {erreur && <p className="sg-fact-err">{erreur}</p>}

      {data && (
        <>
          {/* Le chiffre qui justifie la page. */}
          <div className="sg-fact-tete">
            <div className="sg-fact-kpi is-alerte">
              <span className="sg-fact-kpi-l">Aucune facture retrouvée</span>
              <b>{data.compte.sans}</b>
              <i>CHF {francs(data.aOublier)} d&apos;offres concernées</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Facturés, certain</span>
              <b>{data.compte.facturee}</b>
              <i>titre identique à l&apos;offre</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">À confirmer</span>
              <b>{data.compte.probable + data.compte.retrouvee}</b>
              <i>même client, titre différent</i>
            </div>
            <div className="sg-fact-kpi">
              <span className="sg-fact-kpi-l">Au forfait mensuel</span>
              <b>{data.compte.mensuel}</b>
              <i>noyés dans une facture globale</i>
            </div>
          </div>

          <div className="sg-fact-onglets">
            {ONGLETS.map((o) => {
              const n = o.id === "tout"
                ? data.lignes.length
                : data.lignes.filter((l) => l.etat === o.id).length;
              return (
                <button key={o.id} type="button"
                  className={`sg-fact-ong${onglet === o.id ? " is-on" : ""}`}
                  onClick={() => setOnglet(o.id)}>
                  {o.label}<b>{n}</b>
                </button>
              );
            })}
          </div>

          {lignes.length === 0 ? (
            <p className="sg-fact-vide">
              {onglet === "sans"
                ? "Aucun chantier clôturé sans facture. Tout est passé."
                : "Rien dans cette catégorie."}
            </p>
          ) : (
            <div className="sg-plist">
              {lignes.map((l) => {
                const p = versProjet(l);
                const h = HABILLAGE[l.etat];
                return (
                  <div key={`${l.id}-${l.etat}`} className="sg-plist-row group">
                    <Link href={`/projet/${l.id}?mode=facturation`} className="sg-plist-link"
                      onMouseEnter={() => prefetchProject(l.id)}>
                      {/* Le survol montre la fiche, le clic l'épingle — le reste
                          de la ligne ouvre le chantier. */}
                      <span className="sg-plist-tm sg-tmbtn sg-refs" title="Aperçu du projet"
                        onMouseEnter={(e) => { e.stopPropagation(); survolApercu(() => openSignalPreview(p, "facturation")); }}
                        onMouseLeave={annulerSurvol}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSignalPreview(p, "facturation"); }}>
                        {(l.ofrTM || "—").split(/[\n,;]+/).map((n, k) => <i key={`${n}-${k}`}>{n.trim()}</i>)}
                      </span>
                      <span className="sg-plist-main">
                        <span className="sg-plist-name">{l.projet || "Sans nom"}</span>
                        <span className="sg-plist-sub">{l.adresseChantier || "—"}</span>
                        {l.reglage && (
                          <span className="sg-plist-extra">
                            {l.reglage.libelle}
                            {l.reglage.detail ? ` — ${l.reglage.detail}` : ""}
                            {` · noté le ${new Date(l.reglage.le).toLocaleDateString("fr-CH")}`}
                          </span>
                        )}
                        {l.factures.length > 0 && (
                          <span className="sg-plist-extra">
                            {l.factures.map((f) => `facture ${f.nr} du ${f.date}`).join(" · ")}
                            {l.restant > 0 && ` — reste CHF ${francs(l.restant)}`}
                          </span>
                        )}
                      </span>
                      <span className={`sg-fact-etat is-${l.etat}`} title={h.aide}>{h.titre}</span>
                      <span className="sg-fact-montant">
                        {l.offre ? `CHF ${francs(l.offre.total)}` : "—"}
                        {l.facture > 0 && l.offre && Math.round(l.facture * 100) !== Math.round(l.offre.total * 100) && (
                          <i>facturé {francs(l.facture)}</i>
                        )}
                      </span>
                      <span className="sg-plist-date">{l.offre?.date || "—"}</span>
                      <span className="sg-plist-cab">{l.nbCabines || "—"}</span>
                      <ChevronRight className="w-4 h-4 sg-plist-chev" />
                    </Link>
                    {l.etat === "regle" ? (
                      <button type="button" className="sg-fact-act is-annule"
                        title={`${l.reglage?.libelle}${l.reglage?.detail ? ` — ${l.reglage.detail}` : ""} · ${l.reglage?.par || ""}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); annulerReglage(l); }}>
                        Rouvrir
                      </button>
                    ) : (
                      <button type="button" className="sg-fact-act"
                        title="Ce chantier a été réglé autrement — le dire une fois suffit"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRegler(l); setDetail(""); setMotif("client-final"); }}>
                        Régler
                      </button>
                    )}
                    <a href={`/projet/${l.id}?mode=facturation`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="sg-plist-act sg-plist-act-tab" title="Ouvrir dans un nouvel onglet">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {regler && (
            <div className="sg-fact-fond" role="dialog" aria-modal="true"
              onClick={() => setRegler(null)}>
              <div className="sg-fact-boite" onClick={(e) => e.stopPropagation()}>
                <h3>Comment ce chantier a-t-il été réglé ?</h3>
                <p className="sg-fact-boite-sous">
                  {(regler.ofrTM || "").split(/[\n,;]+/)[0]} — {regler.projet}
                  {regler.offre ? ` · CHF ${francs(regler.offre.total)}` : ""}
                </p>
                <div className="sg-fact-motifs">
                  {MOTIFS.map((m) => (
                    <button key={m.id} type="button"
                      className={`sg-fact-motif${motif === m.id ? " is-on" : ""}`}
                      onClick={() => setMotif(m.id)}>{m.label}</button>
                  ))}
                </div>
                {MOTIFS.find((m) => m.id === motif)?.detail && (
                  <input className="sg-fact-detail" value={detail} autoFocus
                    placeholder={MOTIFS.find((m) => m.id === motif)?.detail}
                    onChange={(e) => setDetail(e.target.value)} />
                )}
                <div className="sg-fact-boite-pied">
                  <button type="button" className="sg-fact-ok" disabled={envoi}
                    onClick={enregistrerReglage}>Enregistrer</button>
                  <button type="button" className="sg-fact-non" onClick={() => setRegler(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          <p className="sg-fact-note">
            Le rapprochement se fait par le numéro d&apos;offre : <b>TM-26xxxxx</b> est le numéro
            d&apos;offre bexio. Les factures, elles, ne le portent pas — le lien passe par le titre
            « Client, Adresse », puis par le montant et le client quand le titre a été retouché au
            moment de facturer. Un client facturé au mois est signalé comme tel plutôt que compté
            comme un oubli.
          </p>
        </>
      )}
      {chargement && !data && <p className="sg-fact-vide">Lecture des factures…</p>}
    </div>
  );
}
