"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag, Pencil, Trash2, Plus, Check, X, Globe, MapPin, Hash, Camera, BarChart3, TrendingUp, Package, Layers, Filter, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { thumbnailUrl } from "@/lib/image-url";
import { joursOuvresEntre } from "@/lib/jours-ouvres";

interface CRMEntry {
  id: string;
  name: string;
  icon: string;
  properties: Record<string, any>;
}

type ClientMode = "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes";

const MODE_TO_TYPE: Record<ClientMode, string> = {
  "clients-contacts": "contacts",
  "clients-entreprises": "entreprises",
  "clients-fournisseurs": "fournisseurs",
  "clients-grossistes": "grossistes",
};

const POSTE_COLORS: Record<string, string> = {
  "Directeur": "bg-purple-100 text-purple-700",
  "Back Office": "bg-blue-100 text-blue-700",
  "Key Account Manager": "bg-amber-100 text-amber-700",
  "Technicien Sanitaire": "bg-green-100 text-green-700",
  "Représentant sanitaire": "bg-teal-100 text-teal-700",
  "Fondateur": "bg-red-100 text-red-700",
  "Employé de bureau": "bg-gray-100 text-gray-700",
  "Responsable site": "bg-indigo-100 text-indigo-700",
  "Architecte": "bg-orange-100 text-orange-700",
};

// ─── Cache global des projets pour les stats (chargé une seule fois) ─────────
let _projectsCache: any[] | null = null;
let _projectsCachePromise: Promise<any[]> | null = null;

function fetchAllProjectsCached(): Promise<any[]> {
  if (_projectsCache !== null) return Promise.resolve(_projectsCache);
  if (!_projectsCachePromise) {
    _projectsCachePromise = fetch("/api/projects/all")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { _projectsCache = Array.isArray(data) ? data : []; return _projectsCache!; })
      .catch(() => { _projectsCache = []; return []; });
  }
  return _projectsCachePromise;
}

/** Un délai, avec ce qui permet de le vérifier. */
interface Delai {
  /** Jours médians — une moyenne serait écrasée par un chantier reporté. */
  median: number | null;
  /** Jours moyens, pour qui veut la comparer à la médiane. */
  moyen: number | null;
  /** Dossiers sur lesquels le délai est mesurable. */
  cas: number;
  projets: { id: string; ofrTM: string; projet: string; jours: number; de: string; a: string }[];
}

// Type de stats calculé pour une entité CRM
interface EntityStats {
  totalProjects: number;
  totalCabines: number;
  mesuresCount: number;
  /** SAV imputables à TM (cause « Erreur TM »), pas ceux du client ou du fournisseur. */
  savTM: number;
  /** Cabines concernées par un SAV TM — sert au taux sur cabines posées. */
  savTMCabines: number;
  /** Mesures relevées, offres établies, commandes obtenues — l'entonnoir. */
  offres: number;
  commandes: number;
  tauxTransfo: number;
  /** Jours médians entre le relevé de mesure et la pose. */
  /**
   * Les deux attentes que subit un client, chacune comptée depuis SON point
   * de départ — et c'est là que tout se joue.
   *
   *   • MESURE — de la demande reçue au relevé. C'est notre réactivité.
   *   • MONTAGE — de l'ARRIVAGE de la marchandise à la pose. Compter depuis
   *     la commande mêlerait le retard du fournisseur au nôtre : le client
   *     attend peut-être six semaines, mais cinq sont chez le fabricant.
   *     L'attente qui nous est imputable commence quand les cabines sont là.
   */
  delaiMesure: Delai;
  delaiMontage: Delai;
  /** Cabines des douze derniers mois, et des douze précédents. */
  cabines12: number;
  cabines12Avant: number;
  /** Chiffre d'affaires cumulé des offres chiffrées, en francs. */
  montant: number;
  /** Projets dont le montant n'est pas renseigné — le chiffre est partiel. */
  montantManquants: number;
  /** Dernier chantier, et premier : l'âge de la relation. */
  dernier: string | null;
  premier: string | null;
  fournisseurs: { name: string; projects: number; cabines: number }[];
  series: { name: string; projects: number; cabines: number }[];
  topClients: { name: string; projects: number; cabines: number }[];
}

// Champ de filtre selon le type d'entité CRM
const ENTITY_NAMEFIELD: Record<string, string> = {
  entreprises: "sanitaireNames",
  fournisseurs: "fournisseursNames",
  grossistes:   "grossistesNames",
};

interface StatsFilter {
  year: number | null;
  month: number | null; // 1–12
  from: string;         // "YYYY-MM" ou ""
  to: string;           // "YYYY-MM" ou ""
}

/** Retourne la date de référence d'un projet terminé (date montage > CMD reçue). */
function projectRefDate(p: any): string {
  return p.dateMontage || p.dateMontageEnd || p.dateCMDRecue || "";
}

function projectMatchesFilter(p: any, f: StatsFilter): boolean {
  const dateStr = projectRefDate(p);
  if (!dateStr) return !f.year && !f.month && !f.from && !f.to; // pas de date → exclure si filtre actif
  const [y, m] = dateStr.split("-").map(Number);
  if (f.year  && y !== f.year)  return false;
  if (f.month && m !== f.month) return false;
  if (f.from) {
    const [fy, fm] = f.from.split("-").map(Number);
    if (y < fy || (y === fy && m < fm)) return false;
  }
  if (f.to) {
    const [ty, tm] = f.to.split("-").map(Number);
    if (y > ty || (y === ty && m > tm)) return false;
  }
  return true;
}

