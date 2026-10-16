"use client";

/**
 * Le Kanban.
 *
 * Les projets de l'application, rangés en colonnes selon l'une des deux
 * propriétés d'avancement de Notion. Ce n'est pas une seconde base de
 * projets : les cartes sont les mêmes objets que partout ailleurs, la fiche
 * latérale est celle de toute l'app, et déplacer une carte écrit dans Notion
 * par la même route que les autres écrans.
 *
 * Le glisser-déposer est écrit avec les événements « pointer » plutôt qu'avec
 * le glisser-déposer natif du navigateur : ce dernier n'existe pas au doigt,
 * et la moitié du travail se fait sur iPad.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Loader2, SlidersHorizontal, RotateCcw, Columns3, Check, AlertTriangle,
} from "lucide-react";
import type { Project } from "@/lib/notion";
import {
  SANS_STATUT, LIBELLE_DE_VUE, PROPRIETE_DE_VUE, FILTRES_VIDES,
  REGLAGES_COLONNES_PAR_DEFAUT, TRIS,
  construireColonnes, comptesParColonne, filtrer, indexer, localiteDe,
  statutDe, teinteDe, valeursDeFiltres, filtresActifs,
  type Colonne, type Filtres, type OptionColonne, type ReglagesColonnes, type Tri, type Vue,
} from "@/lib/kanban";
import {
  openSignalPreview, ouvrirApercuSurvol, survolerApercu, quitterApercu,
} from "@/components/signal-preview";
import { useDroits } from "@/lib/use-droits";
import { toast } from "sonner";

const CLE_VUE = "tm-kanban-vue";
const CLE_REGLAGES = "tm-kanban-reglages";

interface Props {
  projets: Project[];
  chargement?: boolean;
}

export function KanbanView({ projets, chargement = false }: Props) {
  const { peut } = useDroits();

  const [vue, setVue] = useState<Vue>("mesures");
  const [options, setOptions] = useState<Record<Vue, OptionColonne[]>>({ mesures: [], cmd: [] });
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [reglages, setReglages] = useState<ReglagesColonnes>(REGLAGES_COLONNES_PAR_DEFAUT);
  const [panneau, setPanneau] = useState<null | "filtres" | "colonnes">(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const peutDeplacer = peut(vue === "mesures" ? "kanban.mesures" : "kanban.cmd") && peut("projets.modifier");

  /* ── Préférences, par utilisateur et par navigateur ──────────────────── */
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLE_VUE);
      if (v === "mesures" || v === "cmd") setVue(v);
      const r = localStorage.getItem(CLE_REGLAGES);
      if (r) setReglages({ ...REGLAGES_COLONNES_PAR_DEFAUT, ...JSON.parse(r) });
    } catch { /* stockage indisponible */ }
  }, []);

  const changerVue = (v: Vue) => {
    setVue(v);
    try { localStorage.setItem(CLE_VUE, v); } catch { /* sans gravité */ }
  };
  const majReglages = (maj: Partial<ReglagesColonnes>) => {
    setReglages((prec) => {
      const suite = { ...prec, ...maj };
      try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(suite)); } catch { /* sans gravité */ }
      return suite;
    });
  };

  /* ── Les colonnes, depuis Notion ─────────────────────────────────────── */
  const [colonnesPerimees, setColonnesPerimees] = useState(false);
  useEffect(() => {
    fetch("/api/kanban/colonnes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.colonnes) setOptions(d.colonnes);
        if (d?.perime) setColonnesPerimees(true);
      })
      .catch(() => { /* on reconstruira depuis les projets */ });
  }, []);

  /* ── Les cartes ──────────────────────────────────────────────────────── */
  /** Copie locale : une carte déplacée bouge tout de suite, avant Notion. */
  const [local, setLocal] = useState<Record<string, string>>({});
  const projetsVus = useMemo(
    () => projets.map((p) => (local[p.id] !== undefined
      ? { ...p, [PROPRIETE_DE_VUE[vue]]: local[p.id] }
      : p)),
    [projets, local, vue],
  );

  const indexes = useMemo(() => indexer(projetsVus), [projetsVus]);
  const retenus = useMemo(() => filtrer(indexes, filtres), [indexes, filtres]);
  const colonnes = useMemo(
    () => construireColonnes(retenus, vue, options[vue], reglages),
    [retenus, vue, options, reglages],
  );
  const comptes = useMemo(() => comptesParColonne(retenus, vue), [retenus, vue]);
  const valeurs = useMemo(() => valeursDeFiltres(projetsVus), [projetsVus]);

  /* Toutes les colonnes possibles, masquées comprises — pour le panneau. */
  const toutesColonnes = useMemo(() => {
    const noms = options[vue].map((o) => o.nom);
    for (const c of Object.keys(comptes)) if (c !== SANS_STATUT && !noms.includes(c)) noms.push(c);
    return noms;
  }, [options, vue, comptes]);

  /* ── Déplacement d'une carte ─────────────────────────────────────────── */

  const deplacer = useCallback(async (projet: Project, versStatut: string) => {
    const avant = statutDe(projet, vue);
    const vers = versStatut === SANS_STATUT ? "" : versStatut;
    if (avant === vers) return;
    if (!peutDeplacer) {
      toast.error("Vous n'avez pas l'autorisation de changer cet avancement.");
      return;
    }
    /* La carte bouge tout de suite : attendre Notion donnerait l'impression
       que le geste n'a pas été pris. Si l'écriture échoue, on remet. */
    setLocal((l) => ({ ...l, [projet.id]: vers }));
    setEnCours(projet.id);
    try {
      const r = await fetch(`/api/projects/${projet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [PROPRIETE_DE_VUE[vue]]: vers }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Notion n'a pas répondu.");
      toast.success(
        `${projet.ofrTM || "Projet"} déplacé vers « ${vers || "Sans statut"} »`,
        {
          action: {
            label: "Annuler",
            /* Le retour en arrière repasse par la même route : il est une
               modification comme une autre, pas une restauration magique. */
            onClick: () => { void deplacer({ ...projet, [PROPRIETE_DE_VUE[vue]]: vers } as Project, avant || SANS_STATUT); },
          },
        },
      );
    } catch (e) {
      setLocal((l) => ({ ...l, [projet.id]: avant }));
      toast.error(
        `Déplacement non enregistré : ${e instanceof Error ? e.message : "erreur inconnue"}. La carte est revenue à sa place.`,
      );
    } finally {
      setEnCours(null);
    }
  }, [vue, peutDeplacer]);

  /* ── Glisser-déposer au pointeur (souris ET doigt) ───────────────────── */

  const [glisse, setGlisse] = useState<{ projet: Project; x: number; y: number } | null>(null);
  const [cible, setCible] = useState<string | null>(null);
  const depart = useRef<{ x: number; y: number; projet: Project } | null>(null);

  const surPointerDown = (e: React.PointerEvent, projet: Project) => {
    if (!peutDeplacer) return;
    if (e.button !== undefined && e.button !== 0) return;
    depart.current = { x: e.clientX, y: e.clientY, projet };
  };

  useEffect(() => {
    if (!peutDeplacer) return;

    const bouge = (e: PointerEvent) => {
      const d = depart.current;
      if (!d) return;
      /* Six pixels de marge : sans ce seuil, un clic un peu tremblant sur le
         numéro déclenchait un déplacement. */
      if (!glisse && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      if (!glisse) setGlisse({ projet: d.projet, x: e.clientX, y: e.clientY });
      else setGlisse({ ...glisse, x: e.clientX, y: e.clientY });

      const sous = document.elementFromPoint(e.clientX, e.clientY);
      const col = sous?.closest<HTMLElement>("[data-colonne]");
      setCible(col?.dataset.colonne ?? null);
      e.preventDefault();
    };

    const lache = () => {
      const d = depart.current;
      depart.current = null;
      if (glisse && cible && d) void deplacer(d.projet, cible);
      setGlisse(null);
      setCible(null);
    };

    window.addEventListener("pointermove", bouge, { passive: false });
    window.addEventListener("pointerup", lache);
    window.addEventListener("pointercancel", lache);
    return () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", lache);
      window.removeEventListener("pointercancel", lache);
    };
  }, [glisse, cible, deplacer, peutDeplacer]);

  /* ── Rendu ───────────────────────────────────────────────────────────── */

  if (!peut("kanban.voir")) {
    return (
      <div className="glass-card rounded-2xl p-6 text-center text-sm text-gray-500">
        Vous n&apos;avez pas accès au Kanban.
      </div>
    );
  }

  const nbFiltres = filtresActifs(filtres);

  return (
    <div className="kb flex flex-col gap-3">
      {/* ── Barre du haut ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex glass-tabs rounded-xl p-1 shrink-0">
          {(["mesures", "cmd"] as Vue[]).map((v) => (
            <button key={v} onClick={() => changerVue(v)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                vue === v ? "glass-tab-active text-[#1e3a5f] dark:text-white" : "text-gray-500 dark:text-gray-400"
              }`}>
              {v === "mesures" ? "📏" : "📦"} {LIBELLE_DE_VUE[v]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={filtres.recherche}
            onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
            placeholder="Rechercher un projet, une adresse, un client…"
            className="kb-rech w-full h-10 pl-9 pr-8 rounded-xl glass-input text-sm"
          />
          {filtres.recherche && (
            <button onClick={() => setFiltres({ ...filtres, recherche: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Effacer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button onClick={() => setPanneau(panneau === "filtres" ? null : "filtres")}
          className={`shrink-0 h-10 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
            nbFiltres > 0
              ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}>
          <SlidersHorizontal className="w-4 h-4" />
          Filtres{nbFiltres > 0 ? ` (${nbFiltres})` : ""}
        </button>

        <button onClick={() => setPanneau(panneau === "colonnes" ? null : "colonnes")}
          className="shrink-0 h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
          <Columns3 className="w-4 h-4" />
          Colonnes
        </button>
      </div>

      {/* ── Compteurs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <span><b className="text-gray-800 dark:text-gray-100">{retenus.length}</b> projet{retenus.length > 1 ? "s" : ""} affiché{retenus.length > 1 ? "s" : ""}</span>
        {retenus.length !== projetsVus.length && (
          <span className="text-gray-400">sur {projetsVus.length}</span>
        )}
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span>{colonnes.length} colonne{colonnes.length > 1 ? "s" : ""}</span>
        {!peutDeplacer && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> Lecture seule
          </span>
        )}
        {colonnesPerimees && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> Colonnes d&apos;une lecture précédente : Notion n&apos;a pas répondu.
          </span>
        )}
      </div>

      {/* ── Panneau filtres ───────────────────────────────────────────── */}
      {panneau === "filtres" && (
        <div className="glass-card rounded-2xl p-4 grid gap-3 sm:grid-cols-3">
          {([
            { cle: "collaborateur" as const, titre: "Collaborateur", liste: valeurs.collaborateurs },
            { cle: "fournisseur" as const, titre: "Fournisseur", liste: valeurs.fournisseurs },
            { cle: "localite" as const, titre: "Localité", liste: valeurs.localites },
          ]).map(({ cle, titre, liste }) => (
            <div key={cle} className="min-w-0">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{titre}</label>
              <select
                value={filtres[cle] ?? ""}
                onChange={(e) => setFiltres({ ...filtres, [cle]: e.target.value || null })}
                className="w-full h-10 px-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 text-sm">
                <option value="">Tous</option>
                {liste.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          ))}
          <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={filtres.avecTermines}
                onChange={(e) => setFiltres({ ...filtres, avecTermines: e.target.checked })} />
              Afficher aussi les projets terminés et annulés
            </label>
            <button onClick={() => setFiltres(FILTRES_VIDES)}
              className="ml-auto text-xs font-medium text-gray-500 hover:text-blue-600 inline-flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Effacer les filtres
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau colonnes ──────────────────────────────────────────── */}
      {panneau === "colonnes" && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={reglages.masquerVides}
                onChange={(e) => majReglages({ masquerVides: e.target.checked })} />
              Masquer les colonnes vides
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              Tri
              <select value={reglages.tri} onChange={(e) => majReglages({ tri: e.target.value as Tri })}
                className="h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 text-xs">
                {TRIS.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </label>
            <button onClick={() => majReglages(REGLAGES_COLONNES_PAR_DEFAUT)}
              className="ml-auto text-xs font-medium text-gray-500 hover:text-blue-600 inline-flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser l&apos;affichage
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {toutesColonnes.map((nom) => {
              const masquee = reglages.masquees.includes(nom);
              return (
                <button key={nom}
                  onClick={() => majReglages({
                    masquees: masquee
                      ? reglages.masquees.filter((x) => x !== nom)
                      : [...reglages.masquees, nom],
                  })}
                  className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 transition-colors ${
                    masquee
                      ? "border-gray-200 dark:border-gray-600 text-gray-400 line-through"
                      : "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  }`}>
                  {!masquee && <Check className="w-3 h-3" />}
                  {nom} <span className="text-gray-400">{comptes[nom] || 0}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Masquer une colonne ne change rien aux projets : ils restent dans Notion,
            et la recherche continue de les trouver.
          </p>
        </div>
      )}

      {/* ── Le tableau ────────────────────────────────────────────────── */}
      {chargement && projets.length === 0 ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement des projets…
        </div>
      ) : (
        <div className="kb-plateau flex gap-3 overflow-x-auto pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
          {colonnes.map((c) => (
            <ColonneVue
              key={c.id}
              colonne={c}
              vue={vue}
              survolee={cible === c.id}
              enCours={enCours}
              peutDeplacer={peutDeplacer}
              onPointerDownCarte={surPointerDown}
            />
          ))}
          {colonnes.length === 0 && (
            <div className="w-full text-center py-16 text-sm text-gray-400">
              Aucun projet ne correspond.
            </div>
          )}
        </div>
      )}

      {/* ── La carte qui suit le doigt ────────────────────────────────── */}
      {glisse && (
        <div className="fixed z-[9999] pointer-events-none opacity-90"
          style={{ left: glisse.x - 110, top: glisse.y - 28, width: 220 }}>
          <Carte projet={glisse.projet} vue={vue} fantome />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */

function ColonneVue({
  colonne, vue, survolee, enCours, peutDeplacer, onPointerDownCarte,
}: {
  colonne: Colonne;
  vue: Vue;
  survolee: boolean;
  enCours: string | null;
  peutDeplacer: boolean;
  onPointerDownCarte: (e: React.PointerEvent, p: Project) => void;
}) {
  const t = teinteDe(colonne.couleur);
  return (
    <section
      data-colonne={colonne.id}
      className={`kb-col shrink-0 w-[272px] rounded-2xl flex flex-col transition-colors ${survolee ? "kb-col-cible" : ""}`}
      style={{ background: t.fond, outline: survolee ? `2px dashed ${t.trait}` : undefined }}
    >
      <header className="kb-col-tete sticky top-0 z-10 px-3 py-2.5 rounded-t-2xl backdrop-blur-sm"
        style={{ background: t.fond, borderBottom: `1px solid ${t.trait}33` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.trait }} />
          <h3 className="text-[12.5px] font-semibold text-gray-800 truncate">{colonne.titre}</h3>
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-gray-500 tabular-nums">
            {colonne.projets.length}
          </span>
        </div>
      </header>

      <div className="kb-col-corps flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100vh-280px)]">
        {colonne.projets.map((p) => (
          <Carte
            key={p.id}
            projet={p}
            vue={vue}
            trait={t.trait}
            occupe={enCours === p.id}
            peutDeplacer={peutDeplacer}
            onPointerDown={onPointerDownCarte}
          />
        ))}
        {colonne.projets.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-6">Aucun projet</p>
        )}
      </div>
    </section>
  );
}

function Carte({
  projet, vue, trait, occupe, peutDeplacer, onPointerDown, fantome,
}: {
  projet: Project;
  vue: Vue;
  trait?: string;
  occupe?: boolean;
  peutDeplacer?: boolean;
  onPointerDown?: (e: React.PointerEvent, p: Project) => void;
  fantome?: boolean;
}) {
  const localite = localiteDe(projet);
  const adresse = (projet.adresseChantier || "").replace(localite, "").replace(/[,;]\s*$/, "").trim();
  const cabines = projet.nbCabines;

  return (
    <article
      onPointerDown={peutDeplacer && onPointerDown ? (e) => onPointerDown(e, projet) : undefined}
      className={`kb-carte bg-white rounded-xl p-2.5 shadow-sm border border-black/5 ${
        fantome ? "shadow-xl rotate-1" : "hover:shadow-md transition-shadow"
      } ${peutDeplacer ? "cursor-grab active:cursor-grabbing" : ""} ${occupe ? "opacity-60" : ""}`}
      style={{
        ...(trait ? { borderLeft: `3px solid ${trait}` } : {}),
        /* Sans ceci, le doigt qui déplace une carte fait aussi défiler la
           colonne : le navigateur tranche en faveur du défilement. */
        ...(peutDeplacer ? { touchAction: "none" as const } : {}),
      }}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <button
          onClick={(e) => { e.stopPropagation(); openSignalPreview(projet); }}
          onPointerEnter={() => survolerApercu(projet.id, () => ouvrirApercuSurvol(projet, "kanban"))}
          onPointerLeave={() => quitterApercu(projet.id)}
          onPointerDown={(e) => e.stopPropagation()}
          className="kb-num font-mono text-[11.5px] font-bold text-blue-700 hover:underline shrink-0"
          title="Voir la fiche"
        >
          {projet.ofrTM || "—"}
        </button>
        {occupe && <Loader2 className="w-3 h-3 animate-spin text-gray-400 ml-auto shrink-0" />}
      </div>

      <div className="text-[12.5px] font-semibold text-gray-900 leading-tight mt-0.5 line-clamp-2">
        {projet.projet || projet.nomChantier || "Sans nom"}
      </div>

      {(adresse || localite) && (
        <div className="text-[11px] text-gray-500 leading-snug mt-1">
          {adresse && <div className="truncate">📍 {adresse}</div>}
          {localite && <div className="truncate">{localite}</div>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10.5px]">
        {cabines ? (
          <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
            🚿 {cabines} cab.
          </span>
        ) : null}
        {projet.collaborateurs && (
          <span className="text-gray-500 truncate">👤 {projet.collaborateurs}</span>
        )}
      </div>

      {/* Ce qui compte dépend de la vue : une date de RDV côté mesures,
          une commande côté livraison. */}
      {vue === "cmd" && projet.dateCMDRecue && (
        <div className="text-[10.5px] text-gray-500 mt-1">📅 CMD {formatCourt(projet.dateCMDRecue)}</div>
      )}
      {vue === "mesures" && projet.dateMesuresRecue && (
        <div className="text-[10.5px] text-gray-500 mt-1">📅 Mesures {formatCourt(projet.dateMesuresRecue)}</div>
      )}
    </article>
  );
}

function formatCourt(d?: string | null): string {
  if (!d) return "—";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}
