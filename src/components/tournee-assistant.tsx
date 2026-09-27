"use client";

/**
 * Assistant de tournée — panneau latéral du thème « Signal ».
 *
 * La journée part du dépôt d'Yverdon et y revient ; les trajets comptent
 * autant que les poses, sans quoi « 5 h de pose » cache une journée de 10 h.
 *
 * Trois façons de composer la tournée :
 *   • automatique — on donne le nombre de montages, l'app cherche ;
 *   • avec un montage imposé — il y sera, les autres sont choisis autour ;
 *   • à la main — on coche les chantiers, l'app ne fait qu'ordonner le trajet.
 *
 * Elle propose, elle ne décide pas : rien n'est écrit dans Notion.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Route, X, MapPin, Package, Clock, ChevronRight, Sparkles, Pin, ListChecks,
  Loader2, AlertTriangle,
} from "lucide-react";
import {
  preparerCandidats, construireTournee, formatMinutes, DEPOT, JOURNEE_MINUTES,
  type CandidatSource, type Tournee, type Position,
} from "@/lib/tournee";
import { TourneeCarte } from "@/components/tournee-carte";

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
  const [heuresMax, setHeuresMax] = useState("8.5");
  const [obligatoire, setObligatoire] = useState<string | null>(null);
  const [choixManuel, setChoixManuel] = useState(false);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [resultat, setResultat] = useState<Tournee | null | "vide">(null);

  /* ── Coordonnées ────────────────────────────────────────────────────────
     Sans elles, les trajets ne sont qu'une grille par code postal. Elles sont
     conservées côté serveur : la première tournée les résout, les suivantes
     sont instantanées. */
  const [positions, setPositions] = useState<Record<string, Position | null>>({});
  const [posDepot, setPosDepot] = useState<Position | null>(null);
  const [geoRestant, setGeoRestant] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    const adresses = [DEPOT, ...projets.map((p) => p.adresseChantier || "").filter(Boolean)];
    const demander = async () => {
      const r = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresses }),
      }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!vivant || !r) { setGeoRestant(0); return; }
      setPositions((prev) => ({ ...prev, ...r.resultats }));
      if (r.resultats?.[DEPOT]) setPosDepot(r.resultats[DEPOT]);
      setGeoRestant(r.restant || 0);
      if (r.restant > 0 && vivant) demander();
    };
    demander();
    return () => { vivant = false; };
  }, [projets]);

  const candidats = useMemo(
    () => preparerCandidats(projets, historique, positions),
    [projets, historique, positions],
  );

  const secteurs = useMemo(() => {
    const m = new Map<string, number>();
    candidats.forEach((c) => { if (c.region) m.set(c.region, (m.get(c.region) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [candidats]);

  const calculer = () => {
    const t = construireTournee(candidats, {
      nombre,
      secteur: secteur.trim() || undefined,
      cartonsMax: Number(cartonsMax) || 0,
      minutesMax: Math.round((Number(heuresMax) || 0) * 60) || JOURNEE_MINUTES,
      obligatoire: obligatoire || undefined,
      imposes: choixManuel ? [...coches] : undefined,
    }, posDepot);
    setResultat(t ?? "vide");
  };

  const basculerCoche = (id: string) => {
    setCoches((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
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
              Départ et retour&nbsp;: {DEPOT} · {candidats.length} montage{candidats.length > 1 ? "s" : ""} à planifier
            </p>
          </div>
          <button type="button" className="sg-unpin" aria-label="Fermer" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="sgs-drawer-body sgt-body">
          {geoRestant !== null && geoRestant > 0 && (
            <p className="sgt-note sgt-carte-etat">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Localisation des adresses — {geoRestant} restante{geoRestant > 1 ? "s" : ""}.
              Les temps de trajet seront plus justes une fois terminé.
            </p>
          )}

          {/* Mode de composition */}
          <div className="sgt-modes">
            <button type="button" className={!choixManuel ? "is-on" : ""} onClick={() => setChoixManuel(false)}>
              <Sparkles className="w-3.5 h-3.5" /> Automatique
            </button>
            <button type="button" className={choixManuel ? "is-on" : ""} onClick={() => setChoixManuel(true)}>
              <ListChecks className="w-3.5 h-3.5" /> Je choisis
            </button>
          </div>

          {!choixManuel && (
            <>
              <label className="sgt-champ">
                <span>Montages dans la journée</span>
                <div className="sgt-nombre">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button key={n} type="button" className={nombre === n ? "is-on" : ""}
                      onClick={() => setNombre(n)}>{n}</button>
                  ))}
                </div>
              </label>

              <label className="sgt-champ">
                <span>Secteur de départ <em>facultatif</em></span>
                <input value={secteur} onChange={(e) => setSecteur(e.target.value)}
                  placeholder="Localité, code postal ou région…" />
                {secteurs.length > 0 && (
                  <div className="sgt-suggestions">
                    {secteurs.slice(0, 6).map(([r, n]) => (
                      <button key={r} type="button" className={secteur === r ? "is-on" : ""}
                        onClick={() => setSecteur(secteur === r ? "" : r)}>
                        {r} <b>{n}</b>
                      </button>
                    ))}
                  </div>
                )}
              </label>
            </>
          )}

          <div className="sgt-duo">
            <label className="sgt-champ">
              <span>Cartons max. <em>véhicule</em></span>
              <input type="number" inputMode="numeric" value={cartonsMax}
                onChange={(e) => setCartonsMax(e.target.value)} placeholder="illimité" />
            </label>
            <label className="sgt-champ">
              <span>Heures max. <em>trajets compris</em></span>
              <input type="number" inputMode="decimal" step="0.5" value={heuresMax}
                onChange={(e) => setHeuresMax(e.target.value)} placeholder="8.5" />
            </label>
          </div>

          {/* Coche en mode manuel, épingle en automatique */}
          <div className="sgt-champ">
            <span>
              {choixManuel ? `Chantiers retenus (${coches.size})` : "Montage obligatoire — facultatif"}
            </span>
            <div className="sgt-liste">
              {candidats.map((c) => {
                const actif = choixManuel ? coches.has(c.id) : obligatoire === c.id;
                return (
                  <button key={c.id} type="button"
                    className={`sgt-choix${actif ? " is-on" : ""}`}
                    onClick={() => choixManuel
                      ? basculerCoche(c.id)
                      : setObligatoire(obligatoire === c.id ? null : c.id)}>
                    {choixManuel
                      ? <span className="sgt-case">{actif ? "✓" : ""}</span>
                      : <Pin className="w-3.5 h-3.5 shrink-0" />}
                    <span className="sgt-choix-txt">
                      <b className="sg-mono">{c.ofrTM}</b> {c.npa} {c.localite}
                      <em>{c.projet}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" className="sg-btn-primary sgt-go" onClick={calculer}
            disabled={choixManuel && coches.size === 0}>
            <Sparkles className="w-4 h-4" />
            {choixManuel ? "Calculer le meilleur itinéraire" : "Proposer une tournée"}
          </button>

          {resultat === "vide" && (
            <p className="sg-empty">
              Aucune combinaison ne tient dans ces contraintes. Élargissez le secteur,
              augmentez la durée de journée ou réduisez le nombre de montages.
            </p>
          )}

          {resultat && resultat !== "vide" && (
            <div className="sgt-resultat">
              <div className="sgt-bilan">
                <span className={resultat.heuresSupp ? "is-warn" : ""}>
                  <Clock className="w-3.5 h-3.5" />
                  Journée {formatMinutes(resultat.minutesTotal)}
                </span>
                <span>
                  <Route className="w-3.5 h-3.5" />
                  {formatMinutes(resultat.minutesTrajet)} de route
                  {resultat.kmApprox > 0 ? ` · ~${resultat.kmApprox} km` : ""}
                </span>
                <span><Clock className="w-3.5 h-3.5" />{formatMinutes(resultat.minutesPose)} de pose</span>
                <span><MapPin className="w-3.5 h-3.5" />{resultat.etendue}</span>
                <span><Package className="w-3.5 h-3.5" />{resultat.cartons || "—"} cartons · {resultat.cabines} cab.</span>
              </div>

              {resultat.heuresSupp && (
                <p className="sgt-note sgt-alerte">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Retour au dépôt au-delà de 8&nbsp;h&nbsp;30 : ce sont des heures supplémentaires.
                </p>
              )}

              <TourneeCarte
                etapes={resultat.etapes.map((c) => ({
                  id: c.id, adresse: c.adresse, localite: `${c.npa} ${c.localite}`.trim(),
                }))}
                depart={DEPOT}
              />

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
                Départ et retour au dépôt de {DEPOT}, trajets compris dans la journée.
                Durées de pose d&apos;après les heures réellement pointées sur les montages
                terminés du même fournisseur ; temps de route estimés à vol d&apos;oiseau
                majoré — pour les kilomètres réels, ouvrez l&apos;itinéraire dans Google Maps.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
