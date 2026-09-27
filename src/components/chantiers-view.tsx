"use client";

/**
 * Vue « Chantiers » — PPE et immeubles locatifs.
 *
 * Remplace le fichier Excel tenu à la main : un gros chantier est vendu soit en
 * une offre de vingt cabines, soit en vingt offres d'une cabine, et dans les
 * deux cas on veut la même chose — où en est chaque lot, du relevé de mesures
 * à la pose. Le regroupement vit dans `@/lib/chantiers` ; ici on n'affiche.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2, Search, ChevronRight, ArrowLeft, Loader2, Download, Ruler,
  ShoppingCart, Truck, Wrench, FileText, X,
} from "lucide-react";
import {
  construireChantiers, grouperParLot, pct,
  type Chantier, type Lot, type ProjetChantier,
} from "@/lib/chantiers";

const SEUILS = [10, 15, 20, 30];

type Etat = "tous" | "encours" | "termine";
const ETATS: [Etat, string][] = [["encours", "En cours"], ["termine", "Terminé"], ["tous", "Tous"]];

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** « Rue de Corcelles 12 à 2034 Neuchâtel » → « …12, 2034 Neuchâtel ».
 *  La normalisation NFC est indispensable : le « à » arrive parfois décomposé
 *  (un « a » suivi d'un accent combinant), que le caractère précomposé de
 *  l'expression régulière ne reconnaît pas. */
function sansA(titre: string): string {
  return (titre || "").normalize("NFC").replace(/\s+[àa]\s+(?=\d{4}\b)/g, ", ");
}

function jour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Tri naturel des lots : « App. 2 » avant « App. 10 ». */
function comparerLots(a: Lot, b: Lot): number {
  return `${a.batiment} ${a.etage} ${a.nom}`.localeCompare(
    `${b.batiment} ${b.etage} ${b.nom}`,
    "fr", { numeric: true, sensitivity: "base" },
  );
}

/* ── Barre d'avancement d'une étape ─────────────────────────────────────── */
function Jauge({ Icon, label, n, total }: {
  Icon: typeof Ruler; label: string; n: number; total: number;
}) {
  const p = pct(n, total);
  return (
    <div className="sgch-jauge">
      <span className="sgch-jauge-tete">
        <Icon className="w-3.5 h-3.5" />
        {label}
        <b>{n}/{total}</b>
      </span>
      <span className="sgch-jauge-piste">
        <span className="sgch-jauge-fill" style={{ width: `${p}%` }} />
      </span>
      <span className="sgch-jauge-pct">{p}%</span>
    </div>
  );
}

