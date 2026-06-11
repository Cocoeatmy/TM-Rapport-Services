"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shield,
  Loader2,
  Package,
  AlertTriangle,
  Search,
  Image as ImageIcon,
  X,
  Send,
  MessageCircle,
} from "lucide-react";
import { thumbnailUrl, fullUrl } from "@/lib/image-url";

interface CommentItem {
  user: string;
  message: string;
  timestamp: number;
}

interface PieceItem {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl: string;
  status: string;
  timestamp: number;
  comments?: CommentItem[];
}

interface DefautItem {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: string;
  timestamp: number;
  comments?: CommentItem[];
}

const PIECE_STATUSES = ["demande", "commande", "recu"] as const;
const DEFAUT_STATUSES = ["signale", "en-cours", "resolu"] as const;

const pieceStatusLabel: Record<string, string> = {
  demande: "Demande",
  commande: "Commandé",
  recu: "Reçu",
};

const defautStatusLabel: Record<string, string> = {
  signale: "Signalé",
  "en-cours": "En cours",
  resolu: "Résolu",
};

const pieceStatusColor: Record<string, string> = {
  demande: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  commande: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  recu: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const defautStatusColor: Record<string, string> = {
  signale: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "en-cours": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  resolu: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export default function PiecesDefautsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tab, setTab] = useState<"pieces" | "defauts">("pieces");

  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [defauts, setDefauts] = useState<DefautItem[]>([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});

  const formatRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "maintenant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `il y a ${days}j`;
    return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };

  const sendComment = async (id: string, type: "pieces" | "defauts") => {
    const message = commentInputs[id]?.trim();
    if (!message) return;
    setSendingComment((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch(`/api/${type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, comment: message }),
      });
      setCommentInputs((prev) => ({ ...prev, [id]: "" }));
      if (type === "pieces") fetchPieces();
      else fetchDefauts();
    } catch {
      // ignore
    } finally {
      setSendingComment((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Auth check
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.push("/");
          return;
        }
        setIsAdmin(true);
      });
  }, [router]);

  // Fetch data
  const fetchPieces = useCallback(() => {
    fetch("/api/pieces")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPieces(data);
      })
      .catch(() => {});
  }, []);

  const fetchDefauts = useCallback(() => {
    fetch("/api/defauts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDefauts(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Load from Notion project fields (primary) + kv-store (fallback)
    Promise.all([
      fetch("/api/signalements").then((r) => r.json()).catch(() => ({ pieces: [], defauts: [] })),
      fetch("/api/pieces").then((r) => r.json()).catch(() => []),
      fetch("/api/defauts").then((r) => r.json()).catch(() => []),
    ])
      .then(([notionData, kvPieces, kvDefauts]) => {
        // Merge Notion + kv-store, deduplicate by description
        const allPieces = [...(notionData.pieces || [])];
        const seenPieces = new Set(allPieces.map((p: any) => `${p.projectId}-${p.description}`));
        (Array.isArray(kvPieces) ? kvPieces : []).forEach((p: any) => {
          const key = `${p.projectId}-${p.description}`;
          if (!seenPieces.has(key)) { allPieces.push(p); seenPieces.add(key); }
        });

        const allDefauts = [...(notionData.defauts || [])];
        const seenDefauts = new Set(allDefauts.map((d: any) => `${d.projectId}-${d.description}`));
        (Array.isArray(kvDefauts) ? kvDefauts : []).forEach((d: any) => {
          const key = `${d.projectId}-${d.description}`;
          if (!seenDefauts.has(key)) { allDefauts.push(d); seenDefauts.add(key); }
        });

        setPieces(allPieces);
        setDefauts(allDefauts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Status update handlers
  const updatePieceStatus = async (id: string, status: string) => {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await fetch("/api/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      fetchPieces();
    }
  };

  const updateDefautStatus = async (id: string, status: string) => {
    setDefauts((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    try {
      await fetch("/api/defauts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      fetchDefauts();
    }
  };

  // Filtering
  const filteredPieces = pieces.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.projectName?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.user?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredDefauts = defauts.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.projectName?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.typesLabel?.toLowerCase().includes(q) ||
        d.user?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (ts: number) => {
    if (!ts) return "---";
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const currentStatuses = tab === "pieces" ? PIECE_STATUSES : DEFAUT_STATUSES;
  const currentStatusLabel = tab === "pieces" ? pieceStatusLabel : defautStatusLabel;

  return (
    <div className="w-full px-4 sm:px-6 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => router.push("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 dark:text-gray-100" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-600 shrink-0" />
            Pièces &amp; Défauts
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestion des pièces manquantes et défauts signalés
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 glass-tabs p-1.5 rounded-2xl max-w-xs">
        <button
          onClick={() => {
            setTab("pieces");
            setStatusFilter("all");
          }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
            tab === "pieces"
              ? "glass-tab-active text-[#1e3a5f] dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <Package className="w-4 h-4" />
          Pièces ({pieces.length})
        </button>
        <button
          onClick={() => {
            setTab("defauts");
            setStatusFilter("all");
          }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
            tab === "defauts"
              ? "glass-tab-active text-[#1e3a5f] dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Défauts ({defauts.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Status filter pills */}
        <button
          onClick={() => setStatusFilter("all")}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            statusFilter === "all"
              ? "glass-btn text-white"
              : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          }`}
        >
          Tous
        </button>
        {currentStatuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              statusFilter === s
                ? "glass-btn text-white"
                : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
            }`}
          >
            {currentStatusLabel[s]}
          </button>
        ))}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-full glass-card border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* Content */}
      {tab === "pieces" ? (
        <div className="space-y-3">
          {filteredPieces.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-gray-400 dark:text-gray-500">
              Aucune pièce manquante trouvée
            </div>
          ) : (
            filteredPieces.map((piece) => (
              <div
                key={piece.id}
                className="glass-card rounded-2xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                      {piece.projectName || "Sans projet"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {piece.user} &middot; {formatDate(piece.timestamp)}
                    </p>
                  </div>
                  <select
                    value={piece.status}
                    onChange={(e) => updatePieceStatus(piece.id, e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      pieceStatusColor[piece.status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {PIECE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {pieceStatusLabel[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {piece.description}
                </p>
                {piece.reference && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Réf: <span className="font-medium text-gray-700 dark:text-gray-300">{piece.reference}</span>
                  </p>
                )}
                {piece.photoUrl && (
                  <button
                    onClick={() => setLightboxUrl(piece.photoUrl)}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Voir la photo
                  </button>
                )}
                {/* Comment thread */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                  {(piece.comments || []).length > 0 && (
                    <div className="space-y-2 mb-2">
                      {(piece.comments || []).map((c, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <MessageCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs">
                              <span className="font-medium text-gray-700 dark:text-gray-300">{c.user}</span>
                              <span className="text-gray-400 dark:text-gray-500 ml-1.5">{formatRelativeTime(c.timestamp)}</span>
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{c.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ajouter un commentaire..."
                      value={commentInputs[piece.id] || ""}
                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [piece.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") sendComment(piece.id, "pieces"); }}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <button
                      onClick={() => sendComment(piece.id, "pieces")}
                      disabled={!commentInputs[piece.id]?.trim() || sendingComment[piece.id]}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDefauts.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-gray-400 dark:text-gray-500">
              Aucun défaut trouvé
            </div>
          ) : (
            filteredDefauts.map((defaut) => (
              <div
                key={defaut.id}
                className="glass-card rounded-2xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                      {defaut.projectName || "Sans projet"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {defaut.user} &middot; {formatDate(defaut.timestamp)}
                    </p>
                  </div>
                  <select
                    value={defaut.status}
                    onChange={(e) => updateDefautStatus(defaut.id, e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      defautStatusColor[defaut.status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {DEFAUT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {defautStatusLabel[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {defaut.typesLabel && (
                  <div className="flex flex-wrap gap-1">
                    {(defaut.types || []).map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {defaut.description}
                </p>
                {defaut.photoUrls && defaut.photoUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-1">
                    {defaut.photoUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxUrl(url)}
                        className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={thumbnailUrl(url, 128)}
                          alt={`Défaut photo ${i + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                {/* Comment thread */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                  {(defaut.comments || []).length > 0 && (
                    <div className="space-y-2 mb-2">
                      {(defaut.comments || []).map((c, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <MessageCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs">
                              <span className="font-medium text-gray-700 dark:text-gray-300">{c.user}</span>
                              <span className="text-gray-400 dark:text-gray-500 ml-1.5">{formatRelativeTime(c.timestamp)}</span>
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{c.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ajouter un commentaire..."
                      value={commentInputs[defaut.id] || ""}
                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [defaut.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") sendComment(defaut.id, "defauts"); }}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <button
                      onClick={() => sendComment(defaut.id, "defauts")}
                      disabled={!commentInputs[defaut.id]?.trim() || sendingComment[defaut.id]}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={fullUrl(lightboxUrl, 1600)}
            alt="Photo agrandie"
            loading="eager"
            decoding="async"
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
