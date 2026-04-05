"use client";

import { useState, useEffect } from "react";
import { MapPin, Navigation, Clock, CheckCircle } from "lucide-react";

interface GPSTrackerProps {
  chantierAddress: string;
  onArrival?: (time: string) => void;
  onDeparture?: (time: string) => void;
}

export function GPSTracker({ chantierAddress, onArrival, onDeparture }: GPSTrackerProps) {
  const [status, setStatus] = useState<"idle" | "tracking" | "arrived" | "departed">("idle");
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState("");

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  };

  const markArrival = () => {
    const time = getCurrentTime();
    setArrivalTime(time);
    setStatus("arrived");
    onArrival?.(time);

    // Enregistrer la position GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log("Arrivée GPS:", pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }
  };

  const markDeparture = () => {
    const time = getCurrentTime();
    setDepartureTime(time);
    setStatus("departed");
    onDeparture?.(time);
  };

  const startTracking = () => {
    setStatus("tracking");
    setError("");

    if (!navigator.geolocation) {
      setError("GPS non disponible");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Position obtenue, on marque l'arrivée
        markArrival();
      },
      (err) => {
        // Même sans GPS précis, permettre le pointage manuel
        markArrival();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <Navigation className="w-4 h-4" />
        Pointage GPS
      </label>

      <div className="grid grid-cols-2 gap-2">
        {/* Arrivée */}
        <button
          type="button"
          onClick={status === "idle" ? startTracking : undefined}
          disabled={status !== "idle"}
          className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
            arrivalTime
              ? "border-green-300 bg-green-50"
              : "border-dashed border-gray-300 hover:border-green-400 hover:bg-green-50 active:scale-95"
          }`}
        >
          {arrivalTime ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-lg font-bold text-green-700">{arrivalTime}</span>
              <span className="text-[10px] text-green-600">Arrivée enregistrée</span>
            </>
          ) : (
            <>
              <MapPin className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-500">Pointer arrivée</span>
            </>
          )}
        </button>

        {/* Départ */}
        <button
          type="button"
          onClick={status === "arrived" ? markDeparture : undefined}
          disabled={status !== "arrived"}
          className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
            departureTime
              ? "border-blue-300 bg-blue-50"
              : status === "arrived"
                ? "border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50 active:scale-95"
                : "border-dashed border-gray-200 opacity-50"
          }`}
        >
          {departureTime ? (
            <>
              <CheckCircle className="w-5 h-5 text-blue-500" />
              <span className="text-lg font-bold text-blue-700">{departureTime}</span>
              <span className="text-[10px] text-blue-600">Départ enregistré</span>
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-500">Pointer départ</span>
            </>
          )}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
