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
}

interface CollabData {
  contactsRDV: string;
  emplacementCabine: string;
  nbCartons: number | null;
  documentsMontagee: { name: string; url: string }[];
  commentairesMontages: string;
  cmdFournisseurs: string;
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString("fr-CH", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  if (dateStr.includes("T")) {
    const timePart = d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
    return `${datePart} à ${timePart}`;
  }
  return datePart;
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
          cmdFournisseurs: data.cmdFournisseurs || "",
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
              <p className="text-sm text-gray-800 mt-0.5">{formatDate(project.dateMontage)}</p>
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
            href={`/api/pdf/${project.id}`}
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
              {/* Bouton rapport */}
              <a href={`/projet/${project.id}`} className="flex items-center gap-3 p-5 w-full group">
                <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0 group-hover:bg-white/25 transition-colors">
                  <ClipboardList className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Saisir le rapport de montage</p>
                  <p className="text-xs text-blue-200">Heures, photos, rapport</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white/50 group-hover:text-white transition-colors">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>

              {/* ── Infos collaborateur ── */}
              {collabData ? (
                <div className="px-4 pb-4 space-y-2">
                  <div className="border-t border-white/20 pt-4 mb-3">
                    <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">Informations du chantier</p>
                  </div>

                  {/* Grille 2 colonnes pour les infos courtes */}
                  <div className="grid grid-cols-2 gap-2">

                    {/* Emplacement cabine */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Emplacement cabine</p>
                      <p className="text-sm text-white font-medium leading-snug">
                        {collabData.emplacementCabine || <span className="text-white/40 font-normal">—</span>}
                      </p>
                    </div>

                    {/* Nb. de cartons */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Nb. de cartons</p>
                      <p className="text-sm text-white font-medium">
                        {collabData.nbCartons !== null ? collabData.nbCartons : <span className="text-white/40 font-normal">—</span>}
                      </p>
                    </div>

                    {/* N° CMD fournisseur */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">N° CMD fournisseur</p>
                      <p className="text-sm text-white font-medium leading-snug break-all">
                        {collabData.cmdFournisseurs || <span className="text-white/40 font-normal">—</span>}
                      </p>
                    </div>

                    {/* Contact RDV */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Contact RDV</p>
                      <p className="text-sm text-white font-medium leading-snug">
                        {collabData.contactsRDV || <span className="text-white/40 font-normal">—</span>}
                      </p>
                    </div>
                  </div>

                  {/* Commentaire montage — pleine largeur */}
                  {collabData.commentairesMontages && (
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-1">Commentaire montage</p>
                      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                        {collabData.commentairesMontages}
                      </p>
                    </div>
                  )}

                  {/* Mesures — clicable si documents */}
                  <div className={`rounded-xl p-3 ${collabData.documentsMontagee.length > 0 ? "bg-white/20" : "bg-white/10"}`}>
                    <p className="text-[10px] font-medium text-blue-200 uppercase tracking-wide mb-2">Mesures / Documents montage</p>
                    {collabData.documentsMontagee.length === 0 ? (
                      <p className="text-sm text-white/40">—</p>
                    ) : (
                      <div className="space-y-1.5">
                        {collabData.documentsMontagee.map((doc, i) => (
                          <a
                            key={i}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 group/doc"
                          >
                            <FileText className="w-4 h-4 text-blue-200 shrink-0" />
                            <span className="text-sm text-white underline underline-offset-2 decoration-white/40 group-hover/doc:decoration-white transition-colors truncate">
                              {doc.name || `Document ${i + 1}`}
                            </span>
                            <ExternalLink className="w-3 h-3 text-white/50 shrink-0 group-hover/doc:text-white transition-colors" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CTA — Démarrer le rapport */}
                  <a
                    href={`/projet/${project.id}`}
                    className="flex items-center justify-center gap-2 w-full mt-2 py-3 px-4 bg-white text-[#1e3a5f] rounded-xl font-semibold text-sm hover:bg-blue-50 active:bg-blue-100 transition-colors shadow-sm"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Démarrer rapport de montage
                  </a>
                </div>
              ) : (
                <div className="px-5 pb-5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                  <p className="text-xs text-white/50">Chargement des informations...</p>
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

        {/* Photos */}
        {allPhotos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setPhotosOpen(!photosOpen)} className="w-full flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-800">Photos du projet</p>
                  <p className="text-xs text-gray-400">{allPhotos.length} photo{allPhotos.length > 1 ? "s" : ""}</p>
                </div>
              </div>
              {photosOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {photosOpen && (
              <div className="px-5 pb-5 grid grid-cols-2 gap-2">
                {allPhotos.map((photo, idx) => (
                  <a key={idx} href={photo.url} target="_blank" rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
                    <img src={thumbnailUrl(photo.url, 400)} alt={photo.name || `Photo ${idx + 1}`}
                      loading="lazy" decoding="async" className="w-full h-32 object-cover" />
                  </a>
                ))}
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
    </div>
  );
}
