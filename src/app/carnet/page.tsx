"use client";

/**
 * Page « Carnet de commandes » — combien de travail devant nous.
 *
 * Elle ne vit pas dans les Statistiques : celles-ci regardent en arrière, le
 * carnet regarde en avant, et il se consulte — le lundi matin, avant d'accepter
 * un chantier — plutôt qu'il ne s'analyse.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ClipboardList, Loader2, RefreshCw, CalendarClock, Package,
  TrendingUp, AlertTriangle,
} from "lucide-react";

interface Ligne { cle: string; cabines: number; minutes: number; projets: number }
interface Carnet {
  cabines: number; projets: number; minutes: number; jours: number;
  parEtape: Ligne[]; parFournisseur: Ligne[]; parRegion: Ligne[];
  planifiees: number;
  rythme: {
    cabinesParSemaine: number; semainesObservees: number;
    semaines: number | null; dateAbsorption: string | null;
  };
  dormantes: { cabines: number; projets: number; seuilJours: number };
  saison: { mois: number; cabines: number; indice: number; annees: number }[];
}

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function dateLongue(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long" });
}

function Table({ titre, lignes, total }: { titre: string; lignes: Ligne[]; total: number }) {
  if (lignes.length === 0) return null;
  return (
    <div className="sgn-bloc">
      <p className="sgr-bloc-tete">{titre}</p>
      <div className="sgn-liste">
        {lignes.map((l) => (
          <div key={l.cle} className="sgn-ligne">
            <span className="sgn-ligne-nom">{l.cle}</span>
            <span className="sgn-piste">
              <i style={{ width: `${total > 0 ? (l.cabines / total) * 100 : 0}%` }} />
            </span>
            <span className="sgn-ligne-val">{l.cabines} <em>cab.</em></span>
            <span className="sgn-ligne-sub">{Math.round(l.minutes / 510 * 10) / 10} j</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CarnetPage() {
  const [c, setC] = useState<Carnet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    fetch("/api/carnet")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setC(d))
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4 flex items-start gap-3">
        <div className="flex-1">
          <h2 className="flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Carnet de commandes</h2>
          <p>
            Les cabines vendues et pas encore posées, converties en travail d&apos;après
            les heures réellement pointées sur les montages terminés. Les projets
            annulés et les interventions de service pures en sont écartés.
          </p>
        </div>
        <button type="button" className="sgch-retour" onClick={charger} disabled={chargement}>
          {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualiser
        </button>
      </div>

      {erreur && <p className="sgch-vide-msg">Chargement impossible — {erreur}</p>}
      {chargement && !c && (
        <p className="sgch-vide-msg"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Calcul du carnet…</p>
      )}

      {c && (
        <>
          <div className="sgn-kpis">
            <div className="is-fort">
              <b>{c.jours.toLocaleString("fr-CH")}</b>
              <span>jours-homme de travail</span>
              <em>{c.cabines} cabines · {c.projets} projets</em>
            </div>
            <div>
              <b>{c.rythme.semaines !== null ? `${c.rythme.semaines}` : "—"}</b>
              <span>semaines au rythme actuel</span>
              <em>{c.rythme.cabinesParSemaine} cabines/semaine sur {c.rythme.semainesObservees} semaines</em>
            </div>
            <div>
              <b className="sgn-date">{dateLongue(c.rythme.dateAbsorption)}</b>
              <span>carnet absorbé</span>
              <em>si le rythme se maintient</em>
            </div>
            <div>
              <b>{c.planifiees}</b>
              <span>cabines déjà planifiées</span>
              <em>{c.cabines - c.planifiees} sans rendez-vous</em>
            </div>
          </div>

          {c.dormantes.cabines > 0 && (
            <Link href="/relances" className="sgn-alerte">
              <AlertTriangle className="w-4 h-4" />
              <b>{c.dormantes.cabines}</b>
              <span>
                cabine{c.dormantes.cabines > 1 ? "s" : ""} livrée{c.dormantes.cabines > 1 ? "s" : ""} depuis
                plus de {c.dormantes.seuilJours} jours sans rendez-vous fixé, sur {c.dormantes.projets} projet
                {c.dormantes.projets > 1 ? "s" : ""} — du carnet qui dort.
              </span>
            </Link>
          )}

          {c.saison.length > 0 && (
            <div className="sgn-bloc">
              <p className="sgr-bloc-tete">
                Saisonnalité<em>écart à la moyenne, sur 24 mois</em>
              </p>
              <div className="sgn-saison">
                {c.saison.map((m) => {
                  const moisCourant = new Date().getMonth() + 1 === m.mois;
                  return (
                    <div key={m.mois} className={`sgn-mois${moisCourant ? " is-courant" : ""}${m.annees === 0 ? " is-vide" : ""}`}
                      title={`${m.cabines} cabines posées sur ${m.annees} année${m.annees > 1 ? "s" : ""}`}>
                      <span className="sgn-mois-barre">
                        <i className={m.indice >= 0 ? "is-haut" : "is-bas"}
                          style={{ height: `${Math.min(100, Math.abs(m.indice))}%` }} />
                      </span>
                      <span className="sgn-mois-nom">{MOIS[m.mois - 1]}</span>
                      <span className="sgn-mois-val">
                        {m.annees === 0 ? "—" : `${m.indice > 0 ? "+" : ""}${m.indice}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="sgch-vide-msg" style={{ textAlign: "left", padding: "8px 2px 0" }}>
                Le carnet dit combien de travail reste ; ces barres disent dans quel mois il
                tombe. Un carnet de six semaines en septembre, mois historiquement chargé,
                ne se lit pas comme le même carnet en juin. Le mois en cours est exclu du
                calcul — incomplet, il tirerait son propre indice vers le bas.
              </p>
            </div>
          )}

          <Table titre="Par étape" lignes={c.parEtape} total={c.cabines} />
          <Table titre="Par fournisseur" lignes={c.parFournisseur} total={c.cabines} />
          <Table titre="Par région" lignes={c.parRegion} total={c.cabines} />

          <p className="sgch-vide-msg" style={{ textAlign: "left" }}>
            <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 align-[-2px]" />
            Le délai d&apos;absorption se déduit du rythme réellement tenu ces
            {" "}{c.rythme.semainesObservees} dernières semaines, et non d&apos;un effectif
            théorique : l&apos;application ne connaît ni les vacances ni les absences.
            Un renfort, une semaine creuse ou un gros chantier le déplacent.
          </p>
        </>
      )}
    </div>
  );
}
