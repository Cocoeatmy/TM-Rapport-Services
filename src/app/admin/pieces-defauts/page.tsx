"use client";

/**
 * Pièces & Défauts — traitement des signalements.
 *
 * Refonte pour le volume réel : une centaine de signalements ne se lisent pas
 * en cartes empilées. Ici tout tient en lignes d'une hauteur, REGROUPÉES PAR
 * CHANTIER, repliées par défaut. On déplie une ligne pour voir la description
 * complète, les photos et le fil de commentaires ; le statut se change sans
 * rien déplier.
 *
 * Deux leviers contre le défilement : le regroupement par chantier (un même
 * chantier concentre souvent plusieurs signalements) et le filtre « masquer
 * les traités », actif d'emblée — ce qui est reçu ou résolu n'a plus besoin
 * d'être vu.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Shield, Loader2, Package, AlertTriangle, Search, Image as ImageIcon,
  X, Send, MessageCircle, ChevronDown, ChevronRight, ExternalLink, Check,
} from "lucide-react";
import { thumbnailUrl, fullUrl } from "@/lib/image-url";

interface CommentItem { user: string; message: string; timestamp: number }

/** Modèle commun aux pièces et aux défauts, pour un rendu unique. */
interface Signalement {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference?: string;
  typesLabel?: string;
  photos: string[];
  status: string;
  timestamp: number;
  comments: CommentItem[];
}

const PIECE_STATUSES = ["demande", "commande", "recu"] as const;
const DEFAUT_STATUSES = ["signale", "en-cours", "resolu"] as const;

const LABELS: Record<string, string> = {
  demande: "Demande", commande: "Commandé", recu: "Reçu",
  signale: "Signalé", "en-cours": "En cours", resolu: "Résolu",
};

