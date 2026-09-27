"use client";

/**
 * Registre des garanties — ce que nous avons posé, et où.
 *
 * L'usage est au téléphone : une régie appelle pour une cabine cassée dans un
 * immeuble équipé il y a trois ans. On tape l'adresse, on obtient la marque, la
 * série, la date de pose et l'existence des documents de garantie.
 *
 * Seuls les montages TERMINÉS y figurent : un chantier en cours se suit
 * ailleurs, et un registre qui mélange les deux ne se consulte pas vite.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ShieldCheck, Search, X, Loader2, ChevronRight, Camera, FileCheck, QrCode,
} from "lucide-react";

interface Ligne {
  id: string; ofrTM: string; projet: string; adresse: string; localite: string;
  datePose: string | null; marques: string[]; series: string[]; cabines: number | null;
  lots: string[]; monteurs: string; grossiste: string; sanitaire: string;
  garanties: number; qrCodes: number; photos: number; sav: boolean;
}

function annees(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const j = (Date.now() - t) / 86400000;
  if (j < 365) return `il y a ${Math.max(1, Math.round(j / 30))} mois`;
  const a = Math.floor(j / 365);
  return `il y a ${a} an${a > 1 ? "s" : ""}`;
}

function jour(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function GarantiesPage() {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<Ligne[] | null>(null);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chercher = useCallback((texte: string) => {
    if (texte.trim().length < 2) { setResultats(null); return; }
    setChargement(true);
    fetch(`/api/garanties?q=${encodeURIComponent(texte.trim())}`)
      .then((r) => (r.ok ? r.json() : { resultats: [], total: 0 }))
      .then((d) => { setResultats(d.resultats || []); setTotal(d.total || 0); })
      .catch(() => setResultats([]))
      .finally(() => setChargement(false));
  }, []);

  // Frappe au clavier : on attend une pause plutôt que d'interroger à chaque lettre.
  useEffect(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => chercher(q), 350);
    return () => { if (minuteur.current) clearTimeout(minuteur.current); };
  }, [q, chercher]);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Registre des garanties</h2>
        <p>
          Ce que nous avons posé, et où. Cherchez par adresse, localité, nom de client,
          marque, série, numéro de lot ou n° TM. Seuls les montages terminés y figurent.
        </p>
      </div>

      <div className="sgq-barre mb-4">
        <span className="sgch-recherche">
          <Search className="w-3.5 h-3.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            placeholder="Rue de Corcelles, 2034 Peseux, Duka, Milliquet…" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Effacer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {chargement && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </span>
        {resultats && (
          <span className="sgch-compte">
            {total} montage{total > 1 ? "s" : ""}{total > resultats.length ? ` · ${resultats.length} affichés` : ""}
          </span>
        )}
      </div>

      {!resultats && (
        <p className="sgch-vide-msg">
          Tapez au moins deux caractères. La recherche porte sur l&apos;adresse, le titre du
          projet, les lots, la marque, la série, le sanitaire, le grossiste et le monteur.
        </p>
      )}
      {resultats && resultats.length === 0 && !chargement && (
        <p className="sgch-vide-msg">Rien de posé ne correspond à cette recherche.</p>
      )}

      <div className="sgg-liste">
        {(resultats || []).map((l) => (
          <Link key={l.id} href={`/projet/${l.id}?mode=dashboard`} className="sgg-carte">
            <span className="sgg-tete">
              <b className="sg-mono">{l.ofrTM || "—"}</b>
              <span className="sgg-date">{jour(l.datePose)} <em>{annees(l.datePose)}</em></span>
              <ChevronRight className="w-4 h-4 sg-plist-chev" />
            </span>
            <span className="sgg-nom">{l.projet}</span>
            {l.adresse && <span className="sgg-ligne">{l.adresse}</span>}
            <span className="sgg-meta">
              {l.marques.length > 0 && <em>{l.marques.join(", ")}</em>}
              {l.series.length > 0 && <em>{l.series.join(", ")}</em>}
              {l.cabines ? <em>{l.cabines} cab.</em> : null}
              {l.lots.length > 0 && <em>{l.lots.slice(0, 4).join(" · ")}{l.lots.length > 4 ? "…" : ""}</em>}
            </span>
            <span className="sgg-pieces">
              <i className={l.garanties > 0 ? "is-on" : ""}><FileCheck className="w-3 h-3" /> {l.garanties} garantie{l.garanties > 1 ? "s" : ""}</i>
              <i className={l.qrCodes > 0 ? "is-on" : ""}><QrCode className="w-3 h-3" /> {l.qrCodes} QR</i>
              <i className={l.photos > 0 ? "is-on" : ""}><Camera className="w-3 h-3" /> {l.photos} photos</i>
              {l.sav && <i className="is-sav">SAV</i>}
            </span>
            {(l.sanitaire || l.grossiste || l.monteurs) && (
              <span className="sgg-ligne">
                {[l.sanitaire, l.grossiste, l.monteurs].filter(Boolean).join(" · ")}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
