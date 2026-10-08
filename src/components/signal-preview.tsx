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
import { offlineFetch } from "@/lib/offline";
import { useMontantsOFR, francsCourts } from "@/lib/montants-ofr";

/* ── Mini-store module : les lignes publient, l'hôte s'abonne ────────────── */

/** Une ligne de l'aperçu en liste : le projet, et ce qu'on veut en dire. */
export type LigneApercu = { project: Project; detail?: string; fait?: boolean };

type PreviewState =
  | { kind: "projet"; project: Project; mode: string; epingle: boolean }
  | { kind: "liste"; titre: string; sous?: string; lignes: LigneApercu[]; epingle: boolean }
  | null;

let current: PreviewState = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Ouvre l'aperçu sur ce projet (appelé depuis le clic sur le n° TM). */
export function openSignalPreview(project: Project, mode = "dashboard") {
  annulerSurvol();
  annulerFermeture();
  current = { kind: "projet", project, mode, epingle: true };
  emit();
}

/**
 * Ouverture au SURVOL : la fiche suit le curseur et disparaît avec lui.
 *
 * Ouverte comme un clic, elle restait affichée une fois le curseur parti et
 * il fallait aller cliquer la croix — pour un simple coup d'œil, deux gestes
 * de trop. Un clic sur le numéro l'ÉPINGLE : elle ne se referme alors plus
 * toute seule, et l'on peut y lire ou y faire défiler ce qu'on veut.
 */
export function ouvrirApercuSurvol(project: Project, mode = "dashboard") {
  annulerFermeture();
  current = { kind: "projet", project, mode, epingle: false };
  emit();
}

/* Fermeture différée : en quittant le numéro on passe forcément par le vide
   avant d'atteindre la fiche. Fermer sur-le-champ la rendrait inatteignable. */
let fermeture: ReturnType<typeof setTimeout> | null = null;

export function annulerFermeture(): void {
  if (fermeture) { clearTimeout(fermeture); fermeture = null; }
}

/** Le curseur quitte le numéro : on referme, sauf si la fiche est épinglée. */
export function fermerApercuSurvol(delai = 220): void {
  annulerSurvol();
  if (!current || current.epingle) return;
  annulerFermeture();
  fermeture = setTimeout(() => { fermeture = null; closeSignalPreview(); }, delai);
}

/**
 * Ouvre l'aperçu sur PLUSIEURS projets : les compteurs du tableau de bord
 * (« 3/5 posées », « 4/10 mesurées ») disent un total sans dire de quoi il est
 * fait ; la liste répond à « lesquels ? » sans quitter la page.
 */
export function openSignalListe(titre: string, lignes: LigneApercu[], sous?: string, epingle = true) {
  annulerSurvol();
  annulerFermeture();
  if (lignes.length === 0) return;
  current = { kind: "liste", titre, sous, lignes, epingle };
  emit();
}

/* Survol : un aperçu qui s'ouvrirait au premier pixel franchi clignoterait
   quand le curseur ne fait que traverser. On attend un court instant, et l'on
   abandonne si le curseur est déjà reparti. */
let minuterie: ReturnType<typeof setTimeout> | null = null;

export function survolApercu(ouvre: () => void, delai = 170) {
  annulerSurvol();
  minuterie = setTimeout(() => { minuterie = null; ouvre(); }, delai);
}

export function annulerSurvol() {
  if (minuterie) { clearTimeout(minuterie); minuterie = null; }
}

