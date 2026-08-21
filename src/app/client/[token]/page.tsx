"use client";

import { useEffect, useState, use } from "react";
import {
  MapPin,
  Calendar,
  Users,
  Package,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Hash,
  ClipboardList,
  LogIn,
  Phone,
  Box,
  Ruler,
  MessageSquare,
  FileText,
  ExternalLink,
  WifiOff,
  CheckCircle2,
  Info,
  PenLine,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";

interface PublicProject {
  id: string;
  ofrTM: string;
  projet: string;
  nomChantier: string;
  adresseChantier: string;
  dateMontage: string | null;
  collaborateurs: string;
  etatCMD: string;
  fournisseurs: string[];
  seriesCabines: string[];
  nbCabines: number | null;
  photosAvant: { name: string; url: string }[];
  photosMontage: { name: string; url: string }[];
  nomsCabines: string;
  dateMontageEnd: string | null;
  cmdTM: string;
  cmdTMUsine: string;
  cmdGrossiste: string;
  cmdFournisseurs: string;
  servCmdFournisseurs: string;
}

/** Parse "Cab1:J-001 (Divera) | Cab2:J-002..." → Map<numéro, nom> */
function parseCabineNames(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) return map;
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const val = m[2].trim();
    if (val) map.set(parseInt(m[1], 10), val);
  }
  return map;
}

