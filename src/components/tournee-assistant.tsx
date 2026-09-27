"use client";

/**
 * Assistant de tournée — panneau latéral du thème « Signal ».
 *
 * La journée part du dépôt d'Yverdon et y revient ; les trajets comptent
 * autant que les poses, sans quoi « 5 h de pose » cache une journée de 10 h.
 *
 * On coche les montages que l'on doit faire — aucun, un seul ou plusieurs —
 * et l'app COMPLÈTE la journée autour d'eux jusqu'au nombre demandé, en
 * choisissant les voisins les plus proches. Un chantier peut exiger une heure
 * d'arrivée : l'ordre est alors calculé pour la tenir, quitte à attendre.
 *
 * Elle propose, elle ne décide pas : rien n'est écrit dans Notion.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Route, X, MapPin, Package, Clock, ChevronRight, Sparkles,
  Loader2, AlertTriangle, Home, Search,
} from "lucide-react";
import {
  preparerCandidats, construireTournee, formatMinutes, DEPOT, JOURNEE_MINUTES,
  type CandidatSource, type Tournee, type Position,
} from "@/lib/tournee";
import { TourneeCarte } from "@/components/tournee-carte";

function normaliser(v: string): string {
  return (v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Clés sans intérêt pour une recherche : photos, documents, signatures. */
const CLES_IGNOREES = /^(photos|documents|offres)|url$|signature/i;

/** Aplatit toutes les valeurs textuelles d'un projet en une seule chaîne. */
function aplatir(v: unknown, profondeur = 0): string {
  if (v == null || profondeur > 2) return "";
  if (typeof v === "string" || typeof v === "number") return `${v} `;
  if (Array.isArray(v)) return v.map((x) => aplatir(x, profondeur + 1)).join(" ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !CLES_IGNOREES.test(k))
      .map(([, x]) => aplatir(x, profondeur + 1))
      .join(" ");
  }
  return "";
}

