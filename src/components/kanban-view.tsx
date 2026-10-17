"use client";

/**
 * Le Kanban.
 *
 * Les projets de l'application, rangés en colonnes selon l'une des deux
 * propriétés d'avancement de Notion. Ce n'est pas une seconde base de
 * projets : les cartes sont les mêmes objets que partout ailleurs, la fiche
 * latérale est celle de toute l'app, et déplacer une carte écrit dans Notion.
 *
 * Trois choix de fond :
 *
 *   — le glisser-déposer est écrit aux événements « pointer » plutôt qu'au
 *     glisser-déposer natif du navigateur, qui n'existe pas au doigt — la
 *     moitié du travail se fait sur iPad ;
 *   — lâcher une carte dans SA colonne la réordonne et n'écrit rien dans
 *     Notion ; la lâcher ailleurs change son état. Deux gestes voisins, deux
 *     conséquences très différentes : la seconde passe par une route qui
 *     relit l'état réel avant d'écrire ;
 *   — une carte ne porte qu'une pastille, la plus grave. Trois pastilles sur
 *     une carte, c'est une carte qu'on ne lit plus. Les autres situations
 *     restent dans les filtres.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Loader2, SlidersHorizontal, RotateCcw, Columns3, Check, AlertTriangle,
  Star, Bookmark, Save, Trash2, MoreHorizontal, Copy, History, Maximize2, Minimize2,
  Paperclip, Clock, CheckSquare, Square,
} from "lucide-react";
import type { Project } from "@/lib/notion";
import {
  SANS_STATUT, LIBELLE_DE_VUE, FILTRES_VIDES, REGLAGES_COLONNES_PAR_DEFAUT, TRIS,
  construireColonnes, comptesParColonne, filtrer, indexer, localiteDe,
  statutDe, teinteDe, valeursDeFiltres, filtresActifs,
  type Colonne, type Filtres, type OptionColonne, type ReglagesColonnes, type Tri, type Vue,
} from "@/lib/kanban";
import {
  META_INDICATEURS, ORDRE_INDICATEURS, REGLES_PAR_DEFAUT,
  comptesIndicateurs, contexteVide, joursSansEvolution, situationDe,
  type Contexte, type Indicateur, type LigneHistorique, type Regles,
} from "@/lib/kanban-indicateurs";
import {
  VUES_INTEGREES, vueMesProjets, lireVues, ecrireVues, idDepuisNom,
  type VueEnregistree,
} from "@/lib/kanban-vues";
import { jourDe } from "@/lib/signaux";
import {
  openSignalPreview, ouvrirApercuSurvol, survolerApercu, quitterApercu,
} from "@/components/signal-preview";
import { useDroits } from "@/lib/use-droits";
import { toast } from "sonner";

const CLE_VUE = "tm-kanban-vue";
const CLE_REGLAGES = "tm-kanban-reglages";
const CLE_CONCENTRATION = "tm-kanban-concentration";

/** Combien de cartes on dessine d'emblée dans une colonne. Le reste suit au
 *  défilement : à six cents projets, tout dessiner d'un coup se sent. */
const PAR_PAQUET = 40;

interface Props {
  projets: Project[];
  chargement?: boolean;
}

