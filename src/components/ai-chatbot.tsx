"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Loader2, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Rendu Markdown léger (sans dépendance) : gras **…**, puces (- ou *), titres
// (#), et lignes vides → espacement. Suffisant pour les réponses de l'IA.
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-gray-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
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

export function AIChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Assistant IA"
        title="Assistant IA"
        className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center hover:scale-105 transition-transform active:scale-95 border border-white/20"
      >
        <Sparkles className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed top-24 right-4 w-80 sm:w-96 glass-card rounded-2xl shadow-2xl z-50 flex flex-col" style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl">
        <div className="flex items-center gap-2 text-white">
          <Bot className="w-5 h-5" />
          <div>
            <span className="text-sm font-semibold">Assistant TM</span>
            <p className="text-[10px] text-white/70">Posez vos questions</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
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
