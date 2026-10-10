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
import { coutHoraireDe, coutHoraire, HEURES_MOIS_DEFAUT } from "@/lib/cout-horaire";
import { minutesDuChantier } from "@/lib/heures-chantier";
import { numerosTMClient } from "@/lib/montants-ofr";
import {
  ArrowLeft, Loader2, Save, CheckCircle2, TrendingUp, Wallet, Timer,
  PiggyBank, Users, Percent, Info, ReceiptText, Sparkles, X,
} from "lucide-react";

/* ── Champs à saisir ──────────────────────────────────────────────────────
   Regroupés par thème, chacun avec l'unité et ce à quoi il sert. */
type Champ = { id: string; label: string; unite: string; aide: string };
type Groupe = { titre: string; sous: string; champs: Champ[]; monteurs?: boolean };

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
    /* On connaît le salaire qu'on verse, pas son coût horaire. La saisie se
       fait donc au mois ; la conversion en coût de l'heure est faite par
       l'app, à partir des deux réglages ci-dessous — explicitement, plutôt
       qu'avec un coefficient deviné en silence. */
    titre: "Salaire mensuel par monteur (brut)",
    sous: "l'app en déduit le coût horaire · laissez vide pour utiliser le coût horaire par défaut",
    champs: [
      { id: "heuresMois", label: "Heures travaillées par mois", unite: "h / mois", aide: "Base de conversion du salaire en coût horaire. 182 h si laissé vide (42 h par semaine)." },
      { id: "chargesPatronales", label: "Charges patronales", unite: "% du brut", aide: "AVS, LPP, LAA, allocations. S'ajoutent au salaire brut pour obtenir le coût réel." },
    ],
    /* Les monteurs ne sont pas une constante : il en part, il en arrive. La
       liste se tient donc dans les réglages, et retirer quelqu'un n'efface
       PAS son salaire — les chantiers qu'il a faits gardent leur coût juste. */
    monteurs: true,
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
  /**
   * Ce que l'application déduit seule, par exercice.
   *
   * Trois valeurs sur la douzaine que cette page demande. Les autres —
   * salaires, trésorerie, stock, dettes fournisseurs — n'existent nulle part
   * dans les données : les estimer donnerait des indicateurs faux, qui se
   * propagent en silence là où un champ vide se voit.
   */
  const [deduits, setDeduits] = useState<{
    clientsActifs: number; nouveauxClients: number;
    aFacturer: number; aFacturerChantiers: number;
    detailClients: { nom: string; projets: number; total: number; nouveau: boolean }[];
    detailNouveaux: { nom: string; date: string; ofrTM: string; projet: string; id: string }[];
    detailAFacturer: { id: string; ofrTM: string; projet: string; montant: number; statut: string; date: string }[];
  } | null>(null);
  /** Détail ouvert : un compteur qu'on ne peut pas ouvrir ne se vérifie pas. */
  const [detail, setDetail] = useState<{ titre: string; sous: string; corps: React.ReactNode } | null>(null);
  /* Ce que bexio sait déjà. Trois de ces champs étaient demandés à la main
     alors que la comptabilité les connaît au franc près — et une créance
     recopiée le mois dernier est fausse ce mois-ci. */
  /** Saisie du nouveau collaborateur à ajouter à la liste des salaires. */
  const [nouveauMonteur, setNouveauMonteur] = useState("");
  const [bexio, setBexio] = useState<{
    creances: number; dettes: number; ca12: number; achats12: number;
    marge: number; margePct: number | null; clients: number; retard: number;
    coutDirect: number; personnel: number; autres: number; bilan: number; resultat: number;
    sug: {
      mois: number; salaires: number; chargesFixes: number; autresCharges: number;
      creances: number; dettes: number; nbClients: number; nouveauxClients: number;
    } | null;
  } | null>(null);
  const [caParAnnee, setCaParAnnee] = useState<Record<string, number>>({});
  const [annee, setAnnee] = useState<string>(String(new Date().getFullYear()));

  /* Rechargé à chaque changement d'exercice : « clients actifs » n'a de sens
     que rapporté à une année. */
  useEffect(() => {
    if (!annee) return;
    let vivant = true;
    fetch(`/api/stats/ca?de=${annee}-01-01&a=${annee}-12-31`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivant && d?.indicateurs) setDeduits(d.indicateurs); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [annee]);

  /* Douze mois glissants : c'est la fenêtre qui a du sens pour des charges
     et une marge, pas l'année civile tronquée au mois en cours. */
  useEffect(() => {
    const fin = new Date();
    const debut = new Date(); debut.setMonth(debut.getMonth() - 11); debut.setDate(1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let vivant = true;
    fetch(`/api/bexio/ca?de=${iso(debut)}&a=${iso(fin)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivant || !j || j.error) return;
        setBexio({
          creances: j.impayes?.total || 0,
          dettes: j.depenses?.du || 0,
          ca12: j.total || 0,
          achats12: j.depenses?.total || 0,
          marge: j.depenses?.marge || 0,
          margePct: j.depenses?.margePct ?? null,
          clients: j.clientsActifs || 0,
          retard: j.depenses?.enRetard?.total || 0,
          coutDirect: j.depenses?.coutDirect || 0,
          personnel: j.depenses?.personnel || 0,
          autres: j.depenses?.autresCharges || 0,
          bilan: j.depenses?.mouvementsBilan || 0,
          resultat: j.depenses?.resultat || 0,
          sug: j.suggestions || null,
        });
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, []);

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
  /* Ce que chaque chantier a RÉELLEMENT rapporté, lu dans bexio. Jusqu'ici
     la recette était un prix de vente moyen appliqué à toutes les cabines :
     une estimation qui ne correspondait à aucun chantier en particulier. */
  const [recettes, setRecettes] = useState<Record<string, { ht: number; estime: boolean }>>({});
  useEffect(() => {
    fetch("/api/bexio/montants", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.recettes) setRecettes(j.recettes); })
      .catch(() => {});
  }, []);
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
        .map((nom) => coutHoraireDe(nom, vals) ?? tauxDefaut)
        .filter((v): v is number => v !== null);
      if (taux.length === 0) return tauxDefaut;
      return taux.reduce((s2, v) => s2 + v, 0) / taux.length;
    };
    const taux = tauxDefaut ?? (COLLABORATEURS_LIST.some((nom) => coutHoraireDe(nom, vals) !== null) ? 0 : null);
    const dep = n("coutDeplacement") ?? 0;
    const conso = n("consommables") ?? 0;
    const achat = n("achatCabine") ?? 0;
    const acc = n("accessoires") ?? 0;
    const vente = n("prixVente");
    const cible = n("margeCible");
    if (taux === null) return null; // sans coût horaire, rien n'est calculable

    /* Lecture partagée des heures : elle sait lire les trois formats et
       additionne cabines et passages. L'ancienne cherchait la première suite
       « chiffres:chiffres » et trouvait « 1:20 » dans « Cab1:2026 ». */
    const minutes = (p: any) => minutesDuChantier(p.heureArrivee, p.heureDepart);

    const lignes = chantiers
      .filter((p) => String(p.dateMontage || "").startsWith(annee))
      .map((p) => {
        const cab = Number(p.nbCabines) || 0;
        const min = minutes(p);
        const mo = (min / 60) * (tauxDe(p) ?? 0);
        const achats = cab * (achat + acc + conso);
        const cout = mo + achats + dep;
        /* La recette vient de bexio quand elle existe : c'est le montant
           facturé pour CE chantier, hors taxes, à comparer à des coûts qui
           le sont aussi. Le prix de vente moyen ne sert plus que de repli. */
        const nrTM = numerosTMClient(p.ofrTM).find((n) => recettes[n]);
        const reelle = nrTM ? recettes[nrTM] : null;
        const recette = reelle ? reelle.ht : (vente !== null ? cab * vente : null);
        const source: "facture" | "offre" | "moyenne" | null =
          reelle ? (reelle.estime ? "offre" : "facture") : (vente !== null ? "moyenne" : null);
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
          marge, margePct, recette, source,
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

  /** Monteurs affichés : la liste enregistrée, ou celle de l'app au départ. */
  const listeMonteurs = useMemo(() => {
    const brut = String(vals.monteursSalaires ?? "").trim();
    return brut ? brut.split(",").map((x) => x.trim()).filter(Boolean) : [...COLLABORATEURS_LIST];
  }, [vals.monteursSalaires]);

  const retirerMonteur = (nom: string) => {
    /* On retire de la LISTE, pas des valeurs : le salaire enregistré sert
       encore à calculer le coût des chantiers déjà faits par cette personne. */
    setVals((v) => ({ ...v, monteursSalaires: listeMonteurs.filter((x) => x !== nom).join(",") }));
  };
  const ajouterMonteur = () => {
    const nom = nouveauMonteur.trim();
    if (!nom || listeMonteurs.includes(nom)) { setNouveauMonteur(""); return; }
    setVals((v) => ({ ...v, monteursSalaires: [...listeMonteurs, nom].join(",") }));
    setNouveauMonteur("");
  };

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

    /* Une année en cours n'a pas douze mois de chiffre d'affaires, mais on
       lui opposait douze mois de charges : en octobre, l'EBITDA paraissait
       négatif alors que l'exercice était bénéficiaire. On compare donc sur
       la même durée, et la carte dit laquelle. */
    const moisEcoules = annee === String(new Date().getFullYear())
      ? Math.max(1, new Date().getMonth() + 1)
      : 12;
    const caCompare = ca;
    const chargesCompare = chargesMois !== null ? chargesMois * moisEcoules : null;
    const ebitda = chargesCompare !== null ? caCompare - chargesCompare : null;

    const bfrIds = ["creances", "stock", "dettes"];
    const bfr = bfrIds.every((id) => n(id) !== null)
      ? (n("creances") as number) + (n("stock") as number) - (n("dettes") as number)
      : null;

    /* Runway — deux lectures, parce qu'elles ne disent pas la même chose.
     *
     * La trésorerie seule répond à « combien de temps si plus rien ne
     * rentre » : c'est le pire des cas, et il est trompeur pour une
     * entreprise qui a déjà facturé son travail. Les créances ne sont pas du
     * chiffre d'affaires espéré, c'est du travail fait et facturé qui va
     * rentrer — moins ce qu'on doit aux fournisseurs.
     *
     * On affiche donc ce qui est réellement mobilisable, et la trésorerie
     * seule juste en dessous : une créance à soixante jours ne paie pas le
     * salaire de la semaine prochaine. */
    const tresorerie = n("tresorerie");
    const runwayCaisse = tresorerie !== null && chargesMois !== null && chargesMois > 0
      ? tresorerie / chargesMois
      : null;
    const mobilisable = tresorerie !== null
      ? tresorerie + (n("creances") ?? 0) - (n("dettes") ?? 0)
      : null;
    const runway = mobilisable !== null && chargesMois !== null && chargesMois > 0
      ? mobilisable / chargesMois
      : null;
    const avecCreances = n("creances") !== null;

    /* La saisie manuelle prime : on ne remplace jamais un chiffre écrit à la
       main, on comble seulement le vide. */
    const nbClients = n("nbClients") ?? deduits?.clientsActifs ?? null;
    const nouveaux = n("nouveauxClients") ?? deduits?.nouveauxClients ?? null;

    const vmc = nbClients !== null && nbClients > 0 ? ca / nbClients : null;

    const cac = n("depensesAcquisition") !== null && nouveaux !== null && nouveaux > 0
      ? (n("depensesAcquisition") as number) / nouveaux
      : null;

    const roi = n("investissement") !== null && (n("investissement") as number) > 0 && n("gainInvestissement") !== null
      ? (((n("gainInvestissement") as number) - (n("investissement") as number)) / (n("investissement") as number)) * 100
      : null;

    return [
      {
        id: "ebitda", label: "EBITDA", Icon: TrendingUp, color: "#0f766e",
        valeur: ebitda === null ? null : fmtCHF(ebitda),
        detail: moisEcoules < 12
          ? `Chiffre d'affaires ${annee} moins les charges des ${moisEcoules} mois écoulés — même durée des deux côtés.`
          : `Chiffre d'affaires ${annee} moins les charges d'exploitation de l'année.`,
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
        detail: avecCreances
          ? `Ce que la trésorerie et les créances clients couvrent, dettes fournisseurs déduites, à charges constantes. Trésorerie seule : ${runwayCaisse === null ? "—" : `${Math.round(runwayCaisse * 10) / 10} mois`} — une créance à soixante jours ne paie pas le salaire de la semaine prochaine.`
          : "Nombre de mois que la trésorerie couvre, à charges constantes et sans nouvelle rentrée.",
        manque: manque("tresorerie", "salaires", "chargesFixes", "autresCharges"),
      },
      {
        id: "vmc", label: "Valeur moyenne client", Icon: Users, color: "#6d28d9",
        valeur: vmc === null ? null : fmtCHF(vmc),
        detail: `Chiffre d'affaires ${annee} divisé par le nombre de clients actifs.`,
        manque: nbClients !== null ? [] : manque("nbClients"),
        deduit: n("nbClients") === null && nbClients !== null
          ? `${nbClients} clients distincts, calculés sur les chantiers terminés` : null,
      },
      {
        id: "cac", label: "Coût d'acquisition client", Icon: Wallet, color: "#be123c",
        valeur: cac === null ? null : fmtCHF(cac),
        detail: "Dépenses d'acquisition divisées par le nombre de nouveaux clients.",
        manque: manque("depensesAcquisition").concat(nouveaux === null ? manque("nouveauxClients") : []),
        deduit: n("nouveauxClients") === null && nouveaux !== null
          ? `${nouveaux} premiers chantiers cette année` : null,
      },
      {
        id: "a-facturer", label: "À facturer", Icon: ReceiptText, color: "#b45309",
        valeur: deduits && deduits.aFacturer > 0 ? fmtCHF(deduits.aFacturer) : null,
        detail: "Chantiers terminés dont la facture n'est pas partie. De l'argent gagné qu'on n'a pas encore réclamé.",
        manque: [],
        deduit: deduits && deduits.aFacturer > 0
          ? `${deduits.aFacturerChantiers} chantier${deduits.aFacturerChantiers > 1 ? "s" : ""} terminé${deduits.aFacturerChantiers > 1 ? "s" : ""}`
          : null,
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

  /**
   * Ce que recouvre un compteur.
   *
   * Trois listes, trois lectures différentes : qui sont mes clients, lesquels
   * sont nouveaux, et quels chantiers attendent leur facture. Seule la
   * dernière mène à des fiches projet — les deux autres décrivent des
   * clients, qui n'ont pas de page à eux.
   */
  const ouvrirDetail = (id: string) => {
    if (!deduits) return;
    const lignes = (t: React.ReactNode[]) => <div className="divide-y divide-gray-100 dark:divide-gray-700/50">{t}</div>;

    if (id === "vmc") {
      setDetail({
        titre: `Clients actifs ${annee}`,
        sous: `${deduits.clientsActifs} clients distincts, du plus gros au plus petit`,
        corps: lignes(deduits.detailClients.map((c) => (
          <div key={c.nom} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 min-w-0">
              <span className="font-medium text-gray-800 dark:text-gray-100">{c.nom}</span>
              {c.nouveau && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  nouveau
                </span>
              )}
            </span>
            <span className="text-xs text-gray-400 tabular-nums shrink-0">{c.projets} proj.</span>
            <span className="font-semibold tabular-nums shrink-0">{fmtCHF(c.total)}</span>
          </div>
        ))),
      });
      return;
    }

    if (id === "cac") {
      setDetail({
        titre: `Nouveaux clients ${annee}`,
        sous: `${deduits.nouveauxClients} clients dont c'est le premier chantier, tous exercices confondus`,
        corps: lignes(deduits.detailNouveaux.map((c) => (
          <Link key={c.id} href={`/projet/${c.id}?mode=dashboard`}
            className="flex items-center gap-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 -mx-2">
            <span className="text-xs font-mono text-gray-400 shrink-0 w-24">{c.ofrTM || "—"}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-gray-800 dark:text-gray-100">{c.nom}</span>
              <span className="block text-xs text-gray-400 truncate">{c.projet}</span>
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {new Date(c.date).toLocaleDateString("fr-CH")}
            </span>
          </Link>
        ))),
      });
      return;
    }

    if (id === "a-facturer") {
      setDetail({
        titre: "Chantiers à facturer",
        sous: `${deduits.aFacturerChantiers} chantiers terminés, ${fmtCHF(deduits.aFacturer)} en attente`,
        corps: lignes(deduits.detailAFacturer.map((x) => (
          <Link key={x.id} href={`/projet/${x.id}?mode=dashboard`}
            className="flex items-center gap-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 -mx-2">
            <span className="text-xs font-mono text-gray-400 shrink-0 w-24">{x.ofrTM || "—"}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-gray-800 dark:text-gray-100 truncate">{x.projet}</span>
              <span className="block text-xs text-gray-400">
                Monté le {new Date(x.date).toLocaleDateString("fr-CH")} · {x.statut}
              </span>
            </span>
            <span className="font-semibold tabular-nums shrink-0">{fmtCHF(x.montant)}</span>
          </Link>
        ))),
      });
    }
  };

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
                {/* D'où vient le chiffre : une valeur déduite doit se
                    distinguer d'une valeur saisie, sinon on ne sait plus ce
                    qu'on regarde. */}
                {"deduit" in k && k.deduit && (
                  <button type="button"
                    onClick={() => ouvrirDetail(k.id)}
                    className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-2 flex items-start gap-1.5 text-left hover:underline underline-offset-2">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>Calculé&nbsp;: {k.deduit}</span>
                  </button>
                )}
                {k.manque.length > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    À renseigner&nbsp;: {k.manque.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Ce que bexio répond tout seul. Affiché à part des champs à
              saisir : la provenance d'un chiffre fait partie du chiffre. */}
          {bexio && (
            <div className="glass-card rounded-2xl p-5 mb-4 border border-emerald-200 dark:border-emerald-900/40">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Lu dans bexio</h2>
                  <p className="text-xs text-gray-400 mb-4">
                    douze derniers mois · TTC · ces chiffres n&apos;ont pas à être saisis, la comptabilité les connaît.
                    Les salaires NETS ne passent pas par une facture fournisseur : le champ « Salaires » reçoit
                    les charges sociales, à compléter à la main.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVals((v) => ({
                    ...v,
                    creances: String(Math.round(bexio.sug?.creances ?? bexio.creances)),
                    dettes: String(Math.round(bexio.sug?.dettes ?? bexio.dettes)),
                    nbClients: String(bexio.sug?.nbClients ?? bexio.clients),
                    nouveauxClients: String(bexio.sug?.nouveauxClients ?? ""),
                    /* Mensualisés sur la durée réelle de la fenêtre. Les
                       salaires NETS ne passent pas par une facture : le champ
                       reçoit les charges sociales, à compléter à la main. */
                    salaires: bexio.sug ? String(Math.round(bexio.sug.salaires)) : (v.salaires || ""),
                    chargesFixes: bexio.sug ? String(Math.round(bexio.sug.chargesFixes)) : (v.chargesFixes || ""),
                    autresCharges: bexio.sug ? String(Math.round(bexio.sug.autresCharges)) : (v.autresCharges || ""),
                  }))}
                  className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  Reprendre dans les champs
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { l: "Créances clients", v: bexio.creances, s: "factures émises, pas encore encaissées" },
                  { l: "Dettes fournisseurs", v: bexio.dettes, s: bexio.retard > 0 ? `dont ${Math.round(bexio.retard).toLocaleString("fr-CH")} en retard` : "aucune en retard" },
                  { l: "Chiffre d'affaires", v: bexio.ca12, s: "facturé sur douze mois" },
                  { l: "Coût direct (classe 4)", v: bexio.coutDirect, s: "marchandise et sous-traitance" },
                  { l: "Marge brute", v: bexio.marge, s: bexio.margePct !== null ? `${bexio.margePct} % du facturé` : "—" },
                  { l: "Charges de personnel (5)", v: bexio.personnel, s: "charges sociales · salaires nets non inclus" },
                  { l: "Autres charges (classe 6)", v: bexio.autres, s: "véhicules, assurances, locaux, outillage" },
                  { l: "Résultat d'exploitation", v: bexio.resultat, s: "hors salaires nets — à lire avec prudence" },
                  { l: "Mouvements de bilan", v: bexio.bilan, s: "TVA et comptes courants sociaux — pas des charges" },
                ].map((k) => (
                  <div key={k.l} className="rounded-xl bg-white/60 dark:bg-white/5 p-3">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{k.l}</p>
                    <p className="text-lg font-bold text-[#1e3a5f] dark:text-blue-200 tabular-nums">
                      CHF {Math.round(k.v).toLocaleString("fr-CH")}
                    </p>
                    <p className="text-[10px] text-gray-400">{k.s}</p>
                  </div>
                ))}
                <div className="rounded-xl bg-white/60 dark:bg-white/5 p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Clients facturés</p>
                  <p className="text-lg font-bold text-[#1e3a5f] dark:text-blue-200 tabular-nums">{bexio.clients}</p>
                  <p className="text-[10px] text-gray-400">
                    sur douze mois{bexio.sug ? ` · ${bexio.sug.nouveauxClients} nouveau${bexio.sug.nouveauxClients > 1 ? "x" : ""}` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Champs à remplir */}
          {GROUPES.map((g) => ({
            ...g,
            champs: g.monteurs
              ? [...g.champs, ...listeMonteurs.map((nom) => ({
                  id: `taux_${nom}`, label: nom, unite: "CHF / mois", aide: "", monteur: nom,
                }))]
              : g.champs,
          })).map((g) => (
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
                    {/* Ce que le salaire saisi donne à l'heure : le chiffre
                        qui sert vraiment aux calculs doit être visible, pas
                        caché dans une formule. */}
                    {(c as { monteur?: string }).monteur && (
                      <button type="button"
                        title={`Retirer ${(c as { monteur?: string }).monteur} de la liste · son salaire reste enregistré pour les chantiers déjà faits`}
                        onClick={() => retirerMonteur((c as { monteur?: string }).monteur as string)}
                        className="h-8 w-8 shrink-0 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {c.id.startsWith("taux_") && (() => {
                      const h = coutHoraire(Number(vals[c.id]), {
                        heuresMois: Number(vals.heuresMois) || null,
                        chargesPatronales: Number(vals.chargesPatronales) || null,
                      });
                      if (h === null) return null;
                      return (
                        <span className="w-full sm:w-auto text-[11px] text-emerald-700 dark:text-emerald-300 tabular-nums">
                          ≈ {h.toFixed(2)} CHF / h
                          <span className="text-gray-400">
                            {" "}sur {Number(vals.heuresMois) || HEURES_MOIS_DEFAUT} h
                            {Number(vals.chargesPatronales) > 0 ? `, charges +${Number(vals.chargesPatronales)} %` : ", hors charges"}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                ))}
                {g.monteurs && (
                  <div className="flex flex-wrap items-center gap-3 pt-3 mt-1 border-t border-gray-100 dark:border-gray-700/50">
                    <label className="w-full sm:w-64 shrink-0">
                      <span className="block text-sm text-gray-700 dark:text-gray-200">Ajouter un collaborateur&nbsp;:</span>
                      <span className="block text-[11px] text-gray-400">
                        le prénom doit s&apos;écrire comme dans les chantiers, sinon ses heures ne lui seront pas rattachées
                      </span>
                    </label>
                    <input
                      value={nouveauMonteur}
                      onChange={(e) => setNouveauMonteur(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouterMonteur(); } }}
                      placeholder="Prénom"
                      className="flex-1 min-w-[120px] h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-3 text-sm"
                    />
                    <button type="button" onClick={ajouterMonteur} disabled={!nouveauMonteur.trim()}
                      className="h-10 px-4 rounded-lg bg-[#1e3a5f] hover:bg-[#2a4a73] disabled:opacity-40 text-white text-sm font-semibold">
                      Ajouter
                    </button>
                  </div>
                )}
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
                        <span className="text-xs text-gray-500 w-24 text-right shrink-0" title="Coût : main-d'œuvre + achats + déplacement">
                          {fmtCHF(l.cout)}
                        </span>
                        {/* Ce que le chantier a rapporté, et d'où le chiffre
                            vient : une recette facturée et une moyenne ne se
                            lisent pas de la même façon. */}
                        <span className="text-xs w-28 text-right shrink-0 text-gray-600 dark:text-gray-300"
                          title={l.source === "facture" ? "Montant réellement facturé (HT)"
                            : l.source === "offre" ? "Pas encore facturé : montant de l'offre (HT)"
                            : l.source === "moyenne" ? "Prix de vente moyen saisi dans les réglages" : ""}>
                          {l.recette !== null ? fmtCHF(l.recette) : "—"}
                          {l.source && (
                            <em className={`not-italic ml-1 text-[10px] ${l.source === "facture" ? "text-green-600" : "text-gray-400"}`}>
                              {l.source === "facture" ? "fact." : l.source === "offre" ? "offre" : "moy."}
                            </em>
                          )}
                        </span>
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
                    ? "La recette vient de bexio quand le chantier a été facturé (marqué « fact. », hors taxes) ; sinon du montant de l'offre, et à défaut du prix de vente moyen saisi ci-dessus. Rouge = déficitaire, orange = sous la marge cible."
                    : "Sans recette connue, seuls les coûts sont comparés entre eux. Orange = plus de 10 % au-dessus du coût moyen par cabine."}
                  {" "}Les heures proviennent du pointage des monteurs ; un chantier sans heures pointées n&apos;apparaît pas.
                </p>
              </>
            )}
          </div>

          {detail && (
            <>
              <div className="fixed inset-0 z-[70] bg-black/30" onClick={() => setDetail(null)} aria-hidden="true" />
              <div className="fixed top-0 right-0 bottom-0 z-[71] w-[min(560px,94vw)] bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col"
                role="dialog" aria-label={detail.titre}>
                <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{detail.titre}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{detail.sous}</p>
                  </div>
                  <button type="button" onClick={() => setDetail(null)} aria-label="Fermer"
                    className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">{detail.corps}</div>
              </div>
            </>
          )}

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