function computeEntityStats(
  projects: any[], entityName: string, entityType: string,
  filter?: StatsFilter, exclus: Set<string> = new Set(),
): EntityStats {
  const nameField = ENTITY_NAMEFIELD[entityType];
  if (!nameField) return {
    totalProjects: 0, totalCabines: 0, mesuresCount: 0, savTM: 0, savTMCabines: 0,
    offres: 0, commandes: 0, tauxTransfo: 0,
    delaiMesure: { median: null, moyen: null, cas: 0, projets: [] },
    delaiMontage: { median: null, moyen: null, cas: 0, projets: [] },
    cabines12: 0, cabines12Avant: 0, montant: 0, montantManquants: 0,
    dernier: null, premier: null,
    fournisseurs: [], series: [], topClients: [],
  };

  const lc = entityName.toLowerCase();
  const noFilter = !filter || (!filter.year && !filter.month && !filter.from && !filter.to);

  const related = projects.filter((p) =>
    p.etatCMD === "Terminé" &&
    Array.isArray(p[nameField]) && p[nameField].some((n: string) => n.toLowerCase() === lc) &&
    (noFilter || projectMatchesFilter(p, filter!))
  );

  const fMap: Record<string, { projects: number; cabines: number }> = {};
  const sMap: Record<string, { projects: number; cabines: number }> = {};
  const cMap: Record<string, { projects: number; cabines: number }> = {};
  let totalCabines = 0;
  let cabinesSansFournisseur = 0, cabinesSansSerie = 0;
  let projsSansFournisseur = 0, projsSansSerie = 0;

  /* Projets liés SANS la condition « Terminé » — mais AVEC le filtre de
     période : l'oublier donnait le même nombre de SAV et de mesures pour
     « Tout », 2026 et 2025, ce qui n'a aucun sens. */
  const allRelated = projects.filter((p) =>
    Array.isArray(p[nameField]) && p[nameField].some((n: string) => n.toLowerCase() === lc) &&
    (noFilter || projectMatchesFilter(p, filter!))
  );
  const mesuresCount = allRelated.filter((p) => !!p.dateMesures).length;
  /* SAV dont TM est responsable UNIQUEMENT : un SAV causé par le client ou le
     fournisseur ne dit rien de notre travail chez ce client. La cause se lit
     par cabine quand elle existe (« Cab1:Erreur TM | … »), sinon au niveau du
     projet. Même règle que les statistiques générales.
     Le projet est rattaché à l'année de son MONTAGE : on mesure ainsi la
     qualité de ce qu'on a posé cette année-là. */
  const causeEstTM = (c: string) => /\btm\b/i.test(c || "");
  let savTM = 0;          // projets concernés
  let savTMCabines = 0;   // cabines concernées, pour le taux
  allRelated.forEach((p: any) => {
    const parCabine = String(p.causeSavCabines || "");
    let cabines = 0;
    if (parCabine) {
      const re = /Cab(\d+)\s*:([^|]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(parCabine))) {
        if (causeEstTM(m[2])) cabines += 1;
      }
    }
    // Cause au niveau du projet sans détail par cabine : au moins une cabine.
    if (cabines === 0 && causeEstTM(String(p.causeSAV || ""))) cabines = 1;
    if (cabines > 0) { savTM += 1; savTMCabines += cabines; }
  });

  for (const p of related) {
    const cab = p.nbCabines || 0;
    totalCabines += cab;

    const fList: string[] = p.fournisseurs || [];
    const sList: string[] = p.seriesCabines || [];

    // Distribuer les cabines équitablement entre fournisseurs (évite double-comptage)
    if (fList.length > 0) {
      const cabPerF = cab / fList.length;
      for (const f of fList) {
        if (!fMap[f]) fMap[f] = { projects: 0, cabines: 0 };
        fMap[f].projects++;
        fMap[f].cabines += cabPerF;
      }
    } else {
      cabinesSansFournisseur += cab;
      projsSansFournisseur++;
    }

    if (sList.length > 0) {
      const cabPerS = cab / sList.length;
      for (const s of sList) {
        if (!sMap[s]) sMap[s] = { projects: 0, cabines: 0 };
        sMap[s].projects++;
        sMap[s].cabines += cabPerS;
      }
    } else {
      cabinesSansSerie += cab;
      projsSansSerie++;
    }

    // Pour fournisseurs/grossistes → top clients entreprises
    for (const n of (p.sanitaireNames || [])) {
      if (!cMap[n]) cMap[n] = { projects: 0, cabines: 0 };
      cMap[n].projects++; cMap[n].cabines += cab;
    }
  }

  const sortDesc = (map: Record<string, { projects: number; cabines: number }>) =>
    Object.entries(map).map(([name, v]) => ({ name, projects: v.projects, cabines: Math.round(v.cabines) }))
      .sort((a, b) => b.cabines - a.cabines);

  const fournisseursList = sortDesc(fMap);
  if (cabinesSansFournisseur > 0) fournisseursList.push({ name: "Non renseigné", projects: projsSansFournisseur, cabines: cabinesSansFournisseur });

  const seriesList = sortDesc(sMap);
  if (cabinesSansSerie > 0) seriesList.push({ name: "Non renseigné", projects: projsSansSerie, cabines: cabinesSansSerie });

  /* ── L'entonnoir commercial de ce client ───────────────────────────────
     Sur `allRelated` et non sur les projets terminés : une offre sans suite
     n'a jamais de montage, et c'est justement elle qu'on cherche à compter. */
  const offres = allRelated.filter((x: any) => !!x.dateOffre).length;
  const aCommande = (x: any) => !!(String(x.cmdTM || "").trim() || String(x.cmdTMUsine || "").trim()
    || String(x.cmdGrossiste || "").trim() || x.dateCMDRecue || x.dateCMDUsine);
  const commandes = allRelated.filter(aCommande).length;
  const tauxTransfo = mesuresCount > 0 ? Math.round((commandes / mesuresCount) * 100) : 0;

  /* ── Le délai que subit le client ──────────────────────────────────────
     Du relevé de mesure à la pose. On prend la MÉDIANE et non la moyenne :
     un chantier reporté d'un an écraserait tous les autres. */
  /**
   * Un délai entre deux dates d'un projet.
   *
   * Un écart négatif est une saisie incohérente, pas une attente. Au-delà de
   * deux ans, c'est un dossier repris longtemps après : ni l'un ni l'autre ne
   * dit quoi que ce soit du rythme habituel, et les garder déplacerait la
   * moyenne sans rien apprendre.
   */
  const mesurerDelai = (source: any[], depart: (x: any) => string, arrivee: (x: any) => string): Delai => {
    const lignes = source
      .filter((x: any) => !exclus.has(x.id))
      .map((x: any) => {
        const d = String(depart(x) || "").slice(0, 10);
        const f = String(arrivee(x) || "").slice(0, 10);
        /* Jours OUVRÉS : compter les week-ends et les fériés vaudois
           reprocherait à l'entreprise du temps où personne ne travaille. */
        const jours = joursOuvresEntre(d, f);
        if (jours === null) return null;
        return { id: x.id, ofrTM: x.ofrTM || "", projet: x.projet || "Sans nom", jours, de: d, a: f };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((x, y) => y.jours - x.jours);
    if (lignes.length === 0) return { median: null, moyen: null, cas: 0, projets: [] };
    const tri = lignes.map((x) => x.jours).sort((x, y) => x - y);
    return {
      median: tri[Math.floor(tri.length / 2)],
      moyen: Math.round(tri.reduce((s2, v) => s2 + v, 0) / tri.length),
      cas: lignes.length,
      projets: lignes,
    };
  };

  /* Sur allRelated et non sur les seuls projets terminés : une mesure relevée
     compte dès qu'elle est faite, même si le chantier n'a pas encore eu lieu.
     Attendre la fin du montage retarderait l'indicateur de plusieurs mois. */
  /**
   * Les délais ne parlent que des chantiers que CETTE entité nous a confiés.
   *
   * Presque tous les projets portent un fournisseur — c'est lui qui fabrique
   * la cabine. Mais un chantier Nelo mené en direct pour un particulier n'est
   * pas un travail que Nelo nous a demandé : y mesurer notre réactivité
   * envers Nelo n'a aucun sens. On exige donc que « Type de client »
   * corresponde à la famille de la fiche ouverte.
   */
  const familleAttendue = entityType === "fournisseurs" ? "fournisseur"
    : entityType === "grossistes" ? "grossiste"
    : entityType === "entreprises" ? "sanitaire" : "";
  const estSonClient = (x: any) => {
    if (!familleAttendue) return true;
    const t = String(x.typeClient || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return t.startsWith(familleAttendue);
  };
  const pourDelais = allRelated.filter(estSonClient);

  const delaiMesure = mesurerDelai(pourDelais, (x) => x.dateMesuresRecue, (x) => x.dateMesures);
  const delaiMontage = mesurerDelai(
    pourDelais,
    (x) => x.arrivageTM || x.arrivageGrossiste,
    (x) => x.dateMontage,
  );

  /* ── La tendance ───────────────────────────────────────────────────────
     Douze mois glissants contre les douze précédents, INDÉPENDAMMENT du
     filtre de période : comparer deux trimestres ne dirait rien, la
     saisonnalité dominerait. On repart donc de tous les projets. */
  const maintenant = Date.now();
  const unAn = 365 * 86400000;
  let cabines12 = 0, cabines12Avant = 0;
  let dernier: string | null = null, premier: string | null = null;
  projects.forEach((x: any) => {
    if (x.etatCMD !== "Terminé") return;
    if (!Array.isArray(x[nameField]) || !x[nameField].some((n: string) => n.toLowerCase() === lc)) return;
    const jour = String(x.dateMontage || "").slice(0, 10);
    const t = Date.parse(jour);
    if (Number.isNaN(t) || t > maintenant) return;
    const cab = x.nbCabines || 0;
    if (t >= maintenant - unAn) cabines12 += cab;
    else if (t >= maintenant - 2 * unAn) cabines12Avant += cab;
    if (!dernier || jour > dernier) dernier = jour;
    if (!premier || jour < premier) premier = jour;
  });

  /* ── Ce que ça pèse ────────────────────────────────────────────────────
     « Montant OFR » vient d'être créé : il est vide sur l'historique. On
     compte donc à part les projets non chiffrés, pour que le total ne passe
     jamais pour complet. */
  let montant = 0, montantManquants = 0;
  related.forEach((x: any) => {
    const v = Number(x.montantOFR);
    if (Number.isFinite(v) && v > 0) montant += v; else montantManquants += 1;
  });

  return {
    totalProjects: related.length,
    totalCabines,
    mesuresCount,
    savTM,
    savTMCabines,
    offres,
    commandes,
    tauxTransfo,
    delaiMesure,
    delaiMontage,
    cabines12,
    cabines12Avant,
    montant: Math.round(montant),
    montantManquants,
    dernier,
    premier,
    fournisseurs: fournisseursList,
    series:       seriesList,
    topClients:   entityType !== "entreprises" ? sortDesc(cMap).slice(0, 8) : [],
  };
}

// ─── Couleurs pour les barres ─────────────────────────────────────────────────
const BAR_PALETTES = [
  { bar: "bg-blue-500",    label: "text-blue-700 dark:text-blue-300"    },
  { bar: "bg-violet-500",  label: "text-violet-700 dark:text-violet-300" },
  { bar: "bg-emerald-500", label: "text-emerald-700 dark:text-emerald-300" },
  { bar: "bg-amber-500",   label: "text-amber-700 dark:text-amber-300"  },
  { bar: "bg-rose-500",    label: "text-rose-700 dark:text-rose-300"    },
  { bar: "bg-cyan-500",    label: "text-cyan-700 dark:text-cyan-300"    },
  { bar: "bg-orange-500",  label: "text-orange-700 dark:text-orange-300" },
  { bar: "bg-teal-500",    label: "text-teal-700 dark:text-teal-300"    },
];

function StatBar({ label, count, totalCabines, cabines, colorIdx }: {
  label: string; count: number; totalCabines: number; cabines: number; colorIdx: number;
}) {
  const pct = totalCabines > 0 ? Math.round((cabines / totalCabines) * 100) : 0;
  const isUnknown = label === "Non renseigné";
  const pal = isUnknown
    ? { bar: "bg-gray-300 dark:bg-gray-600", label: "text-gray-400" }
    : BAR_PALETTES[colorIdx % BAR_PALETTES.length];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium truncate flex-1 ${isUnknown ? "text-gray-400 dark:text-gray-500 italic" : "text-gray-700 dark:text-gray-300"}`}>{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400">{count} proj.</span>
          {cabines > 0 && <span className="text-[10px] text-gray-400">{cabines} cab.</span>}
          <span className={`text-[11px] font-bold tabular-nums w-8 text-right ${pal.label}`}>{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${pal.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function StatsPanel({ entityName, entityType }: { entityName: string; entityType: string }) {
  const [allProjects, setAllProjects] = useState<any[] | null>(null);
  const [loading, setLoading]         = useState(true);

  // Filtres
  const [filterYear,  setFilterYear]  = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [showRange,   setShowRange]   = useState(false);
  /** Délai ouvert : un chiffre qu'on ne peut pas ouvrir ne se vérifie pas. */
  const [delaiOuvert, setDelaiOuvert] = useState<{ titre: string; aide: string; delai: Delai } | null>(null);
  /**
   * Chantiers écartés des délais — attente non imputable à TM.
   *
   * Rien dans les données ne distingue « le client a reporté » d'un retard de
   * notre part : la cause est extérieure. C'est donc une décision humaine,
   * consignée avec son motif.
   */
  const [exclus, setExclus] = useState<Map<string, string>>(new Map());
  const chargerExclus = useCallback(() => {
    fetch("/api/delais-exclus")
      .then((r) => (r.ok ? r.json() : []))
      .then((l: { projectId: string; motif: string }[]) =>
        setExclus(new Map((Array.isArray(l) ? l : []).map((x) => [x.projectId, x.motif]))))
      .catch(() => {});
  }, []);
  useEffect(() => { chargerExclus(); }, [chargerExclus]);

  const basculerExclusion = async (projectId: string, ofrTM: string) => {
    const dejaExclu = exclus.has(projectId);
    const motif = dejaExclu ? "" : (window.prompt(
      `Pourquoi écarter ${ofrTM || "ce chantier"} des statistiques de délai ?\n` +
      "Exemple : chantier pas prêt, report du client, accès impossible.",
    ) || "").trim();
    if (!dejaExclu && !motif) return; // on n'exclut rien sans dire pourquoi
    await fetch("/api/delais-exclus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ofrTM, motif }),
    }).catch(() => {});
    chargerExclus();
    setDelaiOuvert(null);
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllProjectsCached().then((projects) => {
      if (!cancelled) { setAllProjects(projects); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [entityName, entityType]);

  // Années disponibles (depuis les projets liés terminés)
  const availableYears = useMemo(() => {
    if (!allProjects) return [];
    const lc = entityName.toLowerCase();
    const nf = ENTITY_NAMEFIELD[entityType];
    const years = new Set<number>();
    allProjects.forEach((p) => {
      if (p.etatCMD !== "Terminé") return;
      if (!Array.isArray(p[nf]) || !p[nf].some((n: string) => n.toLowerCase() === lc)) return;
      const d = projectRefDate(p);
      if (d) years.add(parseInt(d.slice(0, 4)));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allProjects, entityName, entityType]);

  const filter: StatsFilter = { year: filterYear, month: filterMonth, from: filterFrom, to: filterTo };
  const hasFilter = !!(filterYear || filterMonth || filterFrom || filterTo);

  const stats = useMemo(() => {
    if (!allProjects) return null;
    return computeEntityStats(allProjects, entityName, entityType, hasFilter ? filter : undefined, new Set(exclus.keys()));
  }, [allProjects, entityName, entityType, filterYear, filterMonth, filterFrom, filterTo, exclus]);

  const resetFilter = () => { setFilterYear(null); setFilterMonth(null); setFilterFrom(""); setFilterTo(""); setShowRange(false); };

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        <span className="text-xs text-gray-400">Calcul des statistiques…</span>
      </div>
    );
  }

  // ── UI Filtres ────────────────────────────────────────────────────────────────
  const filterBar = (
    <div className="space-y-2 mb-3">
      {/* Ligne 1 : années rapides + toggle range */}
      <div className="flex flex-wrap items-center gap-1">
        <Filter className="w-3 h-3 text-gray-400 shrink-0" />
        {/* Tout */}
        <button
          onClick={() => { setFilterYear(null); setFilterMonth(null); setShowRange(false); setFilterFrom(""); setFilterTo(""); }}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!hasFilter ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400"}`}
        >Tout</button>
        {/* Années */}
        {availableYears.map((y) => (
          <button
            key={y}
            onClick={() => { setFilterYear(filterYear === y ? null : y); setFilterMonth(null); setShowRange(false); setFilterFrom(""); setFilterTo(""); }}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${filterYear === y ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400"}`}
          >{y}</button>
        ))}
        {/* Toggle range */}
        <button
          onClick={() => { setShowRange((v) => !v); setFilterYear(null); setFilterMonth(null); }}
          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-0.5 transition-colors ${showRange ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-violet-400"}`}
        >
          <ChevronDown className="w-2.5 h-2.5" /> Période
        </button>
      </div>

      {/* Ligne 2 : mois (si année sélectionnée) */}
      {filterYear && !showRange && (
        <div className="flex flex-wrap gap-1 pl-4">
          <button
            onClick={() => setFilterMonth(null)}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${!filterMonth ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-300"}`}
          >Tous</button>
          {MONTHS_FR.map((m, i) => (
            <button
              key={i}
              onClick={() => setFilterMonth(filterMonth === i + 1 ? null : i + 1)}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${filterMonth === i + 1 ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-300"}`}
            >{m}</button>
          ))}
        </div>
      )}

      {/* Ligne 3 : range de/à */}
      {showRange && (
        <div className="flex items-center gap-1.5 pl-4 flex-wrap">
          <span className="text-[10px] text-gray-500">De</span>
          <input type="month" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="text-[10px] h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-blue-400" />
          <span className="text-[10px] text-gray-500">à</span>
          <input type="month" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="text-[10px] h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-blue-400" />
          {hasFilter && (
            <button onClick={resetFilter} className="text-[9px] text-red-400 hover:text-red-500 ml-1">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!stats || stats.totalProjects === 0) {
    return (
      <div>
        {filterBar}
        <div className="py-5 text-center">
          <BarChart3 className="w-7 h-7 mx-auto mb-2 text-gray-200 dark:text-gray-700" />
          <p className="text-xs text-gray-400">{hasFilter ? "Aucun projet pour cette période" : "Aucun projet lié trouvé"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      {filterBar}

      {/* ── Résumé ── */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5 text-center">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300 leading-none">{stats.totalProjects}</p>
          <p className="text-[9px] text-blue-500 mt-1">Projets</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center">
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 leading-none">{stats.totalCabines}</p>
          <p className="text-[9px] text-emerald-500 mt-1">Cabines</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-2.5 text-center">
          <p className="text-xl font-bold text-violet-700 dark:text-violet-300 leading-none">{stats.mesuresCount}</p>
          <p className="text-[9px] text-violet-500 mt-1">Mesures faites</p>
        </div>
        {/* SAV imputables à TM seulement — un SAV dû au client ou au
            fournisseur ne dit rien de la qualité de notre travail ici. */}
        <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-2.5 text-center"
          title={`${stats.savTM} projet(s) avec un SAV dû à une erreur TM · ${stats.savTMCabines} cabine(s) sur ${stats.totalCabines} posée(s) sur la période`}>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-300 leading-none">{stats.savTM}</p>
          <p className="text-[9px] text-rose-500 mt-1">SAV TM</p>
          {/* Taux rapporté aux cabines posées sur la période filtrée. */}
          <p className="text-[9px] font-semibold text-rose-600 dark:text-rose-400">
            {stats.totalCabines > 0
              ? `${Math.round((stats.savTMCabines / stats.totalCabines) * 1000) / 10}% des cabines`
              : "—"}
          </p>
        </div>
      </div>

      {/* ── Ce que la relation raconte ───────────────────────────────────
          Les quatre cases ci-dessus disent le volume ; celles-ci disent la
          qualité de la relation — ce qui se transforme, ce qu'on fait
          attendre, où va la tendance, et depuis quand on travaille ensemble. */}
      <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-gray-400" />
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">La relation</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <div title={`${stats.mesuresCount} mesures relevées → ${stats.offres} offres → ${stats.commandes} commandes`}>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">Transformation</p>
            <p className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">
              {stats.mesuresCount > 0 ? `${stats.tauxTransfo} %` : "—"}
            </p>
            <p className="text-[9px] text-gray-400">
              {stats.mesuresCount} → {stats.offres} → {stats.commandes}
            </p>
          </div>
          {/* Les deux attentes que subit ce client, ouvrables l'une et
              l'autre : un délai qu'on ne peut pas ouvrir ne se vérifie pas. */}
          {([
            { cle: "mesure" as const, d: stats.delaiMesure, titre: "Demande → mesure",
              aide: "De la demande de mesure reçue au relevé sur place, en jours ouvrés." },
            { cle: "montage" as const, d: stats.delaiMontage, titre: "Arrivage → montage",
              aide: "De l'arrivée de la marchandise à la pose, en jours ouvrés. Compter depuis la commande mêlerait le retard du fournisseur au nôtre." },
          ]).map(({ cle, d, titre, aide }) => (
            <button key={cle} type="button" title={aide} className="text-left"
              onClick={() => d.cas > 0 && setDelaiOuvert({ titre, aide, delai: d })}>
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">{titre}</p>
              <p className={`text-base font-bold leading-tight ${d.cas > 0 ? "text-gray-800 dark:text-gray-100 hover:text-blue-600" : "text-gray-300"}`}>
                {d.median !== null ? `${d.median} j` : "—"}
              </p>
              <p className="text-[9px] text-gray-400">
                {d.cas > 0 ? `médiane · ${d.cas} projet${d.cas > 1 ? "s" : ""}` : "aucune date"}
              </p>
            </button>
          ))}
          <div title="Douze mois glissants comparés aux douze précédents, hors filtre de période">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">Tendance</p>
            {(() => {
              const av = stats.cabines12Avant, ap = stats.cabines12;
              if (av === 0 && ap === 0) return <p className="text-base font-bold text-gray-400 leading-tight">—</p>;
              const v = av > 0 ? Math.round(((ap - av) / av) * 100) : null;
              const ton = v === null ? "text-gray-800 dark:text-gray-100"
                : v <= -25 ? "text-rose-600 dark:text-rose-400"
                : v >= 25 ? "text-emerald-600 dark:text-emerald-400"
                : "text-gray-800 dark:text-gray-100";
              return (
                <>
                  <p className={`text-base font-bold leading-tight ${ton}`}>
                    {v === null ? "nouveau" : `${v > 0 ? "+" : ""}${v} %`}
                  </p>
                  <p className="text-[9px] text-gray-400">{ap} cab. contre {av}</p>
                </>
              );
            })()}
          </div>
          <div title={stats.montantManquants > 0
            ? `${stats.montantManquants} projet(s) sans montant renseigné : le total est partiel`
            : "Somme des montants d'offre des projets terminés"}>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">Montant</p>
            <p className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">
              {stats.montant > 0 ? `${stats.montant.toLocaleString("fr-CH")} .-` : "—"}
            </p>
            <p className="text-[9px] text-gray-400">
              {stats.montantManquants > 0
                ? `${stats.montantManquants} projet${stats.montantManquants > 1 ? "s" : ""} sans montant`
                : "tous chiffrés"}
            </p>
          </div>
        </div>
        {(stats.premier || stats.dernier) && (
          <p className="text-[10px] text-gray-400 mt-2">
            {stats.premier && `Premier chantier le ${new Date(stats.premier).toLocaleDateString("fr-CH")}`}
            {stats.premier && stats.dernier && " · "}
            {stats.dernier && `dernier le ${new Date(stats.dernier).toLocaleDateString("fr-CH")}`}
          </p>
        )}
      </div>

      {/* Les projets derrière un délai, du plus long au plus court : c'est
          l'exceptionnel qu'on veut inspecter, pas la moyenne. */}
      {/* Porté dans <body> : la carte qui contient ce panneau porte un
          `backdrop-filter`, et un tel ancêtre devient le repère des éléments
          `fixed` — le tiroir se retrouvait piégé dedans, sa croix hors
          d'atteinte. Même cause que pour les menus à cocher. */}
      {delaiOuvert && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[90] bg-black/30" onClick={() => setDelaiOuvert(null)} aria-hidden="true" />
          <div className="fixed top-0 right-0 bottom-0 z-[91] w-[min(560px,94vw)] bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col"
            role="dialog" aria-label={delaiOuvert.titre}>
            <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {delaiOuvert.titre} — {entityName}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {delaiOuvert.delai.cas} projet{delaiOuvert.delai.cas > 1 ? "s" : ""} ·
                  {" "}médiane {delaiOuvert.delai.median} j · moyenne {delaiOuvert.delai.moyen} j
                </p>
                <p className="text-[11px] text-gray-400 mt-1">{delaiOuvert.aide}</p>
              </div>
              <button type="button" onClick={() => setDelaiOuvert(null)} aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-gray-100 dark:divide-gray-700/50">
              {delaiOuvert.delai.projets.map((x) => (
                <div key={x.id} className="flex items-center gap-3 py-2 text-sm">
                  <a href={`/projet/${x.id}?mode=dashboard`}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 -mx-2 py-1">
                    <span className="text-xs font-mono text-gray-400 shrink-0 w-24">{x.ofrTM || "—"}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-800 dark:text-gray-100 truncate">{x.projet}</span>
                      <span className="block text-[11px] text-gray-400">
                        {new Date(x.de).toLocaleDateString("fr-CH")} → {new Date(x.a).toLocaleDateString("fr-CH")}
                      </span>
                    </span>
                    <span className={`font-semibold tabular-nums shrink-0 ${x.jours > (delaiOuvert.delai.median ?? 0) * 2 ? "text-amber-600" : "text-gray-700 dark:text-gray-200"}`}>
                      {x.jours} j
                    </span>
                  </a>
                  {/* Écarter une attente qui ne nous est pas imputable. Le
                      motif est obligatoire : une correction sans trace serait
                      invérifiable. */}
                  <button type="button" onClick={() => basculerExclusion(x.id, x.ofrTM)}
                    title="Écarter ce chantier des statistiques de délai"
                    className="shrink-0 text-[10px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-amber-700 hover:border-amber-300">
                    écarter
                  </button>
                </div>
              ))}
            </div>
            {exclus.size > 0 && (
              <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-700 max-h-32 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                  Écartés des statistiques ({exclus.size})
                </p>
                {[...exclus.entries()].map(([id, motif]) => (
                  <div key={id} className="flex items-center gap-2 text-[11px] text-gray-500 py-0.5">
                    <span className="flex-1 min-w-0 truncate">{motif}</span>
                    <button type="button" onClick={() => basculerExclusion(id, "")}
                      className="text-blue-600 hover:underline shrink-0">réintégrer</button>
                  </div>
                ))}
              </div>
            )}
            <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-700">
              Délais en <b>jours ouvrés</b> : week-ends et jours fériés vaudois sont retirés,
              puisque personne n&apos;y travaille. La <b>médiane</b> mène l&apos;affichage — une
              moyenne serait écrasée par un chantier reporté d&apos;un an — mais les deux
              figurent ci-dessus. Seuls les chantiers dont ce client est le <b>donneur
              d&apos;ordre</b> sont comptés.
            </p>
          </div>
        </>,
        document.body,
      )}

      {/* ── Fournisseurs de cabines ── */}
      {stats.fournisseurs.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fournisseurs cabines</p>
          </div>
          {stats.fournisseurs.map((f, i) => (
            <StatBar key={f.name} label={f.name} count={f.projects} totalCabines={stats.totalCabines} cabines={f.cabines} colorIdx={i} />
          ))}
        </div>
      )}

      {/* ── Séries / Modèles ── */}
      {stats.series.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Séries / Modèles</p>
          </div>
          {stats.series.map((s, i) => (
            <StatBar key={s.name} label={s.name} count={s.projects} totalCabines={stats.totalCabines} cabines={s.cabines} colorIdx={i + 2} />
          ))}
        </div>
      )}

      {/* ── Top clients (fournisseurs/grossistes seulement) ── */}
      {stats.topClients.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top clients</p>
          </div>
          {stats.topClients.map((c, i) => (
            <StatBar key={c.name} label={c.name} count={c.projects} totalCabines={stats.totalCabines} cabines={c.cabines} colorIdx={i + 4} />
          ))}
        </div>
      )}
    </div>
  );
}

// Keys to skip in display/edit (internal, read-only, or relation IDs)
const SKIP_KEYS = new Set(["__entryName"]);
// « Entreprise » n'est plus masquée : résolue en nom côté serveur, on l'affiche.
const HIDDEN_KEYS = new Set(["Dossiers (CMD)", "Dossiers", "Contacts", "Opportunités", "Projets CRM", "Grossistes", "Fournisseurs"]);
const READONLY_KEYS = new Set(["Nb. Projets", "Projets terminé", "Projets terminés"]);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

function getIcon(key: string) {
  const k = key.toLowerCase();
  if (k === "entreprise") return <Building className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (k.includes("email") || k.includes("mail")) return <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) return <Phone className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  if (k.includes("site") || k.includes("web") || k.includes("url")) return <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
  if (k.includes("adresse") || k.includes("address")) return <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (k.includes("rabais") || k.includes("nb") || k.includes("projet")) return <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  if (k.includes("étiquette") || k.includes("tag")) return <Tag className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
  if (k.includes("date") || k.includes("contact") || k.includes("dernier")) return <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return null;
}

function isRelationIdArray(value: any): boolean {
  if (!Array.isArray(value)) return false;
  return value.length > 0 && typeof value[0] === "string" && /^[0-9a-f-]{30,}$/.test(value[0]);
}

function PropertyValue({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (SKIP_KEYS.has(label) || HIDDEN_KEYS.has(label)) return null;
  if (isRelationIdArray(value)) return null;

  const k = label.toLowerCase();
  const icon = getIcon(label);

  // Email - clickable
  if ((k.includes("email") || k.includes("mail")) && typeof value === "string" && value.includes("@")) {
    return (
      <a href={`mailto:${value}`} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Phone - clickable
  if ((k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) && typeof value === "string" && value) {
    return (
      <a href={`tel:${value}`} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // URL - clickable
  if ((k.includes("site") || k.includes("web") || k.includes("url")) && typeof value === "string" && value) {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Arrays (multi-select, relations)
  if (Array.isArray(value)) {
    return (
      <div className="flex items-start gap-2 text-xs">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span>
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px]">{String(v)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Percentage (rabais, etc.)
  if (k.includes("rabais") || k.includes("taux") || k.includes("marge")) {
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(num)) {
      const pct = num < 1 ? Math.round(num * 100) : Math.round(num);
      return (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          {icon} <span className="text-gray-400">{label}:</span> <span className="font-medium">{pct} %</span>
        </div>
      );
    }
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon} <span className="text-gray-400">{label}:</span> {value ? "Oui" : "Non"}
      </div>
    );
  }

  // Date
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon || <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="text-gray-400">{label}:</span> {formatDate(value)}
      </div>
    );
  }

  // Default string/number
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 truncate">
      {icon} <span className="text-gray-400 shrink-0">{label}:</span> <span className="truncate">{String(value)}</span>
    </div>
  );
}

function LogoImage({ src, name }: { src: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-gray-500">
        {initials}
      </div>
    );
  }

  return (
    <div ref={ref} className="w-8 h-8 rounded-lg shrink-0 relative">
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-400 animate-pulse">
          {initials}
        </div>
      )}
      {visible && (
        <img
          src={src.startsWith("http") ? thumbnailUrl(src, 64) : src}
          alt=""
          className={`w-8 h-8 rounded-lg object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

function EntryCard({ entry, mode, isAdmin, onEdit, onDelete }: {
  entry: CRMEntry; mode: string; isAdmin: boolean;
  onEdit: (e: CRMEntry) => void; onDelete: (e: CRMEntry) => void;
}) {
  const p = entry.properties;
  const poste = p["Poste"] || "";
  const etiquettes = Array.isArray(p["Étiquettes"]) ? p["Étiquettes"] : [];
  const isEmoji = entry.icon && !entry.icon.startsWith("http");
  const isImage = entry.icon && entry.icon.startsWith("http");

  const titleKey = Object.entries(p).find(([, v]) => v === entry.name)?.[0] || "";
  const displayProps = Object.entries(p)
    .filter(([k, v]) => k !== titleKey && !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(v) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => {
      const priority = (k: string) => {
        const l = k.toLowerCase();
        if (l === "entreprise") return -1;
        if (l.includes("adresse")) return 0;
        if (l.includes("email") || l.includes("mail")) return 1;
        if (l.includes("portable") || l.includes("mobile")) return 2;
        if (l.includes("téléphone") || l.includes("phone")) return 3;
        if (l.includes("site") || l.includes("web")) return 4;
        if (l.includes("étiquette")) return 5;
        return 10;
      };
      return priority(a) - priority(b);
    });

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"infos" | "stats">("infos");

  // Stats disponibles pour tous sauf contacts
  const entityType = MODE_TO_TYPE[mode as ClientMode];
  const hasStats = entityType && entityType !== "contacts";

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      {/* ── En-tête : toujours visible ── */}
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-2 mb-1 min-w-0">
          {isImage ? (
            <LogoImage src={entry.icon} name={entry.name} />
          ) : isEmoji ? (
            <span className="text-xl shrink-0">{entry.icon}</span>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-[#1e3a5f] dark:text-white truncate text-sm">{entry.name}</h3>
            <div className="flex items-center gap-1 flex-wrap">
              {poste && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${POSTE_COLORS[poste] || "bg-gray-100 text-gray-600"}`}>{poste}</span>}
              {etiquettes.map((t: string) => (
                <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }} className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <Pencil className="w-3 h-3 text-gray-400" />
          </button>
          {isAdmin && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(entry); }} className="w-7 h-7 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center">
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── Contenu expansible ── */}
      {expanded && (
        <div className="mt-2">
          {/* Onglets Infos / Statistiques */}
          {hasStats && (
            <div className="flex gap-1 mb-3 border-b border-gray-100 dark:border-gray-700/60 pb-2">
              <button
                onClick={() => setActiveTab("infos")}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activeTab === "infos" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
              >
                Infos
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activeTab === "stats" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
              >
                <BarChart3 className="w-3 h-3" />
                Statistiques
              </button>
            </div>
          )}

          {/* Contenu de l'onglet actif */}
          {(!hasStats || activeTab === "infos") ? (
            <div className="space-y-1.5">
              {displayProps.map(([k, v]) => (
                <PropertyValue key={k} label={k} value={v} />
              ))}
              {displayProps.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Aucune information disponible</p>
              )}
            </div>
          ) : (
            <StatsPanel entityName={entry.name} entityType={entityType} />
          )}
        </div>
      )}

      {/* Indicateur "cliquer pour voir" si pas encore ouvert */}
      {!expanded && displayProps.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => setExpanded(true)}>
          Voir les détails…
        </p>
      )}
    </div>
  );
}

// Dynamic form that shows ALL properties
function EntryForm({ entry, type, onSubmit, onCancel, loading }: {
  entry: CRMEntry | null;
  type: string;
  onSubmit: (properties: Record<string, any>, icon?: string | null) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const props = entry?.properties || {};
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [iconUrl, setIconUrl] = useState<string>(entry?.icon || "");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [schema, setSchema] = useState<Record<string, { type: string; options?: string[] }>>({});
  const [newOption, setNewOption] = useState<Record<string, string>>({});

  // Load schema with options
  useEffect(() => {
    fetch(`/api/crm?type=${type}&schema=1`)
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setSchema(data); })
      .catch(() => {});
  }, [type]);

  useEffect(() => {
    const init: Record<string, string> = {};
    const initMulti: Record<string, string[]> = {};
    if (entry) {
      for (const [k, v] of Object.entries(props)) {
        if (SKIP_KEYS.has(k) || HIDDEN_KEYS.has(k) || isRelationIdArray(v)) continue;
        if (Array.isArray(v)) {
          initMulti[k] = v.map(String);
          init[k] = v.join(", ");
        } else if (v !== null && v !== undefined) {
          init[k] = String(v);
        } else {
          init[k] = "";
        }
      }
      const titleKey = Object.entries(props).find(([, v]) => v === entry.name)?.[0];
      if (titleKey && !init[titleKey]) init[titleKey] = entry.name;
      setIconUrl(entry.icon || "");
    }
    setValues(init);
    setMultiValues(initMulti);
  }, [entry]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("category", "crm-logos");
      formData.append("projectId", "crm");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.files?.[0]?.url;
        if (url) setIconUrl(url);
      }
    } catch {} finally {
      setUploadingIcon(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (READONLY_KEYS.has(k)) continue;
      const schemaType = schema[k]?.type;
      if (schemaType === "multi_select") {
        result[k] = multiValues[k] || v.split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        result[k] = v;
      }
    }
    // Include multi_select fields not in values
    for (const [k, v] of Object.entries(multiValues)) {
      if (!result[k]) result[k] = v;
    }
    const iconChanged = entry ? iconUrl !== (entry.icon || "") : !!iconUrl;
    onSubmit(result, iconChanged ? (iconUrl || null) : undefined);
  };

  const fields = entry
    ? Object.keys(props).filter((k) => !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(props[k]))
    : ["Nom", "Email", "Téléphone"];

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto">
      {/* Logo */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Logo</label>
        <div className="flex items-center gap-3">
          {iconUrl && iconUrl.startsWith("http") ? (
            <img src={thumbnailUrl(iconUrl, 96)} alt="Logo" loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700" />
          ) : iconUrl ? (
            <span className="text-3xl">{iconUrl}</span>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {uploadingIcon ? "Upload..." : iconUrl ? "Changer" : "Ajouter"}
              <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} disabled={uploadingIcon} />
            </label>
            {iconUrl && (
              <button type="button" onClick={() => setIconUrl("")} className="text-xs text-red-500 hover:text-red-600 text-left">
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {fields.map((key) => {
        const isReadOnly = READONLY_KEYS.has(key);
        const val = values[key] || "";
        const schemaEntry = schema[key];
        const fieldType = schemaEntry?.type;
        const options = schemaEntry?.options || [];

        return (
          <div key={key}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5 block">{key}</label>
            {isReadOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{val || "—"}</p>
            ) : fieldType === "select" && options.length > 0 ? (
              <select
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              >
                <option value="">— Sélectionner —</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : fieldType === "multi_select" ? (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(multiValues[key] || []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {tag}
                      <button type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: (prev[key] || []).filter((t) => t !== tag) }))} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {options.filter((o) => !(multiValues[key] || []).includes(o)).map((o) => (
                    <button key={o} type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), o] }))}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      + {o}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newOption[key] || ""}
                    onChange={(e) => setNewOption((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Nouvelle option..."
                    className="flex-1 h-7 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100"
                  />
                  <button type="button" onClick={() => {
                    const v = (newOption[key] || "").trim();
                    if (!v) return;
                    setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), v] }));
                    setNewOption((prev) => ({ ...prev, [key]: "" }));
                  }} className="h-7 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <input
                type={key.toLowerCase().includes("email") || key.toLowerCase().includes("mail") ? "email" : key.toLowerCase().includes("date") ? "date" : "text"}
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={key}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              />
            )}
          </div>
        );
      })}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-800">
        <button type="submit" disabled={loading}
          className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
          Annuler
        </button>
      </div>
    </form>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

