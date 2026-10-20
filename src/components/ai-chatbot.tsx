"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bot, Send, X, Loader2, History, SquarePen, ChevronLeft } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Rendu Markdown léger (sans dépendance) : gras **…**, puces (- ou *), titres
// (#), et lignes vides → espacement. Suffisant pour les réponses de l'IA.
function renderInline(text: string, keyPrefix: string) {
  // Gras **…**, liens Markdown [texte](url), et URLs brutes → cliquables.
  const tokenRe = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;
  return text.split(tokenRe).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    const md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (md) {
      return (
        <a key={key} href={md[2]} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline break-all">
          {md[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline break-all">
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function FormattedMessage({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let k = 0;
  const flush = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={`ul-${k++}`} className="space-y-2 my-1.5 pl-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-purple-400 shrink-0">•</span>
              <span className="flex-1">{renderInline(it, `li-${k}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    const bullet = trimmed.match(/^[-*]\s+(.*)/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (trimmed === "") {
      blocks.push(<div key={`sp-${k++}`} className="h-1.5" />);
    } else {
      const heading = trimmed.replace(/^#{1,6}\s+/, "");
      blocks.push(
        <p key={`p-${k++}`} className="leading-snug">
          {renderInline(heading, `p-${k}`)}
        </p>
      );
    }
  }
  flush();
  return <div>{blocks}</div>;
}

interface ResumeConversation { id: string; titre: string; cree: number; maj: number; n: number }

/* La dernière conversation ouverte sur cet appareil : on la reprend à la
   réouverture. Confort seulement — l'historique lui-même vit sur le serveur. */
const CLE_CONV_LOCALE = "tm-assistant-conversation";
const lireLocale = () => { try { return localStorage.getItem(CLE_CONV_LOCALE); } catch { return null; } };
const ecrireLocale = (id: string | null) => {
  try { if (id) localStorage.setItem(CLE_CONV_LOCALE, id); else localStorage.removeItem(CLE_CONV_LOCALE); } catch { /* confort */ }
};

function quand(t: number): string {
  const d = new Date(t), auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-CH", { day: "numeric", month: "short", year: d.getFullYear() === auj.getFullYear() ? undefined : "numeric" });
}

export function AIChatbot() {
  const [open, setOpen] = useState(false);
  /* Le rail de navigation ouvre l'assistant par un évènement : il vit dans
     une autre branche de l'arbre, et faire remonter cet état jusqu'au layout
     pour le redescendre n'apporterait rien. */
  useEffect(() => {
    const ouvrir = () => setOpen(true);
    window.addEventListener("tm-ouvrir-assistant", ouvrir);
    return () => window.removeEventListener("tm-ouvrir-assistant", ouvrir);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  /* La conversation en cours (gardée sur le serveur) et l'onglet Historique. */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [vue, setVue] = useState<"chat" | "historique">("chat");
  const [historique, setHistorique] = useState<ResumeConversation[] | null>(null);
  const [chargementHisto, setChargementHisto] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ouvrirConversation = async (id: string) => {
    setChargementHisto(true);
    try {
      const r = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) { if (r.status === 404) ecrireLocale(null); return; }
      const { conversation } = await r.json();
      setMessages((conversation.messages || []).map((m: { role: "user" | "assistant"; texte: string; t: number }) => ({ role: m.role, content: m.texte, timestamp: m.t })));
      setConversationId(conversation.id);
      ecrireLocale(conversation.id);
      setVue("chat");
    } catch { /* hors ligne : on reste où l'on est */ } finally { setChargementHisto(false); }
  };
  const nouvelleConversation = () => {
    setMessages([]); setConversationId(null); ecrireLocale(null); setVue("chat");
  };
  const afficherHistorique = async () => {
    setVue("historique"); setChargementHisto(true);
    try {
      const r = await fetch("/api/ai/conversations", { cache: "no-store" });
      const d = r.ok ? await r.json() : { conversations: [] };
      setHistorique(d.conversations || []);
    } catch { setHistorique([]); } finally { setChargementHisto(false); }
  };
  /* À l'ouverture : la dernière conversation de cet appareil reprend. */
  useEffect(() => {
    if (!open || conversationId || messages.length > 0) return;
    const id = lireLocale();
    if (id) void ouvrirConversation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pathname = usePathname();
  // Masqué sur la page projet (création de rapport) pour ne pas gêner.
  const hidden = !!pathname && pathname.startsWith("/projet/");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setVue("chat");
    setMessages((prev) => [...prev, { role: "user", content: userMsg, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, conversationId }),
      });
      const data = await res.json();
      if (data.conversationId) { setConversationId(data.conversationId); ecrireLocale(data.conversationId); }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || data.error || "Erreur", timestamp: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erreur de connexion", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Sur la page projet : on masque complètement l'assistant (bouton + panneau).
  if (hidden) return null;

  /* Fermé, l'assistant n'occupe plus l'écran : il s'ouvre depuis sa pastille
     de l'en-tête (BoutonAssistant) ou depuis le rail du thème Signal. Le
     bouton flottant d'avant masquait du contenu en bas à droite. */
  if (!open) return null;

  return (
    <div className="tm-chatbot-panneau fixed bottom-5 right-5 w-80 sm:w-96 glass-card rounded-2xl shadow-2xl z-50 flex flex-col" style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl">
        <div className="flex items-center gap-2 text-white">
          <Bot className="w-5 h-5" />
          <div>
            <span className="text-sm font-semibold">Assistant TM</span>
            <p className="text-[10px] text-white/70">Posez vos questions</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => (vue === "historique" ? setVue("chat") : afficherHistorique())}
            title={vue === "historique" ? "Revenir à la conversation" : "Historique des conversations"}
            aria-label={vue === "historique" ? "Revenir à la conversation" : "Historique des conversations"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 ${vue === "historique" ? "bg-white/20 text-white" : ""}`}>
            {vue === "historique" ? <ChevronLeft className="w-4 h-4" /> : <History className="w-4 h-4" />}
          </button>
          <button onClick={nouvelleConversation} title="Nouvelle conversation" aria-label="Nouvelle conversation"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15">
            <SquarePen className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(false)} aria-label="Fermer" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {vue === "historique" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ minHeight: 250 }}>
          <p className="text-xs font-semibold text-gray-500 px-1 pb-1">Historique de mes conversations</p>
          {chargementHisto && historique === null && (
            <p className="text-sm text-gray-500 flex items-center gap-2 px-1"><Loader2 className="w-4 h-4 animate-spin" /> Lecture…</p>
          )}
          {historique && historique.length === 0 && (
            <p className="text-sm text-gray-500 px-1">Aucune conversation enregistrée pour l&apos;instant.</p>
          )}
          {(historique || []).map((c) => (
            <button key={c.id} onClick={() => ouvrirConversation(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${c.id === conversationId ? "border-purple-300 bg-purple-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}>
              <span className="block text-sm font-medium text-gray-800 truncate">{c.titre}</span>
              <span className="block text-[11px] text-gray-500">{quand(c.maj)} · {Math.ceil(c.n / 2)} question{c.n > 2 ? "s" : ""}</span>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {vue === "chat" && (
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 250 }}>
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <Bot className="w-10 h-10 text-purple-300 mx-auto" />
            <p className="text-sm text-gray-500">Bonjour ! Je suis votre assistant.</p>
            <div className="space-y-1.5">
              {[
                "Quels sont mes montages du jour ?",
                "Comment poser un joint silicone ?",
                "Infos sur le projet TM-2600219",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                msg.role === "user"
                  ? "bg-[#1e3a5f] text-white rounded-br-md"
                  : "bg-gray-100 text-gray-800 rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <FormattedMessage content={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      )}

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Posez votre question..."
          className="flex-1 h-10 text-sm px-3 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          style={{ color: "#111", WebkitTextFillColor: "#111" }}
          disabled={loading}
          autoComplete="off"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center shrink-0 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
