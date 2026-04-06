"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, Play, Square } from "lucide-react";

interface SiteTimerProps {
  projectId: string;
  onArrival: (time: string) => void;
  onDeparture: (time: string) => void;
}

interface TimerState {
  running: boolean;
  startTimestamp: number | null; // epoch ms when timer started
  arrivalTime: string | null;
}

const STORAGE_KEY_PREFIX = "tm-timer-";

function getStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export function SiteTimer({ projectId, onArrival, onDeparture }: SiteTimerProps) {
  const [running, setRunning] = useState(false);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (raw) {
        const state: TimerState = JSON.parse(raw);
        if (state.running && state.startTimestamp) {
          setRunning(true);
          setStartTimestamp(state.startTimestamp);
          setElapsed(Date.now() - state.startTimestamp);
          if (state.arrivalTime) {
            setArrivalTime(state.arrivalTime);
          }
        }
      }
    } catch {}
  }, [projectId]);

  // Tick interval when running
  useEffect(() => {
    if (running && startTimestamp) {
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimestamp);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, startTimestamp]);

  const persistState = useCallback(
    (state: TimerState) => {
      try {
        localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
      } catch {}
    },
    [projectId]
  );

  const handleStart = () => {
    const now = Date.now();
    const time = getCurrentTime();
    setRunning(true);
    setStartTimestamp(now);
    setElapsed(0);
    setArrivalTime(time);
    persistState({ running: true, startTimestamp: now, arrivalTime: time });
    onArrival(time);
  };

  const handleStop = () => {
    const time = getCurrentTime();
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Clear persisted state
    try {
      localStorage.removeItem(getStorageKey(projectId));
    } catch {}
    onDeparture(time);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Minuteur de chantier
      </label>

      <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {/* Pulsing dot when active */}
        {running && (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
        )}

        {/* Elapsed time display */}
        <span className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100 flex-1 tabular-nums">
          {formatElapsed(elapsed)}
        </span>

        {/* Arrival time badge */}
        {arrivalTime && (
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
            depuis {arrivalTime}
          </span>
        )}

        {/* Start/Stop button */}
        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 active:scale-95 transition-all shrink-0"
          >
            <Play className="w-4 h-4" />
            Démarrer
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 active:scale-95 transition-all shrink-0"
          >
            <Square className="w-4 h-4" />
            Arrêter
          </button>
        )}
      </div>
    </div>
  );
}
