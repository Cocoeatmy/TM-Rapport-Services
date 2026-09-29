"use client";

/**
 * Page « Indicateurs financiers » — réservée aux administrateurs.
 *
 * Le chiffre d'affaires vient des statistiques réelles (base journalière
 * Notion). Tout le reste — charges, salaires, trésorerie, créances… — n'existe
 * dans aucune base de l'app : ce sont des champs à remplir, conservés côté
 * serveur pour être partagés entre les appareils.
 *
 * Un indicateur dont il manque une donnée affiche « — » plutôt qu'un chiffre
 * inventé, et dit ce qui lui manque.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CaVue } from "@/components/ca-vue";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COLLABORATEURS_LIST } from "@/lib/constants";
import {
  ArrowLeft, Loader2, Save, CheckCircle2, TrendingUp, Wallet, Timer,
  PiggyBank, Users, Percent, Info,
} from "lucide-react";

/* ── Champs à saisir ──────────────────────────────────────────────────────
   Regroupés par thème, chacun avec l'unité et ce à quoi il sert. */
type Champ = { id: string; label: string; unite: string; aide: string };
type Groupe = { titre: string; sous: string; champs: Champ[] };

const GROUPES: Groupe[] = [
  {
    titre: "Charges d'exploitation",
    sous: "par mois, en moyenne",
    champs: [
      { id: "salaires", label: "Salaires (charges comprises)", unite: "CHF / mois", aide: "Masse salariale mensuelle totale." },
      { id: "chargesFixes", label: "Charges fixes", unite: "CHF / mois", aide: "Loyers, véhicules, assurances, abonnements." },
      { id: "autresCharges", label: "Autres charges", unite: "CHF / mois", aide: "Matériel, carburant, sous-traitance, frais divers." },
    ],
  },
  {
    titre: "Trésorerie et besoin en fonds de roulement",
    sous: "à la date d'aujourd'hui",
    champs: [
      { id: "tresorerie", label: "Trésorerie disponible", unite: "CHF", aide: "Solde des comptes, immédiatement mobilisable." },
      { id: "creances", label: "Créances clients", unite: "CHF", aide: "Factures émises, pas encore encaissées." },
      { id: "stock", label: "Stock", unite: "CHF", aide: "Valeur des cabines et pièces en dépôt." },
      { id: "dettes", label: "Dettes fournisseurs", unite: "CHF", aide: "Factures reçues, pas encore payées." },
    ],
  },
  {
    titre: "Acquisition de clients",
    sous: "sur la période affichée",
    champs: [
      { id: "depensesAcquisition", label: "Dépenses d'acquisition", unite: "CHF", aide: "Publicité, démarchage, salons, commissions d'apport." },
      { id: "nouveauxClients", label: "Nouveaux clients", unite: "clients", aide: "Clients qui ont commandé pour la première fois." },
      { id: "nbClients", label: "Clients actifs", unite: "clients", aide: "Clients distincts ayant commandé sur la période." },
    ],
  },
  {
    titre: "Rentabilité par chantier",
    sous: "valeurs moyennes servant au calcul, par cabine ou par heure",
    champs: [
      { id: "tauxHoraire", label: "Coût horaire par défaut", unite: "CHF / h", aide: "Utilisé pour un monteur sans taux propre ci-dessous." },
      { id: "coutDeplacement", label: "Coût d'un déplacement", unite: "CHF / chantier", aide: "Véhicule, carburant, temps de trajet moyen." },
      { id: "consommables", label: "Consommables par cabine", unite: "CHF / cabine", aide: "Silicone, visserie, joints, petites fournitures." },
      { id: "achatCabine", label: "Achat moyen d'une cabine", unite: "CHF / cabine", aide: "Prix d'achat vitrage et profilés, hors accessoires." },
      { id: "accessoires", label: "Accessoires par cabine", unite: "CHF / cabine", aide: "Barres, poignées, pièces complémentaires." },
      { id: "prixVente", label: "Prix de vente moyen d'une cabine", unite: "CHF / cabine", aide: "Laissez vide si le prix varie trop : le calcul se limitera alors aux coûts." },
      { id: "margeCible", label: "Marge cible", unite: "%", aide: "En dessous, le chantier est signalé comme sous-estimé." },
    ],
  },
  {
    titre: "Coût horaire par monteur",
    sous: "salaire chargé rapporté à l'heure travaillée · laissez vide pour utiliser le taux par défaut",
    champs: COLLABORATEURS_LIST.map((nom) => ({
      id: `taux_${nom}`,
      label: nom,
      unite: "CHF / h",
      aide: "",
    })),
  },
  {
    titre: "Investissement",
    sous: "pour le calcul du retour sur investissement",
    champs: [
      { id: "investissement", label: "Montant investi", unite: "CHF", aide: "Véhicule, machine, outillage, logiciel…" },
      { id: "gainInvestissement", label: "Gain généré", unite: "CHF", aide: "Économie ou marge supplémentaire apportée par cet investissement." },
    ],
  },
];