/* ── Détail d'un chantier ───────────────────────────────────────────────── */
function DetailChantier({ c, onRetour }: { c: Chantier; onRetour: () => void }) {
  const [filtre, setFiltre] = useState("");

  /* Une même adresse peut réunir plusieurs affaires : un sanitaire par
     immeuble, parfois deux succursales du même grossiste. Les mélanger dans un
     seul tableau mêlerait des lots qui ne se suivent pas ensemble — d'où un
     onglet par couple sanitaire / grossiste. */
  const onglets = useMemo(() => {
    const m = new Map<string, Lot[]>();
    c.lots.forEach((l) => {
      const cle = `${l.sanitaire}|${l.grossiste}`;
      const liste = m.get(cle);
      if (liste) liste.push(l); else m.set(cle, [l]);
    });
    const groupes = [...m.entries()].map(([cle, ls]) => ({
      cle, lots: ls, sanitaire: ls[0].sanitaire, grossiste: ls[0].grossiste,
    }));
    // Le grossiste n'est ajouté au libellé que s'il départage deux onglets
    // du même sanitaire : sinon il alourdirait sans rien distinguer.
    const parSanitaire = new Map<string, number>();
    groupes.forEach((g) => parSanitaire.set(g.sanitaire, (parSanitaire.get(g.sanitaire) || 0) + 1));
    return groupes
      .map((g) => ({
        ...g,
        label: [
          g.sanitaire || g.grossiste || "Sans sanitaire",
          g.sanitaire && (parSanitaire.get(g.sanitaire) || 0) > 1 ? g.grossiste : "",
        ].filter(Boolean).join(" · "),
      }))
      .sort((a, b) => b.lots.length - a.lots.length);
  }, [c.lots]);

  const [onglet, setOnglet] = useState("");
  const actif = onglets.find((o) => o.cle === onglet) || onglets[0];
  const lotsOnglet = actif ? actif.lots : c.lots;
  /* La fiche montre TOUT le chantier : un immeuble se lit d'un bloc, et un lot
     posé l'an dernier fait partie de son histoire — son statut « Terminé »
     suffit à le distinguer. Les pastilles restent là pour isoler ce qui reste
     à faire quand la liste est longue. */
  const [etat, setEtat] = useState<Etat>("tous");

  const comptes = useMemo(() => ({
    tous: lotsOnglet.length,
    encours: lotsOnglet.filter((l) => l.statut !== "Terminé").length,
    termine: lotsOnglet.filter((l) => l.statut === "Terminé").length,
  }), [lotsOnglet]);

  /* Avancement de l'onglet affiché, et non du chantier entier : les quatre
     jauges doivent décrire le tableau qu'on a sous les yeux. */
  const avance = useMemo(() => ({
    total: lotsOnglet.length,
    mesurees: lotsOnglet.filter((l) => l.mesure).length,
    commandees: lotsOnglet.filter((l) => !!l.cmd || !!l.dateCMD).length,
    livrees: lotsOnglet.filter((l) => !!l.livraison).length,
    posees: lotsOnglet.filter((l) => l.pose).length,
  }), [lotsOnglet]);

  const lots = useMemo(() => {
    const tri = [...lotsOnglet]
      .filter((l) => etat === "tous" ? true : etat === "termine" ? l.statut === "Terminé" : l.statut !== "Terminé")
      .sort(comparerLots);
    const q = norm(filtre.trim());
    if (!q) return tri;
    const mots = q.split(/\s+/);
    return tri.filter((l) => {
      const foin = norm(`${l.nom} ${l.piece} ${l.batiment} ${l.etage} ${l.ofrTM} ${l.marque} ${l.serie} ${l.grossiste} ${l.statut} ${l.infos}`);
      return mots.every((m) => foin.includes(m));
    });
  }, [lotsOnglet, filtre, etat]);

  /* Un lot vendu en plusieurs cabines (douche + baignoire, deux salles d'eau)
     tient sur UNE ligne : la colonne « Cab. » en donne le nombre, et la ligne
     se déplie pour voir chaque cabine. Sans cela, le même appartement
     apparaissait deux ou trois fois de suite. */
  const lignes = useMemo(() => grouperParLot(lots), [lots]);

  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const basculer = (cle: string) => setOuverts((p) => {
    const n = new Set(p);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  });

  /* Export : le tableau tel qu'il est affiché, ouvrable dans Excel. Le
     point-virgule est le séparateur attendu par Excel en configuration
     suisse/française, et le BOM évite les accents cassés. */
  const exporter = () => {
    const cols = [
      "Bâtiment", "Étage", "Lot", "Cabines", "Pièce", "Sanitaire", "Grossiste", "N° OFR Grossiste",
      "Marque", "Série", "Emplacement", "Mesuré", "Date mesures", "OFR TM",
      "Date offre", "Commande", "Date commande", "Livraison", "Posé",
      "Date pose", "Statut", "Infos",
    ];
    const corps = lignes.map((g) => {
      const l = g.chef;
      return [
        l.batiment, l.etage, l.nom, String(g.qte),
        [...new Set(g.lots.map((x) => x.piece).filter(Boolean))].join(" / "),
        l.sanitaire, l.grossiste, l.ofrGrossiste,
        l.marque, l.serie, l.emplacement, l.mesure ? "OUI" : "NON", jour(l.dateMesures),
        l.ofrTM, jour(l.dateOffre), l.cmd, jour(l.dateCMD), jour(l.livraison),
        g.poses === g.qte ? "OUI" : g.poses > 0 ? `${g.poses}/${g.qte}` : "NON",
        jour(l.datePose), l.statut, l.infos,
      ];
    });
    const echap = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols, ...corps].map((r) => r.map(echap).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    const titre = [c.nom, onglets.length > 1 ? actif?.label : ""].filter(Boolean).join(" - ");
    a.download = `${titre.replace(/[^\w\s-]/g, "").trim().slice(0, 70) || "chantier"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Rapport PDF : il couvre le chantier ENTIER — tous les onglets, tous les
     lots, terminés compris — là où l'export Excel reprend le tableau affiché.
     Un document qu'on transmet à un sanitaire ou à une régie doit se suffire
     à lui-même. La bibliothèque PDF est chargée à la demande : elle pèse
     lourd, et la page ne doit pas la porter tant qu'on ne clique pas. */
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const rapportPdf = async () => {
    setPdfEnCours(true);
    try {
      const { generateChantierPDF } = await import("@/components/chantier-pdf");
      const sections = onglets.map((o) => {
        const tri = [...o.lots].sort(comparerLots);
        return {
          label: o.label,
          lignes: grouperParLot(tri),
          total: o.lots.length,
          mesurees: o.lots.filter((l) => l.mesure).length,
          commandees: o.lots.filter((l) => !!l.cmd || !!l.dateCMD).length,
          livrees: o.lots.filter((l) => !!l.livraison).length,
          posees: o.lots.filter((l) => l.pose).length,
        };
      });
      const blob = await generateChantierPDF({
        nom: c.nom,
        adresse: c.rue,
        localite: c.localite,
        fournisseurs: c.fournisseurs,
        nbOffres: c.offres.length,
        nbLots: sections.reduce((n, x) => n + x.lignes.length, 0),
        nbCabines: c.nbLots,
        mesurees: c.nbMesurees,
        commandees: c.nbCommandees,
        livrees: c.nbLivrees,
        posees: c.nbPosees,
        sections,
        offres: c.offres.map((o) => ({
          ofrTM: o.ofrTM || "", projet: sansA(o.projet),
          cabines: o.nbCabines || 1, statut: o.etatCMD || "",
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.nom.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "chantier"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfEnCours(false);
    }
  };

  return (
    <div className="sgch">
      <div className="sgch-detail-head">
        <button type="button" className="sgch-retour" onClick={onRetour}>
          <ArrowLeft className="w-4 h-4" /> Chantiers
        </button>
        <button type="button" className="sgch-export sgch-pdf" onClick={rapportPdf} disabled={pdfEnCours}>
          {pdfEnCours
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileText className="w-3.5 h-3.5" />}
          Rapport PDF
        </button>
        <button type="button" className="sgch-export" onClick={exporter}>
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      <div className="sgch-entete">
        <h2>{c.nom}</h2>
        <p>
          {[c.rue, c.localite].filter(Boolean).join(" · ")}
          {" — "}
          {c.nbLots} lot{c.nbLots > 1 ? "s" : ""} sur {c.offres.length} offre{c.offres.length > 1 ? "s" : ""}
          {c.fournisseurs.length > 0 ? ` · ${c.fournisseurs.join(", ")}` : ""}
        </p>
      </div>

      {onglets.length > 1 && (
        <div className="sgch-onglets" role="tablist">
          {onglets.map((o) => (
            <button key={o.cle} type="button" role="tab"
              aria-selected={actif?.cle === o.cle}
              className={actif?.cle === o.cle ? "is-on" : ""}
              onClick={() => setOnglet(o.cle)}>
              {o.label} <b>{o.lots.length}</b>
            </button>
          ))}
        </div>
      )}

      <div className="sgch-jauges">
        <Jauge Icon={Ruler} label="Mesurés" n={avance.mesurees} total={avance.total} />
        <Jauge Icon={ShoppingCart} label="Commandés" n={avance.commandees} total={avance.total} />
        <Jauge Icon={Truck} label="Livrés" n={avance.livrees} total={avance.total} />
        <Jauge Icon={Wrench} label="Posés" n={avance.posees} total={avance.total} />
      </div>

      <div className="sgch-barre">
        <span className="sgch-recherche">
          <Search className="w-3.5 h-3.5" />
          <input value={filtre} onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer un lot, un bâtiment, une OFR…" />
          {filtre && (
            <button type="button" onClick={() => setFiltre("")} aria-label="Effacer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
        <span className="sgch-etats">
          {ETATS.map(([k, label]) => (
            <button key={k} type="button" className={etat === k ? "is-on" : ""} onClick={() => setEtat(k)}>
              {label} <b>{comptes[k]}</b>
            </button>
          ))}
        </span>
        <span className="sgch-compte">{lignes.length} lots · {lots.length} cab.</span>
      </div>

      <div className="sgch-table-wrap">
        <table className="sgch-table">
          <thead>
            <tr>
              <th>Bât.</th><th>Étage</th><th>Lot</th>
              <th>Marque / série</th><th>Grossiste</th>
              <th className="sgch-c">Mesure</th><th className="sgch-c">Cab.</th>
              <th>OFR TM</th>
              <th className="sgch-c">CMD</th><th className="sgch-c">Livraison</th>
              <th className="sgch-c">Posé</th><th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((g) => {
              const l = g.chef;
              const deplie = ouverts.has(g.cle);
              return (
                <Fragment key={g.cle}>
                  <tr className={g.qte > 1 ? "sgch-groupe" : undefined}>
                    <td>{l.batiment || "—"}</td>
                    <td>{l.etage || "—"}</td>
                    <td className="sgch-lot">
                      <span className="sgch-lot-tete">
                        {g.qte > 1 && (
                          <button type="button" className="sgch-plier" onClick={() => basculer(g.cle)}
                            aria-expanded={deplie}
                            aria-label={deplie ? "Replier les cabines" : "Voir les cabines"}>
                            <ChevronRight className={`w-3.5 h-3.5${deplie ? " sgch-plier-on" : ""}`} />
                          </button>
                        )}
                        <Link href={`/projet/${l.projectId}?mode=dashboard`}>{l.nom}</Link>
                      </span>
                      {g.qte === 1 && l.piece ? <span className="sgch-piece">{l.piece}</span> : null}
                      {l.infos ? <span className="sgch-infos" title={l.infos}>{l.infos}</span> : null}
                    </td>
                    <td>
                      {l.marque || "—"}
                      {l.serie ? <span className="sgch-serie">{l.serie}</span> : null}
                    </td>
                    <td>
                      {l.grossiste || "—"}
                      {l.ofrGrossiste ? <span className="sgch-serie">{l.ofrGrossiste}</span> : null}
                    </td>
                    <td className="sgch-c">
                      <span className={`sgch-ou${l.mesure ? " is-oui" : ""}`}>{l.mesure ? "OUI" : "NON"}</span>
                      {l.dateMesures ? <span className="sgch-d">{jour(l.dateMesures)}</span> : null}
                    </td>
                    <td className="sgch-c sgch-qte">{g.qte}</td>
                    <td className="sgch-mono">
                      {l.ofrTM || "—"}
                      {l.dateOffre ? <span className="sgch-d">{jour(l.dateOffre)}</span> : null}
                    </td>
                    <td className="sgch-c sgch-mono">
                      {l.cmd || null}
                      {l.dateCMD ? <span className="sgch-d">{jour(l.dateCMD)}</span> : null}
                      {!l.cmd && !l.dateCMD ? <span className="sgch-vide">—</span> : null}
                    </td>
                    <td className="sgch-c sgch-mono">
                      {l.livraison ? jour(l.livraison) : <span className="sgch-vide">—</span>}
                    </td>
                    <td className="sgch-c">
                      {/* Sur un lot à plusieurs cabines, « OUI » serait faux tant
                          qu'il en reste une à poser : on montre le compte. */}
                      <span className={`sgch-ou${g.poses === g.qte ? " is-oui" : g.poses > 0 ? " is-part" : ""}`}>
                        {g.poses === g.qte ? "OUI" : g.poses > 0 ? `${g.poses}/${g.qte}` : "NON"}
                      </span>
                      {l.datePose ? <span className="sgch-d">{jour(l.datePose)}</span> : null}
                    </td>
                    <td className="sgch-statut">
                      {l.statut === "Terminé"
                        ? <span className="sgch-fini">Terminé</span>
                        : (l.statut || "—")}
                    </td>
                  </tr>
                  {deplie && g.lots.map((x) => (
                    <tr key={`${g.cle}-${x.cab}`} className="sgch-sous">
                      <td colSpan={2} />
                      <td className="sgch-lot">
                        <span className="sgch-souscab">cab. {x.cab}</span>
                        {x.piece ? <span className="sgch-piece">{x.piece}</span> : null}
                      </td>
                      <td colSpan={4} />
                      <td className="sgch-mono">{x.ofrTM}</td>
                      <td colSpan={2} />
                      <td className="sgch-c">
                        <span className={`sgch-ou${x.pose ? " is-oui" : ""}`}>{x.pose ? "OUI" : "NON"}</span>
                      </td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {lignes.length === 0 && (
          <p className="sgch-vide-msg">
            Aucun lot {etat === "termine" ? "terminé" : etat === "encours" ? "en cours" : ""} ne correspond.
          </p>
        )}
      </div>

      <div className="sgch-offres">
        <h3><FileText className="w-3.5 h-3.5" /> Offres du chantier</h3>
        {c.offres.map((o) => (
          <Link key={o.id} href={`/projet/${o.id}?mode=dashboard`} className="sgch-offre">
            <b>{o.ofrTM || "—"}</b>
            <span>{sansA(o.projet)}</span>
            <em>{o.nbCabines || 1} cab.</em>
            <span className="sgch-offre-st">{o.etatCMD}</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Liste des chantiers ────────────────────────────────────────────────── */
export function ChantiersView() {
  const [projets, setProjets] = useState<ProjetChantier[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [seuil, setSeuil] = useState(10);
  const [etat, setEtat] = useState<Etat>("encours");
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch("/api/projects/all")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ProjetChantier[]) => { if (vivant) setProjets(Array.isArray(d) ? d : []); })
      .catch((e) => { if (vivant) setErreur(String(e.message || e)); });
    return () => { vivant = false; };
  }, []);

  const chantiers = useMemo(
    () => (projets ? construireChantiers(projets, { seuilCabines: seuil }) : []),
    [projets, seuil],
  );

  const comptes = useMemo(() => ({
    tous: chantiers.length,
    encours: chantiers.filter((c) => !c.termine).length,
    termine: chantiers.filter((c) => c.termine).length,
  }), [chantiers]);

  const visibles = useMemo(() => {
    const parEtat = chantiers.filter((c) =>
      etat === "tous" ? true : etat === "termine" ? c.termine : !c.termine);
    const q = norm(recherche.trim());
    if (!q) return parEtat;
    const mots = q.split(/\s+/);
    return parEtat.filter((c) => {
      const foin = norm(`${c.nom} ${c.rue} ${c.localite} ${c.fournisseurs.join(" ")} ${c.grossistes.join(" ")} ${c.offres.map((o) => o.ofrTM).join(" ")}`);
      return mots.every((m) => foin.includes(m));
    });
  }, [chantiers, recherche, etat]);

  const choisi = chantiers.find((c) => c.id === ouvert) || null;
  if (choisi) return <DetailChantier key={choisi.id} c={choisi} onRetour={() => setOuvert(null)} />;

  return (
    <div className="sgch">
      <div className="sgch-entete">
        <h2 className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Chantiers PPE &amp; locatif</h2>
        <p>
          Immeubles suivis lot par lot, regroupés par adresse : une offre de vingt
          cabines ou vingt offres d&apos;une cabine reviennent au même. Un chantier
          apparaît à partir du nombre de cabines choisi. Les offres annulées et les
          interventions de service pures sont écartées.
        </p>
      </div>

      <div className="sgch-barre">
        <span className="sgch-recherche">
          <Search className="w-3.5 h-3.5" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un chantier, une localité, une OFR…" />
          {recherche && (
            <button type="button" onClick={() => setRecherche("")} aria-label="Effacer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
        <span className="sgch-etats">
          {ETATS.map(([k, label]) => (
            <button key={k} type="button" className={etat === k ? "is-on" : ""} onClick={() => setEtat(k)}>
              {label} <b>{comptes[k]}</b>
            </button>
          ))}
        </span>
        <span className="sgch-seuil">
          <em>À partir de</em>
          {SEUILS.map((s) => (
            <button key={s} type="button" className={seuil === s ? "is-on" : ""} onClick={() => setSeuil(s)}>
              {s}
            </button>
          ))}
          <em>cabines</em>
        </span>
      </div>

      {!projets && !erreur && (
        <p className="sgch-vide-msg"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Chargement des projets…</p>
      )}
      {erreur && <p className="sgch-vide-msg">Chargement impossible — {erreur}</p>}

      {projets && visibles.length === 0 && (
        <p className="sgch-vide-msg">
          {chantiers.length > 0
            ? `Aucun chantier ${etat === "termine" ? "terminé" : "en cours"} ne correspond.`
            : "Aucun chantier à ce seuil. Abaissez-le, ou vérifiez que l'adresse du chantier est renseignée sur les offres."}
        </p>
      )}

      <div className="sgch-liste">
        {visibles.map((c) => (
          <button key={c.id} type="button" className="sgch-row" onClick={() => setOuvert(c.id)}>
            <span className="sgch-row-main">
              <b>{c.nom}</b>
              <em>
                {c.localite || c.rue}
                {c.fournisseurs.length > 0 ? ` · ${c.fournisseurs.join(", ")}` : ""}
              </em>
            </span>
            <span className="sgch-row-chiffres">
              <span><b>{c.nbLots}</b> lots</span>
              <span><b>{c.offres.length}</b> offres</span>
            </span>
            <span className="sgch-row-prog" title={`Mesurés ${c.nbMesurees} · Commandés ${c.nbCommandees} · Livrés ${c.nbLivrees} · Posés ${c.nbPosees}`}>
              <span className="sgch-seg is-mes" style={{ width: `${pct(c.nbMesurees, c.nbLots)}%` }} />
              <span className="sgch-seg is-cmd" style={{ width: `${pct(c.nbCommandees, c.nbLots)}%` }} />
              <span className="sgch-seg is-liv" style={{ width: `${pct(c.nbLivrees, c.nbLots)}%` }} />
              <span className="sgch-seg is-pos" style={{ width: `${pct(c.nbPosees, c.nbLots)}%` }} />
            </span>
            <span className="sgch-row-pose">
              {c.termine ? <em className="sgch-fini">terminé</em> : `${pct(c.nbPosees, c.nbLots)}% posé`}
            </span>
            <ChevronRight className="w-4 h-4 sgch-chev" />
          </button>
        ))}
      </div>
    </div>
  );
}
