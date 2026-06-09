"use client";

import { useEffect, useState, use } from "react";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Ruler,
  FileText,
  ExternalLink,
  MessageSquare,
  Wrench,
  LogIn,
} from "lucide-react";

interface MesuresData {
  /** Nom du projet */
  projet: string;
  /** ID Notion (pour les proxies de fichiers) */
  id: string;
  /** Commentaires sur les prises de mesures */
  commentairesMesures: string;
  /** Commentaires spécifiques au montage */
  commentairesMontages: string;
  /** Documents de montage (plans, instructions…) */
  documentsMontagee: { name: string; url: string }[];
  /** Documents de mesures (PDF plans, cotes…) */
  documentsMesures: { name: string; url: string }[];
}

export default function MesuresPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<MesuresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollab, setIsCollab] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // 1. Récupère l'ID projet depuis l'API publique (token → projectId)
        const pubRes = await fetch(`/api/client/${token}`);
        if (!pubRes.ok) {
          const d = await pubRes.json();
          setError(d.error || "Projet introuvable");
          setLoading(false);
          return;
        }
        const pub = await pubRes.json();
        const projectId: string = pub.id;

        // 2. Vérifie si l'utilisateur est connecté (collab)
        const authRes = await fetch("/api/auth", { cache: "no-store" });
        const authenticated = authRes.ok;
        setIsCollab(authenticated);

        if (!authenticated) {
          setLoading(false);
          return;
        }

        // 3. Charge les données complètes (commentaires + documents)
        const fullRes = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        if (!fullRes.ok) {
          setError("Impossible de charger les données");
          setLoading(false);
          return;
        }
        const full = await fullRes.json();

        // 4. Construit les URLs proxy stables (Notion URLs expirent)
        const proxyUrl = (field: string, index: number) =>
          `/api/file-proxy?${new URLSearchParams({ projectId, field, index: String(index) })}`;

        const docsMontagee: { name: string; url: string }[] =
          (full.documentsMontagee || []).map((doc: any, i: number) => ({
            name: doc.name || `Document ${i + 1}`,
            url: proxyUrl("Documents pour Montage", i),
          }));

        const docsMesures: { name: string; url: string }[] =
          (full.documentsMesures || []).map((doc: any, i: number) => ({
            name: doc.name || `Document ${i + 1}`,
            url: proxyUrl("Documents pour prise de mesures", i),
          }));

        setData({
          projet: pub.projet || "",
          id: projectId,
          commentairesMesures: full.commentairesMesures || "",
          commentairesMontages: full.commentairesMontages || "",
          documentsMontagee: docsMontagee,
          documentsMesures: docsMesures,
        });
      } catch {
        setError("Erreur de connexion");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // ── Chargement ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement des mesures...</p>
        </div>
      </div>
    );
  }

  // ── Non connecté ─────────────────────────────────────────────────────────────
  if (isCollab === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <LogIn className="w-10 h-10 text-blue-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Accès réservé aux collaborateurs</h2>
          <p className="text-sm text-gray-500 mb-6">Connectez-vous pour consulter les mesures et documents de chantier.</p>
          <a
            href={`/login?redirect=/client/${token}/mesures`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#16304f] transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  // ── Erreur ───────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Erreur</h2>
          <p className="text-sm text-gray-500">{error || "Données introuvables."}</p>
        </div>
      </div>
    );
  }

  const hasDocuments = data.documentsMontagee.length > 0 || data.documentsMesures.length > 0;

  // ── Rendu principal ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">

      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <a
            href={`/client/${token}`}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </a>
          <div className="flex-1">
            <h1 className="font-semibold text-lg leading-tight">Mesures & Documents</h1>
            <p className="text-blue-200 text-xs truncate">{data.projet}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Ruler className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── Commentaires mesures ── */}
        {data.commentairesMesures ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <Ruler className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Commentaires mesures</p>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {data.commentairesMesures}
            </p>
          </div>
        ) : null}

        {/* ── Commentaires montage ── */}
        {data.commentairesMontages ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Commentaires montage</p>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {data.commentairesMontages}
            </p>
          </div>
        ) : null}

        {/* ── Documents montage ── */}
        {data.documentsMontagee.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Documents montage</p>
                <p className="text-xs text-gray-400">{data.documentsMontagee.length} document{data.documentsMontagee.length > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="space-y-2">
              {data.documentsMontagee.map((doc, i) => (
                <a
                  key={i}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 group-hover:border-indigo-300 transition-colors">
                    <FileText className="w-4 h-4 text-gray-500 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <span className="text-sm text-gray-700 group-hover:text-indigo-700 transition-colors flex-1 truncate font-medium">
                    {doc.name}
                  </span>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Documents mesures ── */}
        {data.documentsMesures.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Documents de mesures</p>
                <p className="text-xs text-gray-400">{data.documentsMesures.length} document{data.documentsMesures.length > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="space-y-2">
              {data.documentsMesures.map((doc, i) => (
                <a
                  key={i}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-teal-50 border border-gray-100 hover:border-teal-200 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 group-hover:border-teal-300 transition-colors">
                    <FileText className="w-4 h-4 text-gray-500 group-hover:text-teal-600 transition-colors" />
                  </div>
                  <span className="text-sm text-gray-700 group-hover:text-teal-700 transition-colors flex-1 truncate font-medium">
                    {doc.name}
                  </span>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-teal-500 shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Aucun contenu */}
        {!data.commentairesMesures && !data.commentairesMontages && !hasDocuments && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune information de mesures disponible pour ce projet.</p>
          </div>
        )}

      </main>

      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <p className="text-xs text-gray-400">Powered by <span className="font-medium text-gray-500">TM Rapport Services</span></p>
        </div>
      </footer>
    </div>
  );
}
