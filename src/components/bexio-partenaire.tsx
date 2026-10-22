"use client";

/**
 * Les chiffres bexio d'un partenaire, dans ses statistiques (thème Signal).
 *
 * Visible du SEUL propriétaire de l'accès bexio : le bloc demande d'abord
 * /api/bexio/etat, qui répond 403 à tout autre compte — et alors il ne
 * s'affiche pas du tout, pas même comme un cadre vide.
 *
 * La correspondance partenaire → contact(s) bexio est proposée par l'app et
 * se confirme ici d'un clic ; elle est mémorisée ensuite.
 */

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import type { StatsBexioPartenaire } from "@/lib/bexio-partenaires";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const chf = (n: number) => (Math.abs(n) >= 100_000
  ? `CHF ${Math.round(n / 1000).toLocaleString("fr-CH")} k`
  : `CHF ${Math.round(n).toLocaleString("fr-CH")}`);
const date = (d?: string | null) => (d ? new Date(d.slice(0, 10)).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

export function BexioPartenaire({ cle, mots, numeros, de, a }: {
  cle: string; mots: string[]; numeros: string[]; de?: string; a?: string;
}) {
  const [autorise, setAutorise] = useState(false);
  const [d, setD] = useState<StatsBexioPartenaire | null>(null);
  const [erreur, setErreur] = useState("");
  const [choix, setChoix] = useState<Set<number> | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    let vivant = true;
    fetch("/api/bexio/etat", { credentials: "include" })
      .then((r) => { if (vivant) setAutorise(r.ok); })
      .catch(() => {});
    return () => { vivant = false; };
  }, []);

  const corps = useMemo(() => JSON.stringify({ cle, mots, numeros, de, a }), [cle, mots, numeros, de, a]);
  useEffect(() => {
    if (!autorise) return;
    let vivant = true;
    setErreur("");
    fetch("/api/bexio/partenaire", { method: "POST", headers: { "Content-Type": "application/json" }, body: corps })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j as StatsBexioPartenaire;
      })
      .then((j) => { if (vivant) setD(j); })
      .catch((e) => { if (vivant) setErreur(e.message || "bexio indisponible"); });
    return () => { vivant = false; };
  }, [autorise, corps, tour]);

  if (!autorise) return null;

  const enregistrer = async (contacts: number[]) => {
    setEnvoi(true);
    try {
      const r = await fetch("/api/bexio/partenaire", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle, contacts }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setChoix(null);
      setTour((t) => t + 1);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const pic = Math.max(1, ...(d?.parMois || []).map((m) => m.total));

  return (
    <section className="sgpt-carte sgbx">
      <div className="sgpt-carte-tete">
        <h3>Dans bexio</h3>
        <p className="sgbx-prive"><Lock className="w-3 h-3" /> visible par toi seul</p>
      </div>

      {erreur && <p className="sgpt-vide">bexio : {erreur}</p>}
      {!d && !erreur && <p className="sgpt-vide">Lecture de bexio…</p>}

      {d && (
        <>
          <div className={`sgbx-lien ${d.statut === "confirmee" ? "is-ok" : "is-propose"}`}>
            <span>
              {d.retenus.length === 0
                ? "Aucun contact bexio trouvé pour ce partenaire."
                : <>Contact{d.retenus.length > 1 ? "s" : ""} bexio : <b>{d.retenus.map((r) => r.nom).join(" · ")}</b></>}
              <em>{d.statut === "confirmee"
                ? ` — confirmé le ${date(d.confirmeePar?.le)}`
                : d.retenus.length ? " — proposé par l'app, à confirmer" : ""}</em>
            </span>
            <span className="sgbx-lien-actions">
              {d.statut !== "confirmee" && d.retenus.length > 0 && (
                <button type="button" disabled={envoi} onClick={() => enregistrer(d.retenus.map((r) => r.id))}>Confirmer</button>
              )}
              {d.candidats.length > 0 && (
                <button type="button" className="is-second" onClick={() => setChoix(choix ? null : new Set(d.retenus.map((r) => r.id)))}>
                  {choix ? "Fermer" : "Modifier"}
                </button>
              )}
            </span>
          </div>

          {choix && (
            <div className="sgbx-choix">
              <p>Cochez le ou les contacts bexio qui sont ce partenaire. Indices : chantiers dont l&apos;offre lui est adressée, et nom du client.</p>
              <ul>
                {d.candidats.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" checked={choix.has(c.id)}
                        onChange={() => { const n = new Set(choix); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setChoix(n); }} />
                      <b>{c.nom}</b>
                      <small>
                        {c.parChantiers ? `${c.parChantiers} chantier${c.parChantiers > 1 ? "s" : ""}` : ""}
                        {c.parChantiers && c.parNom ? " · " : ""}
                        {c.parNom ? "nom" : ""} · {c.factures} fact. · {chf(c.total)}
                      </small>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="sgbx-choix-pied">
                <button type="button" disabled={envoi} onClick={() => enregistrer([...choix])}>
                  {choix.size ? "Enregistrer la correspondance" : "Effacer la correspondance"}
                </button>
              </div>
            </div>
          )}

          {d.retenus.length > 0 && (
            <>
              <div className="sgbx-tuiles">
                <div><span>Facturé</span><b>{chf(d.facture)}</b><small>{d.nbFactures} facture{d.nbFactures > 1 ? "s" : ""}</small></div>
                <div><span>Encaissé</span><b className="is-ok">{chf(d.encaisse)}</b><small>{d.facture ? Math.round((d.encaisse / d.facture) * 100) : 0} %</small></div>
                <div><span>Reste dû</span><b className={d.restant > 0.01 ? "is-alerte" : ""}>{chf(d.restant)}</b>
                  <small>{d.echues.nb ? `${d.echues.nb} échue${d.echues.nb > 1 ? "s" : ""} · ${chf(d.echues.total)}` : "rien d'échu"}</small></div>
                <div><span>Offres acceptées</span><b>{d.offres.tauxAcceptation === null ? "—" : `${d.offres.tauxAcceptation} %`}</b>
                  <small>{d.offres.acceptees} sur {d.offres.acceptees + d.offres.declinees} tranchées · {d.offres.nb} offres</small></div>
                <div><span>Facturé sur ses chantiers</span><b>{chf(d.surSesChantiers.total)}</b><small>quel que soit le payeur</small></div>
                {d.achats.nb > 0 && (
                  <div><span>Achats chez lui</span><b>{chf(d.achats.ttc)}</b><small>{d.achats.nb} facture{d.achats.nb > 1 ? "s" : ""} fournisseur{d.achats.du > 0.01 ? ` · ${chf(d.achats.du)} à payer` : ""}</small></div>
                )}
              </div>

              <div className="sgbx-histo" aria-label="Facturé par mois, 12 derniers mois">
                {d.parMois.map((m) => (
                  <div key={m.mois} className="sgbx-histo-mois" title={`${m.mois} : ${chf(m.total)} (${m.nb} facture${m.nb > 1 ? "s" : ""})`}>
                    <span className="sgbx-histo-col"><i style={{ height: `${(m.total / pic) * 100}%` }} /></span>
                    <span className="sgpt-histo-lib">{MOIS[Number(m.mois.slice(5, 7)) - 1]}</span>
                  </div>
                ))}
              </div>

              {d.dernieres.length > 0 && (
                <ul className="sgbx-factures">
                  {d.dernieres.map((f) => (
                    <li key={f.nr}>
                      <time>{date(f.date)}</time>
                      <span>{f.nr} — {f.titre}</span>
                      <b>{chf(f.total)}</b>
                      <em className={f.restant > 0.01 ? "is-alerte" : "is-ok"}>{f.restant > 0.01 ? `dû ${chf(f.restant)}` : "payée"}</em>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {d.copieLe && <p className="sgpt-note">Copie bexio du {date(d.copieLe)} — rafraîchie chaque nuit.</p>}
        </>
      )}
    </section>
  );
}
