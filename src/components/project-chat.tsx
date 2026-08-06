"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { offlineFetch } from "@/lib/offline";
import { getCollaboratorColor } from "@/lib/collaborators";

interface ChatMessage {
  id: string;
  user: string;
  email: string;
  message: string;
  timestamp: number;
}

export function ProjectChat({ projectId }: { projectId: string }) {
  // Monté côté client uniquement pour permettre createPortal vers
  // document.body (sinon SSR plante avec "document is not defined").
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastReadTs, setLastReadTs] = useState<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastReadKey = `tm-chat-lastread-${projectId}`;

  const loadMessages = () => {
    fetch(`/api/chat?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  };

  // Poll TOUJOURS, même fermé : pour pouvoir afficher l'indicateur
  // de notification sur le bouton flottant. Plus rapide quand le
  // panneau est ouvert (10 s) que fermé (30 s) pour économiser
  // batterie & data.
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, open ? 10000 : 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Restaure le timestamp de dernière lecture depuis localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastReadKey);
      if (raw) setLastReadTs(parseInt(raw, 10) || 0);
    } catch {}
  }, [lastReadKey]);

  // À l'ouverture du panneau : on marque tous les messages actuels
  // comme lus en sauvant le ts du plus récent dans localStorage.
  useEffect(() => {
    if (!open) return;
    const latest = messages.reduce((max, m) => (m.timestamp > max ? m.timestamp : max), 0);
    if (latest > lastReadTs) {
      setLastReadTs(latest);
      try { localStorage.setItem(lastReadKey, String(latest)); } catch {}
    }
  }, [open, messages, lastReadKey, lastReadTs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const unreadCount = messages.filter((m) => m.timestamp > lastReadTs).length;

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      // offlineFetch : si le réseau est coupé, le message est mis
      // en queue et rejoué dès que la connexion revient. Le user
      // voit son message disparaître du champ comme d'habitude.
      await offlineFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: input }),
      });
      setInput("");
      loadMessages();
    } catch {} finally {
      setSending(false);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  };

  // Tant que le composant n'est pas monté côté client, on ne rend rien
  // (createPortal a besoin de document.body, qui n'existe pas en SSR).
  if (!mounted) return null;

  // ⚠️ On rend TOUJOURS via un Portal vers document.body. Sinon, en
  // thème Ocean (et plus généralement dès qu'un ancêtre crée un
  // containing block via transform/filter/contain), `position: fixed`
  // est cassé et la bulle / le panneau se retrouvent en flow normal
  // au bas de la page — l'utilisateur doit alors scroller pour les
  // atteindre. En portail au niveau body, le containing block est
  // toujours le viewport, donc fixed fonctionne dans tous les
  // contextes.
  // Style en dur (et pas via Tailwind) pour le positionnement fixed.
  // Raisons :
  //   - garantit que la valeur est appliquée même si une règle CSS
  //     d'un thème (ou un override Ocean) écrase position/bottom/left.
  //   - max(...) avec env(safe-area-inset-bottom) pousse le bouton
  //     au-dessus de l'indicateur home iOS quand l'app tourne en PWA.
  //   - translateZ(0) crée un compositing layer GPU : sur iOS Safari
  //     ça stabilise le rendu de position:fixed pendant le scroll
  //     (sans, le bouton peut "trembler" ou disparaître brièvement).
  const fixedStyle = {
    position: "fixed" as const,
    bottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
    left: "max(1.5rem, env(safe-area-inset-left, 1.5rem))",
    zIndex: 60,
    transform: "translateZ(0)",
    WebkitTransform: "translateZ(0)",
    willChange: "transform" as const,
  };

  if (!open) {
    const hasMessages = messages.length > 0;
    const dotClass = unreadCount > 0
      ? "bg-red-500 animate-pulse"
      : hasMessages
        ? "bg-green-500"
        : "";
    return createPortal(
      <button
        onClick={() => setOpen(true)}
        style={fixedStyle}
        className="w-14 h-14 rounded-full glass-btn text-white flex items-center justify-center shadow-xl"
        aria-label={unreadCount > 0 ? `Discussion : ${unreadCount} message(s) non lu(s)` : "Discussion"}
      >
        <MessageCircle className="w-6 h-6" />
        {unreadCount > 0 ? (
          <span className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${dotClass}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : hasMessages ? (
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${dotClass}`}
            title="Tous les messages ont été lus"
          />
        ) : null}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div style={{ ...fixedStyle, maxHeight: "60vh" }} className="w-80 sm:w-96 glass-card rounded-2xl shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#1e3a5f] dark:text-cyan-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discussion</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          Fermer
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">Aucun message</p>
        )}
        {messages.map((msg) => {
          const firstName = msg.user.split(" ")[0];
          const colors = getCollaboratorColor(firstName);
          return (
            <div key={msg.id} className="flex gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {msg.user.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: colors.text }}>{firstName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(msg.timestamp)}</span>
                </div>
                {/* Texte du message : foncé en clair, clair en sombre.
                    Avant, text-gray-700 sans variante dark rendait le
                    texte quasi invisible sur le fond navy du chat. */}
                <p className="text-sm text-gray-800 dark:text-gray-100 mt-0.5 break-words">{msg.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-gray-100 dark:border-gray-700">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Message..."
          className="h-9 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="w-9 h-9 rounded-lg bg-[#1e3a5f] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>,
    document.body,
  );
}