/** Extrait le numéro de cabine depuis le nom du fichier (.Cab3. → 3, sinon 0 = général) */
function extractCabNum(name: string): number {
  const m = (name || "").match(/\.Cab(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

/** Détecte le type de photo depuis le préfixe du nom de fichier */
function detectPhotoType(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.startsWith("avant") || n.includes("avant_intervention") || n.includes("avant intervention")) return "Avant montage";
  if (n.startsWith("apres") || n.includes("apres_intervention") || n.includes("après intervention")) return "Après montage";
  if (n.startsWith("demontage") || n.includes("démontage")) return "Démontage";
  if (n.startsWith("montage") || n.includes("montage terminé") || n.includes("montage_termine")) return "Montage terminé";
  if (n.startsWith("qrcode") || n.includes("qr")) return "QR Code";
  return "";
}

interface CollabData {
  contactsRDV: string;
  emplacementCabine: string;
  nbCartons: number | null;
  photosCartons: { name: string; url: string }[];
  documentsMontagee: { name: string; url: string }[];
  commentairesMontages: string;
  cmdGrossiste: string;
  cmdFournisseurs: string;
  servCmdFournisseurs: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "En attente de mesures":     { bg: "bg-cyan-100",   text: "text-cyan-800" },
  "Cabines mesurées":          { bg: "bg-teal-100",   text: "text-teal-800" },
  "OFR envoyées sans mesures": { bg: "bg-violet-100", text: "text-violet-800" },
  "Cabines en CMD":            { bg: "bg-gray-100",   text: "text-gray-700" },
  "Cabines à recevoir":        { bg: "bg-yellow-100", text: "text-yellow-800" },
  "Livraison partielle":       { bg: "bg-orange-100", text: "text-orange-800" },
  "Cabine à aller chercher":   { bg: "bg-blue-100",   text: "text-blue-800" },
  "Récéptionné - RDV à fixer": { bg: "bg-blue-100",   text: "text-blue-800" },
  "RDV - fixé":                { bg: "bg-green-100",  text: "text-green-800" },
  "RDV - Attendre news":       { bg: "bg-purple-100", text: "text-purple-800" },
  "Montage partiel":           { bg: "bg-amber-100",  text: "text-amber-800" },
  "Soucis montage":            { bg: "bg-red-100",    text: "text-red-800" },
  "Annulé":                    { bg: "bg-red-100",    text: "text-red-700" },
  "Terminé":                   { bg: "bg-emerald-100", text: "text-emerald-800" },
};

function formatDate(dateStr: string | null, endDateStr?: string | null): string {
  if (!dateStr) return "Non planifié";

  const fmt = (s: string) => {
    const d = new Date(s);
    const datePart = d.toLocaleDateString("fr-CH", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    if (s.includes("T")) {
      const timePart = d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
      return `${datePart} à ${timePart}`;
    }
    return datePart;
  };

  const start = fmt(dateStr);
  if (!endDateStr) return start;

  // Plage de dates : "mardi, 09 juin 2026 → mercredi, 10 juin 2026"
  const end = fmt(endDateStr);
  return `${start} → ${end}`;
}

function getStatusStyle(status: string) {
  return STATUS_COLORS[status] || { bg: "bg-gray-100", text: "text-gray-700" };
}

function extractTmNumber(projet: string): string | null {
  const match = projet.match(/TM-\d+/);
  return match ? match[0] : null;
}

export default function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  /** null = vérification en cours, false = non connecté, true = connecté */
  const [isCollab, setIsCollab] = useState<boolean | null>(null);
  /** Données sensibles chargées uniquement si collaborateur authentifié */
  const [collabData, setCollabData] = useState<CollabData | null>(null);
  /** État du pré-cache hors-ligne : null=inconnu, false=en cours, true=prêt */
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null);
  // Lightbox : photos à afficher en grand (null = fermé), index courant.
  const [zoomPhotos, setZoomPhotos] = useState<{ name: string; url: string }[] | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  // Contact RDV : masqué par défaut, révélé au clic sur la cellule.
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/client/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Projet introuvable");
          return;
        }
        const data = await res.json();
        setProject(data);
        fetch(`/api/client/${token}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view" }),
        }).catch(() => {});
      } catch {
        setError("Erreur de connexion");
      } finally {
        setLoading(false);
      }
    }

    async function checkAuth() {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        setIsCollab(res.ok);
      } catch {
        setIsCollab(false);
      }
    }

    fetchProject();
    checkAuth();
  }, [token]);

  // Pré-cache automatique pour consultation hors-ligne dès que les données sont chargées
  useEffect(() => {
    if (!project?.id || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const urlsToCache = [
      `/api/client/${token}`,
      `/api/projects/${project.id}`,
    ];

    const sw = navigator.serviceWorker.controller;
    if (!sw) return;

    setOfflineReady(false);

    // Écoute la confirmation du SW que le pré-cache est terminé
    const handler = (evt: MessageEvent) => {
      if (evt.data?.type === "PRECACHE_DONE") setOfflineReady(true);
    };
    navigator.serviceWorker.addEventListener("message", handler);

    sw.postMessage({ type: "PRECACHE_URLS", urls: urlsToCache });

    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [project?.id, token]);

  // Charger les données collaborateur dès que l'authentification est confirmée
  useEffect(() => {
    if (!isCollab || !project?.id) return;
    fetch(`/api/projects/${project.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.id) return;
        const docs: { name: string; url: string }[] = data.documentsMontagee || [];
        setCollabData({
          contactsRDV: data.contactsRDV || "",
          emplacementCabine: data.emplacementCabine || "",
          nbCartons: data.nbCartons ?? null,
          photosCartons: Array.isArray(data.photosCartons) ? data.photosCartons : [],
          // Remplace les URLs Notion (expirantes) par des URLs proxy stables
          documentsMontagee: docs.map((doc, i) => ({
            name: doc.name,
            url: `/api/file-proxy?${new URLSearchParams({
              projectId: project.id,
              field: "Documents pour Montage",
              index: String(i),
            })}`,
          })),
          commentairesMontages: data.commentairesMontages || "",
          cmdGrossiste: data.cmdGrossiste || "",
          cmdFournisseurs: data.cmdFournisseurs || "",
          servCmdFournisseurs: data.servCmdFournisseurs || "",
        });

        // Pré-cache les documents via le SW dès qu'ils sont connus
        if (docs.length > 0 && "serviceWorker" in navigator) {
          const sw = navigator.serviceWorker.controller;
          if (sw) {
            const docUrls = docs.map((_, i) =>
              `/api/file-proxy?${new URLSearchParams({
                projectId: project.id,
                field: "Documents pour Montage",
                index: String(i),
              })}`
            );
            sw.postMessage({ type: "PRECACHE_URLS", urls: docUrls });
          }
        }
      })
      .catch(() => {});
  }, [isCollab, project?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement du projet...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Projet introuvable</h2>
          <p className="text-sm text-gray-500">{error || "Ce lien n'est plus valide ou le projet a été supprimé."}</p>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(project.etatCMD);
  const allPhotos = [...(project.photosAvant || []), ...(project.photosMontage || [])];
  const tmNumber = project.ofrTM || extractTmNumber(project.projet);

  // Grouper les photos par numéro de cabine
  const cabineNamesMap = parseCabineNames(project.nomsCabines || "");
  const photosByCabin = new Map<number, { name: string; url: string }[]>();
  for (const photo of allPhotos) {
    const cab = extractCabNum(photo.name || "");
    if (!photosByCabin.has(cab)) photosByCabin.set(cab, []);
    photosByCabin.get(cab)!.push(photo);
  }
  // Trier : cabines numérotées d'abord (1, 2, 3…), photos sans cabine (0) en dernier
  const cabinEntries = [...photosByCabin.entries()].sort(([a], [b]) =>
    a === 0 ? 1 : b === 0 ? -1 : a - b
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <img src="/icons/logo-app.png?v=4" alt="TM" className="w-10 h-10 rounded-xl shadow-lg" />
          <div className="flex-1">
            <h1 className="font-semibold text-lg leading-tight">Suivi de votre projet</h1>
            <p className="text-blue-200 text-xs">TM Douche Montage</p>
          </div>
          {/* Indicateur hors-ligne */}
          {offlineReady === true && (
            <div className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1" title="Consultable sans réseau">
              <WifiOff className="w-3 h-3 text-green-300" />
              <span className="text-[10px] font-medium text-green-300">Hors-ligne OK</span>
            </div>
          )}
          {offlineReady === false && (
            <div className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1">
              <Loader2 className="w-3 h-3 text-blue-200 animate-spin" />
              <span className="text-[10px] text-blue-200">Sauvegarde…</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Titre + statut */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 leading-snug">{project.projet}</h2>
              {project.nomChantier && project.nomChantier !== project.projet && (
                <p className="text-sm text-gray-500 mt-0.5">{project.nomChantier}</p>
              )}
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium shrink-0 mt-0.5 ${statusStyle.bg} ${statusStyle.text}`}>
              {project.etatCMD}
            </span>
          </div>
        </div>

        {/* Détails publics */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">

          {/* N° Projet */}
          {tmNumber && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Hash className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">N° Projet</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{tmNumber}</p>
                </div>
              </div>
              <div className="border-t border-gray-100" />
            </>
          )}

          {/* Adresse */}
          {project.adresseChantier && (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Adresse</p>
                <p className="text-sm text-gray-800 mt-0.5">{project.adresseChantier}</p>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Date prévue</p>
              <p className="text-sm text-gray-800 mt-0.5">{formatDate(project.dateMontage, project.dateMontageEnd)}</p>
            </div>
          </div>

          {/* Technicien */}
          {project.collaborateurs && (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Technicien</p>
                <p className="text-sm text-gray-800 mt-0.5">{project.collaborateurs}</p>
              </div>
            </div>
          )}

          {/* Cabines */}
          {(project.nbCabines && project.nbCabines > 0) && (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Cabines</p>
                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                  <p className="text-sm text-gray-800">
                    {project.nbCabines} cabine{project.nbCabines > 1 ? "s" : ""}
                    {project.fournisseurs.length > 0 && (
                      <span className="text-gray-400"> — {project.fournisseurs.join(", ")}</span>
                    )}
                  </p>
                  {project.seriesCabines && project.seriesCabines.length > 0 && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {project.seriesCabines.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rapport PDF */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <a
            // client=1 : rapport SANS les heures d'arrivée/départ (version client).
            href={`/api/pdf/${project.id}?client=1`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fetch(`/api/client/${token}/track`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "pdf" }),
              }).catch(() => {});
            }}
            className="flex items-center gap-3 w-full group"
          >
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0 group-hover:bg-red-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-600">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-red-700 transition-colors">Consulter le rapport de montage</p>
              <p className="text-xs text-gray-400">Ouvrir le rapport PDF</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-300 group-hover:text-red-400 transition-colors">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </a>
        </div>

        {/* ── Accès Collaborateur ─────────────────────────────────────────── */}
        <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors ${
          isCollab ? "bg-[#1e3a5f] border-[#1e3a5f]" : "bg-white border-gray-100"
        }`}>
          {isCollab === null ? (
            <div className="flex items-center gap-3 p-5">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              <p className="text-sm text-gray-400">Vérification accès...</p>
            </div>
          ) : isCollab ? (
            <>
              {/* En-tête section collaborateur */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Espace collaborateur</p>
                  <p className="text-xs text-blue-200">Accès rapide au chantier</p>
                </div>
              </div>

              {/* ── Cartes de navigation rapide (4 cellules) ── */}
              <div className="px-4 pb-4 grid grid-cols-4 gap-2.5">

                {/* 1 — Détails du projet */}
                <a
                  href={`/projet/${project.id}`}
                  className="bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl p-3 flex flex-col items-center gap-2 text-center transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <Info className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-white leading-tight">Détails projet</span>
                </a>

                {/* 1b — Contact RDV (toujours visible ; le contact se révèle au clic) */}
                <button
                  type="button"
                  onClick={() => setShowContact((v) => !v)}
                  aria-expanded={showContact}
                  className={`rounded-2xl p-3 flex flex-col items-center gap-2 text-center transition-all active:scale-95 ${showContact ? "bg-white/25" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-white leading-tight">Contact RDV</span>
                </button>

                {/* 2 — Mesures & Documents */}
                <a
                  href={`/client/${token}/mesures`}
                  className="bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl p-3 flex flex-col items-center gap-2 text-center transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <Ruler className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-white leading-tight">Mesures</span>
                </a>

                {/* 3 — Saisir le rapport (accès direct à la liste des cabines) */}
                <a
                  href={`/projet/${project.id}`}
                  onClick={() => {
                    try { sessionStorage.setItem(`tm-goto-${project.id}`, "cabines"); } catch {}
                  }}
                  className="bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl p-3 flex flex-col items-center gap-2 text-center transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <PenLine className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-white leading-tight">Saisir rapport</span>
                </a>
              </div>

              {/* Contact RDV révélé au clic sur la cellule ci-dessus */}
              {showContact && (
                <div className="px-4 pb-4 -mt-1">
                  <div className="bg-white/10 rounded-xl p-3">
                    <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Contact RDV</p>
                    {collabData?.contactsRDV ? (
                      <p className="text-sm text-white font-medium leading-snug whitespace-pre-line">{collabData.contactsRDV}</p>
                    ) : (
                      <p className="text-sm text-blue-200/70 italic leading-snug">Non renseigné</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Infos rapides : Emplacement / Nb. cartons / État cartons (3 cellules égales) ── */}
              {collabData && (collabData.emplacementCabine || collabData.nbCartons != null || collabData.photosCartons.length > 0) && (
                <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                  {collabData.emplacementCabine && (
                    <div className="bg-white/10 rounded-xl p-3 min-h-[72px] flex flex-col justify-center">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Emplacement</p>
                      <p className="text-sm text-white font-medium leading-snug">{collabData.emplacementCabine}</p>
                    </div>
                  )}
                  {collabData.nbCartons != null && (
                    <div className="bg-white/10 rounded-xl p-3 min-h-[72px] flex flex-col justify-center">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Nb. cartons</p>
                      <p className="text-base text-white font-semibold leading-snug">{collabData.nbCartons}</p>
                    </div>
                  )}
                  {collabData.photosCartons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setZoomPhotos(collabData.photosCartons); setZoomIndex(0); }}
                      className="relative rounded-xl overflow-hidden bg-white/10 min-h-[72px] group active:scale-[0.98] transition-transform"
                      title="Voir l'état des cartons réceptionnés"
                    >
                      <img
                        src={thumbnailUrl(collabData.photosCartons[0].url, 300)}
                        alt="État des cartons réceptionnés"
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/30" />
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold text-white uppercase tracking-wide drop-shadow">État cartons</span>
                      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[9px] font-medium text-white bg-black/45 px-1.5 py-0.5 rounded-full">
                        <ImageIcon className="w-2.5 h-2.5" />
                        {collabData.photosCartons.length > 1 ? collabData.photosCartons.length : "Agrandir"}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* ── Références TM (OFR / CMD / CMD Usine) — 3 cellules égales, toujours affichées ── */}
              <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° OFR TM</p>
                  <p className={`text-sm font-semibold leading-snug ${project.ofrTM ? "text-white" : "text-blue-200/50"}`}>{project.ofrTM || "—"}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° CMD TM</p>
                  <p className={`text-sm font-semibold leading-snug ${project.cmdTM ? "text-white" : "text-blue-200/50"}`}>{project.cmdTM || "—"}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° CMD TM - Usine</p>
                  <p className={`text-sm font-semibold leading-snug ${project.cmdTMUsine ? "text-white" : "text-blue-200/50"}`}>{project.cmdTMUsine || "—"}</p>
                </div>
              </div>

              {/* ── Références commandes (lues depuis l'API publique — pas de 2ème fetch) ── */}
              {(project.cmdGrossiste || project.cmdFournisseurs || project.servCmdFournisseurs) && (
                <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                  {project.cmdGrossiste && (
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° CMD Grossiste</p>
                      <p className="text-sm text-white font-semibold leading-snug">{project.cmdGrossiste}</p>
                    </div>
                  )}
                  {project.cmdFournisseurs && (
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° CMD Fourn.</p>
                      <p className="text-sm text-white font-semibold leading-snug">{project.cmdFournisseurs}</p>
                    </div>
                  )}
                  {project.servCmdFournisseurs && (
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° Serv. CMD Fourn.</p>
                      <p className="text-sm text-white font-semibold leading-snug">{project.servCmdFournisseurs}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Commentaires Montages (info interne, via collabData authentifié) ── */}
              {collabData?.commentairesMontages && (
                <div className="px-4 pb-4">
                  <div className="bg-white/10 rounded-xl p-3">
                    <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Commentaires Montages</p>
                    <p className="text-sm text-white font-medium leading-snug whitespace-pre-line">{collabData.commentairesMontages}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Non connecté */
            <a href={`/login?redirect=/client/${token}`} className="flex items-center gap-3 p-5 w-full group">
              <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">
                <LogIn className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <p className="text-sm font-semibold text-gray-700 group-hover:text-blue-700 transition-colors">Accès collaborateur</p>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors ml-auto">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </a>
          )}
        </div>

        {/* Photos — groupées par lot/cabine */}
        {allPhotos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setPhotosOpen(!photosOpen)} className="w-full flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-800">Photos du projet</p>
                  <p className="text-xs text-gray-400">
                    {allPhotos.length} photo{allPhotos.length > 1 ? "s" : ""}
                    {cabinEntries.length > 1 && ` · ${cabinEntries.filter(([c]) => c > 0).length} lot${cabinEntries.filter(([c]) => c > 0).length > 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
              {photosOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {photosOpen && (
              <div className="px-4 pb-5 space-y-5">
                {cabinEntries.map(([cabNum, photos]) => {
                  const cabName = cabNum > 0
                    ? (cabineNamesMap.get(cabNum) || `Cabine ${cabNum}`)
                    : "Général";
                  return (
                    <div key={cabNum}>
                      {/* En-tête du lot */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                          <Box className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">{cabName}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">
                          {photos.length} photo{photos.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      {/* Grille de photos */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {photos.map((photo, idx) => {
                          const typeLabel = detectPhotoType(photo.name || "");
                          return (
                            <a key={idx} href={photo.url} target="_blank" rel="noopener noreferrer"
                              className="block rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow relative group">
                              <img
                                src={thumbnailUrl(photo.url, 400)}
                                alt={photo.name || `Photo ${idx + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-28 object-cover"
                              />
                              {typeLabel && (
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                                  <span className="text-[9px] font-medium text-white/90">{typeLabel}</span>
                                </div>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <p className="text-xs text-gray-400">Powered by <span className="font-medium text-gray-500">TM Rapport Services</span></p>
          <p className="text-xs text-gray-300 mt-1">TM Douche Montage | Champs-Lovat 13 Box n.16, 1400 Yverdon</p>
        </div>
      </footer>

      {/* Lightbox : état des cartons réceptionnés agrandi (clic sur la miniature) */}
      {zoomPhotos && zoomPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomPhotos(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={zoomPhotos[zoomIndex].url}
            alt={zoomPhotos[zoomIndex].name || "État des cartons réceptionnés"}
            className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoomPhotos(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          {zoomPhotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setZoomIndex((i) => (i - 1 + zoomPhotos.length) % zoomPhotos.length); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setZoomIndex((i) => (i + 1) % zoomPhotos.length); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors"
                aria-label="Photo suivante"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
                {zoomIndex + 1} / {zoomPhotos.length}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