function indexerCandidat(c: { ofrTM: string; projet: string; npa: string; localite: string; region: string; canton: string; source: unknown }): string {
  return normaliser([
    c.ofrTM, c.projet, c.npa, c.localite, c.region, c.canton, aplatir(c.source),
  ].join(" "));
}

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
  const [coches, setCoches] = useState<Set<string>>(new Set());
  /** Heure d'arrivée imposée, par chantier — « HH:MM ». */
  const [heures, setHeures] = useState<Record<string, string>>({});
  const [departHeure, setDepartHeure] = useState("07:30");
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

  /* Recherche dans les montages à planifier.
     Elle porte sur TOUT ce que le projet contient — sanitaire, client, n° de
     commande, statut, série… — et non sur une liste de champs choisis
     d'avance : c'est la seule façon de retrouver un chantier avec le mot qu'on
     a en tête. Les pièces jointes sont écartées : leurs URL n'apprennent rien
     et alourdiraient l'index. */
  const [recherche, setRecherche] = useState("");

  const index = useMemo(() => {
    const m = new Map<string, string>();
    candidats.forEach((c) => m.set(c.id, indexerCandidat(c)));
    return m;
  }, [candidats]);

  const trouves = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return candidats;
    const mots = q.split(/\s+/).filter(Boolean);
    return candidats.filter((c) => {
      const foin = index.get(c.id) || "";
      return mots.every((mot) => foin.includes(mot));
    });
  }, [candidats, index, recherche]);

  /* Un chantier coché reste visible même s'il sort de la recherche : sans
     cela, on ne pourrait plus le décocher après avoir change de mots-clés. */
  const listeAffichee = useMemo(() => {
    if (!recherche.trim()) return candidats;
    const vus = new Set(trouves.map((c) => c.id));
    const gardes = candidats.filter((c) => coches.has(c.id) && !vus.has(c.id));
    return [...gardes, ...trouves];
  }, [candidats, trouves, coches, recherche]);

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
      imposes: [...coches],
      heures,
      departHeure,
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

          <label className="sgt-champ">
            <span>Montages dans la journée</span>
            <div className="sgt-nombre">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={nombre === n ? "is-on" : ""}
                  onClick={() => setNombre(n)}>{n}</button>
              ))}
            </div>
          </label>

          <div className="sgt-duo">
            <label className="sgt-champ">
              <span>Départ du dépôt</span>
              <input type="time" value={departHeure} onChange={(e) => setDepartHeure(e.target.value)} />
            </label>
            <label className="sgt-champ">
              <span>Secteur <em>facultatif</em></span>
              <input value={secteur} onChange={(e) => setSecteur(e.target.value)}
                placeholder="Localité, NPA, région…" />
            </label>
          </div>
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

          {/* Chantiers imposés : ils seront dans la tournée, le reste est
              complété autour d'eux. Une heure d'arrivée peut être exigée. */}
          <div className="sgt-champ">
            <span>
              Montages imposés <em>{coches.size > 0 ? `${coches.size} retenu${coches.size > 1 ? "s" : ""}` : "facultatif"}</em>
            </span>
            <label className="sgt-recherche">
              <Search className="w-3.5 h-3.5" />
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher : sanitaire, client, n° de projet, commande…" />
              {recherche && (
                <button type="button" onClick={() => setRecherche("")} aria-label="Effacer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {recherche.trim() && <b>{trouves.length}</b>}
            </label>
            <div className="sgt-liste">
              {listeAffichee.length === 0 && (
                <p className="sgt-note sgt-rien">Aucun montage ne correspond.</p>
              )}
              {listeAffichee.map((c) => {
                const actif = coches.has(c.id);
                return (
                  <div key={c.id} className={`sgt-choix${actif ? " is-on" : ""}`}>
                    <button type="button" className="sgt-choix-btn" onClick={() => basculerCoche(c.id)}>
                      <span className="sgt-case">{actif ? "✓" : ""}</span>
                      <span className="sgt-choix-txt">
                        <b className="sg-mono">{c.ofrTM}</b> {c.npa} {c.localite}
                        <em>{c.projet}</em>
                      </span>
                    </button>
                    {actif && (
                      <label className="sgt-heure" title="Heure d'arrivée imposée — laissez vide si libre">
                        <Clock className="w-3 h-3" />
                        <input type="time" value={heures[c.id] || ""}
                          onChange={(e) => setHeures((p2) => ({ ...p2, [c.id]: e.target.value }))} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button type="button" className="sg-btn-primary sgt-go" onClick={calculer}>
            <Sparkles className="w-4 h-4" />
            {coches.size > 0 ? "Compléter et ordonner la tournée" : "Proposer une tournée"}
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
                <span><Home className="w-3.5 h-3.5" />Retour {resultat.retourDepot}</span>
                {resultat.minutesAttente > 0 && (
                  <span className="is-warn">
                    <Clock className="w-3.5 h-3.5" />
                    {formatMinutes(resultat.minutesAttente)} d&apos;attente
                  </span>
                )}
              </div>

              {resultat.retardMax > 0 && (
                <p className="sgt-note sgt-alerte">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Une heure imposée ne peut pas être tenue — {formatMinutes(resultat.retardMax)} de
                  retard au mieux. Retirez un montage ou avancez l&apos;heure de départ.
                </p>
              )}

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
                {resultat.etapes.map((c, i) => {
                  const h = resultat.horaires[i];
                  return (
                    <li key={c.id}>
                      <span className="sgt-num">{i + 1}</span>
                      <Link href={`/projet/${c.id}?mode=dashboard`} className="sgt-etape">
                        <span className="sgt-etape-haut">
                          <b className="sg-mono">{c.ofrTM}</b>
                          <span className="sgt-npa">{c.npa} {c.localite}</span>
                        </span>
                        <span className="sgt-etape-nom">{c.projet}</span>
                        <span className="sgt-etape-meta">
                          {h && (
                            <b className={`sgt-h${h.enRetard ? " is-retard" : ""}`}>
                              {h.arrivee} → {h.depart}
                              {h.impose ? <em> imposé {h.impose}</em> : null}
                            </b>
                          )}
                          {c.cabines} cab. · {formatMinutes(c.minutes)}
                          {c.cartons ? ` · ${c.cartons} cartons` : ""}
                        </span>
                      </Link>
                      <ChevronRight className="w-4 h-4 sg-plist-chev" />
                    </li>
                  );
                })}
              </ol>

              <p className="sgt-note">
                Départ de {DEPOT} à {departHeure}, retour au même dépôt à {resultat.retourDepot},
                trajets compris dans la journée.
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
