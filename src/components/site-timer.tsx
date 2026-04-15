"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, Play, Square } from "lucide-react";

interface SiteTimerProps {
  projectId: string;
  heureArrivee: string;
  heureDepart: string;
  onArrival: (time: string) => void;
  onDeparture: (time: string) => void;
  onArriveeChange: (time: string) => void;
  onDepartChange: (time: string) => void;
}

interface TimerState {
  running: boolean;
  startTimestamp: number | null;
  arrivalTime: string | null;
}

const STORAGE_KEY_PREFIX = "tm-timer-";

function getStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

function timeToMs(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return (parseInt(match[1]) * 60 + parseInt(match[2])) * 60 * 1000;
}

function computeElapsedFromTimes(arrivee: string, depart: string): number {
  const arrMs = timeToMs(arrivee);
  const depMs = timeToMs(depart);
  if (arrMs < 0 || depMs < 0) return 0;
  return Math.max(depMs - arrMs, 0);
}

function computeElapsedSinceArrivee(arrivee: string): number {
  const arrMs = timeToMs(arrivee);
  if (arrMs < 0) return 0;
  const now = new Date();
  const nowMs = (now.getHours() * 60 + now.getMinutes()) * 60 * 1000 + now.getSeconds() * 1000;
  return Math.max(nowMs - arrMs, 0);
}

export function SiteTimer({ projectId, heureArrivee, heureDepart, onArrival, onDeparture, onArriveeChange, onDepartChange }: SiteTimerProps) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localArrivee, setLocalArrivee] = useState(heureArrivee);
  const [localDepart, setLocalDepart] = useState(heureDepart);

  // Sync from props
  useEffect(() => { setLocalArrivee(heureArrivee); }, [heureArrivee]);
  useEffect(() => { setLocalDepart(heureDepart); }, [heureDepart]);

  // Restore running state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (raw) {
        const state: TimerState = JSON.parse(raw);
        if (state.running && state.startTimestamp) {
          setRunning(true);
          setElapsed(Date.now() - state.startTimestamp);
        }
      }
    } catch {}
  }, [projectId]);

  // Compute elapsed from arrivee/depart when both set (and not running)
  useEffect(() => {
    if (!running && localArrivee && localDepart) {
      setElapsed(computeElapsedFromTimes(localArrivee, localDepart));
    }
  }, [localArrivee, localDepart, running]);

  // Tick when running
  useEffect(() => {
    if (running && localArrivee) {
      intervalRef.current = setInterval(() => {
        setElapsed(computeElapsedSinceArrivee(localArrivee));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [running, localArrivee]);

  const persistState = useCallback((state: TimerState) => {
    try { localStorage.setItem(getStorageKey(projectId), JSON.stringify(state)); } catch {}
  }, [projectId]);

  // START: set arrivée + start chrono
  const handleStart = () => {
    const time = getCurrentTime();
    setRunning(true);
    setLocalArrivee(time);
    setElapsed(0);
    persistState({ running: true, startTimestamp: Date.now(), arrivalTime: time });
    onArrival(time);
    onArriveeChange(time);
  };

  // STOP: set départ + stop chrono
  const handleStop = () => {
    const time = getCurrentTime();
    setRunning(false);
    setLocalDepart(time);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try { localStorage.removeItem(getStorageKey(projectId)); } catch {}
    onDeparture(time);
    onDepartChange(time);
  };

  // Manual arrivée change: start chrono if not running
  const handleArriveeManual = (val: string) => {
    setLocalArrivee(val);
    onArriveeChange(val);
    if (val && !running && !localDepart) {
      // Start chrono based on manual arrivée
      setRunning(true);
      const arrMs = timeToMs(val);
      const now = new Date();
      const nowMs = (now.getHours() * 60 + now.getMinutes()) * 60 * 1000;
      const startTs = Date.now() - Math.max(nowMs - arrMs, 0);
      persistState({ running: true, startTimestamp: startTs, arrivalTime: val });
    }
  };

  // Manual départ change: stop chrono
  const handleDepartManual = (val: string) => {
    setLocalDepart(val);
    onDepartChange(val);
    if (val && running) {
      setRunning(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      try { localStorage.removeItem(getStorageKey(projectId)); } catch {}
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Minuteur de chantier
      </label>

      {/* Timer display */}
      <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {running && (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
        )}
        <span className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100 flex-1 tabular-nums">
          {formatElapsed(elapsed)}
        </span>
        {!running ? (
          <button type="button" onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 active:scale-95 transition-all shrink-0">
            <Play className="w-4 h-4" />
            Démarrer
          </button>
        ) : (
          <button type="button" onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 active:scale-95 transition-all shrink-0">
            <Square className="w-4 h-4" />
            Arrêter
          </button>
        )}
      </div>

      {/* Heure d'arrivée / départ */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Heure d&apos;arrivée</label>
          <input
            type="time"
            value={localArrivee}
            onChange={(e) => handleArriveeManual(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Heure de départ</label>
          <input
            type="time"
            value={localDepart}
            onChange={(e) => handleDepartManual(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 px-3 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