export function CRMClients({ mode, isAdmin, filterTag, initialSearch }: { mode: ClientMode; isAdmin?: boolean; filterTag?: string | null; initialSearch?: string }) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(initialSearch || "");
  const [editEntry, setEditEntry] = useState<CRMEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<CRMEntry | null>(null);
  const [mutating, setMutating] = useState(false);

  const type = MODE_TO_TYPE[mode];

  const fetchEntries = (refresh = false) => {
    if (refresh) {
      // Purge du localStorage pour forcer le rechargement des logos/données
      try { localStorage.removeItem(`tm-crm-${type}`); } catch {}
      // Aussi vider le cache global des projets pour les stats
      _projectsCache = null;
      _projectsCachePromise = null;
    }
    fetch(`/api/crm?type=${type}${refresh ? "&refresh=1" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEntries(data);
          try { localStorage.setItem(`tm-crm-${type}`, JSON.stringify(data)); } catch {}
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    setEntries([]);
    try {
      const cached = localStorage.getItem(`tm-crm-${type}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEntries(parsed);
          setLoading(false);
        }
      }
    } catch {}
    fetchEntries();
  }, [type]);

  const filtered = useMemo(() => {
    let result = entries;
    // Filtre par étiquette
    // Cherche dans TOUTES les propriétés (multi_select, select, text…) pour
    // être compatible quel que soit le nom de champ utilisé dans Notion.
    if (filterTag) {
      const lc = filterTag.toLowerCase();
      result = result.filter((e) =>
        Object.values(e.properties).some((v) => {
          if (Array.isArray(v)) return v.some((item: unknown) => typeof item === "string" && item.toLowerCase() === lc);
          if (typeof v === "string") return v.toLowerCase() === lc;
          return false;
        })
      );
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter((e) => {
      const allValues = Object.values(e.properties).flatMap((v) =>
        Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      );
      return e.name.toLowerCase().includes(q) || allValues.some((v) => String(v).toLowerCase().includes(q));
    });
  }, [entries, search, filterTag]);

  const handleCreate = async (properties: Record<string, any>, icon?: string | null) => {
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, properties, ...(icon !== undefined ? { icon } : {}) }),
      });
      if (res.ok) {
        setShowCreate(false);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
  };

  const handleEdit = async (properties: Record<string, any>, icon?: string | null) => {
    if (!editEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editEntry.id, type, properties, ...(icon !== undefined ? { icon } : {}) }),
      });
      if (res.ok) {
        setEditEntry(null);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteEntry.id, type }),
      });
      if (res.ok) {
        setDeleteEntry(null);
        setEntries((prev) => prev.filter((e) => e.id !== deleteEntry.id));
      }
    } catch {} finally { setMutating(false); }
  };

  if (loading && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        {/* Rafraîchir — purge localStorage + re-fetch Notion */}
        <button
          onClick={() => { setLoading(true); fetchEntries(true); }}
          title="Rafraîchir depuis Notion (logos, données)"
          className="shrink-0 h-10 w-10 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} mode={mode} isAdmin={!!isAdmin} onEdit={setEditEntry} onDelete={setDeleteEntry} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun résultat</p>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => !mutating && setShowCreate(false)} title="Nouveau">
        <EntryForm entry={null} type={type} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} loading={mutating} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => !mutating && setEditEntry(null)} title="Modifier">
        {editEntry && (
          <EntryForm entry={editEntry} type={type} onSubmit={handleEdit} onCancel={() => setEditEntry(null)} loading={mutating} />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteEntry} onClose={() => !mutating && setDeleteEntry(null)} title="Supprimer">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Supprimer <strong>{deleteEntry?.name}</strong> ? Cette action est irréversible.
        </p>
        <div className="flex gap-2">
          <button onClick={handleDelete} disabled={mutating}
            className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
            {mutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Supprimer
          </button>
          <button onClick={() => setDeleteEntry(null)} className="h-9 px-4 rounded-lg border border-gray-200 text-sm text-gray-600">
            Annuler
          </button>
        </div>
      </Modal>
    </div>
  );
}
