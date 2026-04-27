"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Navigation, Clock, CheckCircle } from "lucide-react";
import { offlineFetch } from "@/lib/offline";

interface GPSTrackerProps {
  /** Adresse complète du chantier — sert au géocodage Nominatim. */
  chantierAddress: string;
  /** ID Notion du projet — sert à POSTer l'événement GPS. */
  projectId: string;
  /** Si true, le composant ne rend AUCUNE UI : il tracke en silence
   *  et POST les événements arrivée/départ. Utilisé pour les monteurs,
   *  qui ne doivent pas voir le timer. L'admin garde l'UI complète. */
  silent?: boolean;
  /** Heure de départ saisie manuellement par le monteur (heureDepart Notion).
   *  Dès qu'elle est non-vide, le GPS s'arrête : le monteur est parti. */
  heureDepart?: string;
  /** Heure d'arrivée saisie manuellement — permet de pré-remplir l'arrivée
   *  si le GPS n'a pas détecté l'entrée dans la zone. */
  heureArrivee?: string;
}

const GEOFENCE_RADIUS_METERS = 150; // Rayon de détection en mètres
const POSITION_TIMEOUT_MS = 30000;

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

export function GPSTracker({ chantierAddress, projectId, silent = false, heureDepart, heureArrivee }: GPSTrackerProps) {
  const [status, setStatus] = useState<"idle" | "watching" | "arrived" | "departed">("idle");
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [chantierCoords, setChantierCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const wasInside = useRef(false);

  // Refs pour éviter les stale closures dans les callbacks geolocation.
  const statusRef = useRef(status);
  const chantierCoordsRef = useRef(chantierCoords);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { chantierCoordsRef.current = chantierCoords; }, [chantierCoords]);

  // POST asynchrone vers l'endpoint pointage GPS. Silencieux : on ne
  // ré-affiche pas d'erreur si l'utilisateur est offline, on retentera
  // au prochain mouvement.
  const postGpsEvent = useCallback(async (type: "arrival" | "departure", time: string, dist: number | null) => {
    try {
      // offlineFetch : si le monteur est sur un chantier sans réseau,
      // l'arrivée/départ est mis en queue et envoyé dès retour réseau.
      await offlineFetch(`/api/gps-pointage/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, time, distance: dist }),
      });
    } catch {
      /* silent — on ne dérange pas l'utilisateur */
    }
  }, [projectId]);

  // Geocode the chantier address to get coordinates
  useEffect(() => {
    if (!chantierAddress) return;
    const cacheKey = `geo-${chantierAddress}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setChantierCoords(JSON.parse(cached));
        return;
      }
    } catch {}

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

  // Callback position : lit les refs pour éviter les stale closures.
  // ⚠️ Important : on EFFACE l'erreur dès qu'une position arrive.
  // L'ancien code laissait "Position indisponible" à l'écran même
  // quand le watchPosition réussissait à délivrer des coordonnées
  // après un timeout transitoire — d'où le bug visuel.
  const checkPosition = useCallback((position: GeolocationPosition) => {
    setError("");
    const coords = chantierCoordsRef.current;
    if (!coords) return;

    const dist = haversineDistance(
      position.coords.latitude, position.coords.longitude,
      coords.lat, coords.lng,
    );
    setDistance(Math.round(dist));

    const isInside = dist <= GEOFENCE_RADIUS_METERS;
    const currentStatus = statusRef.current;

    if (isInside && !wasInside.current && currentStatus === "watching") {
      wasInside.current = true;
      const time = getCurrentTime();
      setArrivalTime(time);
      setStatus("arrived");
      postGpsEvent("arrival", time, Math.round(dist));
    } else if (!isInside && wasInside.current && currentStatus === "arrived") {
      wasInside.current = false;
      const time = getCurrentTime();
      setDepartureTime(time);
      setStatus("departed");
      postGpsEvent("departure", time, Math.round(dist));
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    }
  }, [postGpsEvent]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError("GPS non disponible sur cet appareil");
      return;
    }
    setStatus("watching");
    setError("");

    watchId.current = navigator.geolocation.watchPosition(
      checkPosition,
      (err) => {
        // Permission refusée : pas la peine de retenter, on laisse le message.
        if (err.code === 1) {
          setError("Permission GPS refusée");
          return;
        }
        // Pour POSITION_UNAVAILABLE / TIMEOUT on n'écrase pas un
        // distance déjà connu — la position reviendra. On affiche
        // l'erreur uniquement si on n'a JAMAIS reçu de position.
        setDistance((current) => {
          if (current === null) setError("Position indisponible");
          return current;
        });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: POSITION_TIMEOUT_MS },
    );
  }, [checkPosition]);

  // Auto-start GPS tracking dès que les coordonnées sont prêtes
  useEffect(() => {
    if (chantierCoords && status === "idle" && navigator.geolocation) {
      startWatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierCoords]);

  // Si le monteur a saisi une heure de départ manuellement, on arrête
  // immédiatement le suivi GPS — il est parti, le watcher ne sert plus à rien.
  useEffect(() => {
    if (!heureDepart) return;
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    // Extrait la première heure du champ (format "HH:MM" ou "date | nom | HH:MM | …")
    const timeMatch = heureDepart.match(/\d{1,2}:\d{2}/);
    const depTime = timeMatch ? timeMatch[0] : heureDepart;
    setDepartureTime(depTime);
    setStatus("departed");
    wasInside.current = false;
  }, [heureDepart]);

  // Si une heure d'arrivée manuelle est connue et que le GPS n'a pas encore
  // détecté l'entrée dans la zone, on la reflète dans l'état local.
  useEffect(() => {
    if (!heureArrivee || status !== "idle") return;
    const timeMatch = heureArrivee.match(/\d{1,2}:\d{2}/);
    if (timeMatch) {
      setArrivalTime(timeMatch[0]);
      setStatus("arrived");
      wasInside.current = true;
    }
  }, [heureArrivee, status]);

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
    postGpsEvent("arrival", time, distance);
  };

  const markDepartureManual = () => {
    const time = getCurrentTime();
    setDepartureTime(time);
    setStatus("departed");
    wasInside.current = false;
    postGpsEvent("departure", time, distance);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  // En mode silencieux (monteur), on ne rend rien. Le tracking continue
  // côté navigateur en arrière-plan via watchPosition.
  if (silent) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Navigation className="w-4 h-4" />
        Pointage GPS <span className="text-[10px] text-gray-400 font-normal">(contrôle admin)</span>
      </label>

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
            Suivi GPS actif — en attente d&apos;arrivée sur site
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