export function KanbanView({ projets, chargement = false }: Props) {
  const { peut, mes } = useDroits();

  const [vue, setVue] = useState<Vue>("mesures");
  const [options, setOptions] = useState<Record<Vue, OptionColonne[]>>({ mesures: [], cmd: [] });
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [reglages, setReglages] = useState<ReglagesColonnes>(REGLAGES_COLONNES_PAR_DEFAUT);
  const [panneau, setPanneau] = useState<null | "filtres" | "colonnes" | "vues">(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [concentration, setConcentration] = useState(false);

  const peutDeplacer = peut(vue === "mesures" ? "kanban.mesures" : "kanban.cmd") && peut("projets.modifier");

  /* ── Préférences ─────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLE_VUE);
      if (v === "mesures" || v === "cmd") setVue(v);
      const r = localStorage.getItem(CLE_REGLAGES);
      if (r) setReglages({ ...REGLAGES_COLONNES_PAR_DEFAUT, ...JSON.parse(r) });
      setConcentration(localStorage.getItem(CLE_CONCENTRATION) === "1");
    } catch { /* stockage indisponible */ }
  }, []);

  const changerVue = (v: Vue) => {
    setVue(v);
    try { localStorage.setItem(CLE_VUE, v); } catch { /* sans gravité */ }
  };
  const majReglages = useCallback((maj: Partial<ReglagesColonnes>) => {
    setReglages((prec) => {
      const suite = { ...prec, ...maj };
      try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(suite)); } catch { /* sans gravité */ }
      return suite;
    });
  }, []);
  const basculerConcentration = () => {
    setConcentration((v) => {
      try { localStorage.setItem(CLE_CONCENTRATION, v ? "0" : "1"); } catch { /* sans gravité */ }
      return !v;
    });
  };

  /* ── Colonnes, depuis Notion ─────────────────────────────────────────── */
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

  /* ── Le contexte des pastilles ───────────────────────────────────────── */
  const [regles, setRegles] = useState<Regles>(REGLES_PAR_DEFAUT);
  const [priorites, setPriorites] = useState<Record<string, Indicateur>>({});
  const [historique, setHistorique] = useState<LigneHistorique[]>([]);
  const [piecesOuvertes, setPiecesOuvertes] = useState<Set<string>>(new Set());

  const rechargerEtat = useCallback(() => {
    fetch("/api/kanban/etat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.regles) setRegles({ ...REGLES_PAR_DEFAUT, ...d.regles });
        if (d.priorites) setPriorites(d.priorites);
        if (Array.isArray(d.historique)) setHistorique(d.historique);
      })
      .catch(() => { /* les pastilles se contenteront des règles d'origine */ });
  }, []);
  useEffect(() => { rechargerEtat(); }, [rechargerEtat]);

  useEffect(() => {
    /* Un chantier n'est « bloqué » que si quelque chose le bloque vraiment :
       une pièce demandée et pas reçue, ou le statut posé à la main. On ne le
       déduit jamais d'une attente. */
    fetch("/api/pieces", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((liste: { projectId?: string; status?: string; resolved?: boolean }[]) => {
        if (!Array.isArray(liste)) return;
        setPiecesOuvertes(new Set(
          liste.filter((x) => !(x.status === "recu" || x.resolved === true))
            .map((x) => x.projectId || "").filter(Boolean),
        ));
      })
      .catch(() => { /* sans les pièces, « bloqué » se limite au statut */ });
  }, []);

  const contexte: Contexte = useMemo(() => ({
    ...contexteVide(),
    piecesOuvertes,
    manuelles: priorites,
    regles,
  }), [piecesOuvertes, priorites, regles]);

  /* ── Les cartes ──────────────────────────────────────────────────────── */
  /** Copie locale : une carte déplacée bouge avant que Notion ait répondu. */
  const [local, setLocal] = useState<Record<string, { mesures?: string; cmd?: string }>>({});
  const projetsVus = useMemo(() => projets.map((p) => {
    const l = local[p.id];
    if (!l) return p;
    return {
      ...p,
      ...(l.mesures !== undefined ? { etatMesures: l.mesures } : {}),
      ...(l.cmd !== undefined ? { etatCMD: l.cmd } : {}),
    };
  }), [projets, local]);

  const indexes = useMemo(() => indexer(projetsVus), [projetsVus]);
  const retenus = useMemo(() => filtrer(indexes, filtres, contexte), [indexes, filtres, contexte]);
  const colonnes = useMemo(
    () => construireColonnes(retenus, vue, options[vue], reglages, contexte),
    [retenus, vue, options, reglages, contexte],
  );
  const comptes = useMemo(() => comptesParColonne(retenus, vue), [retenus, vue]);
  const valeurs = useMemo(() => valeursDeFiltres(projetsVus), [projetsVus]);

  /** Les compteurs des pastilles portent sur tout, pas sur ce qui est filtré :
   *  sinon cliquer « Urgents » ferait tomber le compteur « Urgents » à sa
   *  propre valeur et on ne saurait plus d'où l'on part. */
  const baseCompteurs = useMemo(
    () => filtrer(indexes, { ...FILTRES_VIDES, avecTermines: filtres.avecTermines }, contexte),
    [indexes, filtres.avecTermines, contexte],
  );
  const comptesCouleurs = useMemo(
    () => comptesIndicateurs(baseCompteurs, contexte),
    [baseCompteurs, contexte],
  );
  const sansResponsable = useMemo(
    () => baseCompteurs.filter((p) => !(p.collaborateurs || "").trim()).length,
    [baseCompteurs],
  );

  const toutesColonnes = useMemo(() => {
    const noms = options[vue].map((o) => o.nom);
    for (const c of Object.keys(comptes)) if (c !== SANS_STATUT && !noms.includes(c)) noms.push(c);
    return noms;
  }, [options, vue, comptes]);

  /* ── Déplacer une carte d'une colonne à l'autre ──────────────────────── */

  const deplacer = useCallback(async (projet: Project, versStatut: string, precedentAttendu?: string) => {
    const avant = statutDe(projet, vue);
    const vers = versStatut === SANS_STATUT ? "" : versStatut;
    if (avant === vers && precedentAttendu === undefined) return;
    if (!peutDeplacer) {
      toast.error("Vous n'avez pas l'autorisation de changer cet avancement.");
      return;
    }
    setLocal((l) => ({ ...l, [projet.id]: { ...l[projet.id], [vue]: vers } }));
    setEnCours(projet.id);
    try {
      const r = await fetch("/api/kanban/deplacer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetId: projet.id, vue, vers, precedentAttendu }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Notion n'a pas répondu.");
      rechargerEtat();
      toast.success(
        `${projet.ofrTM || "Projet"} → « ${vers || "Sans statut"} »`,
        {
          action: {
            label: "Annuler",
            onClick: () => {
              /* On dit à la route ce qu'on s'attend à trouver : si quelqu'un
                 est passé entre-temps, elle refusera plutôt que d'écraser. */
              void deplacer({ ...projet, etatMesures: vue === "mesures" ? vers : projet.etatMesures, etatCMD: vue === "cmd" ? vers : projet.etatCMD } as Project, avant || SANS_STATUT, vers);
            },
          },
        },
      );
    } catch (e) {
      setLocal((l) => ({ ...l, [projet.id]: { ...l[projet.id], [vue]: avant } }));
      toast.error(
        `${e instanceof Error ? e.message : "Erreur inconnue"} La carte est revenue à sa place.`,
      );
    } finally {
      setEnCours(null);
    }
  }, [vue, peutDeplacer, rechargerEtat]);

  /** Réordonner DANS une colonne : rien ne part vers Notion. */
  const reordonner = useCallback((colonneId: string, projetId: string, versIndex: number) => {
    const col = colonnes.find((c) => c.id === colonneId);
    if (!col) return;
    const ordre = col.projets.map((p) => p.id).filter((id) => id !== projetId);
    ordre.splice(Math.max(0, Math.min(versIndex, ordre.length)), 0, projetId);
    majReglages({
      tri: "manuel",
      ordreManuel: { ...reglages.ordreManuel, [colonneId]: ordre },
    });
  }, [colonnes, majReglages, reglages.ordreManuel]);

  /* ── Glisser-déposer ─────────────────────────────────────────────────── */

  const [glisse, setGlisse] = useState<{ projet: Project; source: string; x: number; y: number } | null>(null);
  const [cible, setCible] = useState<{ colonne: string; index: number } | null>(null);
  const depart = useRef<{ x: number; y: number; projet: Project; source: string } | null>(null);

  const surPointerDown = (e: React.PointerEvent, projet: Project, source: string) => {
    if (!peutDeplacer) return;
    if (e.button !== undefined && e.button !== 0) return;
    depart.current = { x: e.clientX, y: e.clientY, projet, source };
  };

  useEffect(() => {
    if (!peutDeplacer) return;

    const bouge = (e: PointerEvent) => {
      const d = depart.current;
      if (!d) return;
      /* Six pixels de marge : sans ce seuil, un clic un peu tremblant sur le
         numéro déclenchait un déplacement. */
      if (!glisse && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      setGlisse((g) => (g ? { ...g, x: e.clientX, y: e.clientY }
        : { projet: d.projet, source: d.source, x: e.clientX, y: e.clientY }));

      const sous = document.elementFromPoint(e.clientX, e.clientY);
      const col = sous?.closest<HTMLElement>("[data-colonne]");
      if (!col) { setCible(null); return; }
      /* L'index d'insertion : au-dessus ou en dessous de la carte survolée. */
      const carte = sous?.closest<HTMLElement>("[data-carte-index]");
      let index = col.querySelectorAll("[data-carte-index]").length;
      if (carte) {
        const i = Number(carte.dataset.carteIndex || 0);
        const r = carte.getBoundingClientRect();
        index = e.clientY < r.top + r.height / 2 ? i : i + 1;
      }
      setCible({ colonne: col.dataset.colonne!, index });
      e.preventDefault();
    };

    const lache = () => {
      const d = depart.current;
      const g = glisse;
      const c = cible;
      depart.current = null;
      setGlisse(null);
      setCible(null);
      if (!g || !c || !d) return;
      if (c.colonne === d.source) reordonner(c.colonne, d.projet.id, c.index);
      else void deplacer(d.projet, c.colonne);
    };

    window.addEventListener("pointermove", bouge, { passive: false });
    window.addEventListener("pointerup", lache);
    window.addEventListener("pointercancel", lache);
    return () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", lache);
      window.removeEventListener("pointercancel", lache);
    };
  }, [glisse, cible, deplacer, reordonner, peutDeplacer]);

  /* ── Sélection multiple ──────────────────────────────────────────────── */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const basculerSelection = (id: string) => {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const [groupeEnCours, setGroupeEnCours] = useState(false);

  const deplacerEnGroupe = async (versStatut: string) => {
    const liste = retenus.filter((p) => selection.has(p.id));
    if (liste.length === 0) return;
    setGroupeEnCours(true);
    let reussis = 0;
    const echecs: string[] = [];
    /* En série, et non en parallèle : Notion accepte environ trois requêtes
       par seconde, et un lot de trente cartes lancé d'un coup se fait
       refuser la moitié du temps. */
    for (const p of liste) {
      try {
        const r = await fetch("/api/kanban/deplacer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projetId: p.id, vue, vers: versStatut === SANS_STATUT ? "" : versStatut }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "refus");
        reussis += 1;
        setLocal((l) => ({ ...l, [p.id]: { ...l[p.id], [vue]: versStatut === SANS_STATUT ? "" : versStatut } }));
      } catch {
        echecs.push(p.ofrTM || p.id);
      }
    }
    setGroupeEnCours(false);
    setSelection(new Set());
    rechargerEtat();
    if (echecs.length === 0) toast.success(`${reussis} projet(s) déplacé(s).`);
    else toast.error(`${reussis} déplacé(s). Échec sur : ${echecs.join(", ")}.`);
  };

  /* ── Vues enregistrées ───────────────────────────────────────────────── */
  const [miennes, setMiennes] = useState<VueEnregistree[]>([]);
  useEffect(() => { setMiennes(lireVues()); }, []);

  const toutesVues = useMemo(() => {
    const prenom = (mes?.nom || "").split(" ")[0];
    return [
      ...VUES_INTEGREES.slice(0, 1),
      ...(prenom ? [vueMesProjets(prenom)] : []),
      ...VUES_INTEGREES.slice(1),
      ...miennes,
    ];
  }, [miennes, mes]);

  const appliquerVue = (v: VueEnregistree) => {
    changerVue(v.vue);
    setFiltres(v.filtres);
    majReglages(v.reglages);
    setPanneau(null);
    toast.success(`Vue « ${v.nom} »`);
  };

  const enregistrerVue = () => {
    const nom = window.prompt("Nom de la vue ?")?.trim();
    if (!nom) return;
    const nouvelle: VueEnregistree = { id: idDepuisNom(nom), nom, vue, filtres, reglages };
    const suite = [...miennes.filter((x) => x.id !== nouvelle.id), nouvelle];
    setMiennes(suite);
    ecrireVues(suite);
    toast.success(`Vue « ${nom} » enregistrée.`);
  };

  const supprimerVue = (id: string) => {
    const suite = miennes.filter((x) => x.id !== id);
    setMiennes(suite);
    ecrireVues(suite);
  };

  /* ── Suggestions de recherche ────────────────────────────────────────── */
  const [suggestionsOuvertes, setSuggestionsOuvertes] = useState(false);
  const champRecherche = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = filtres.recherche.trim().toLowerCase();
    if (q.length < 2) return { projets: [] as Project[], clients: [] as string[], localites: [] as string[] };
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const qn = norm(q);
    return {
      projets: retenus.slice(0, 5),
      clients: [...new Set(projetsVus.map((p) => p.projet).filter((x) => x && norm(x).includes(qn)))].slice(0, 4),
      localites: valeurs.localites.filter((x) => norm(x).includes(qn)).slice(0, 4),
    };
  }, [filtres.recherche, retenus, projetsVus, valeurs.localites]);

  /* ── Raccourcis clavier ──────────────────────────────────────────────── */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const dansUnChamp = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName || "",
      ) || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") {
        setPanneau(null);
        setSuggestionsOuvertes(false);
        setSelection(new Set());
        return;
      }
      if (dansUnChamp) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        champRecherche.current?.focus();
        champRecherche.current?.select();
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  /* ── Rendu ───────────────────────────────────────────────────────────── */

  if (!peut("kanban.voir")) {
    return (
      <div className="glass-card rounded-2xl p-6 text-center text-sm text-gray-500">
        Vous n&apos;avez pas accès au Kanban.
      </div>
    );
  }

  const nbFiltres = filtresActifs(filtres);
  const basculerCouleur = (i: Indicateur) => {
    setFiltres((f) => ({
      ...f,
      indicateurs: f.indicateurs.includes(i)
        ? f.indicateurs.filter((x) => x !== i)
        : [...f.indicateurs, i],
    }));
  };

  return (
    <div className={`kb flex flex-col gap-3 ${concentration ? "kb-concentre" : ""}`}>
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
            ref={champRecherche}
            value={filtres.recherche}
            onChange={(e) => { setFiltres({ ...filtres, recherche: e.target.value }); setSuggestionsOuvertes(true); }}
            onFocus={() => setSuggestionsOuvertes(true)}
            onBlur={() => window.setTimeout(() => setSuggestionsOuvertes(false), 150)}
            placeholder="Rechercher…  (touche /)"
            className="kb-rech w-full h-10 pl-9 pr-8 rounded-xl glass-input text-sm"
          />
          {filtres.recherche && (
            <button onClick={() => setFiltres({ ...filtres, recherche: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Effacer">
              <X className="w-4 h-4" />
            </button>
          )}

          {suggestionsOuvertes && filtres.recherche.trim().length >= 2 && (
            <div className="kb-sugg absolute z-40 mt-1 w-full glass-card rounded-xl p-2 shadow-xl max-h-80 overflow-y-auto">
              {suggestions.clients.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1.5 py-1">Clients</div>
                  {suggestions.clients.map((c) => (
                    <button key={c} onMouseDown={(e) => { e.preventDefault(); setFiltres({ ...filtres, recherche: c }); }}
                      className="w-full text-left text-xs px-1.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 truncate">
                      {c}
                    </button>
                  ))}
                </>
              )}
              {suggestions.localites.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1.5 py-1">Localités</div>
                  {suggestions.localites.map((l) => (
                    <button key={l} onMouseDown={(e) => { e.preventDefault(); setFiltres({ ...filtres, localite: l, recherche: "" }); }}
                      className="w-full text-left text-xs px-1.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 truncate">
                      {l}
                    </button>
                  ))}
                </>
              )}
              {suggestions.projets.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1.5 py-1">Projets</div>
                  {suggestions.projets.map((p) => (
                    <button key={p.id} onMouseDown={(e) => { e.preventDefault(); openSignalPreview(p); }}
                      className="w-full text-left text-xs px-1.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 truncate">
                      <span className="font-mono font-semibold text-blue-700">{p.ofrTM}</span> — {p.projet}
                    </button>
                  ))}
                </>
              )}
              {suggestions.clients.length + suggestions.localites.length + suggestions.projets.length === 0 && (
                <p className="text-xs text-gray-400 px-1.5 py-2">Rien de ce nom-là.</p>
              )}
            </div>
          )}
        </div>

        <button onClick={() => setPanneau(panneau === "vues" ? null : "vues")}
          className="shrink-0 h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
          <Bookmark className="w-4 h-4" /> Vues
        </button>
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
          <Columns3 className="w-4 h-4" /> Colonnes
        </button>
        <button onClick={basculerConcentration} title="Mode concentration"
          className="shrink-0 h-10 w-10 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center">
          {concentration ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Synthèse + pastilles ──────────────────────────────────────── */}
      {!concentration && (
        <div className="flex items-center gap-1.5 flex-wrap kb-pastilles">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
            <b className="text-gray-800 dark:text-gray-100">{retenus.length}</b>
            {retenus.length !== baseCompteurs.length ? ` / ${baseCompteurs.length}` : ""} projets
          </span>

          <button onClick={() => setFiltres({ ...filtres, mesPriorites: !filtres.mesPriorites })}
            className={`kb-pilule ${filtres.mesPriorites ? "is-on" : ""}`}
            style={filtres.mesPriorites ? { background: "#fff7ed", borderColor: "#f59e0b", color: "#b45309" } : undefined}>
            <Star className="w-3 h-3" /> Mes priorités
          </button>

          {ORDRE_INDICATEURS.filter((i) => !regles.desactives.includes(i)).map((i) => {
            const m = META_INDICATEURS[i];
            const actif = filtres.indicateurs.includes(i);
            return (
              <button key={i} onClick={() => basculerCouleur(i)}
                className={`kb-pilule ${actif ? "is-on" : ""}`}
                style={actif ? { background: m.fond, borderColor: m.trait, color: m.texte } : undefined}>
                <span className="kb-point" style={{ background: m.trait }} />
                {m.libelle}
                <span className="kb-compte">{comptesCouleurs[i]}</span>
              </button>
            );
          })}

          {sansResponsable > 0 && (
            <button onClick={() => setFiltres({ ...filtres, sansResponsable: !filtres.sansResponsable })}
              className={`kb-pilule ${filtres.sansResponsable ? "is-on" : ""}`}
              style={filtres.sansResponsable ? { background: "#f1f5f9", borderColor: "#64748b", color: "#334155" } : undefined}>
              👤 Non attribué <span className="kb-compte">{sansResponsable}</span>
            </button>
          )}

          {(filtres.indicateurs.length > 0 || filtres.mesPriorites || filtres.sansResponsable) && (
            <button onClick={() => setFiltres({ ...filtres, indicateurs: [], mesPriorites: false, sansResponsable: false })}
              className="text-xs font-medium text-gray-500 hover:text-blue-600 ml-1">
              Tout afficher
            </button>
          )}

          {!peutDeplacer && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 ml-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Lecture seule
            </span>
          )}
          {colonnesPerimees && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 ml-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Colonnes d&apos;une lecture précédente
            </span>
          )}
        </div>
      )}

      {/* ── Panneaux ──────────────────────────────────────────────────── */}
      {panneau === "vues" && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Vues enregistrées</h3>
            <button onClick={enregistrerVue}
              className="text-xs font-medium text-blue-600 inline-flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" /> Enregistrer la vue actuelle
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {toutesVues.map((v) => (
              <span key={v.id} className="inline-flex items-center">
                <button onClick={() => appliquerVue(v)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400">
                  {v.nom}
                </button>
                {!v.integree && (
                  <button onClick={() => supprimerVue(v.id)} aria-label={`Supprimer la vue ${v.nom}`}
                    className="ml-0.5 text-gray-300 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Une vue retient la propriété en colonnes, les filtres, les couleurs, le tri
            et les colonnes masquées. Les vues sont personnelles à ce navigateur.
          </p>
        </div>
      )}

      {panneau === "filtres" && (
        <div className="glass-card rounded-2xl p-4 grid gap-3 sm:grid-cols-3">
          {([
            { cle: "collaborateur" as const, titre: "Collaborateur", liste: valeurs.collaborateurs },
            { cle: "fournisseur" as const, titre: "Fournisseur", liste: valeurs.fournisseurs },
            { cle: "localite" as const, titre: "Localité", liste: valeurs.localites },
          ]).map(({ cle, titre, liste }) => (
            <div key={cle} className="min-w-0">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{titre}</label>
              <select value={filtres[cle] ?? ""}
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
                    masquees: masquee ? reglages.masquees.filter((x) => x !== nom) : [...reglages.masquees, nom],
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
              cible={cible?.colonne === c.id ? cible.index : null}
              enCours={enCours}
              peutDeplacer={peutDeplacer}
              contexte={contexte}
              historique={historique}
              selection={selection}
              onSelection={basculerSelection}
              onPointerDownCarte={surPointerDown}
              onPriorite={async (id, valeur) => {
                setPriorites((p) => {
                  const n = { ...p };
                  if (valeur === null) delete n[id]; else n[id] = valeur;
                  return n;
                });
                await fetch("/api/kanban/etat", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ priorites: { [id]: valeur } }),
                }).catch(() => toast.error("Priorité non enregistrée."));
              }}
            />
          ))}
          {colonnes.length === 0 && (
            <div className="w-full text-center py-16 text-sm text-gray-400">
              Aucun projet ne correspond.
            </div>
          )}
        </div>
      )}

      {/* ── Barre de sélection multiple ───────────────────────────────── */}
      {selection.size > 0 && (
        <div className="kb-barre sticky bottom-3 z-30 glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap shadow-xl">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            {selection.size} projet{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""}
          </span>
          {peutDeplacer && (
            <select
              defaultValue=""
              disabled={groupeEnCours}
              onChange={(e) => { if (e.target.value) { void deplacerEnGroupe(e.target.value); e.target.value = ""; } }}
              className="h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 text-xs">
              <option value="">Déplacer vers…</option>
              {toutesColonnes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button
            onClick={() => {
              const texte = retenus.filter((p) => selection.has(p.id))
                .map((p) => `${p.ofrTM}\t${p.projet}\t${p.adresseChantier}\t${statutDe(p, vue)}`).join("\n");
              navigator.clipboard?.writeText(texte);
              toast.success("Sélection copiée.");
            }}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copier
          </button>
          {groupeEnCours && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button onClick={() => setSelection(new Set())}
            className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700">
            Annuler la sélection
          </button>
        </div>
      )}

      {/* ── La carte qui suit le doigt ────────────────────────────────── */}
      {glisse && (
        <div className="fixed z-[9999] pointer-events-none opacity-90"
          style={{ left: glisse.x - 110, top: glisse.y - 28, width: 220 }}>
          <Carte projet={glisse.projet} vue={vue} contexte={contexte} historique={historique} fantome />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */

function ColonneVue({
  colonne, vue, cible, enCours, peutDeplacer, contexte, historique,
  selection, onSelection, onPointerDownCarte, onPriorite,
}: {
  colonne: Colonne;
  vue: Vue;
  cible: number | null;
  enCours: string | null;
  peutDeplacer: boolean;
  contexte: Contexte;
  historique: LigneHistorique[];
  selection: Set<string>;
  onSelection: (id: string) => void;
  onPointerDownCarte: (e: React.PointerEvent, p: Project, source: string) => void;
  onPriorite: (id: string, valeur: Indicateur | null) => void;
}) {
  const t = teinteDe(colonne.couleur);
  /* Chargement progressif : on dessine un paquet, puis un autre dès qu'on
     approche du bas. Six cents cartes dessinées d'un coup se sentent.
     Le compteur se remet à zéro quand on change de colonne — ajusté pendant
     le rendu, et non dans un effet : un effet ferait un second rendu visible
     avec l'ancienne valeur. */
  const [fenetre, setFenetre] = useState({ cle: colonne.id, limite: PAR_PAQUET });
  if (fenetre.cle !== colonne.id) setFenetre({ cle: colonne.id, limite: PAR_PAQUET });
  const limite = fenetre.cle === colonne.id ? fenetre.limite : PAR_PAQUET;
  const sentinelle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelle.current;
    if (!el || limite >= colonne.projets.length) return;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setFenetre((f) => ({ cle: f.cle, limite: f.limite + PAR_PAQUET }));
    }, { rootMargin: "300px" });
    o.observe(el);
    return () => o.disconnect();
  }, [limite, colonne.projets.length]);

  const visibles = colonne.projets.slice(0, limite);

  return (
    <section
      data-colonne={colonne.id}
      className={`kb-col shrink-0 w-[272px] rounded-2xl flex flex-col transition-colors ${cible !== null ? "kb-col-cible" : ""}`}
      style={{ background: t.fond, outline: cible !== null ? `2px dashed ${t.trait}` : undefined }}
    >
      <header className="kb-col-tete sticky top-0 z-10 px-3 py-2.5 rounded-t-2xl"
        style={{ background: t.fond, borderBottom: `1px solid ${t.trait}33` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.trait }} />
          <h3 className="text-[12.5px] font-semibold text-gray-800 truncate">{colonne.titre}</h3>
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-gray-500 tabular-nums">
            {colonne.projets.length}
          </span>
        </div>
      </header>

      <div className="kb-col-corps flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100vh-300px)]">
        {visibles.map((p, i) => (
          <div key={p.id} data-carte-index={i} className="relative">
            {cible === i && <div className="kb-trait" style={{ background: t.trait }} />}
            <Carte
              projet={p}
              vue={vue}
              trait={t.trait}
              occupe={enCours === p.id}
              peutDeplacer={peutDeplacer}
              contexte={contexte}
              historique={historique}
              selectionne={selection.has(p.id)}
              onSelection={onSelection}
              onPointerDown={(e, pr) => onPointerDownCarte(e, pr, colonne.id)}
              onPriorite={onPriorite}
            />
          </div>
        ))}
        {cible !== null && cible >= visibles.length && (
          <div className="kb-trait" style={{ background: t.trait }} />
        )}
        {limite < colonne.projets.length && (
          <div ref={sentinelle} className="text-center text-[11px] text-gray-400 py-2">
            {colonne.projets.length - limite} de plus…
          </div>
        )}
        {colonne.projets.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-6">Aucun projet</p>
        )}
      </div>
    </section>
  );
}

function Carte({
  projet, vue, trait, occupe, peutDeplacer, contexte, historique,
  selectionne, onSelection, onPointerDown, onPriorite, fantome,
}: {
  projet: Project;
  vue: Vue;
  trait?: string;
  occupe?: boolean;
  peutDeplacer?: boolean;
  contexte: Contexte;
  historique: LigneHistorique[];
  selectionne?: boolean;
  onSelection?: (id: string) => void;
  onPointerDown?: (e: React.PointerEvent, p: Project) => void;
  onPriorite?: (id: string, valeur: Indicateur | null) => void;
  fantome?: boolean;
}) {
  const [menu, setMenu] = useState<null | "actions" | "priorite" | "histoire">(null);
  const localite = localiteDe(projet);
  const adresse = (projet.adresseChantier || "").replace(localite, "").replace(/[,;]\s*$/, "").trim();
  const situation = situationDe(projet, contexte);
  const m = META_INDICATEURS[situation.principal];
  const dormant = joursSansEvolution(projet.id, vue, historique, contexte.aujourdhui);
  const docs = (projet.documentsMontagee?.length || 0) + (projet.documentsMesures?.length || 0);
  const siennes = historique
    .filter((h) => h.projetId === projet.id)
    .sort((a, b) => b.quand.localeCompare(a.quand))
    .slice(0, 6);

  const echeance = vue === "cmd"
    ? (projet.previsionLivraison ? { mot: "Livraison", jour: jourDe(projet.previsionLivraison) }
      : projet.dateCMDRecue ? { mot: "CMD", jour: jourDe(projet.dateCMDRecue) } : null)
    : (projet.dateMontage ? { mot: "Montage", jour: jourDe(projet.dateMontage) }
      : projet.dateMesuresRecue ? { mot: "Mesures", jour: jourDe(projet.dateMesuresRecue) } : null);
  const enRetard = !!echeance && echeance.jour < contexte.aujourdhui;
  const aujourdhui = !!echeance && echeance.jour === contexte.aujourdhui;

  return (
    <article
      onPointerDown={peutDeplacer && onPointerDown ? (e) => onPointerDown(e, projet) : undefined}
      className={`kb-carte bg-white rounded-xl p-2.5 border border-black/5 ${
        fantome ? "shadow-xl rotate-1" : ""
      } ${peutDeplacer ? "cursor-grab active:cursor-grabbing" : ""} ${occupe ? "opacity-60" : ""} ${
        selectionne ? "kb-carte-sel" : ""
      }`}
      style={{
        ...(trait ? { borderLeft: `3px solid ${trait}` } : {}),
        /* Sans ceci, le doigt qui déplace une carte fait aussi défiler la
           colonne : le navigateur tranche en faveur du défilement. */
        ...(peutDeplacer ? { touchAction: "none" as const } : {}),
      }}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        {onSelection && (
          <button onClick={(e) => { e.stopPropagation(); onSelection(projet.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={selectionne ? "Retirer de la sélection" : "Sélectionner"}
            className="shrink-0 text-gray-300 hover:text-blue-600">
            {selectionne ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
          </button>
        )}
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

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {occupe && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          {/* La pastille : une seule, la plus grave. Au clic, on peut en
              poser une à la main — sans effacer l'alerte calculée. */}
          <button
            onClick={(e) => { e.stopPropagation(); setMenu(menu === "priorite" ? null : "priorite"); }}
            onPointerDown={(e) => e.stopPropagation()}
            title={situation.raisons.join(" · ")}
            aria-label={`${m.libelle} — ${situation.raisons.join(". ")}`}
            className="kb-pastille"
            style={{ background: m.trait }}
          />
          {!fantome && (
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === "actions" ? null : "actions"); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Actions" className="text-gray-300 hover:text-gray-600">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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
        {projet.nbCabines ? (
          <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">🚿 {projet.nbCabines} cab.</span>
        ) : null}
        {projet.collaborateurs
          ? <span className="text-gray-500 truncate">👤 {projet.collaborateurs}</span>
          : <span className="text-gray-400">👤 Non attribué</span>}
        {docs > 0 && (
          <span className="text-gray-500 inline-flex items-center gap-0.5">
            <Paperclip className="w-3 h-3" />{docs}
          </span>
        )}
      </div>

      {/* Les informations ne s'affichent que si elles disent quelque chose :
          une carte sans problème n'a pas besoin de cinq lignes d'indicateurs. */}
      {echeance && (
        <div className={`text-[10.5px] mt-1 ${
          enRetard ? "text-red-600 font-semibold" : aujourdhui ? "text-blue-600 font-semibold" : "text-gray-500"
        }`}>
          📅 {echeance.mot} {formatCourt(echeance.jour)}
          {enRetard && " — dépassée"}
          {aujourdhui && " — aujourd'hui"}
        </div>
      )}
      {dormant !== null && dormant >= 7 && (
        <div className="text-[10.5px] text-amber-700 mt-0.5 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> {dormant} jours sans évolution
        </div>
      )}

      {/* ── Menus ───────────────────────────────────────────────────── */}
      {menu === "priorite" && (
        <div className="kb-menu" onPointerDown={(e) => e.stopPropagation()}>
          <div className="kb-menu-titre">{situation.raisons[0] || "Rien à signaler"}</div>
          {ORDRE_INDICATEURS.map((i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); onPriorite?.(projet.id, i); setMenu(null); }}
              className="kb-menu-item">
              <span className="kb-point" style={{ background: META_INDICATEURS[i].trait }} />
              {META_INDICATEURS[i].libelle}
              {situation.manuelle === i && <Check className="w-3 h-3 ml-auto text-blue-600" />}
            </button>
          ))}
          {situation.manuelle && (
            <button onClick={(e) => { e.stopPropagation(); onPriorite?.(projet.id, null); setMenu(null); }}
              className="kb-menu-item text-gray-500">
              <RotateCcw className="w-3 h-3" /> Laisser l&apos;app décider
            </button>
          )}
        </div>
      )}

      {menu === "actions" && (
        <div className="kb-menu" onPointerDown={(e) => e.stopPropagation()}>
          <button className="kb-menu-item" onClick={(e) => { e.stopPropagation(); openSignalPreview(projet); setMenu(null); }}>
            Ouvrir la fiche
          </button>
          <a className="kb-menu-item" href={`/projet/${projet.id}`} onClick={(e) => e.stopPropagation()}>
            Ouvrir le projet complet
          </a>
          <button className="kb-menu-item" onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(projet.ofrTM || "");
            toast.success("Numéro copié."); setMenu(null);
          }}>
            <Copy className="w-3 h-3" /> Copier le numéro
          </button>
          <button className="kb-menu-item" onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(`${window.location.origin}/projet/${projet.id}`);
            toast.success("Lien copié. Il respecte les droits de celui qui l'ouvrira."); setMenu(null);
          }}>
            <Copy className="w-3 h-3" /> Copier le lien
          </button>
          <button className="kb-menu-item" onClick={(e) => { e.stopPropagation(); setMenu("histoire"); }}>
            <History className="w-3 h-3" /> Historique
          </button>
        </div>
      )}

      {menu === "histoire" && (
        <div className="kb-menu" onPointerDown={(e) => e.stopPropagation()}>
          <div className="kb-menu-titre">Historique des statuts</div>
          {siennes.length === 0 ? (
            <p className="text-[11px] text-gray-400 px-2 py-1.5 leading-snug">
              Aucun déplacement enregistré. Le journal ne retient que les
              changements faits depuis le Kanban, et commence à sa mise en service.
            </p>
          ) : siennes.map((h, i) => (
            <div key={i} className="text-[11px] text-gray-600 px-2 py-1 leading-snug">
              <b>{new Date(h.quand).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</b>{" "}
              {h.avant || "Sans statut"} → {h.apres || "Sans statut"}
              <span className="text-gray-400"> · {h.qui}</span>
            </div>
          ))}
          <button className="kb-menu-item text-gray-500" onClick={(e) => { e.stopPropagation(); setMenu(null); }}>
            Fermer
          </button>
        </div>
      )}
    </article>
  );
}

function formatCourt(jour?: string | null): string {
  if (!jour) return "—";
  const t = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}
