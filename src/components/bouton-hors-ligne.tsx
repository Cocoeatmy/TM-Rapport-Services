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
 *
 * ── Où il se trouve, et pour qui (18 octobre 2026) ──────────────────────
 *
 * Il n'est pas au même endroit selon qui regarde, et c'est voulu :
 *
 *   — un MONTEUR le garde dans la barre du haut, à portée de pouce. C'est
 *     le dernier geste avant de monter dans la camionnette, et il doit se
 *     voir sans ouvrir de menu ;
 *   — l'ADMINISTRATEUR le trouve dans le menu du profil. Depuis le bureau,
 *     on ne prépare pas une journée de chantier ; le bouton occupait un
 *     rond permanent dans une barre qui en comptait huit et qui débordait
 *     sur un iPad en portrait.
 *
 * Jamais aux deux endroits à la fois : un même bouton en double est un
 * bouton dont on ne sait plus lequel est le bon. Le FONCTIONNEMENT est
 * identique dans les deux cas — même état, même panneau, même bouton
 * « Préparer la journée ».
 *
 * ── Et depuis le 18 octobre, il n'attend plus qu'on y pense ─────────────
 *
 * Le seul geste qu'on pouvait oublier était celui-ci. La préparation se
 * lance donc toute seule, à l'ouverture de l'application, du LUNDI AU
 * VENDREDI entre 6 H 30 ET 7 H 30 — l'heure du téléphone, donc celle du
 * monteur. Une fois par jour, jamais le week-end, jamais en dehors de
 * cette heure-là, et seulement si ce qui est sur l'appareil a plus de
 * douze heures.
 *
 * Une application web ne tourne que lorsqu'elle est ouverte : « à 6 h 30 »
 * veut donc dire « à la première ouverture dans cette tranche ». Si le
 * monteur n'ouvre rien avant 8 h, rien ne se lance — il reste le bouton,
 * qui dit alors « à rafraîchir ». La règle elle-même vit dans
 * `preparation-auto.ts`, où elle se laisse éprouver heure par heure.
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

export interface ProprietesBoutonHorsLigne {
  /** `rond` : la pastille historique de l'en-tête. `menu` : une ligne du
      menu profil, alignée sur les autres entrées. */
  variante?: "rond" | "menu";
}

export function BoutonHorsLigne({ variante = "rond" }: ProprietesBoutonHorsLigne = {}) {
  /* Le thème Signal seul monte ce bouton : les autres gardent l'en-tête qu'ils
     ont toujours eu. On lit l'attribut plutôt qu'un contexte — il est posé
     avant l'hydratation, et aucune donnée ne transite. */
  const [signal, setSignal] = useState(false);
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<string | null>(null);
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
      .then((d) => {
        if (d?.user?.name) setNom(String(d.user.name));
        if (d?.user?.role) setRole(String(d.user.role));
      })
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

  const preparer = useCallback(async () => {
    setTravaille(true);
    try {
      await prefetchTodaysProjects(projetsEnCache(), nom, true);
    } finally {
      await relire();
      setTravaille(false);
    }
  }, [nom, relire]);

  /* ── La préparation du matin, sans qu'on la demande ───────────────────
     `page.tsx` la déclenche déjà à l'affichage du tableau de bord. Mais un
     monteur ouvre souvent l'application directement sur une fiche : la
     barre du haut, elle, est partout. On appelle donc sans forcer — la
     fenêtre du lundi au vendredi 6 h 30 – 7 h 30, le plafond d'une fois
     par heure et la marque du jour vivent tous dans
     `prefetchTodaysProjects`, qui refuse poliment le reste du temps. */
  useEffect(() => {
    if (!nom) return;
    const t = setTimeout(() => {
      const projets = projetsEnCache();
      if (projets.length === 0) return;
      prefetchTodaysProjects(projets, nom).then(relire).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [nom, relire]);

  if (!signal) return null;

  /* La pastille de l'en-tête n'est montée que pour ceux qui partent en
     chantier. Tant que le compte n'est pas connu, on ne montre rien : mieux
     vaut une barre qui se complète qu'un bouton qui disparaît sous les yeux.
     L'administrateur, lui, l'a dans son menu — voir `UserMenu`. */
  if (variante === "rond" && role !== "monteur") return null;

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

  const icone = charge && !perime
    ? <CloudCheck className="w-4 h-4" />
    : <CloudDownload className="w-4 h-4" />;

  const basculer = () => setOuvert((o) => !o);

  return (
    <>
      {variante === "menu" ? (
        /* En ligne de menu : même gabarit que « Sauvegardes » ou « Droits
           d'accès » juste au-dessus, pour que la liste reste une liste. Le
           sous-titre dit l'état sans qu'on ait à ouvrir le panneau. */
        <button
          ref={btnRef}
          type="button"
          aria-expanded={ouvert}
          onClick={basculer}
          className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
        >
          <span className={alerte ? "text-amber-600 dark:text-amber-400" : ""}>{icone}</span>
          <span className="flex-1 min-w-0">
            Journée hors ligne
            <em className="block not-italic text-[11px] text-gray-400 dark:text-gray-500 truncate">{titre}</em>
          </span>
          {bloques > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
          )}
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          className={`sgh-off${alerte ? " is-alerte" : ""}`}
          aria-expanded={ouvert}
          aria-label={`Hors réseau — ${titre}`}
          title={`${titre} · ${detail}`}
          onClick={basculer}
        >
          {icone}
          {bloques > 0 && <span className="sgh-off-point" aria-hidden="true" />}
        </button>
      )}

      {/* ── Le panneau ───────────────────────────────────────────────────
          En variante « rond », il flotte sous le bouton de l'en-tête, comme
          avant. En variante « menu », il se DÉPLIE dans le menu : une bulle
          flottante y aurait recouvert la liste dont elle sort, et surtout,
          refermer le menu pour lui faire de la place démontait le composant
          — le panneau ne s'ouvrait jamais. Un dépliant ne pose aucun de ces
          deux problèmes. */}
      {ouvert && variante === "menu" && (
        <div className="px-3 pb-2 pt-1" role="group" aria-label="Journée prête hors ligne">
          {enAttente > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
              {enAttente} envoi{enAttente > 1 ? "s" : ""} en attente — ils partiront dès le retour du réseau.
            </p>
          )}
          {bloques > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{bloques} envoi{bloques > 1 ? "s" : ""} qui n&apos;aboutissent pas — à vérifier.</span>
            </p>
          )}
          <button
            type="button"
            onClick={preparer}
            disabled={travaille}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {travaille ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {travaille ? "Préparation…" : "Préparer la journée"}
          </button>
          <p className="mt-1.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
            Télécharge vos chantiers des sept prochains jours, et les plans de
            montage du jour et du lendemain, pour les consulter sans réseau.
          </p>
        </div>
      )}

      {ouvert && variante === "rond" && typeof document !== "undefined" && createPortal(
        <div ref={popRef} className="sgh-offpop" style={{ top: pos.top, right: pos.right }}
          role="dialog" aria-label="Journée prête hors ligne">
          <div className="sgh-offpop-head">
            <span className={`sgh-offpop-chip${alerte ? " is-alerte" : ""}`}>
              {icone}
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
