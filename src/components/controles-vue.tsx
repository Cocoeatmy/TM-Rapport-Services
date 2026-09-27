"use client";

/**
 * Affichage commun aux pages « Anomalie Notion » et « Relances ».
 *
 * Les deux posent la même question sous deux angles — quelles fiches demandent
 * une action, et pourquoi — donc une seule présentation : des groupes repliés
 * par défaut, ouverts d'un clic, avec la raison écrite en clair. Une liste qui
 * ne dit pas ce qu'elle casse ne sera jamais traitée.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight, Search, X, Loader2, RefreshCw, CheckCircle2, MessageSquare,
} from "lucide-react";

export interface LigneControle {
  id: string;
  ofrTM: string;
  projet: string;
  etatCMD: string;
  collaborateurs: string;
  /** Champ Notion « Journal des échanges » — l'historique des appels. */
  journal: string;
  detail: string;
}

export interface GroupeControle {
  id: string;
  titre: string;
  pourquoi: string;
  gravite: "bloquant" | "important" | "mineur";
  projets: LigneControle[];
}

const GRAVITES: { id: GroupeControle["gravite"] | "toutes"; label: string }[] = [
  { id: "toutes", label: "Tout" },
  { id: "bloquant", label: "Bloquant" },
  { id: "important", label: "Important" },
  { id: "mineur", label: "Mineur" },
];

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Journal des échanges d'un projet, en ajout rapide.
 *
 * On n'édite pas le texte existant : on APPEND une ligne horodatée. Un journal
 * d'appels se relit, il ne se réécrit pas — et deux personnes qui notent le
 * même jour ne doivent pas s'effacer l'une l'autre. Le champ est celui de
 * Notion, le même que sur la fiche projet.
 */
