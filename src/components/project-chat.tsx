"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getCollaboratorColor } from "@/lib/collaborators";

interface ChatMessage {
  id: string;
  user: string;
  email: string;
  message: string;
  timestamp: number;
}

export function ProjectChat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = () => {
    fetch(`/api/chat?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      });
  };

  useEffect(() => {
    if (open) {
      loadMessages();
      const interval = setInterval(loadMessages, 10000);
      return () => clearInterval(interval);
    }
  }, [open, projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      await fetch("/api/chat", {
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 w-14 h-14 rounded-full glass-btn text-white flex items-center justify-center shadow-xl z-40"
      >
        <MessageCircle className="w-6 h-6" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 w-80 sm:w-96 glass-card rounded-2xl shadow-2xl z-40 flex flex-col" style={{ maxHeight: "60vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold">Discussion</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
          Fermer
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">Aucun message</p>
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
                  <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{msg.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-gray-100">
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
    </div>
  );
}