/** Ferme l'aperçu. */
export function closeSignalPreview() {
  annulerSurvol();
  annulerFermeture();
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
  /* Les listes ne transportent plus les pièces jointes (voir useFicheComplete).
     L'aperçu va les chercher ; tant qu'elles n'arrivent pas, il affiche ce que
     la liste lui a donné. */
  const complete = useFicheComplete(p.id);
  const { montant } = useMontantsOFR();
  const montantOFR = montant(p.ofrTM);
  const avecPieces: any = complete || p;
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
          /* Montant de l'offre bexio. La case n'existe que pour le
             propriétaire des accès : chez les autres, le montant n'est même
             pas chargé, et la fiche a une case de moins. */
          ...(montantOFR != null ? [{ k: "MONTANT OFR", v: `CHF ${francsCourts(montantOFR)}` }] : []),
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
      <ContactsProjet project={p} />


      {/* Mesures : ce que le client a dit et ce qu'il a envoyé. Réservé aux
          rendez-vous de mesures — sur un montage, ces deux champs parlent
          d'une étape déjà passée et n'aident plus personne. */}
      {mode.startsWith("mesures") && String(p.commentairesMesures || "").trim() && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><MessageSquare className="w-3.5 h-3.5" /> Commentaires mesures</span>
          <p className="sg-pv-journal">{linkifyTel(String(p.commentairesMesures))}</p>
        </div>
      )}
      {mode.startsWith("mesures") && (avecPieces.documentsMesures || []).length > 0 && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><FileText className="w-3.5 h-3.5" /> Documents pour prise de mesures</span>
          <div className="sg-pv-docs">
            {(avecPieces.documentsMesures || []).map((d: { name: string; url: string }, i: number) => (
              <a key={`${d.url}-${i}`} href={d.url} target="_blank" rel="noopener noreferrer"
                className="sg-pv-doc" title={d.name}>
                {d.name || `Document ${i + 1}`}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Documents pour Montage */}
      {(avecPieces.documentsMontagee || []).length > 0 && (
        <div className="sg-pv-bloc">
          <span className="sg-pv-titre"><FileText className="w-3.5 h-3.5" /> Documents pour Montage</span>
          <div className="sg-pv-docs">
            {(avecPieces.documentsMontagee as { name: string; url: string }[]).map((d, i) => (
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



/* ── Contacts du projet ──────────────────────────────────────────────────
   Fixer un rendez-vous demande de savoir QUI appeler. Les listes ne portent
   que les noms d'entreprises ; les personnes, leurs téléphones et leurs
   adresses vivent dans des relations que seule la lecture d'une fiche
   résout. On les lit donc à la demande, une fois par projet.

   Les contacts restent groupés par famille — le grossiste avec son contact,
   le sanitaire avec le sien : un numéro sorti de sa maison ne dit plus à
   quel titre on appelle. Une famille vide ne s'affiche pas. */

/** Ce qu'on garde d'une fiche déjà lue : inutile de la relire au survol suivant. */
const ficheLue = new Map<string, Project>();

type Personne = { nom: string; tel: string; mail: string };

/** Personnes d'une famille : les fiches résolues d'abord, les noms sinon. */
function personnes(details: any[] | undefined, noms: string[] | undefined): Personne[] {
  if (details && details.length > 0) {
    return details
      .map((c) => ({ nom: String(c?.name || "").trim(), tel: String(c?.phone || "").trim(), mail: String(c?.email || "").trim() }))
      .filter((c) => c.nom || c.tel || c.mail)
      .map((c) => ({ ...c, nom: c.nom || c.tel || c.mail }));
  }
  /* Avant que la fiche complète ne soit lue, la liste ne connaît que des
     noms : les montrer tout de suite vaut mieux qu'un vide qui se remplit. */
  return (noms || []).map((n) => String(n || "").trim()).filter(Boolean)
    .map((nom) => ({ nom, tel: "", mail: "" }));
}

/**
 * La fiche complète d'un chantier, lue une fois et partagée.
 *
 * Les listes ne transportent plus les pièces jointes : à elles seules, elles
 * pesaient douze mégaoctets sur « tous les projets », pour un écran qui
 * n'affiche que des noms et des dates. L'aperçu, lui, en a besoin — il va donc
 * les chercher à l'ouverture, comme il le faisait déjà pour les contacts.
 */
function useFicheComplete(projectId: string): Project | null {
  const [fiche, setFiche] = useState<Project | null>(() => ficheLue.get(projectId) || null);

  useEffect(() => {
    const deja = ficheLue.get(projectId);
    setFiche(deja || null);
    if (deja) return;
    let vivant = true;
    /* L'aperçu suit le survol : sans ce délai, traverser la liste à la
       souris déclencherait une lecture par ligne franchie. */
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !d.id) return;
          ficheLue.set(projectId, d);
          if (vivant) setFiche(d);
        })
        .catch(() => {});
    }, 300);
    return () => { vivant = false; clearTimeout(t); };
  }, [projectId]);

  return fiche && fiche.id === projectId ? fiche : null;
}

function ContactsProjet({ project }: { project: Project }) {
  const fiche = useFicheComplete(project.id);
  const p: any = fiche || project;

  const familles = [
    { titre: "Grossiste", societes: p.grossistesNames, gens: personnes(p.contactsGrossisteDetails, p.contactsProjetNames) },
    { titre: "Sanitaire", societes: p.sanitaireNames, gens: personnes(p.contactsSanitaireDetails, undefined) },
    { titre: "DT", societes: p.dtNames, gens: personnes(p.contactsDTDetails, undefined) },
    { titre: "Architecte", societes: p.architecteNames, gens: personnes(p.contactsArchitecteDetails, undefined) },
    { titre: "Clients finaux", societes: [], gens: personnes(p.contactsClientsFinauxDetails, undefined) },
    { titre: "Locataires", societes: [], gens: personnes(p.contactsLocatairesDetails, undefined) },
    { titre: "Autres", societes: [], gens: personnes(p.contactsAutresDetails, undefined) },
  ]
    .map((f) => ({ ...f, societes: (f.societes || []).map((s: any) => String(s || "").trim()).filter(Boolean) }))
    .filter((f) => f.societes.length > 0 || f.gens.length > 0);

  /* Les deux champs libres de Notion complètent les relations sans les
     remplacer : on les garde tant qu'ils servent. */
  const libres = [
    { t: "Pour RDV", v: String(p.contactsRDV || "").trim() },
  ].filter((c) => c.v);

  if (familles.length === 0 && libres.length === 0) return null;

  return (
    <div className="sg-pv-bloc">
      <span className="sg-pv-titre"><Phone className="w-3.5 h-3.5" /> Contacts</span>
      {familles.map((f) => (
        <div key={f.titre} className="sg-pv-fam">
          <span className="sg-pv-fam-t">{f.titre}</span>
          {f.societes.map((s: string) => <span key={s} className="sg-pv-soc">{s}</span>)}
          {f.gens.map((g, i) => (
            <span key={`${g.nom}-${i}`} className="sg-pv-pers">
              <b>{g.nom}</b>
              {g.tel && <a href={`tel:${g.tel.replace(/[^\d+]/g, "")}`} className="sg-pv-tel">{g.tel}</a>}
              {g.mail && <a href={`mailto:${g.mail}`} className="sg-pv-mail">{g.mail}</a>}
            </span>
          ))}
        </div>
      ))}
      {libres.map((c) => (
        <div key={c.t} className="sg-pv-contact">
          <span className="sg-pv-contact-t">{c.t}</span>
          <span className="sg-pv-contact-v">{linkifyTel(c.v)}</span>
        </div>
      ))}
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

/**
 * Ce qu'on vient d'écrire, par projet.
 *
 * La liste du tableau de bord se rafraîchit toutes les quelques secondes et
 * peut servir une copie antérieure à notre écriture — le cache serveur n'a
 * pas encore vu passer le PATCH. Sans cette mémoire, la note disparaissait à
 * l'écran puis revenait dix secondes plus tard, ce qui donne toutes les
 * raisons de croire qu'elle est perdue.
 */
const journalEcrit = new Map<string, string>();

/** Journal des échanges, modifiable depuis l'aperçu. Écrit dans le MÊME champ
 *  Notion que la page projet ; la fiche affichée est mise à jour sur place. */
function JournalEditable({ project }: { project: Project }) {
  const distant = String((project as any).journalEchanges || "");
  const ecrit = journalEcrit.get(project.id);
  /* Notre écriture l'emporte tant que le serveur ne l'a pas rattrapée : une
     valeur plus ancienne qui repasse par la liste ne doit pas la recouvrir. */
  const affiche = ecrit !== undefined ? ecrit : distant;

  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(affiche);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    if (ecrit !== undefined && ecrit === distant) journalEcrit.delete(project.id);
  }, [project.id, ecrit, distant]);

  /* On ne referme QUE sur changement de projet. Refermer parce que la fiche
     s'est rafraîchie effaçait la saisie en cours — c'est ce qui avait fait
     perdre une note entière. */
  useEffect(() => { setEdition(false); setEchec(false); }, [project.id]);

  const ouvrir = () => { setBrouillon(affiche); setEchec(false); setEdition(true); };

  /**
   * Enregistrement immédiat : la note s'affiche dès le clic, l'écriture part
   * derrière. Attendre Notion pour refermer faisait patienter plusieurs
   * secondes sur un geste qui n'a aucune raison de bloquer quoi que ce soit.
   */
  const enregistrer = () => {
    const valeur = brouillon;
    journalEcrit.set(project.id, valeur);
    (project as any).journalEchanges = valeur;
    setEdition(false);
    setEchec(false);
    emit();
    offlineFetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journalEchanges: valeur }),
    })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); })
      .catch(() => {
        /* Le texte reste à l'écran et dans le brouillon : on signale l'échec,
           on ne reprend jamais ce qui a été écrit. */
        setBrouillon(valeur);
        setEchec(true);
      });
  };

  return (
    <div className="sg-pv-bloc">
      <span className="sg-pv-titre">
        <MessageSquare className="w-3.5 h-3.5" /> Journal des échanges
        {!edition && (
          <button type="button" className="sg-pv-edit" onClick={ouvrir}>
            {affiche.trim() ? "Modifier" : "Ajouter"}
          </button>
        )}
      </span>
      {edition ? (
        <>
          <textarea
            className="sg-pv-textarea"
            value={brouillon}
            autoFocus
            rows={5}
            placeholder="25.09.26 - 16h31 : appel sans réponse…"
            onChange={(e) => setBrouillon(e.target.value)}
          />
          <div className="sg-pv-actions">
            <button type="button" className="sg-pv-btn"
              onClick={() => { setBrouillon(affiche); setEdition(false); setEchec(false); }}>
              Annuler
            </button>
            <button type="button" className="sg-pv-btn is-primary" onClick={enregistrer}>
              Enregistrer
            </button>
          </div>
        </>
      ) : affiche.trim() ? (
        <p className="sg-pv-journal">{affiche}</p>
      ) : (
        <p className="sg-pv-vide">Aucun échange noté.</p>
      )}
      {echec && (
        <span className="sg-pv-erreur">
          Pas encore envoyé — la note est gardée et repartira toute seule.{" "}
          <button type="button" className="sg-pv-edit" onClick={enregistrer}>Réessayer</button>
        </span>
      )}
    </div>
  );
}

