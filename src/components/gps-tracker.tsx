"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Navigation, Clock, CheckCircle, Radio } from "lucide-react";

interface GPSTrackerProps {
  chantierAddress: string;
  onArrival?: (time: string) => void;
  onDeparture?: (time: string) => void;
}

const GEOFENCE_RADIUS_METERS = 150; // Rayon de détection en mètres
const WATCH_INTERVAL = 15000; // Vérifier toutes les 15 secondes

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export function GPSTracker({ chantierAddress, onArrival, onDeparture }: GPSTrackerProps) {
  const [status, setStatus] = useState<"idle" | "watching" | "arrived" | "departed">("idle");
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [chantierCoords, setChantierCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const wasInside = useRef(false);

  // Geocode the chantier address to get coordinates
  useEffect(() => {
    if (!chantierAddress) return;
    // Check localStorage cache first
    const cacheKey = `geo-${chantierAddress}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setChantierCoords(JSON.parse(cached));
        return;
      }
    } catch {}

    // Geocode via Nominatim
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(chantierAddress)}&limit=1`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.[0]) {
          const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          setChantierCoords(coords);
          try { localStorage.setItem(cacheKey, JSON.stringify(coords)); } catch {}
        }
      })
      .catch(() => {});
  }, [chantierAddress]);

  const checkPosition = useCallback((position: GeolocationPosition) => {
    if (!chantierCoords) return;

    const dist = haversineDistance(
      position.coords.latitude, position.coords.longitude,
      chantierCoords.lat, chantierCoords.lng
    );
    setDistance(Math.round(dist));

    const isInside = dist <= GEOFENCE_RADIUS_METERS;

    if (isInside && !wasInside.current && status === "watching") {
      // Entré dans la zone → arrivée
      wasInside.current = true;
      const time = getCurrentTime();
      setArrivalTime(time);
      setStatus("arrived");
      onArrival?.(time);
    } else if (!isInside && wasInside.current && status === "arrived") {
      // Sorti de la zone → départ
      wasInside.current = false;
      const time = getCurrentTime();
      setDepartureTime(time);
      setStatus("departed");
      onDeparture?.(time);
      // Stop watching
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    }
  }, [chantierCoords, status, onArrival, onDeparture]);

  const startWatching = () => {
    if (!navigator.geolocation) {
      setError("GPS non disponible sur cet appareil");
      return;
    }
    setStatus("watching");
    setError("");

    watchId.current = navigator.geolocation.watchPosition(
      checkPosition,
      (err) => {
        if (err.code === 1) setError("Permission GPS refusée");
        else setError("Position indisponible");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  };

  // Auto-start GPS tracking dès que les coordonnées sont prêtes
  useEffect(() => {
    if (chantierCoords && status === "idle" && navigator.geolocation) {
      startWatching();
    }
  }, [chantierCoords]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  const markArrivalManual = () => {
    const time = getCurrentTime();
    setArrivalTime(time);
    setStatus("arrived");
    wasInside.current = true;
    onArrival?.(time);
  };

  const markDepartureManual = () => {
    const time = getCurrentTime();
    setDepartureTime(time);
    setStatus("departed");
    wasInside.current = false;
    onDeparture?.(time);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Navigation className="w-4 h-4" />
        Pointage GPS
      </label>

      {/* Statut en attente de coordonnées */}
      {status === "idle" && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse" />
          <span className="text-xs text-gray-500">Initialisation du GPS...</span>
        </div>
      )}

      {status === "watching" && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-700 dark:text-green-300 flex-1">
            Suivi GPS actif — en attente d'arrivée sur site
            {distance !== null && ` (${distance > 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`})`}
          </span>
        </div>
      )}

      {status === "arrived" && !departureTime && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs text-blue-700 dark:text-blue-300 flex-1">
            Sur site — départ enregistré automatiquement en quittant la zone
            {distance !== null && ` (${distance} m du chantier)`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Arrivée */}
        <button
          type="button"
          onClick={(!arrivalTime && status !== "watching") ? markArrivalManual : undefined}
          disabled={!!arrivalTime || status === "watching"}
          className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
            arrivalTime
              ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800"
              : "border-dashed border-gray-300 hover:border-green-400 hover:bg-green-50 active:scale-95"
          }`}
        >
          {arrivalTime ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-lg font-bold text-green-700 dark:text-green-400">{arrivalTime}</span>
              <span className="text-[10px] text-green-600 dark:text-green-500">Arrivée enregistrée</span>
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
          onClick={(arrivalTime && !departureTime) ? markDepartureManual : undefined}
          disabled={!arrivalTime || !!departureTime}
          className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
            departureTime
              ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800"
              : arrivalTime
                ? "border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50 active:scale-95"
                : "border-dashed border-gray-200 opacity-50"
          }`}
        >
          {departureTime ? (
            <>
              <CheckCircle className="w-5 h-5 text-blue-500" />
              <span className="text-lg font-bold text-blue-700 dark:text-blue-400">{departureTime}</span>
              <span className="text-[10px] text-blue-600 dark:text-blue-500">Départ enregistré</span>
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
