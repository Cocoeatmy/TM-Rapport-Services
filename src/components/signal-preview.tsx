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
import { X, Phone, FileText, MessageSquare, Package, AlertTriangle } from "lucide-react";
import { supplierLogo } from "@/lib/supplier-logos";
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

/** Rend cliquables les numéros de téléphone d'un texte libre : on appelle
 *  depuis l'aperçu, sans ouvrir le projet. */
function linkifyTel(texte: string) {
  const parts = texte.split(/(\+?\d[\d\s.\/-]{7,}\d)/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <span key={i}>{part}</span>;
    const num = part.replace(/[^\d+]/g, "");
    return <a key={i} href={`tel:${num}`} className="sg-pv-tel">{part.trim()}</a>;
  });
}

/* ── La fiche elle-même ──────────────────────────────────────────────────── */

export function SignalPreviewCard({
  project: p,
  mode = "dashboard",
  onClose,
}: { project: Project; mode?: string; onClose?: () => void }) {
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
        {onClose && (
          <button type="button" className="sg-unpin" title="Fermer l'aperçu" aria-label="Fermer l'aperçu"
            onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <h3 className="sg-detail-title">{p.projet || "Sans nom"}</h3>
      {p.adresseChantier && <p className="sg-detail-addr">{p.adresseChantier}</p>}
      <div className="sg-fields">
        {([
          { k: "N° OFR TM", v: p.ofrTM || "—" },
          { k: "N° FOURN.", v: p.servCmdFournisseurs || p.cmdFournisseurs || p.servMesuresFournisseurs || "—" },
          { k: "NB. CABINES", v: String(total) },
          { k: "EMPLACEMENT", v: p.emplacementCabine || "—" },
          /* Tant que rien n'est arrivé, la prévision est la seule date connue :
             la taire laisserait croire qu'on ignore quand la marchandise vient. */
          ...((p.arrivageTM || p.arrivageGrossiste)
            ? [{ k: "ARRIVAGE", v: (p.arrivageTM || p.arrivageGrossiste || "").split("T")[0] }]
            : [{ k: "LIVRAISON PRÉVUE", v: (p.previsionLivraison || "").split("T")[0] || "—" }]),
          { k: "COLLABORATEUR", v: p.collaborateurs || "—" },
          /* Plusieurs séries s'empilent au lieu de se suivre : côte à côte,
             la seconde était coupée par la largeur de la case, et l'on ne
             savait même pas qu'il y en avait une. */
          { k: "SÉRIE", v: (p.seriesCabines || []).filter(Boolean) },
          { k: "CARTONS", v: p.nbCartons != null ? String(p.nbCartons) : "—" },
          { k: "PERS. MONTAGE", v: (p as any).nbCollaborateursMontage ? String((p as any).nbCollaborateursMontage) : "—" },
        ] as { k: string; v: string | string[] }[]).map((f) => {
          const liste = Array.isArray(f.v) ? f.v : null;
          return (
            <div key={f.k} className="sg-field">
              <span className="sg-field-k">{f.k}</span>
              {liste
                ? (
                  <span className="sg-field-v is-multi">
                    {liste.length > 0 ? liste.map((x) => <i key={x}>{x}</i>) : "—"}
                  </span>
                )
                : <span className="sg-field-v">{f.v}</span>}
            </div>
          );
        })}
      </div>

      {/* Fournisseurs — logo quand la maison en a un, nom sinon. */}
      {(p.fournisseurs || []).length > 0 && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><Package className="w-3.5 h-3.5" /> Fournisseur</span>
          <div className="sg-pv-fourns">
            {(p.fournisseurs || []).map((f: string) => {
              const logo = supplierLogo(f);
              return (
                <span key={f} className="sg-pv-fourn" title={f}>
                  {logo
                    ? <img src={logo.src} alt={f} style={logo.white ? { filter: "invert(1)" } : undefined} />
                    : null}
                  <b>{f}</b>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Contacts : numéros cliquables, pour appeler sans ouvrir le projet. */}
      {(p.contactsRDV || p.contacts) && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><Phone className="w-3.5 h-3.5" /> Contacts</span>
          {[
            { t: "Pour RDV", v: p.contactsRDV },
            { t: "Projet", v: p.contacts },
          ].filter((c) => String(c.v || "").trim()).map((c) => (
            <div key={c.t} className="sg-pv-contact">
              <span className="sg-pv-contact-t">{c.t}</span>
              <span className="sg-pv-contact-v">{linkifyTel(String(c.v))}</span>
            </div>
          ))}
        </div>
      )}

      {/* Documents pour Montage */}
      {((p as any).documentsMontagee || []).length > 0 && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><FileText className="w-3.5 h-3.5" /> Documents pour Montage</span>
          <div className="sg-pv-docs">
            {((p as any).documentsMontagee as { name: string; url: string }[]).map((d, i) => (
              <a key={`${d.url}-${i}`} href={d.url} target="_blank" rel="noopener noreferrer"
                className="sg-pv-doc" title={d.name}>
                {d.name || `Document ${i + 1}`}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Signalements encore ouverts : un projet peut rester à traiter pour une
          pièce manquante ou un défaut, même montage terminé. */}
      <SignalementsOuverts projectId={p.id} />

      {/* Journal des échanges — modifiable ici : c'est juste après l'appel
          qu'on note le résultat, sans avoir à ouvrir le projet. */}
      <JournalEditable project={p} />
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



/** Pièces manquantes et défauts encore ouverts sur ce projet. Ils vivent hors
 *  Notion (saisis dans l'app) : on les lit à la demande, par projet. */
function SignalementsOuverts({ projectId }: { projectId: string }) {
  const [etat, setEtat] = useState<{ pieces: number; defauts: number } | null>(null);

  useEffect(() => {
    let vivant = true;
    setEtat(null);
    Promise.all([
      fetch(`/api/pieces?projectId=${encodeURIComponent(projectId)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/defauts?projectId=${encodeURIComponent(projectId)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([pieces, defauts]) => {
      if (!vivant) return;
      const ouvertes = (Array.isArray(pieces) ? pieces : [])
        .filter((x: any) => !(x.status === "recu" || x.resolved === true)).length;
      const ouverts = (Array.isArray(defauts) ? defauts : [])
        .filter((x: any) => !(x.status === "resolu" || x.resolved === true)).length;
      setEtat({ pieces: ouvertes, defauts: ouverts });
    });
    return () => { vivant = false; };
  }, [projectId]);

  // Rien à signaler : on n'encombre pas la fiche d'une section vide.
  if (!etat || (etat.pieces === 0 && etat.defauts === 0)) return null;

  return (
    <div className="sg-pv-bloc">
      <span className="sg-pv-titre"><AlertTriangle className="w-3.5 h-3.5" /> Signalements ouverts</span>
      {etat.pieces > 0 && (
        <span className="sg-pv-sig is-piece">
          <i /> Pièces manquantes <b>{etat.pieces}</b>
        </span>
      )}
      {etat.defauts > 0 && (
        <span className="sg-pv-sig is-defaut">
          <i /> Défauts ouverts <b>{etat.defauts}</b>
        </span>
      )}
    </div>
  );
}

/** Journal des échanges, modifiable depuis l'aperçu. Écrit dans le MÊME champ
 *  Notion que la page projet ; la fiche affichée est mise à jour sur place. */
function JournalEditable({ project }: { project: Project }) {
  const initial = String((project as any).journalEchanges || "");
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(initial);
  const [enreg, setEnreg] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => { setTexte(initial); setEdition(false); setErreur(false); }, [project.id, initial]);

  const enregistrer = async () => {
    setEnreg(true);
    setErreur(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalEchanges: texte }),
      });
      if (!res.ok) throw new Error("PATCH");
      // La fiche vit dans le store : on la met à jour pour refléter la saisie.
      (project as any).journalEchanges = texte;
      emit();
      setEdition(false);
    } catch {
      setErreur(true);
    } finally {
      setEnreg(false);
    }
  };

  return (
    <div className="sg-pv-bloc">
      <span className="sg-pv-titre">
        <MessageSquare className="w-3.5 h-3.5" /> Journal des échanges
        {!edition && (
          <button type="button" className="sg-pv-edit" onClick={() => setEdition(true)}>
            {initial.trim() ? "Modifier" : "Ajouter"}
          </button>
        )}
      </span>
      {edition ? (
        <>
          <textarea
            className="sg-pv-textarea"
            value={texte}
            autoFocus
            rows={5}
            placeholder="25.09.26 - 16h31 : appel sans réponse…"
            onChange={(e) => setTexte(e.target.value)}
          />
          <div className="sg-pv-actions">
            <button type="button" className="sg-pv-btn" disabled={enreg}
              onClick={() => { setTexte(initial); setEdition(false); setErreur(false); }}>
              Annuler
            </button>
            <button type="button" className="sg-pv-btn is-primary" disabled={enreg} onClick={enregistrer}>
              {enreg ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          {erreur && <span className="sg-pv-erreur">Enregistrement impossible — réessayez.</span>}
        </>
      ) : initial.trim() ? (
        <p className="sg-pv-journal">{initial}</p>
      ) : (
        <p className="sg-pv-vide">Aucun échange noté.</p>
      )}
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
