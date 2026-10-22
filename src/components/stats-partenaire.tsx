"use client";

/**
 * Les statistiques d'un partenaire — grossiste, fournisseur ou sanitaire —
 * dans le thème Signal (22.10.2026).
 *
 * L'ancien onglet comptait (en cours, cabines, RDV, terminés) et répartissait
 * par statut. Il ne disait rien de la RELATION : ce qu'elle pèse, comment elle
 * évolue, combien de temps prend un chantier avec ce partenaire, ce qui y
 * casse le plus. Tout est calculé ici à partir des projets déjà chargés — pas
 * un appel de plus vers Notion.
 *
 * Les montants (« Montant OFR ») ne paraissent qu'avec le droit
 * `argent.voir`, et seulement une fois ce droit CONFIRMÉ : on ne montre pas
 * d'argent le temps que la réponse arrive.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDroits } from "@/lib/use-droits";
import { BexioPartenaire } from "@/components/bexio-partenaire";
import { mesuresFaites } from "@/lib/cabines-mesurees";
import { cabinesPosees as poseesSurLeChantier } from "@/lib/cabines-posees";
import { defautsParProjet, LIBELLES_SIGNALEMENT, type DefautsParProjet, type SignalementPourStats } from "@/lib/types-defaut";
import "./stats-partenaire.css";

type P = Record<string, any>;

export type SectionStats = "tuiles" | "activite" | "parcours" | "delais" | "qualite" | "signalements" | "series" | "lies" | "installateurs" | "equipe" | "prochains";
const TOUTES: SectionStats[] = ["tuiles", "activite", "parcours", "delais", "qualite", "signalements", "series", "lies", "installateurs", "equipe", "prochains"];

export interface StatsPartenaireProps {
  /** Tous les projets du partenaire, toutes dates confondues (tendance). */
  tous: P[];
  /** Les projets de la période choisie. */
  periode: P[];
  famille: "grossistes" | "fournisseurs" | "sanitaires" | "clients";
  nom: string;
  libellePeriode: string;
  /** Sans gestionnaire, la liste s'ouvre dans une feuille du panneau. */
  onOuvrir?: (titre: string, projets: P[]) => void;
  /** Les blocs à montrer (tous par défaut) — la fiche CRM n'ajoute que ce
      que son propre panneau n'a pas. */
  sections?: SectionStats[];
  /** Titre « Grossiste · Dubat » en tête (oui par défaut). */
  entete?: boolean;
  /** Le bloc bexio : clé de correspondance, mots du nom et bornes de la
      période. Absent = pas de bloc (vue « Tous grossistes », par exemple). */
  bexio?: { cle: string; mots: string[]; de?: string; a?: string };
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const jour = (d?: string | null) => (d ? String(d).slice(0, 10) : "");
const ecartJours = (a?: string | null, b?: string | null): number | null => {
  const x = jour(a), y = jour(b);
  if (!x || !y) return null;
  const n = Math.round((Date.parse(y) - Date.parse(x)) / 86_400_000);
  return Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
};
const mediane = (v: number[]): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
/* Au-delà de 100 000, en milliers : le chiffre entier ne tenait plus dans
   sa tuile sur iPad. Le détail reste dans la liste qu'ouvre la tuile. */
