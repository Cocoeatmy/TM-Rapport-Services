"use client";

/**
 * Aperçu latéral du thème « Signal ».
 *
 * Un clic sur le numéro TM d'une ligne de projet — dans N'IMPORTE quelle liste
 * de l'app — ouvre cette fiche sur la droite ; le reste de la ligne continue
 * d'ouvrir le projet complet. Le composant est monté une seule fois (l'hôte
 * `SignalPreviewHost`, posé dans le conteneur `.sg-host` de la page) et les
 * listes l'alimentent via `openSignalPreview(projet)` : aucune liste n'a donc
 * besoin de porter son propre état ni son propre panneau.
 *
 * L'hôte est positionné en ABSOLU dans `.sg-host` : la fiche occupe la hauteur
 * de la page affichée (la liste en cours), pas celle de la fenêtre, et son
 * contenu reste collé en haut pendant le défilement.
 *
 * Aucun autre thème n'utilise ce composant.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Project } from "@/lib/notion";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";

/* ── Mini-store module : les lignes publient, l'hôte s'abonne ────────────── */

type PreviewState = { project: Project; mode: string } | null;

let current: PreviewState = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Ouvre l'aperçu sur ce projet (appelé depuis le clic sur le n° TM). */
export function openSignalPreview(project: Project, mode = "dashboard") {
  current = { project, mode };
  emit();
}

/** Ferme l'aperçu. */
export function closeSignalPreview() {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function getSnapshot() { return current; }
function getServerSnapshot(): PreviewState { return null; }

/** J+x depuis une date ISO — mêmes seuils/couleurs que le tableau de bord. */
function daysInfo(raw: string | null | undefined) {
  if (!raw || raw === "no-date") return null;
  const ref = new Date(raw.split("T")[0] + "T00:00:00");
  if (isNaN(ref.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - ref.getTime()) / 86400000);
  if (days < 0) return null;
  const colorClass = days <= 5 ? "text-green-700 dark:text-green-400"
    : days <= 9 ? "text-orange-700 dark:text-orange-400"
    : "text-red-700 dark:text-red-400";
  const bgClass = days <= 5 ? "bg-green-100 dark:bg-green-900/30"
    : days <= 9 ? "bg-orange-100 dark:bg-orange-900/30"
    : "bg-red-100 dark:bg-red-900/30";
  return { colorClass, bgClass, days };
}

/* ── La fiche elle-même ──────────────────────────────────────────────────── */

export function SignalPreviewCard({
  project: p,
  mode = "dashboard",
  onClose,
}: { project: Project; mode?: string; onClose: () => void }) {
  const etat = (mode.startsWith("mesures") ? p.etatMesures : p.etatCMD) || "—";
  const cls = STATUS_CMD_COLORS[etat] || STATUS_MESURES_COLORS[etat] || "bg-gray-100 text-gray-700";
  const j = daysInfo(mode.startsWith("mesures") ? p.dateMesures : p.dateMontage);
  const total = p.nbCabines || 0;
  const posed = Math.min(p.nbCabinesInstallees || 0, total);

  return (
    <div className="sg-detail-in">
      <div className="sg-detail-top">
        {j && <span className={`sg-jpill ${j.bgClass} ${j.colorClass}`}>J+{j.days}</span>}
        <span className={`sg-state ${cls}`}>{etat}</span>
        <button type="button" className="sg-unpin" title="Fermer l'aperçu" aria-label="Fermer l'aperçu"
          onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <h3 className="sg-detail-title">{p.projet || "Sans nom"}</h3>
      {p.adresseChantier && <p className="sg-detail-addr">{p.adresseChantier}</p>}
      <div className="sg-fields">
        {([
          { k: "N° OFR TM", v: p.ofrTM || "—" },
          { k: "N° FOURN.", v: p.servCmdFournisseurs || p.cmdFournisseurs || p.servMesuresFournisseurs || "—" },
          { k: "NB. CABINES", v: String(total) },
          { k: "EMPLACEMENT", v: p.emplacementCabine || "—" },
          { k: "ARRIVAGE", v: (p.arrivageTM || p.arrivageGrossiste || "").split("T")[0] || "—" },
          { k: "COLLABORATEUR", v: p.collaborateurs || "—" },
        ]).map((f) => (
          <div key={f.k} className="sg-field">
            <span className="sg-field-k">{f.k}</span>
            <span className="sg-field-v">{f.v}</span>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="sg-gauge-wrap">
          <div className="sg-gauge-head">
            <span>Lots</span>
            {/* Avancement du montage : le pourcentage se lit d'un coup d'œil,
                le détail « x / y » reste à côté pour le chiffre exact. */}
            <span className="sg-mono">
              <b className={`sg-gauge-pct${posed >= total ? " is-done" : posed > 0 ? " is-wip" : ""}`}>
                {Math.round((posed / total) * 100)} %
              </b>
              {posed} / {total} posés
            </span>
          </div>
          <div className="sg-gauge">
            {Array.from({ length: total }).map((_, i) => (
              <i key={i} className={i < posed ? "is-done" : ""} />
            ))}
          </div>
        </div>
      )}
      <div className="sg-detail-actions">
        <Link href={`/projet/${p.id}?mode=${mode}`} className="sg-btn-primary" onClick={onClose}>
          Ouvrir le projet
        </Link>
      </div>
    </div>
  );
}

/* ── L'hôte, monté une fois par page ─────────────────────────────────────── */

export function SignalPreviewHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Échap ferme l'aperçu, comme les autres surfaces de l'app.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSignalPreview(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!mounted || !state) return null;
  return (
    <aside className="sg-detail is-open" role="complementary" aria-label="Aperçu du projet">
      <SignalPreviewCard project={state.project} mode={state.mode} onClose={closeSignalPreview} />
    </aside>
  );
}
