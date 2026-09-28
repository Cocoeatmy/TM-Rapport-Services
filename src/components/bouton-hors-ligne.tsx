"use client";

/**
 * « Journée prête hors ligne » — le bouton de l'en-tête.
 *
 * Un monteur passe sa journée dans des sous-sols sans couverture. Tout est
 * prévu pour cela : les fiches sont pré-téléchargées, les heures et les photos
 * saisies hors réseau partent en file d'attente et s'envoient au retour. Mais
 * rien ne le DISAIT — impossible de vérifier, avant de partir, que la journée
 * était bien chargée, alors que c'est le seul moment où l'on peut encore y
 * remédier.
 *
 * Le bandeau qui portait cette information vivait sur le tableau de bord ; il
 * l'encombrait, et disparaissait dès qu'on ouvrait une fiche. Il est devenu ce
 * rond, dans la barre du haut : visible partout, sur téléphone comme sur
 * ordinateur, et replié tant qu'il n'a rien à dire.
 *
 * Le nuage voisin et l'avion parlent de ce qui REMONTE — synchronisation,
 * envois en attente. Celui-ci parle de ce qui DESCEND sur l'appareil : d'où la
 * flèche vers le bas, pour que les trois ne se confondent pas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloudDownload, CloudCheck, RefreshCw, Loader2, AlertTriangle, X } from "lucide-react";
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

/**
 * Les projets que la page d'accueil a mis en cache.
 *
 * Le bouton vit dans l'en-tête, loin de la page qui détient les projets. Plutôt
 * que de relire Notion — ce que ce bouton cherche précisément à éviter — il
 * reprend le cache que le tableau de bord écrit à chaque visite. Le filtre par
 * date et par collaborateur se fait ensuite dans `prefetchTodaysProjects` : un
 * surplus de projets ne gêne pas, il sera écarté.
 */
function projetsEnCache(): Project[] {
  try {
    const brut = localStorage.getItem("tm-projects-cache");
    if (!brut) return [];
    const par = JSON.parse(brut) as Record<string, Project[]>;
    const vus = new Set<string>();
    const out: Project[] = [];
    Object.values(par || {}).forEach((liste) => {
      if (!Array.isArray(liste)) return;
      liste.forEach((p) => {
        if (!p?.id || vus.has(p.id)) return;
        vus.add(p.id);
        out.push(p);
      });
    });
    return out;
  } catch {
    return [];
  }
}

/** Au-delà, les rendez-vous ont pu bouger et les plans changer. */
const PEREMPTION_MS = 12 * 3600_000;