const chf = (n: number) => (Math.abs(n) >= 100_000
  ? `CHF ${Math.round(n / 1000).toLocaleString("fr-CH")} k`
  : `CHF ${Math.round(n).toLocaleString("fr-CH")}`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const cab = (p: P) => Number(p.nbCabines) || 0;
const termine = (p: P) => p.etatCMD === "Terminé";
/* Cabines RÉELLEMENT posées : toutes si le chantier est terminé, sinon la
   règle commune (photos « .CabN. », compteur Notion, chantier d'une cabine).
   Le graphique comptait toutes les cabines du chantier dès qu'une date de
   montage tombait dans le mois — rendez-vous à venir compris (22.10.2026). */
const posees = (p: P) => (termine(p) ? cab(p) : poseesSurLeChantier(p));
const aSav = (p: P) => !!p.sav || !!String(p.causeSAV || "").trim() || !!p.dateSAVRecu;
const noms = (s: string) => String(s || "").split(/\s*(?:,|&|\+| et )\s*/).map((x) => x.trim()).filter(Boolean);

/* Les signalements (défauts d'usine, dommages de transport) : une seule
   lecture pour toutes les fiches partenaires, gardée une minute. */
let signalementsMemo: { t: number; p: Promise<DefautsParProjet> } | null = null;
function chargerSignalements(): Promise<DefautsParProjet> {
  if (!signalementsMemo || Date.now() - signalementsMemo.t > 60_000) {
    signalementsMemo = {
      t: Date.now(),
      p: Promise.all(["/api/defauts", "/api/pieces"].map((u) => fetch(u, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((l) => (Array.isArray(l) ? l : [])))) 
        .then(([d, pc]) => defautsParProjet(d as SignalementPourStats[], pc as { projectId?: string }[]))
        .catch(() => { signalementsMemo = null; return new Map() as DefautsParProjet; }),
    };
  }
  return signalementsMemo.p;
}

/** Compte pondéré (par cabines) → les `n` premiers, triés. */
function classement(projets: P[], cles: (p: P) => string[], n = 6) {
  const m = new Map<string, { cabines: number; projets: P[] }>();
  for (const p of projets) {
    for (const k of new Set(cles(p).filter(Boolean))) {
      const e = m.get(k) || { cabines: 0, projets: [] };
      e.cabines += cab(p) || 1;
      e.projets.push(p);
      m.set(k, e);
    }
  }
  return [...m.entries()].map(([nom, e]) => ({ nom, ...e })).sort((a, b) => b.cabines - a.cabines).slice(0, n);
}

export function StatsPartenaire({ tous, periode, famille, nom, libellePeriode, onOuvrir: ouvrirExterne, sections = TOUTES, entete = true, bexio }: StatsPartenaireProps) {
  const { mes, peut } = useDroits();
  const voir = (x: SectionStats) => sections.includes(x);
  const [feuille, setFeuille] = useState<{ titre: string; projets: P[] } | null>(null);
  const onOuvrir = (titre: string, projets: P[]) => (ouvrirExterne ? ouvrirExterne(titre, projets) : setFeuille({ titre, projets }));
  const argent = !!mes && peut("argent.voir");
  const voitSignalements = !!mes && peut("signalements.voir");
  const [defauts, setDefauts] = useState<DefautsParProjet | null>(null);
  useEffect(() => {
    if (!voitSignalements || !voir("signalements")) return;
    let vivant = true;
    chargerSignalements().then((d) => { if (vivant) setDefauts(d); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voitSignalements]);

  const s = useMemo(() => {
    const cabines = periode.reduce((n, p) => n + cab(p), 0);
    const poses = periode.filter(termine);
    const cabinesPosees = poses.reduce((n, p) => n + cab(p), 0);
    const montant = periode.reduce((n, p) => n + (Number(p.montantOFR) || 0), 0);
    const avecMontant = periode.filter((p) => Number(p.montantOFR) > 0);
    const sav = periode.filter(aSav);

    /* Douze mois glissants, mois courant compris : mesures (projets) et
       montages (cabines), sur TOUS les projets du partenaire. */
    const now = new Date();
    const mois = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, lib: MOIS[d.getMonth()], an: d.getFullYear() };
    });
    const auj = new Date().toISOString().slice(0, 10);
    const parMois = mois.map((m) => {
      /* Un montage encore à venir n'a rien posé. */
      const montages = tous.filter((p) => jour(p.dateMontage).startsWith(m.cle) && jour(p.dateMontage) <= auj);
      const mesures = tous.filter((p) => jour(p.dateMesures).startsWith(m.cle));
      return { ...m, montages, mesures, cabines: montages.reduce((n, p) => n + posees(p), 0) };
    });
    const pic = Math.max(1, ...parMois.map((m) => Math.max(m.cabines, m.mesures.length)));
    const an12 = parMois.reduce((n, m) => n + m.cabines, 0);
    /* Les douze mois d'avant, pour la tendance. */
    const debut = `${mois[0].cle}-01`;
    const avant = new Date(now.getFullYear(), now.getMonth() - 23, 1);
    const debutAvant = `${avant.getFullYear()}-${String(avant.getMonth() + 1).padStart(2, "0")}-01`;
    const an12Avant = tous.filter((p) => { const d = jour(p.dateMontage); return d >= debutAvant && d < debut; })
      .reduce((n, p) => n + posees(p), 0);

    const parcours = [
      { lib: "Demandes", liste: periode.filter((p) => p.dateDemandeProjet) },
      { lib: "Mesurés", liste: periode.filter((p) => mesuresFaites(p)) },
      { lib: "Offres", liste: periode.filter((p) => p.dateOffre || p.ofrTM) },
      { lib: "Commandés", liste: periode.filter((p) => p.dateCMDRecue || p.dateCMDUsine || p.cmdTM) },
      { lib: "Posés", liste: poses },
    ];

    const delai = (lib: string, de: string, a: string) => {
      const v = periode.map((p) => ecartJours(p[de], p[a])).filter((x): x is number => x !== null);
      return { lib, j: mediane(v), n: v.length };
    };
    const delais = [
      delai("Demande → mesure", "dateDemandeProjet", "dateMesures"),
      delai("Offre → commande", "dateOffre", "dateCMDRecue"),
      delai("Commande usine → arrivage", "dateCMDUsine", "arrivageTM"),
      delai("Arrivage → montage", "arrivageTM", "dateMontage"),
      delai("Demande → montage", "dateDemandeProjet", "dateMontage"),
    ];
    const delaiMax = Math.max(1, ...delais.map((d) => d.j || 0));

    const base = Math.max(1, cabines);
    const qualite = [
      { lib: "SAV", liste: sav, ton: "is-sav" },
      { lib: "Soucis de montage", liste: periode.filter((p) => p.soucisMontage), ton: "is-souci" },
      { lib: "Pièces manquantes", liste: periode.filter((p) => String(p.infoPiecesManquantes || "").trim()), ton: "is-piece" },
      { lib: "Défauts signalés", liste: periode.filter((p) => String(p.infoDefautsSignale || "").trim()), ton: "is-defaut" },
    ].map((q) => ({ ...q, taux: Math.round((q.liste.reduce((n, p) => n + (cab(p) || 1), 0) / base) * 100) }));
    /* Signalements, en NOMBRE et chaque sorte à part (22.10.2026) : défauts
       d'usine, dommages de transport (liste « defauts »), pièces manquantes
       (liste « pieces »). Jamais les photos « État des cartons réceptionnés »
       — un carton abîmé n'est pas une cabine abîmée. */
    const signalements = defauts
      ? (([["usine", "is-usine"], ["transport", "is-degat"], ["piece", "is-piece"]] as const).map(([n, ton]) => {
          const liste = periode.filter((p) => (defauts.get(p.id)?.[n] || 0) > 0);
          return { lib: LIBELLES_SIGNALEMENT[n], ton, liste, nb: liste.reduce((k, p) => k + (defauts.get(p.id)?.[n] || 0), 0) };
        }))
      : null;

    const series = classement(periode, (p) => p.seriesCabines || []);
    const lies = famille === "grossistes"
      ? classement(periode, (p) => p.fournisseursNames || [])
      : classement(periode, (p) => p.grossistesNames || []);
    const installateurs = classement(periode, (p) => p.sanitaireNames || []);
    const equipe = classement(periode.filter((p) => p.dateMontage), (p) => noms(p.collaborateurs));

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const prochains = tous
      .filter((p) => jour(p.dateMontage) >= aujourdhui && p.etatCMD !== "Annulé")
      .sort((a, b) => jour(a.dateMontage).localeCompare(jour(b.dateMontage)))
      .slice(0, 6);

    return { cabines, poses, cabinesPosees, montant, avecMontant, sav, parMois, pic, an12, an12Avant,
      parcours, delais, delaiMax, qualite, signalements, series, lies, installateurs, equipe, prochains };
  }, [tous, periode, famille, defauts]);

  /* Les numéros TM de TOUS ses chantiers : c'est par eux que bexio
     reconnaît le partenaire (l'offre porte ce numéro). */
  const numerosTM = useMemo(() => [...new Set(tous.map((p) => String(p.ofrTM || "")).filter(Boolean))], [tous]);

  const tendance = s.an12Avant ? Math.round(((s.an12 - s.an12Avant) / s.an12Avant) * 100) : null;
  const titreLies = famille === "grossistes" ? "Marques commandées" : "Par quels grossistes";

  const Barres = ({ titre, lignes, vide }: { titre: string; lignes: { nom: string; cabines: number; projets: P[] }[]; vide: string }) => {
    const max = Math.max(1, ...lignes.map((l) => l.cabines));
    return (
      <section className="sgpt-carte">
        <h3>{titre}</h3>
        {lignes.length === 0 ? <p className="sgpt-vide">{vide}</p> : (
          <ul className="sgpt-barres">
            {lignes.map((l) => (
              <li key={l.nom}>
                <button type="button" onClick={() => onOuvrir(`${titre} — ${l.nom}`, l.projets)}>
                  <span className="sgpt-barres-nom">{l.nom}</span>
                  <span className="sgpt-barres-piste"><i style={{ width: `${(l.cabines / max) * 100}%` }} /></span>
                  <b>{l.cabines}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  const tuiles: { val: string; lib: string; sous?: string; liste: P[]; ton?: string }[] = [
    { val: String(periode.length), lib: "Projets", sous: libellePeriode, liste: periode },
    { val: String(s.cabines), lib: "Cabines", sous: `${s.cabinesPosees} posées`, liste: periode },
    { val: `${pct(s.poses.length, periode.length)} %`, lib: "Terminés", sous: `${s.poses.length} sur ${periode.length}`, liste: s.poses, ton: "is-ok" },
    ...(argent ? [
      { val: chf(s.montant), lib: "Offres TM", sous: `${s.avecMontant.length} chiffrées`, liste: s.avecMontant },
      { val: s.avecMontant.length ? chf(s.montant / s.avecMontant.length) : "—", lib: "Panier moyen", sous: "par projet chiffré", liste: s.avecMontant },
    ] : []),
    { val: `${pct(s.sav.length, periode.length)} %`, lib: "Taux de SAV", sous: `${s.sav.length} projet${s.sav.length > 1 ? "s" : ""}`, liste: s.sav, ton: s.sav.length ? "is-alerte" : undefined },
  ];

  return (
    <div className="sgpt">
      {entete && <header className="sgpt-tete">
        <div>
          <p className="sgpt-sur">{famille === "grossistes" ? "Grossiste" : famille === "sanitaires" ? "Sanitaire" : famille === "clients" ? "Client" : "Fournisseur"}</p>
          <h2>{nom}</h2>
        </div>
        <p className="sgpt-periode">{libellePeriode}</p>
      </header>}

      {voir("tuiles") && <div className="sgpt-tuiles">
        {tuiles.map((t) => (
          <button key={t.lib} type="button" className={`sgpt-tuile ${t.ton || ""}`} onClick={() => onOuvrir(t.lib, t.liste)}>
            <span className="sgpt-tuile-lib">{t.lib}</span>
            <span className="sgpt-tuile-val">{t.val}</span>
            {t.sous && <span className="sgpt-tuile-sous">{t.sous}</span>}
          </button>
        ))}
      </div>}

      {bexio && (
        <BexioPartenaire cle={bexio.cle} mots={bexio.mots} de={bexio.de} a={bexio.a}
          numeros={numerosTM} />
      )}

      {voir("activite") && <section className="sgpt-carte sgpt-activite">
        <div className="sgpt-carte-tete">
          <h3>Activité sur 12 mois</h3>
          <p>
            <span className="sgpt-pastille is-montage" /> Cabines posées
            <span className="sgpt-pastille is-mesure" /> Mesures
            {tendance !== null && (
              <b className={tendance >= 0 ? "is-hausse" : "is-baisse"}>
                {tendance >= 0 ? "▲" : "▼"} {Math.abs(tendance)} % sur un an
              </b>
            )}
          </p>
        </div>
        <div className="sgpt-histo">
          {s.parMois.map((m) => (
            <button key={m.cle} type="button" className="sgpt-histo-mois"
              title={`${m.lib} ${m.an} : ${m.cabines} cabine(s) posée(s), ${m.mesures.length} mesure(s)`}
              onClick={() => onOuvrir(`${m.lib} ${m.an}`, [...new Set([...m.montages, ...m.mesures])])}>
              <span className="sgpt-histo-col">
                <i className="is-montage" style={{ height: `${(m.cabines / s.pic) * 100}%` }}>{m.cabines > 0 && <em>{m.cabines}</em>}</i>
                <i className="is-mesure" style={{ height: `${(m.mesures.length / s.pic) * 100}%` }} />
              </span>
              <span className="sgpt-histo-lib">{m.lib}</span>
            </button>
          ))}
        </div>
      </section>}

      <div className="sgpt-grille">
        {voir("parcours") && <section className="sgpt-carte">
          <h3>Parcours des projets</h3>
          <ol className="sgpt-parcours">
            {s.parcours.map((e, i) => {
              const base = s.parcours[0].liste.length || periode.length || 1;
              return (
                <li key={e.lib}>
                  <button type="button" onClick={() => onOuvrir(e.lib, e.liste)}>
                    <span className="sgpt-parcours-lib">{e.lib}</span>
                    <span className="sgpt-barres-piste"><i style={{ width: `${Math.min(100, (e.liste.length / base) * 100)}%` }} /></span>
                    <b>{e.liste.length}</b>
                    <em>{i > 0 ? `${pct(e.liste.length, base)} %` : ""}</em>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="sgpt-note">Part des projets de la période arrivés à chaque étape.</p>
        </section>}

        {voir("delais") && <section className="sgpt-carte">
          <h3>Délais médians</h3>
          <ul className="sgpt-delais">
            {s.delais.map((d) => (
              <li key={d.lib}>
                <span className="sgpt-delais-lib">{d.lib}</span>
                <span className="sgpt-barres-piste"><i style={{ width: `${((d.j || 0) / s.delaiMax) * 100}%` }} /></span>
                <b>{d.j === null ? "—" : `${d.j} j`}</b>
                <small>{d.n ? `${d.n} proj.` : ""}</small>
              </li>
            ))}
          </ul>
        </section>}

        {voir("qualite") && <section className="sgpt-carte">
          <h3>Qualité <small>pour 100 cabines</small></h3>
          <ul className="sgpt-qualite">
            {s.qualite.map((q) => (
              <li key={q.lib}>
                <button type="button" className={q.ton} onClick={() => onOuvrir(q.lib, q.liste)} disabled={!q.liste.length}>
                  <span>{q.lib}</span>
                  <b>{q.taux}</b>
                  <small>{q.liste.length} proj.</small>
                </button>
              </li>
            ))}
          </ul>
        </section>}

        {voir("signalements") && s.signalements && <section className="sgpt-carte">
          <h3>Signalements <small>en nombre</small></h3>
          <ul className="sgpt-qualite">
            {s.signalements.map((q) => (
              <li key={q.lib}>
                <button type="button" className={q.ton} onClick={() => onOuvrir(q.lib, q.liste)} disabled={!q.liste.length}>
                  <span>{q.lib}</span>
                  <b>{q.nb}</b>
                  <small>{q.liste.length} proj.</small>
                </button>
              </li>
            ))}
          </ul>
        </section>}

        {voir("series") && <Barres titre="Séries posées" lignes={s.series} vide="Aucune série renseignée sur la période." />}
        {voir("lies") && <Barres titre={titreLies} lignes={s.lies} vide="Aucun partenaire lié sur la période." />}
        {voir("installateurs") && <Barres titre="Installateurs sanitaires" lignes={s.installateurs} vide="Aucun installateur lié sur la période." />}
        {voir("equipe") && <Barres titre="Équipe de pose" lignes={s.equipe} vide="Aucun montage daté sur la période." />}

        {voir("prochains") && <section className="sgpt-carte">
          <h3>Prochains montages</h3>
          {s.prochains.length === 0 ? <p className="sgpt-vide">Aucun montage à venir.</p> : (
            <ul className="sgpt-rdv">
              {s.prochains.map((p) => (
                <li key={p.id}>
                  <Link href={`/projet/${p.id}`}>
                    <time>{new Date(jour(p.dateMontage)).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</time>
                    <span>{p.projet}</span>
                    {cab(p) > 0 && <b>{cab(p)} cab.</b>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>}
      </div>

      {feuille && (
        <div className="sgpt-feuille" role="dialog" aria-label={feuille.titre} onClick={() => setFeuille(null)}>
          <div className="sgpt-feuille-corps" onClick={(e) => e.stopPropagation()}>
            <div className="sgpt-feuille-tete">
              <h3>{feuille.titre} <small>{feuille.projets.length} projet{feuille.projets.length > 1 ? "s" : ""}</small></h3>
              <button type="button" onClick={() => setFeuille(null)}>Fermer</button>
            </div>
            <ul className="sgpt-rdv">
              {feuille.projets.map((p) => (
                <li key={p.id}>
                  <Link href={`/projet/${p.id}`}>
                    <time>{p.dateMontage ? new Date(jour(p.dateMontage)).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "—"}</time>
                    <span>{p.projet}</span>
                    {cab(p) > 0 && <b>{cab(p)} cab.</b>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