function Journal({ ligne, onEcrit }: {
  ligne: LigneControle; onEcrit: (texte: string) => void;
}) {
  const [texte, setTexte] = useState(ligne.journal);
  const [saisie, setSaisie] = useState("");
  const [enreg, setEnreg] = useState(false);
  const [erreur, setErreur] = useState(false);

  const ajouter = async () => {
    const note = saisie.trim();
    if (!note) return;
    const d = new Date();
    const deuxChiffres = (n: number) => String(n).padStart(2, "0");
    const entete = `${deuxChiffres(d.getDate())}.${deuxChiffres(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`
      + ` - ${deuxChiffres(d.getHours())}h${deuxChiffres(d.getMinutes())} : `;
    const nouveau = [texte.trim(), entete + note].filter(Boolean).join("\n");
    setEnreg(true);
    setErreur(false);
    try {
      const r = await fetch(`/api/projects/${ligne.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalEchanges: nouveau }),
      });
      if (!r.ok) throw new Error("PATCH");
      setTexte(nouveau);
      onEcrit(nouveau);
      setSaisie("");
    } catch {
      setErreur(true);
    } finally {
      setEnreg(false);
    }
  };

  return (
    <div className="sgq-journal">
      {texte.trim()
        ? <p className="sgq-journal-txt">{texte}</p>
        : <p className="sgq-journal-vide">Aucun échange noté pour ce projet.</p>}
      <div className="sgq-journal-saisie">
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)}
          placeholder="Appel sans réponse, rappeler lundi…"
          onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
        <button type="button" onClick={ajouter} disabled={enreg || !saisie.trim()}>
          {enreg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ajouter"}
        </button>
      </div>
      {erreur && <span className="sgq-journal-err">Enregistrement impossible — réessayez.</span>}
    </div>
  );
}

export function ControlesVue({
  groupes, chargement, erreur, onRecharger, vide, avecJournal = false,
}: {
  groupes: GroupeControle[];
  chargement: boolean;
  erreur: string | null;
  onRecharger: () => void;
  /** Phrase affichée quand aucune règle ne remonte rien. */
  vide: string;
  /**
   * Ouvre le journal des échanges sur chaque ligne. Utile pour les relances :
   * sans lui, la liste redonne demain les dossiers déjà appelés aujourd'hui.
   */
  avecJournal?: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const [gravite, setGravite] = useState<GroupeControle["gravite"] | "toutes">("toutes");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [journalOuvert, setJournalOuvert] = useState<string | null>(null);

  const basculer = (id: string) => setOuverts((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const visibles = useMemo(() => {
    const q = norm(recherche.trim());
    const mots = q ? q.split(/\s+/) : [];
    return groupes
      .filter((g) => gravite === "toutes" || g.gravite === gravite)
      .map((g) => ({
        ...g,
        projets: mots.length === 0 ? g.projets : g.projets.filter((p) => {
          const foin = norm(`${p.ofrTM} ${p.projet} ${p.etatCMD} ${p.detail} ${p.collaborateurs}`);
          return mots.every((m) => foin.includes(m));
        }),
      }))
      .filter((g) => g.projets.length > 0);
  }, [groupes, recherche, gravite]);

  const comptes = useMemo(() => {
    const c: Record<string, number> = { toutes: 0, bloquant: 0, important: 0, mineur: 0 };
    groupes.forEach((g) => { c.toutes += g.projets.length; c[g.gravite] += g.projets.length; });
    return c;
  }, [groupes]);

  return (
    <div className="sgq">
      <div className="sgq-barre">
        <span className="sgch-recherche">
          <Search className="w-3.5 h-3.5" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un projet, un n° TM, un statut…" />
          {recherche && (
            <button type="button" onClick={() => setRecherche("")} aria-label="Effacer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
        <span className="sgch-etats">
          {GRAVITES.map((g) => (
            <button key={g.id} type="button" className={gravite === g.id ? "is-on" : ""}
              onClick={() => setGravite(g.id)}>
              {g.label} <b>{comptes[g.id] || 0}</b>
            </button>
          ))}
        </span>
        <button type="button" className="sgch-retour" onClick={onRecharger} disabled={chargement}>
          {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualiser
        </button>
      </div>

      {erreur && <p className="sgch-vide-msg">Chargement impossible — {erreur}</p>}
      {chargement && groupes.length === 0 && (
        <p className="sgch-vide-msg">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Analyse des projets…
        </p>
      )}
      {!chargement && !erreur && groupes.length === 0 && (
        <p className="sgq-ok"><CheckCircle2 className="w-4 h-4" /> {vide}</p>
      )}
      {!chargement && groupes.length > 0 && visibles.length === 0 && (
        <p className="sgch-vide-msg">Aucune fiche ne correspond à ce filtre.</p>
      )}

      <div className="sgq-groupes">
        {visibles.map((g) => {
          const ouvert = ouverts.has(g.id);
          return (
            <div key={g.id} className={`sgq-groupe is-${g.gravite}`}>
              <button type="button" className="sgq-tete" onClick={() => basculer(g.id)}
                aria-expanded={ouvert}>
                <ChevronRight className={`w-4 h-4 sgq-chev${ouvert ? " is-on" : ""}`} />
                <span className="sgq-tete-txt">
                  <b>{g.titre}</b>
                  <em>{g.pourquoi}</em>
                </span>
                <span className="sgq-compte">{g.projets.length}</span>
              </button>
              {ouvert && (
                <div className="sgq-liste">
                  {g.projets.map((p) => (
                    <div key={p.id} className="sgq-bloc">
                      <div className="sgq-ligne">
                        <b className="sg-mono">{p.ofrTM || "—"}</b>
                        <Link href={`/projet/${p.id}?mode=dashboard`} className="sgq-ligne-main">
                          <span className="sgq-ligne-nom">{p.projet}</span>
                          <span className="sgq-ligne-detail">{p.detail}</span>
                        </Link>
                        {avecJournal && (
                          <button type="button" className="sgq-journal-btn"
                            aria-expanded={journalOuvert === p.id}
                            title="Journal des échanges"
                            onClick={() => setJournalOuvert(journalOuvert === p.id ? null : p.id)}>
                            <MessageSquare className="w-3.5 h-3.5" />
                            {p.journal.trim() ? <i /> : null}
                          </button>
                        )}
                        <span className="sgq-ligne-statut">{p.etatCMD || "—"}</span>
                        <Link href={`/projet/${p.id}?mode=dashboard`} aria-label="Ouvrir le projet">
                          <ChevronRight className="w-4 h-4 sg-plist-chev" />
                        </Link>
                      </div>
                      {avecJournal && journalOuvert === p.id && (
                        <Journal ligne={p} onEcrit={(txt) => { p.journal = txt; }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
