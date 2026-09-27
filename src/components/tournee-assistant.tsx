"use client";

/**
 * Assistant de tournée — panneau latéral du thème « Signal ».
 *
 * On indique combien de montages on veut enchaîner, éventuellement un secteur,
 * et la capacité du véhicule ; l'assistant propose la combinaison la moins
 * dispersée parmi les projets de la liste affichée.
 *
 * Il propose, il ne décide pas : rien n'est écrit dans Notion. Chaque étape
 * reste un lien vers son projet, où l'on fixe le rendez-vous comme d'habitude.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Route, X, MapPin, Package, Clock, ChevronRight, Sparkles } from "lucide-react";
import {
  preparerCandidats, construireTournee, formatMinutes,
  type CandidatSource, type Tournee,
} from "@/lib/tournee";

export function TourneeAssistant({
  projets, historique, onClose,
}: {
  projets: CandidatSource[];
  historique: CandidatSource[];
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(3);
  const [secteur, setSecteur] = useState("");
  const [cartonsMax, setCartonsMax] = useState("");
  const [heuresMax, setHeuresMax] = useState("8");
  const [resultat, setResultat] = useState<Tournee | null | "vide">(null);

  const candidats = useMemo(
    () => preparerCandidats(projets, historique),
    [projets, historique],
  );

  /** Secteurs proposés : ceux réellement présents dans la liste. */
  const secteurs = useMemo(() => {
    const m = new Map<string, number>();
    candidats.forEach((c) => {
      if (c.region) m.set(c.region, (m.get(c.region) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [candidats]);

  const calculer = () => {
    const t = construireTournee(candidats, {
      nombre,
      secteur: secteur.trim() || undefined,
      cartonsMax: Number(cartonsMax) || 0,
      minutesMax: Math.round((Number(heuresMax) || 0) * 60),
    });
    setResultat(t ?? "vide");
  };

  return (
    <>
      <div className="sgs-drawer-veil" onClick={onClose} aria-hidden="true" />
      <aside className="sgs-drawer sgt" role="dialog" aria-label="Assistant de tournée">
        <div className="sgs-drawer-head">
          <div>
            <h2 className="sgs-card-title flex items-center gap-2">
              <Route className="w-4 h-4" /> Assistant de tournée
            </h2>
            <p className="sgs-card-meta">
              {candidats.length} montage{candidats.length > 1 ? "s" : ""} à planifier dans la liste
            </p>
          </div>
          <button type="button" className="sg-unpin" aria-label="Fermer" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="sgs-drawer-body sgt-body">
          {/* Réglages */}
          <label className="sgt-champ">
            <span>Montages dans la tournée</span>
            <div className="sgt-nombre">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={nombre === n ? "is-on" : ""}
                  onClick={() => setNombre(n)}>{n}</button>
              ))}
            </div>
          </label>

          <label className="sgt-champ">
            <span>Secteur de départ <em>facultatif</em></span>
            <input
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
              placeholder="Localité, code postal ou région…"
              list="sgt-secteurs"
            />
            <datalist id="sgt-secteurs">
              {secteurs.map(([r]) => <option key={r} value={r} />)}
            </datalist>
            {secteurs.length > 0 && (
              <div className="sgt-suggestions">
                {secteurs.slice(0, 6).map(([r, n]) => (
                  <button key={r} type="button"
                    className={secteur === r ? "is-on" : ""}
                    onClick={() => setSecteur(secteur === r ? "" : r)}>
                    {r} <b>{n}</b>
                  </button>
                ))}
              </div>
            )}
          </label>

          <div className="sgt-duo">
            <label className="sgt-champ">
              <span>Cartons max. <em>véhicule</em></span>
              <input type="number" inputMode="numeric" value={cartonsMax}
                onChange={(e) => setCartonsMax(e.target.value)} placeholder="illimité" />
            </label>
            <label className="sgt-champ">
              <span>Heures max. <em>journée</em></span>
              <input type="number" inputMode="decimal" step="0.5" value={heuresMax}
                onChange={(e) => setHeuresMax(e.target.value)} placeholder="illimité" />
            </label>
          </div>

          <button type="button" className="sg-btn-primary sgt-go" onClick={calculer}>
            <Sparkles className="w-4 h-4" /> Proposer une tournée
          </button>

          {/* Résultat */}
          {resultat === "vide" && (
            <p className="sg-empty">
              Aucune combinaison ne respecte ces contraintes. Élargissez le secteur,
              augmentez la capacité ou réduisez le nombre de montages.
            </p>
          )}

          {resultat && resultat !== "vide" && (
            <div className="sgt-resultat">
              <div className="sgt-bilan">
                <span><MapPin className="w-3.5 h-3.5" />{resultat.etendue}</span>
                <span><Clock className="w-3.5 h-3.5" />{formatMinutes(resultat.minutes)} de pose</span>
                <span><Package className="w-3.5 h-3.5" />{resultat.cartons || "—"} cartons · {resultat.cabines} cab.</span>
              </div>

              {resultat.etapes.length < nombre && (
                <p className="sgt-note">
                  {resultat.etapes.length} montage{resultat.etapes.length > 1 ? "s" : ""} seulement :
                  les autres ne tiennent pas dans les contraintes.
                </p>
              )}

              <ol className="sgt-etapes">
                {resultat.etapes.map((c, i) => (
                  <li key={c.id}>
                    <span className="sgt-num">{i + 1}</span>
                    <Link href={`/projet/${c.id}?mode=dashboard`} className="sgt-etape">
                      <span className="sgt-etape-haut">
                        <b className="sg-mono">{c.ofrTM}</b>
                        <span className="sgt-npa">{c.npa} {c.localite}</span>
                      </span>
                      <span className="sgt-etape-nom">{c.projet}</span>
                      <span className="sgt-etape-meta">
                        {c.cabines} cab. · {formatMinutes(c.minutes)}
                        {c.cartons ? ` · ${c.cartons} cartons` : ""}
                      </span>
                    </Link>
                    <ChevronRight className="w-4 h-4 sg-plist-chev" />
                  </li>
                ))}
              </ol>

              <p className="sgt-note">
                Durées estimées d&apos;après les heures réellement pointées sur les montages
                terminés du même fournisseur. Proximité évaluée au code postal, pas en
                kilomètres routiers.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
