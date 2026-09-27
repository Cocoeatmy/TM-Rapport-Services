"use client";

/**
 * Vue « Chantiers » — PPE et immeubles locatifs.
 *
 * Remplace le fichier Excel tenu à la main : un gros chantier est vendu soit en
 * une offre de vingt cabines, soit en vingt offres d'une cabine, et dans les
 * deux cas on veut la même chose — où en est chaque lot, du relevé de mesures
 * à la pose. Le regroupement vit dans `@/lib/chantiers` ; ici on n'affiche.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2, Search, ChevronRight, ArrowLeft, Loader2, Download, Ruler,
  ShoppingCart, Truck, Wrench, FileText, X,
} from "lucide-react";
import {
  construireChantiers, pct,
  type Chantier, type Lot, type ProjetChantier,
} from "@/lib/chantiers";

const SEUILS = [5, 10, 15, 20];

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

  const lots = useMemo(() => {
    const tri = [...c.lots].sort(comparerLots);
    const q = norm(filtre.trim());
    if (!q) return tri;
    const mots = q.split(/\s+/);
    return tri.filter((l) => {
      const foin = norm(`${l.nom} ${l.batiment} ${l.etage} ${l.ofrTM} ${l.marque} ${l.serie} ${l.grossiste} ${l.statut} ${l.infos}`);
      return mots.every((m) => foin.includes(m));
    });
  }, [c.lots, filtre]);

  /* Export : le tableau tel qu'il est affiché, ouvrable dans Excel. Le
     point-virgule est le séparateur attendu par Excel en configuration
     suisse/française, et le BOM évite les accents cassés. */
  const exporter = () => {
    const cols = [
      "Bâtiment", "Étage", "Lot", "Sanitaire", "Grossiste", "N° OFR Grossiste",
      "Marque", "Série", "Emplacement", "Mesuré", "Date mesures", "OFR TM",
      "Date offre", "Commande", "Date commande", "Livraison", "Posé",
      "Date pose", "Statut", "Infos",
    ];
    const lignes = lots.map((l) => [
      l.batiment, l.etage, l.nom, l.sanitaire, l.grossiste, l.ofrGrossiste,
      l.marque, l.serie, l.emplacement, l.mesure ? "OUI" : "NON", jour(l.dateMesures),
      l.ofrTM, jour(l.dateOffre), l.cmd, jour(l.dateCMD), jour(l.livraison),
      l.pose ? "OUI" : "NON", jour(l.datePose), l.statut, l.infos,
    ]);
    const echap = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols, ...lignes].map((r) => r.map(echap).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.nom.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "chantier"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sgch">
      <div className="sgch-detail-head">
        <button type="button" className="sgch-retour" onClick={onRetour}>
          <ArrowLeft className="w-4 h-4" /> Chantiers
        </button>
        <button type="button" className="sgch-export" onClick={exporter}>
          <Download className="w-3.5 h-3.5" /> Exporter
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

      <div className="sgch-jauges">
        <Jauge Icon={Ruler} label="Mesurés" n={c.nbMesurees} total={c.nbLots} />
        <Jauge Icon={ShoppingCart} label="Commandés" n={c.nbCommandees} total={c.nbLots} />
        <Jauge Icon={Truck} label="Livrés" n={c.nbLivrees} total={c.nbLots} />
        <Jauge Icon={Wrench} label="Posés" n={c.nbPosees} total={c.nbLots} />
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
        <span className="sgch-compte">{lots.length} / {c.nbLots}</span>
      </div>

      <div className="sgch-table-wrap">
        <table className="sgch-table">
          <thead>
            <tr>
              <th>Bât.</th><th>Étage</th><th>Lot</th>
              <th>Marque / série</th><th>Grossiste</th>
              <th className="sgch-c">Mesure</th><th>OFR TM</th>
              <th className="sgch-c">CMD</th><th className="sgch-c">Livraison</th>
              <th className="sgch-c">Posé</th><th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l, i) => (
              <tr key={`${l.projectId}-${l.cab ?? 0}-${i}`}>
                <td>{l.batiment || "—"}</td>
                <td>{l.etage || "—"}</td>
                <td className="sgch-lot">
                  <Link href={`/projet/${l.projectId}?mode=dashboard`}>
                    {l.nom}
                    {l.cab ? <em>cab. {l.cab}</em> : null}
                  </Link>
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
                <td className="sgch-mono">
                  {l.ofrTM || "—"}
                  {l.dateOffre ? <span className="sgch-d">{jour(l.dateOffre)}</span> : null}
                </td>
                <td className="sgch-c sgch-mono">
                  {l.cmd || (l.dateCMD ? "—" : "")}
                  {l.dateCMD ? <span className="sgch-d">{jour(l.dateCMD)}</span> : null}
                  {!l.cmd && !l.dateCMD ? <span className="sgch-vide">—</span> : null}
                </td>
                <td className="sgch-c sgch-mono">
                  {l.livraison ? jour(l.livraison) : <span className="sgch-vide">—</span>}
                </td>
                <td className="sgch-c">
                  <span className={`sgch-ou${l.pose ? " is-oui" : ""}`}>{l.pose ? "OUI" : "NON"}</span>
                  {l.datePose ? <span className="sgch-d">{jour(l.datePose)}</span> : null}
                </td>
                <td className="sgch-statut">{l.statut || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lots.length === 0 && <p className="sgch-vide-msg">Aucun lot ne correspond au filtre.</p>}
      </div>

      <div className="sgch-offres">
        <h3><FileText className="w-3.5 h-3.5" /> Offres du chantier</h3>
        {c.offres.map((o) => (
          <Link key={o.id} href={`/projet/${o.id}?mode=dashboard`} className="sgch-offre">
            <b>{o.ofrTM || "—"}</b>
            <span>{o.projet}</span>
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

  const visibles = useMemo(() => {
    const q = norm(recherche.trim());
    if (!q) return chantiers;
    const mots = q.split(/\s+/);
    return chantiers.filter((c) => {
      const foin = norm(`${c.nom} ${c.rue} ${c.localite} ${c.fournisseurs.join(" ")} ${c.grossistes.join(" ")} ${c.offres.map((o) => o.ofrTM).join(" ")}`);
      return mots.every((m) => foin.includes(m));
    });
  }, [chantiers, recherche]);

  const choisi = chantiers.find((c) => c.id === ouvert) || null;
  if (choisi) return <DetailChantier c={choisi} onRetour={() => setOuvert(null)} />;

  return (
    <div className="sgch">
      <div className="sgch-entete">
        <h2 className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Chantiers PPE &amp; locatif</h2>
        <p>
          Immeubles suivis lot par lot. Un chantier apparaît dès qu&apos;il atteint le
          nombre de cabines choisi, ou qu&apos;il rassemble trois offres à la même adresse.
          Les offres annulées et les interventions de service pures sont écartées.
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
          Aucun chantier à ce seuil. Abaissez-le, ou vérifiez que l&apos;adresse du chantier
          est renseignée sur les offres.
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
            <span className="sgch-row-pose">{pct(c.nbPosees, c.nbLots)}% posé</span>
            <ChevronRight className="w-4 h-4 sgch-chev" />
          </button>
        ))}
      </div>
    </div>
  );
}