const COLORS: Record<string, string> = {
  demande: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  commande: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  recu: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  signale: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "en-cours": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  resolu: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

/** Statuts qui signifient « c'est réglé ». */
const CLOS = new Set(["recu", "resolu"]);

export default function PiecesDefautsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tab, setTab] = useState<"pieces" | "defauts">("pieces");
  const [pieces, setPieces] = useState<Signalement[]>([]);
  const [defauts, setDefauts] = useState<Signalement[]>([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  /** Actif d'emblée : on ouvre la page pour traiter ce qui reste, pas pour
   *  relire ce qui est fait. */
  const [masquerTraites, setMasquerTraites] = useState(true);

  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [chantiersReplies, setChantiersReplies] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});

  /* ── Chargement ─────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((data) => {
      if (data.user?.role !== "admin") { router.push("/"); return; }
      setIsAdmin(true);
    });
  }, [router]);

  const normalise = (raw: any, type: "pieces" | "defauts"): Signalement => ({
    id: raw.id,
    projectId: raw.projectId,
    projectName: raw.projectName || "Sans projet",
    user: raw.user || "—",
    description: raw.description || "",
    reference: raw.reference,
    typesLabel: raw.typesLabel,
    photos: type === "pieces"
      ? [raw.photoUrl, ...(raw.photoUrls || [])].filter(Boolean)
      : (raw.photoUrls || []).filter(Boolean),
    status: raw.status || (type === "pieces" ? "demande" : "signale"),
    timestamp: raw.timestamp || 0,
    comments: raw.comments || [],
  });

  const charger = useCallback(() => {
    return Promise.all([
      fetch("/api/signalements").then((r) => r.json()).catch(() => ({ pieces: [], defauts: [] })),
      fetch("/api/pieces").then((r) => r.json()).catch(() => []),
      fetch("/api/defauts").then((r) => r.json()).catch(() => []),
    ]).then(([notionData, kvPieces, kvDefauts]) => {
      // Notion d'abord, complété par le magasin local ; dédoublonné par
      // projet + description, comme avant.
      const fusion = (base: any[], extra: any[], type: "pieces" | "defauts") => {
        const out = [...(base || [])];
        const vus = new Set(out.map((x: any) => `${x.projectId}-${x.description}`));
        (Array.isArray(extra) ? extra : []).forEach((x: any) => {
          const cle = `${x.projectId}-${x.description}`;
          if (!vus.has(cle)) { out.push(x); vus.add(cle); }
        });
        return out.map((x) => normalise(x, type)).sort((a, b) => b.timestamp - a.timestamp);
      };
      setPieces(fusion(notionData.pieces, kvPieces, "pieces"));
      setDefauts(fusion(notionData.defauts, kvDefauts, "defauts"));
    });
  }, []);

  useEffect(() => { charger().finally(() => setLoading(false)); }, [charger]);

  /* ── Actions ────────────────────────────────────────────────────────── */
  const changerStatut = async (id: string, status: string) => {
    const type = tab;
    const maj = (l: Signalement[]) => l.map((x) => (x.id === id ? { ...x, status } : x));
    if (type === "pieces") setPieces(maj); else setDefauts(maj);
    try {
      await fetch(`/api/${type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch { charger(); }
  };

  const envoyerCommentaire = async (id: string) => {
    const message = commentInputs[id]?.trim();
    if (!message) return;
    setSendingComment((p) => ({ ...p, [id]: true }));
    try {
      await fetch(`/api/${tab}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, comment: message }),
      });
      setCommentInputs((p) => ({ ...p, [id]: "" }));
      await charger();
    } catch {
      // silencieux : le champ garde le texte, l'utilisateur peut réessayer
    } finally {
      setSendingComment((p) => ({ ...p, [id]: false }));
    }
  };

  /* ── Filtrage et regroupement ───────────────────────────────────────── */
  const liste = tab === "pieces" ? pieces : defauts;
  const statuts = tab === "pieces" ? PIECE_STATUSES : DEFAUT_STATUSES;

  const filtres = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liste.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (masquerTraites && statusFilter === "all" && CLOS.has(s.status)) return false;
      if (!q) return true;
      return [s.projectName, s.description, s.reference, s.typesLabel, s.user]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [liste, statusFilter, searchQuery, masquerTraites]);

  const groupes = useMemo(() => {
    const m = new Map<string, Signalement[]>();
    filtres.forEach((s) => {
      const cle = s.projectName || "Sans projet";
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle)!.push(s);
    });
    // Le chantier au signalement le plus récent d'abord.
    return [...m.entries()].sort((a, b) =>
      Math.max(...b[1].map((x) => x.timestamp)) - Math.max(...a[1].map((x) => x.timestamp)));
  }, [filtres]);

  const nbOuverts = (l: Signalement[]) => l.filter((s) => !CLOS.has(s.status)).length;

  const dateCourte = (ts: number) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };
  const tempsRelatif = (ts: number) => {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return "maintenant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    if (j < 7) return `il y a ${j} j`;
    return new Date(ts).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" });
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalOuverts = nbOuverts(liste);

  return (
    <div className="w-full px-3 sm:px-5 py-4 pb-10 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} aria-label="Retour"
          className="w-9 h-9 rounded-xl glass-card flex items-center justify-center hover:bg-white/80 transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-200 flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-500" /> Pièces &amp; Défauts
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {totalOuverts} à traiter sur {liste.length} {tab === "pieces" ? "pièces" : "défauts"}
          </p>
        </div>
      </div>

      {/* Barre d'outils — reste visible pendant le défilement */}
      <div className="sticky top-[var(--header-h,60px)] z-20 -mx-3 sm:-mx-5 px-3 sm:px-5 py-2 mb-3
                      bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {([["pieces", "Pièces", Package, pieces], ["defauts", "Défauts", AlertTriangle, defauts]] as const).map(
            ([id, label, Icon, src]) => (
              <button key={id} onClick={() => { setTab(id); setStatusFilter("all"); }}
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
                  tab === id
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
                <span className="opacity-70">{nbOuverts(src)}/{src.length}</span>
              </button>
            ))}

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un chantier, une pièce, une référence…"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setStatusFilter("all")}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              statusFilter === "all"
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700"}`}>
            Tous
          </button>
          {statuts.map((s) => {
            const n = liste.filter((x) => x.status === s).length;
            return (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                  statusFilter === s
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    : `${COLORS[s]} border-transparent`}`}>
                {LABELS[s]} {n}
              </button>
            );
          })}
          {statusFilter === "all" && (
            <button onClick={() => setMasquerTraites((v) => !v)}
              title="Reçu et résolu : déjà traités"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                masquerTraites
                  ? "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700"
                  : "bg-gray-100 dark:bg-slate-700 text-gray-500 border-transparent"}`}>
              <span className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
                masquerTraites ? "bg-[#1e3a5f] border-[#1e3a5f] text-white" : "border-gray-300 dark:border-slate-500"}`}>
                {masquerTraites && <Check className="w-2.5 h-2.5" />}
              </span>
              Masquer les traités
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {filtres.length} signalement{filtres.length > 1 ? "s" : ""} · {groupes.length} chantier{groupes.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Liste groupée par chantier */}
      {groupes.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-gray-400">
          {masquerTraites && statusFilter === "all"
            ? "Rien à traiter — tout est reçu ou résolu."
            : "Aucun signalement ne correspond."}
        </div>
      ) : (
        <div className="space-y-2">
          {groupes.map(([chantier, items]) => {
            const replie = chantiersReplies.has(chantier);
            const ouvertsN = nbOuverts(items);
            return (
              <div key={chantier} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                {/* Bande chantier */}
                <button
                  onClick={() => setChantiersReplies((prev) => {
                    const n = new Set(prev);
                    if (n.has(chantier)) n.delete(chantier); else n.add(chantier);
                    return n;
                  })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left bg-gray-50 dark:bg-slate-700/40 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border-l-[3px] border-l-[#1e3a5f]">
                  {replie ? <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{chantier}</span>
                  {items[0]?.projectId && (
                    <Link href={`/projet/${items[0].projectId}?mode=dashboard`} onClick={(e) => e.stopPropagation()}
                      title="Ouvrir le projet"
                      className="shrink-0 text-gray-400 hover:text-blue-600">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] font-mono text-gray-500 dark:text-gray-400">
                    {ouvertsN > 0 ? `${ouvertsN} à traiter · ` : ""}{items.length}
                  </span>
                </button>

                {/* Lignes */}
                {!replie && items.map((s) => {
                  const deplie = ouverts.has(s.id);
                  return (
                    <div key={s.id} className="border-t border-gray-100 dark:border-slate-700/60">
                      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                        <button
                          onClick={() => setOuverts((prev) => {
                            const n = new Set(prev);
                            if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                            return n;
                          })}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left">
                          {deplie ? <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                          <span className="text-[13px] text-gray-800 dark:text-gray-200 truncate">
                            {s.description || s.typesLabel || "Sans description"}
                          </span>
                          {s.reference && (
                            <span className="shrink-0 text-[11px] font-mono text-gray-400">{s.reference}</span>
                          )}
                          {s.photos.length > 0 && <ImageIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                          {s.comments.length > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-gray-400">
                              <MessageCircle className="w-3 h-3" />{s.comments.length}
                            </span>
                          )}
                        </button>
                        <span className="shrink-0 hidden sm:block text-[11px] text-gray-400 w-32 truncate text-right">
                          {s.user} · {dateCourte(s.timestamp)}
                        </span>
                        {/* Le statut se change sans rien déplier. */}
                        <select
                          value={s.status}
                          onChange={(e) => changerStatut(s.id, e.target.value)}
                          className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300 ${COLORS[s.status] || "bg-gray-100 text-gray-700"}`}>
                          {statuts.map((v) => <option key={v} value={v}>{LABELS[v]}</option>)}
                        </select>
                      </div>

                      {/* Détail déplié */}
                      {deplie && (
                        <div className="px-3 pb-3 pl-8 space-y-2 bg-gray-50/60 dark:bg-slate-700/20">
                          {s.typesLabel && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{s.typesLabel}</p>
                          )}
                          <p className="text-[13px] text-gray-700 dark:text-gray-300 whitespace-pre-line">
                            {s.description || "—"}
                          </p>
                          {s.photos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {s.photos.map((url, i) => (
                                <button key={`${url}-${i}`} onClick={() => setLightboxUrl(fullUrl(url))}
                                  className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={thumbnailUrl(url)} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          {s.comments.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {s.comments.map((c, i) => (
                                <div key={i} className="flex gap-2 items-start">
                                  <MessageCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{c.user}</span>
                                    <span className="text-gray-400 ml-1.5">{tempsRelatif(c.timestamp)}</span>
                                    <br />{c.message}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Ajouter un commentaire…"
                              value={commentInputs[s.id] || ""}
                              onChange={(e) => setCommentInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") envoyerCommentaire(s.id); }}
                              className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-blue-400"
                            />
                            <button onClick={() => envoyerCommentaire(s.id)}
                              disabled={!commentInputs[s.id]?.trim() || sendingComment[s.id]}
                              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e3a5f] text-white hover:bg-[#2a4f7f] disabled:opacity-40 transition-colors">
                              {sendingComment[s.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Photo en grand */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
            aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
