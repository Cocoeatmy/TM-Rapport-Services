"use client";

/**
 * Page « Rapport quotidien » — ce qui part chaque matin à 6 h 45.
 *
 * Le rapport est un e-mail : une fois parti, il faut le retrouver dans sa
 * boîte, et personne ne peut vérifier avant l'envoi ce qu'un collaborateur
 * va recevoir. Cette page montre le même contenu, calculé par les mêmes
 * fonctions, à la demande et pour n'importe quel jour.
 *
 * Un collaborateur y voit ses montages ; un administrateur voit la répartition
 * complète, plus les deux compteurs de contrôle.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Sun, Loader2, RefreshCw, MapPin, Clock, Users, Package,
  ClipboardCheck, BellRing, ChevronRight,
} from "lucide-react";

interface Montage {
  id: string; ofrTM: string; projet: string; nomChantier: string;
  adresseChantier: string; heure: string; collaborateurs: string;
  nbCabines: number | null; typeServices: string[]; emplacementCabine: string;
  contactsRDV: string; commentaires: string;
}

interface Apercu {
  date: string; nom: string; estAdmin: boolean; total: number;
  moi: Montage[];
  parCollaborateur: { nom: string; email: string; role: string; projets: Montage[] }[];
  alertes: { anomalies: number; relances: number } | null;
}

function jourIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Carte({ m }: { m: Montage }) {
  return (
    <Link href={`/projet/${m.id}?mode=dashboard`} className="sgr-carte">
      <span className="sgr-carte-tete">
        <b className="sg-mono">{m.ofrTM || "—"}</b>
        {m.heure && <em><Clock className="w-3 h-3" /> {m.heure}</em>}
        {m.nbCabines ? <em><Package className="w-3 h-3" /> {m.nbCabines} cab.</em> : null}
        <ChevronRight className="w-4 h-4 sg-plist-chev" />
      </span>
      <span className="sgr-carte-nom">{m.nomChantier || m.projet}</span>
      {m.adresseChantier && (
        <span className="sgr-carte-ligne"><MapPin className="w-3 h-3" /> {m.adresseChantier}</span>
      )}
      {m.collaborateurs && (
        <span className="sgr-carte-ligne"><Users className="w-3 h-3" /> {m.collaborateurs}</span>
      )}
      {m.typeServices.length > 0 && (
        <span className="sgr-carte-ligne">{m.typeServices.join(", ")}</span>
      )}
      {m.commentaires && <span className="sgr-carte-note">{m.commentaires}</span>}
    </Link>
  );
}

export default function RapportQuotidienPage() {
  const [date, setDate] = useState(() => jourIso(new Date()));
  const [d, setD] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback((jour: string) => {
    setChargement(true);
    setErreur(null);
    fetch(`/api/daily-report/apercu?date=${jour}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((x) => setD(x))
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(date); }, [date, charger]);

  const libelle = new Date(`${date}T12:00:00`).toLocaleDateString("fr-CH", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2"><Sun className="w-5 h-5" /> Rapport quotidien</h2>
        <p>
          Ce qui part par e-mail chaque matin à 6 h 45, du lundi au vendredi —
          chaque collaborateur ne reçoit que ses montages. Cette page montre le même
          contenu, pour le jour de votre choix.
        </p>
      </div>

      <div className="sgq-barre mb-4">
        <span className="sgch-recherche" style={{ flex: "0 0 auto" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </span>
        <span className="sgch-compte">{libelle}</span>
        <button type="button" className="sgch-retour" onClick={() => charger(date)} disabled={chargement}>
          {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualiser
        </button>
      </div>

      {erreur && <p className="sgch-vide-msg">Chargement impossible — {erreur}</p>}
      {chargement && !d && (
        <p className="sgch-vide-msg"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Lecture des montages…</p>
      )}

      {d && (
        <>
          {d.alertes && (d.alertes.anomalies > 0 || d.alertes.relances > 0) && (
            <div className="sgr-alertes">
              <Link href="/admin/anomalies" className="sgr-alerte">
                <ClipboardCheck className="w-4 h-4" />
                <b>{d.alertes.anomalies}</b>
                <span>fiche{d.alertes.anomalies > 1 ? "s" : ""} à corriger — anomalies bloquantes</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link href="/relances" className="sgr-alerte">
                <BellRing className="w-4 h-4" />
                <b>{d.alertes.relances}</b>
                <span>dossier{d.alertes.relances > 1 ? "s" : ""} à relancer</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          <h3 className="sgr-titre">
            {d.total === 0
              ? "Aucun montage ce jour-là."
              : `${d.total} montage${d.total > 1 ? "s" : ""} ce jour-là`}
          </h3>

          {d.moi.length > 0 && (
            <div className="sgr-bloc">
              <p className="sgr-bloc-tete">Vos montages<em>{d.moi.length}</em></p>
              <div className="sgr-cartes">{d.moi.map((m) => <Carte key={m.id} m={m} />)}</div>
            </div>
          )}

          {d.estAdmin && d.parCollaborateur.length > 0 && (
            <div className="sgr-bloc">
              <p className="sgr-bloc-tete">
                Ce que chacun reçoit
                <em>{d.parCollaborateur.length} destinataire{d.parCollaborateur.length > 1 ? "s" : ""}</em>
              </p>
              {d.parCollaborateur.map((c) => (
                <details key={c.nom} className="sgch-fold" style={{ marginBottom: 6 }}>
                  <summary>
                    {c.nom}
                    <em>{c.projets.length} montage{c.projets.length > 1 ? "s" : ""}</em>
                  </summary>
                  <div className="sgr-cartes" style={{ padding: "10px 12px" }}>
                    {c.projets.map((m) => <Carte key={m.id} m={m} />)}
                  </div>
                </details>
              ))}
            </div>
          )}

          {d.estAdmin && d.total > 0 && d.parCollaborateur.length === 0 && (
            <p className="sgch-vide-msg">
              Des montages sont prévus, mais aucun collaborateur n&apos;y est rattaché :
              personne ne recevra d&apos;e-mail. Le champ « Collaborateurs montages » est
              probablement vide.
            </p>
          )}
        </>
      )}
    </div>
  );
}
