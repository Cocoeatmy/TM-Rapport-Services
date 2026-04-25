"use client";

import { useEffect, useState } from "react";
import { Timer, MapPin, LogOut } from "lucide-react";
import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";

interface GpsEvent {
  id: string;
  projectId: string;
  userEmail: string;
  userName: string;
  type: "arrival" | "departure";
  time: string;
  timestamp: number;
  date: string;
  distance?: number;
}

interface AdminGpsTimerProps {
  projectId: string;
}

interface SessionRow {
  userName: string;
  date: string;
  arrival: GpsEvent;
  departure?: GpsEvent;
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}`;
}

/** Construit une liste de sessions (arrivée + départ apparié) à partir
 *  des événements bruts. Les arrivées sans départ donnent une session
 *  "ouverte" qui sera chronométrée live. */
function buildSessions(events: GpsEvent[]): SessionRow[] {
  // Trie par timestamp ascendant
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  // Pour chaque (userEmail, date), on apparie les arrivées avec la
  // prochaine sortie chronologique du même user le même jour.
  const sessions: SessionRow[] = [];
  // userEmail|date -> dernière arrivée non clôturée
  const open = new Map<string, GpsEvent>();
  for (const e of sorted) {
    const key = `${e.userEmail}|${e.date}`;
    if (e.type === "arrival") {
      // S'il y avait une arrivée pas clôturée, on la pousse comme "ouverte"
      const prev = open.get(key);
      if (prev) sessions.push({ userName: prev.userName, date: prev.date, arrival: prev });
      open.set(key, e);
    } else if (e.type === "departure") {
      const arrival = open.get(key);
      if (arrival) {
        sessions.push({ userName: arrival.userName, date: arrival.date, arrival, departure: e });
        open.delete(key);
      }
      // Sinon départ orphelin, on l'ignore (cas rare où on a perdu l'arrivée).
    }
  }
  for (const arrival of open.values()) {
    sessions.push({ userName: arrival.userName, date: arrival.date, arrival });
  }
  // Plus récent en premier
  return sessions.sort((a, b) => b.arrival.timestamp - a.arrival.timestamp);
}

export function AdminGpsTimer({ projectId }: AdminGpsTimerProps) {
  const [events, setEvents] = useState<GpsEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/gps-pointage/${projectId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setEvents(data);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId]);

  // Tick toutes les secondes pour le chrono live des sessions ouvertes.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!loaded) return null;
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 p-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Timer className="w-4 h-4" />
          <span>Aucun pointage GPS enregistré pour ce projet (contrôle admin uniquement).</span>
        </div>
      </div>
    );
  }

  const sessions = buildSessions(events);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Timer className="w-4 h-4 text-purple-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Pointage GPS — temps sur site
        </span>
        <span className="ml-auto text-[10px] text-gray-400">visible admin uniquement</span>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {sessions.map((s, i) => {
          const color = getCollaboratorColor(s.userName);
          const initials = getCollaboratorInitials(s.userName);
          const isOpen = !s.departure;
          const endMs = s.departure ? s.departure.timestamp : now;
          const duration = endMs - s.arrival.timestamp;
          const dateLabel = new Date(s.arrival.timestamp).toLocaleDateString("fr-CH", {
            day: "2-digit",
            month: "short",
          });
          return (
            <li key={`${s.arrival.id}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <span
                className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: color.dot, color: "#fff" }}
              >
                {initials}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.userName}</span>
                  <span className="text-[10px] text-gray-400">{dateLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-green-500" />
                    {s.arrival.time}
                  </span>
                  {s.departure ? (
                    <span className="inline-flex items-center gap-1">
                      <LogOut className="w-3 h-3 text-blue-500" />
                      {s.departure.time}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      En cours
                    </span>
                  )}
                </div>
              </div>
              <div className={`text-right shrink-0 ${isOpen ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-gray-700 dark:text-gray-200"}`}>
                <p className="text-sm font-semibold tabular-nums">{formatDuration(duration)}</p>
                <p className="text-[9px] text-gray-400">{isOpen ? "live" : "session"}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