export function BoutonHorsLigne() {
  /* Le thème Signal seul monte ce bouton : les autres gardent l'en-tête qu'ils
     ont toujours eu. On lit l'attribut plutôt qu'un contexte — il est posé
     avant l'hydratation, et aucune donnée ne transite. */
  const [signal, setSignal] = useState(false);
  const [nom, setNom] = useState("");
  const [etat, setEtat] = useState({ projets: 0, quand: 0 });
  const [enAttente, setEnAttente] = useState(0);
  const [bloques, setBloques] = useState(0);
  const [travaille, setTravaille] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState({ top: 56, right: 8 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSignal(document.documentElement.getAttribute("data-ui") === "signal");
    fetch("/api/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user?.name) setNom(String(d.user.name)); })
      .catch(() => {});
  }, []);

  const relire = useCallback(async () => {
    setEtat(lireEtat());
    try {
      setEnAttente(getQueue().length + (await countPendingUploads()));
      setBloques(await countPermanentlyFailed());
    } catch { /* stockage indisponible : on n'affiche simplement rien */ }
  }, []);

  useEffect(() => {
    if (!signal) return;
    relire();
    const evts = [
      "tm-offline-ready", "tm-pending-upload-added", "tm-pending-upload-removed",
      "tm-offline-queued", "online",
    ];
    evts.forEach((e) => window.addEventListener(e, relire));
    return () => evts.forEach((e) => window.removeEventListener(e, relire));
  }, [signal, relire]);

  /* Le panneau est porté dans <body> : la barre d'en-tête défile
     horizontalement sur petit écran et le rognerait. */
  useEffect(() => {
    if (!ouvert) return;
    const placer = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    placer();
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const preparer = async () => {
    setTravaille(true);
    try {
      await prefetchTodaysProjects(projetsEnCache(), nom, true);
    } finally {
      await relire();
      setTravaille(false);
    }
  };

  if (!signal) return null;

  /* Quatre situations, et une seule demande un geste.
     • jamais   — rien n'a été tenté : c'est le cas qui doit se voir.
     • vide     — préparé, mais aucun chantier sur sept jours. Un monteur en
                  atelier ou en vacances est dans son droit : le lui reprocher
                  en ambre, comme on le faisait, était une fausse alerte.
     • perime   — chargé il y a plus de douze heures : à rafraîchir.
     • pret     — tout est là. */
  const charge = etat.projets > 0;
  const perime = charge && etat.quand > 0 && Date.now() - etat.quand > PEREMPTION_MS;
  const situation = etat.quand === 0 ? "jamais"
    : !charge ? "vide"
    : perime ? "perime" : "pret";
  const alerte = situation === "jamais" || situation === "perime" || bloques > 0;

  const titre = {
    jamais: "Aucun chantier téléchargé",
    vide: "Aucun chantier ces sept prochains jours",
    perime: `${etat.projets} chantier${etat.projets > 1 ? "s" : ""} disponible${etat.projets > 1 ? "s" : ""} hors réseau`,
    pret: `${etat.projets} chantier${etat.projets > 1 ? "s" : ""} disponible${etat.projets > 1 ? "s" : ""} hors réseau`,
  }[situation];

  const detail = {
    jamais: "touchez « Préparer » pendant que vous avez du réseau",
    vide: `vérifié ${quandLisible(etat.quand)} — rien à charger`,
    perime: `préparé ${quandLisible(etat.quand)} — à rafraîchir avant de partir`,
    pret: `préparé ${quandLisible(etat.quand)}`,
  }[situation];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sgh-off${alerte ? " is-alerte" : ""}`}
        aria-expanded={ouvert}
        aria-label={`Hors réseau — ${titre}`}
        title={`${titre} · ${detail}`}
        onClick={() => setOuvert((o) => !o)}
      >
        {charge && !perime ? <CloudCheck className="w-4 h-4" /> : <CloudDownload className="w-4 h-4" />}
        {bloques > 0 && <span className="sgh-off-point" aria-hidden="true" />}
      </button>

      {ouvert && typeof document !== "undefined" && createPortal(
        <div ref={popRef} className="sgh-offpop" style={{ top: pos.top, right: pos.right }}
          role="dialog" aria-label="Journée prête hors ligne">
          <div className="sgh-offpop-head">
            <span className={`sgh-offpop-chip${alerte ? " is-alerte" : ""}`}>
              {charge && !perime ? <CloudCheck className="w-4 h-4" /> : <CloudDownload className="w-4 h-4" />}
            </span>
            <div className="sgh-offpop-txt">
              <b>{titre}</b>
              <em>{detail}</em>
            </div>
            <button type="button" className="sgh-offpop-x" aria-label="Fermer" onClick={() => setOuvert(false)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {enAttente > 0 && (
            <p className="sgh-offpop-ligne">
              {enAttente} envoi{enAttente > 1 ? "s" : ""} en attente — ils partiront dès le retour du réseau.
            </p>
          )}
          {bloques > 0 && (
            <p className="sgh-offpop-ligne is-alerte">
              <AlertTriangle className="w-3.5 h-3.5" />
              {bloques} envoi{bloques > 1 ? "s" : ""} qui n&apos;aboutissent pas — à vérifier.
            </p>
          )}

          <button type="button" className="sgh-offpop-btn" onClick={preparer} disabled={travaille}>
            {travaille ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {travaille ? "Préparation…" : "Préparer la journée"}
          </button>
          <p className="sgh-offpop-note">
            Télécharge vos chantiers des sept prochains jours, et les plans de
            montage du jour et du lendemain, pour les consulter sans réseau.
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