/* ── L'aperçu en liste ────────────────────────────────────── */

/**
 * Même cadre que la fiche d'un projet, mais plusieurs projets à la suite :
 * chaque ligne mène au projet, le numéro TM en tête pour le reconnaître, et à
 * droite l'avancement du jour (« 2/3 ») en vert quand il est complet.
 */
export function SignalListeCard({
  titre,
  sous,
  lignes,
  onClose,
}: { titre: string; sous?: string; lignes: LigneApercu[]; onClose?: () => void }) {
  return (
    <div className="sg-detail-in">
      <div className="sg-detail-top">
        <span className="sg-state bg-gray-100 text-gray-700">{lignes.length} projet{lignes.length > 1 ? "s" : ""}</span>
        {onClose && (
          <button type="button" className="sg-unpin" title="Fermer l'aperçu" aria-label="Fermer l'aperçu"
            onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <h3 className="sg-detail-title">{titre}</h3>
      {sous && <p className="sg-detail-addr">{sous}</p>}
      <div className="sg-apl">
        {lignes.map((l) => (
          <Link key={l.project.id} href={`/projet/${l.project.id}?mode=dashboard`}
            className="sg-apl-row" onClick={closeSignalPreview}>
            <span className="sg-apl-haut">
              <span className="sg-apl-tm">{l.project.ofrTM || "—"}</span>
              {l.detail && (
                <span className={`sg-apl-det${l.fait ? " is-done" : ""}`}>{l.detail}</span>
              )}
            </span>
            <span className="sg-apl-nom">{l.project.projet || "Sans nom"}</span>
            {l.project.adresseChantier && (
              <span className="sg-apl-adr">{l.project.adresseChantier}</span>
            )}
          </Link>
        ))}
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
    <>
      {/* Fond assombri — téléphone seulement (masqué en CSS au-delà). Sur
          grand écran, la fiche est une colonne à côté de la liste ; sur
          téléphone elle couvre l'écran, et il faut pouvoir en sortir en
          touchant à côté, comme partout ailleurs dans l'app. */}
      <button type="button" className="sg-detail-fond" aria-label="Fermer l'aperçu"
        onClick={closeSignalPreview} />
      {/* Survoler la fiche elle-même la garde ouverte : on veut pouvoir y
          lire une adresse ou un numéro de téléphone sans qu'elle s'efface. */}
      <aside className="sg-detail is-open" role="complementary" aria-label="Aperçu du projet"
        onMouseEnter={annulerFermeture}
        onMouseLeave={() => fermerApercuSurvol(120)}>
        {state.kind === "liste" ? (
          <SignalListeCard titre={state.titre} sous={state.sous} lignes={state.lignes}
            onClose={closeSignalPreview} />
        ) : (
          <SignalPreviewCard project={state.project} mode={state.mode} onClose={closeSignalPreview} />
        )}
      </aside>
    </>
  );
}
