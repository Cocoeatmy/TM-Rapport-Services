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
  ChevronRight, Search, X, Loader2, RefreshCw, CheckCircle2,
} from "lucide-react";

export interface LigneControle {
  id: string;
  ofrTM: string;
  projet: string;
  etatCMD: string;
  collaborateurs: string;
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

export function ControlesVue({
  groupes, chargement, erreur, onRecharger, vide,
}: {
  groupes: GroupeControle[];
  chargement: boolean;
  erreur: string | null;
  onRecharger: () => void;
  /** Phrase affichée quand aucune règle ne remonte rien. */
  vide: string;
}) {
  const [recherche, setRecherche] = useState("");
  const [gravite, setGravite] = useState<GroupeControle["gravite"] | "toutes">("toutes");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

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
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`} className="sgq-ligne">
                      <b className="sg-mono">{p.ofrTM || "—"}</b>
                      <span className="sgq-ligne-main">
                        <span className="sgq-ligne-nom">{p.projet}</span>
                        <span className="sgq-ligne-detail">{p.detail}</span>
                      </span>
                      <span className="sgq-ligne-statut">{p.etatCMD || "—"}</span>
                      <ChevronRight className="w-4 h-4 sg-plist-chev" />
                    </Link>
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