const fmtCHF = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")} CHF`;

export default function FinancesPage() {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  /* Page reservee aux administrateurs : un collaborateur qui taperait
     l'adresse est renvoye a l'accueil, le menu ne suffit pas a proteger. */
  const [autorise, setAutorise] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role !== "admin") { router.replace("/"); setAutorise(false); }
        else setAutorise(true);
      })
      .catch(() => { router.replace("/"); setAutorise(false); });
  }, [router]);
  const [chargement, setChargement] = useState(true);
  /* Deux onglets plutôt qu'une page de plus : les indicateurs financiers
     posaient déjà ces questions, en attendant des chiffres qu'on n'avait pas.
     L'onglet se lit dans l'adresse, pour qu'un lien mène droit au bon. */
  const [onglet, setOnglet] = useState<"indicateurs" | "ca">("indicateurs");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("onglet");
    if (p === "ca") setOnglet("ca");
  }, []);
  const [enreg, setEnreg] = useState(false);
  const [enregOk, setEnregOk] = useState(false);

  /* Chiffre d'affaires réel, par année, depuis la base statistique. */
  const [caParAnnee, setCaParAnnee] = useState<Record<string, number>>({});
  const [annee, setAnnee] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    Promise.all([
      fetch("/api/finances").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/stats/services").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([params, stats]) => {
      const v: Record<string, string> = {};
      Object.entries(params || {}).forEach(([k, val]) => {
        v[k] = val === null || val === undefined ? "" : String(val);
      });
      setVals(v);
      const par: Record<string, number> = {};
      (Array.isArray(stats) ? stats : []).forEach((r: any) => {
        if (r?.objectif || !r?.mois) return;
        const an = String(r.mois).slice(0, 4);
        par[an] = (par[an] || 0) + (Number(r.ca) || 0);
      });
      setCaParAnnee(par);
      const annees = Object.keys(par).sort();
      if (annees.length && !par[String(new Date().getFullYear())]) {
        setAnnee(annees[annees.length - 1]);
      }
    }).finally(() => setChargement(false));
  }, []);

  const enregistrer = useCallback(async () => {
    setEnreg(true);
    setEnregOk(false);
    try {
      const corps: Record<string, number | null> = {};
      Object.entries(vals).forEach(([k, v]) => {
        corps[k] = v.trim() === "" ? null : Number(String(v).replace(",", "."));
      });
      const res = await fetch("/api/finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (res.ok) { setEnregOk(true); setTimeout(() => setEnregOk(false), 2500); }
    } finally {
      setEnreg(false);
    }
  }, [vals]);

  /** Valeur saisie, ou null si le champ est vide. */
  const n = useCallback((id: string): number | null => {
    const v = (vals[id] ?? "").trim();
    if (v === "") return null;
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? x : null;
  }, [vals]);

  const ca = caParAnnee[annee] ?? 0;
  const annees = Object.keys(caParAnnee).sort();

  /* ── Rentabilité par chantier ─────────────────────────────────────────
     Les heures réellement pointées croisées avec les coûts saisis. Aucune
     recette n'existe par projet dans l'app : la marge n'apparaît donc que si
     un prix de vente moyen est renseigné, et elle est alors une ESTIMATION,
     dite comme telle. Sans prix, on compare les coûts entre eux, ce qui
     suffit à repérer les dérives. */
  const [chantiers, setChantiers] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/projects/cmd-termine")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChantiers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const rentabilite = useMemo(() => {
    const tauxDefaut = n("tauxHoraire");
    /* Chaque monteur a son coût : on prend la moyenne de ceux qui ont
       travaillé sur le chantier, et le taux par défaut pour les autres. */
    const tauxDe = (p: any): number | null => {
      const attr = String(p.attributionCabines || "");
      const noms = new Set<string>();
      const re = /Cab(\d+)\s*:([^|]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attr))) {
        m[2].split("&").map((x) => x.trim()).filter(Boolean).forEach((x) => noms.add(x));
      }
      if (noms.size === 0) {
        String(p.collaborateurs || "").split("&").map((x) => x.trim()).filter(Boolean)
          .forEach((x) => noms.add(x));
      }
      const taux = [...noms]
        .map((nom) => n(`taux_${nom}`) ?? tauxDefaut)
        .filter((v): v is number => v !== null);
      if (taux.length === 0) return tauxDefaut;
      return taux.reduce((s2, v) => s2 + v, 0) / taux.length;
    };
    const taux = tauxDefaut ?? (COLLABORATEURS_LIST.some((nom) => n(`taux_${nom}`) !== null) ? 0 : null);
    const dep = n("coutDeplacement") ?? 0;
    const conso = n("consommables") ?? 0;
    const achat = n("achatCabine") ?? 0;
    const acc = n("accessoires") ?? 0;
    const vente = n("prixVente");
    const cible = n("margeCible");
    if (taux === null) return null; // sans coût horaire, rien n'est calculable

    const minutes = (p: any) => {
      const lire = (raw?: string) => {
        const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const a = lire(p.heureArrivee), b = lire(p.heureDepart);
      return a !== null && b !== null && b > a ? b - a : 0;
    };

    const lignes = chantiers
      .filter((p) => String(p.dateMontage || "").startsWith(annee))
      .map((p) => {
        const cab = Number(p.nbCabines) || 0;
        const min = minutes(p);
        const mo = (min / 60) * (tauxDe(p) ?? 0);
        const achats = cab * (achat + acc + conso);
        const cout = mo + achats + dep;
        const recette = vente !== null ? cab * vente : null;
        const marge = recette !== null ? recette - cout : null;
        const margePct = recette !== null && recette > 0 ? (marge! / recette) * 100 : null;
        return {
          id: p.id,
          ofrTM: p.ofrTM || "—",
          projet: p.projet || "Sans nom",
          serie: (p.seriesCabines || []).join(", ") || "Non renseignée",
          fournisseur: (p.fournisseurs || []).join(", ") || "Non renseigné",
          cabines: cab,
          minutes: min,
          coutMO: mo,
          cout,
          coutParCabine: cab > 0 ? cout / cab : 0,
          marge, margePct,
        };
      })
      .filter((l) => l.cabines > 0 && l.minutes > 0);

    if (lignes.length === 0) return { lignes: [], moyenneCoutCabine: 0, parSerie: [], cible };

    const moyenneCoutCabine =
      lignes.reduce((s2, l) => s2 + l.coutParCabine, 0) / lignes.length;

    // Regroupement par série : repérer les modèles qui dérivent.
    const m = new Map<string, { n: number; cab: number; cout: number; min: number }>();
    lignes.forEach((l) => {
      const cur = m.get(l.serie) || { n: 0, cab: 0, cout: 0, min: 0 };
      cur.n += 1; cur.cab += l.cabines; cur.cout += l.cout; cur.min += l.minutes;
      m.set(l.serie, cur);
    });
    const parSerie = [...m.entries()]
      .map(([serie, v]) => ({
        serie, chantiers: v.n, cabines: v.cab,
        coutParCabine: v.cab > 0 ? v.cout / v.cab : 0,
        minutesParCabine: v.cab > 0 ? v.min / v.cab : 0,
      }))
      .sort((a, b) => b.coutParCabine - a.coutParCabine);

    return {
      lignes: lignes.sort((a, b) =>
        (a.margePct ?? -a.coutParCabine) - (b.margePct ?? -b.coutParCabine)),
      moyenneCoutCabine, parSerie, cible,
    };
  }, [chantiers, annee, n]);

  /* ── Indicateurs ────────────────────────────────────────────────────────
     Chacun dit ce qui lui manque plutôt que d'afficher un chiffre faux. */
  const indicateurs = useMemo(() => {
    const manque = (...ids: string[]) =>
      ids.filter((id) => n(id) === null)
        .map((id) => GROUPES.flatMap((g) => g.champs).find((c) => c.id === id)?.label || id);

    const chargesMensuelles = [n("salaires"), n("chargesFixes"), n("autresCharges")];
    const chargesCompletes = chargesMensuelles.every((x) => x !== null);
    const chargesMois = chargesCompletes ? chargesMensuelles.reduce((s, x) => s + (x as number), 0) : null;
    const chargesAnnee = chargesMois !== null ? chargesMois * 12 : null;

    const ebitda = chargesAnnee !== null ? ca - chargesAnnee : null;

    const bfrIds = ["creances", "stock", "dettes"];
    const bfr = bfrIds.every((id) => n(id) !== null)
      ? (n("creances") as number) + (n("stock") as number) - (n("dettes") as number)
      : null;

    const runway = n("tresorerie") !== null && chargesMois !== null && chargesMois > 0
      ? (n("tresorerie") as number) / chargesMois
      : null;

    const vmc = n("nbClients") !== null && (n("nbClients") as number) > 0
      ? ca / (n("nbClients") as number)
      : null;

    const cac = n("depensesAcquisition") !== null && n("nouveauxClients") !== null && (n("nouveauxClients") as number) > 0
      ? (n("depensesAcquisition") as number) / (n("nouveauxClients") as number)
      : null;

    const roi = n("investissement") !== null && (n("investissement") as number) > 0 && n("gainInvestissement") !== null
      ? (((n("gainInvestissement") as number) - (n("investissement") as number)) / (n("investissement") as number)) * 100
      : null;

    return [
      {
        id: "ebitda", label: "EBITDA", Icon: TrendingUp, color: "#0f766e",
        valeur: ebitda === null ? null : fmtCHF(ebitda),
        detail: `Chiffre d'affaires ${annee} moins les charges d'exploitation de l'année.`,
        manque: manque("salaires", "chargesFixes", "autresCharges"),
      },
      {
        id: "bfr", label: "BFR", Icon: PiggyBank, color: "#1e3a5f",
        valeur: bfr === null ? null : fmtCHF(bfr),
        detail: "Créances clients + stock − dettes fournisseurs. Ce que l'activité immobilise.",
        manque: manque("creances", "stock", "dettes"),
      },
      {
        id: "runway", label: "Runway", Icon: Timer, color: "#b45309",
        valeur: runway === null ? null : `${Math.round(runway * 10) / 10} mois`,
        detail: "Nombre de mois que la trésorerie couvre, à charges constantes et sans nouvelle rentrée.",
        manque: manque("tresorerie", "salaires", "chargesFixes", "autresCharges"),
      },
      {
        id: "vmc", label: "Valeur moyenne client", Icon: Users, color: "#6d28d9",
        valeur: vmc === null ? null : fmtCHF(vmc),
        detail: `Chiffre d'affaires ${annee} divisé par le nombre de clients actifs.`,
        manque: manque("nbClients"),
      },
      {
        id: "cac", label: "Coût d'acquisition client", Icon: Wallet, color: "#be123c",
        valeur: cac === null ? null : fmtCHF(cac),
        detail: "Dépenses d'acquisition divisées par le nombre de nouveaux clients.",
        manque: manque("depensesAcquisition", "nouveauxClients"),
      },
      {
        id: "roi", label: "ROI", Icon: Percent, color: "#15803d",
        valeur: roi === null ? null : `${roi > 0 ? "+" : ""}${Math.round(roi)} %`,
        detail: "(Gain généré − montant investi) ÷ montant investi.",
        manque: manque("investissement", "gainInvestissement"),
      },
    ];
  }, [n, ca, annee]);

  // Rien n'est peint tant que le role n'est pas confirme : pas d'aperçu
  // fugace du contenu pour un collaborateur.
  if (autorise !== true) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-400 px-4 py-10">
        <Loader2 className="w-4 h-4 animate-spin" /> Vérification des droits…
      </p>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl glass-card flex items-center justify-center hover:bg-white/80 transition-all active:scale-95"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-200">Indicateurs financiers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Le chiffre d&apos;affaires vient des statistiques ; le reste est à renseigner ci-dessous
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {([["indicateurs", "Indicateurs"], ["ca", "Chiffre d'affaires"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => {
            setOnglet(k);
            const u = new URL(window.location.href);
            if (k === "ca") u.searchParams.set("onglet", "ca"); else u.searchParams.delete("onglet");
            window.history.replaceState(null, "", u.pathname + u.search);
          }}
            className={`text-xs font-medium px-4 py-2 rounded-xl transition-colors ${
              onglet === k ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
            }`}>{l}</button>
        ))}
      </div>

      {onglet === "ca" ? <CaVue /> : chargement ? (
        <p className="flex items-center gap-2 text-sm text-gray-400 py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </p>
      ) : (
        <>
          {/* Année de référence + CA réel */}
          <div className="glass-card rounded-2xl p-5 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Année</span>
              {annees.length === 0 && <span className="text-sm text-gray-400">Aucune donnée statistique.</span>}
              {annees.map((a) => (
                <button
                  key={a}
                  onClick={() => setAnnee(a)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    annee === a ? "bg-[#1e3a5f] text-white" : "glass-card text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {a}
                </button>
              ))}
              <span className="ml-auto text-right">
                <span className="block text-xs text-gray-400">Chiffre d&apos;affaires {annee}</span>
                <span className="block text-2xl font-bold text-[#1e3a5f] dark:text-blue-200">{fmtCHF(ca)}</span>
              </span>
            </div>
          </div>

          {/* Indicateurs calculés */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            {indicateurs.map((k) => (
              <div key={k.id} className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <k.Icon className="w-4 h-4" style={{ color: k.color }} />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{k.label}</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: k.valeur ? k.color : "#9ca3af" }}>
                  {k.valeur ?? "—"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{k.detail}</p>
                {k.manque.length > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    À renseigner&nbsp;: {k.manque.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Champs à remplir */}
          {GROUPES.map((g) => (
            <div key={g.titre} className="glass-card rounded-2xl p-5 mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{g.titre}</h2>
              <p className="text-xs text-gray-400 mb-4">{g.sous}</p>
              <div className="space-y-3">
                {g.champs.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3">
                    <label htmlFor={c.id} className="w-full sm:w-64 shrink-0">
                      <span className="block text-sm text-gray-700 dark:text-gray-200">{c.label}&nbsp;:</span>
                      <span className="block text-[11px] text-gray-400">{c.aide}</span>
                    </label>
                    <input
                      id={c.id}
                      type="number"
                      inputMode="decimal"
                      value={vals[c.id] ?? ""}
                      onChange={(e) => setVals((p) => ({ ...p, [c.id]: e.target.value }))}
                      placeholder="—"
                      className="flex-1 min-w-[120px] h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-3 text-sm"
                    />
                    <span className="text-xs text-gray-400 w-24 shrink-0">{c.unite}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── Rentabilité par chantier ── */}
          <div className="glass-card rounded-2xl p-5 mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Contrôle de rentabilité par chantier
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              heures réellement pointées croisées avec les coûts ci-dessus · montages {annee}
            </p>

            {!rentabilite ? (
              <p className="text-sm text-gray-400">
                Renseignez au moins un <strong>coût horaire</strong> — par défaut ou pour un monteur — afin de lancer le calcul.
              </p>
            ) : rentabilite.lignes.length === 0 ? (
              <p className="text-sm text-gray-400">
                Aucun montage {annee} avec des heures pointées — le calcul repose sur ces heures.
              </p>
            ) : (
              <>
                {/* Modèles qui dérivent */}
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Coût par cabine selon la série
                </h3>
                <div className="space-y-1 mb-5">
                  {rentabilite.parSerie.map((s2) => {
                    const ecart = rentabilite.moyenneCoutCabine > 0
                      ? ((s2.coutParCabine - rentabilite.moyenneCoutCabine) / rentabilite.moyenneCoutCabine) * 100
                      : 0;
                    return (
                      <div key={s2.serie} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-100 dark:border-gray-700/50">
                        <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{s2.serie}</span>
                        <span className="text-xs text-gray-400 w-28 text-right">
                          {s2.chantiers} chantier{s2.chantiers > 1 ? "s" : ""} · {s2.cabines} cab.
                        </span>
                        <span className="text-xs text-gray-400 w-20 text-right">
                          {Math.round(s2.minutesParCabine)} min/cab.
                        </span>
                        <span className="font-semibold w-24 text-right text-gray-900 dark:text-gray-100">
                          {fmtCHF(s2.coutParCabine)}
                        </span>
                        <span className={`text-xs font-semibold w-16 text-right ${
                          ecart > 10 ? "text-red-600" : ecart < -10 ? "text-green-600" : "text-gray-400"}`}>
                          {ecart > 0 ? "+" : ""}{Math.round(ecart)}%
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-gray-400 pt-1">
                    Écart au coût moyen de {fmtCHF(rentabilite.moyenneCoutCabine)} par cabine.
                    Au-delà de +10 %, la série coûte plus cher que la moyenne à poser.
                  </p>
                </div>

                {/* Chantiers, du moins rentable au plus rentable */}
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Chantiers {rentabilite.lignes[0]?.margePct !== null ? "du moins au plus rentable" : "du plus coûteux au moins coûteux"}
                </h3>
                <div className="space-y-1">
                  {rentabilite.lignes.slice(0, 25).map((l) => {
                    const deficitaire = l.marge !== null && l.marge < 0;
                    const sousEstime = !deficitaire && l.margePct !== null
                      && rentabilite.cible !== null && l.margePct < rentabilite.cible;
                    const cher = l.margePct === null
                      && rentabilite.moyenneCoutCabine > 0
                      && l.coutParCabine > rentabilite.moyenneCoutCabine * 1.1;
                    return (
                      <Link key={l.id} href={`/projet/${l.id}?mode=dashboard`}
                        className={`flex items-center gap-3 text-sm py-2 px-2 rounded-lg border ${
                          deficitaire ? "border-red-200 bg-red-50/60 dark:bg-red-900/10"
                          : sousEstime || cher ? "border-amber-200 bg-amber-50/60 dark:bg-amber-900/10"
                          : "border-transparent hover:bg-gray-50 dark:hover:bg-slate-700/30"}`}>
                        <span className="font-mono text-xs text-gray-500 w-24 shrink-0">{l.ofrTM}</span>
                        <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{l.projet}</span>
                        <span className="text-xs text-gray-400 w-24 text-right shrink-0">
                          {l.cabines} cab. · {Math.round(l.minutes / 6) / 10} h
                        </span>
                        <span className="text-xs text-gray-500 w-24 text-right shrink-0">{fmtCHF(l.cout)}</span>
                        {l.margePct !== null ? (
                          <span className={`text-xs font-bold w-20 text-right shrink-0 ${
                            deficitaire ? "text-red-600" : sousEstime ? "text-amber-600" : "text-green-600"}`}>
                            {Math.round(l.margePct)}%
                          </span>
                        ) : (
                          <span className={`text-xs font-bold w-20 text-right shrink-0 ${cher ? "text-amber-600" : "text-gray-400"}`}>
                            {fmtCHF(l.coutParCabine)}/cab.
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                  {rentabilite.lignes[0]?.margePct !== null
                    ? "Marge ESTIMÉE : l'app ne connaît pas le prix de vente réel de chaque chantier, elle applique le prix moyen saisi ci-dessus. Rouge = déficitaire, orange = sous la marge cible."
                    : "Sans prix de vente moyen, seuls les coûts sont comparés entre eux. Orange = plus de 10 % au-dessus du coût moyen par cabine."}
                  {" "}Les heures proviennent du pointage des monteurs ; un chantier sans heures pointées n&apos;apparaît pas.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 pb-10">
            <button
              onClick={enregistrer}
              disabled={enreg}
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#1e3a5f] text-white hover:bg-[#2a4f7f] transition-all active:scale-95 disabled:opacity-60"
            >
              {enreg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {enreg ? "Enregistrement…" : "Enregistrer"}
            </button>
            {enregOk && (
              <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enregistré
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
