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

/** Rayon de détection en mètres. Augmenté à 200 m pour absorber les
 *  imprécisions de géocodage Nominatim (adresses suisses parfois décalées). */
const GEOFENCE_RADIUS_METERS = 200;
const POSITION_TIMEOUT_MS = 30000;
/** Timeout de sécurité : si le GPS reste en mode "arrivé" sans détecter
 *  de départ pendant 4 h (iOS suspend les mises à jour en arrière-plan),
 *  on arrête automatiquement le suivi. */
const MAX_ONSITE_DURATION_MS = 4 * 60 * 60 * 1000;

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

function extractTime(value: string): string | null {
  const m = value.match(/\d{1,2}:\d{2}/);
  return m ? m[0] : null;
}

export function GPSTracker({ chantierAddress, projectId, silent = false, heureDepart, heureArrivee }: GPSTrackerProps) {
  const [status, setStatus] = useState<"idle" | "watching" | "arrived" | "departed">("idle");
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [chantierCoords, setChantierCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);

  /** Pré-marqué "dans la zone" si heureArrivee est déjà connue au montage.
   *  Cela empêche checkPosition de re-détecter une arrivée alors qu'on est
   *  déjà sur site (race condition géocodage vs heure manuelle). */
  const wasInside = useRef(!!heureArrivee);

  // Refs pour éviter les stale closures dans les callbacks geolocation.
  const statusRef = useRef(status);
  const chantierCoordsRef = useRef(chantierCoords);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { chantierCoordsRef.current = chantierCoords; }, [chantierCoords]);

  const postGpsEvent = useCallback(async (type: "arrival" | "departure", time: string, dist: number | null) => {
    try {
      await offlineFetch(`/api/gps-pointage/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, time, distance: dist }),
      });
    } catch {
      /* silent — on ne dérange pas l'utilisateur */
    }
  }, [projectId]);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

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
    } else if (!isInside && wasInside.current && (currentStatus === "arrived" || currentStatus === "watching")) {
      wasInside.current = false;
      const time = getCurrentTime();
      setDepartureTime(time);
      setStatus("departed");
      postGpsEvent("departure", time, Math.round(dist));
      stopWatching();
    }
  }, [postGpsEvent, stopWatching]);

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
        if (err.code === 1) {
          setError("Permission GPS refusée");
          return;
        }
        setDistance((current) => {
          if (current === null) setError("Position indisponible");
          return current;
        });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: POSITION_TIMEOUT_MS },
    );
  }, [checkPosition]);

  // Auto-start GPS dès que les coordonnées sont prêtes.
  // Si le départ est déjà enregistré dans Notion, on n'ouvre même pas le watch.
  useEffect(() => {
    if (!chantierCoords || status !== "idle" || !navigator.geolocation) return;

    if (heureDepart) {
      // Déjà parti manuellement — afficher les temps sans tracker
      const arrTime = heureArrivee ? extractTime(heureArrivee) : null;
      const depTime = extractTime(heureDepart) ?? heureDepart;
      if (arrTime) setArrivalTime(arrTime);
      setDepartureTime(depTime);
      setStatus("departed");
      return;
    }

    startWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierCoords]);

  // Si le monteur saisit une heure de départ manuellement → stop immédiat.
  // Gère aussi le cas où heureDepart est déjà non-vide au montage.
  useEffect(() => {
    if (!heureDepart) return;
    stopWatching();
    const depTime = extractTime(heureDepart) ?? heureDepart;
    setDepartureTime(depTime);
    setStatus("departed");
    wasInside.current = false;
  }, [heureDepart, stopWatching]);

  // Si une heure d'arrivée manuelle est fournie, on l'utilise IMMÉDIATEMENT
  // sans attendre status === "idle". Cela corrige la race condition où le
  // géocodage termine avant que cet effet ne soit traité :
  //   géocodage → status="watching" → checkPosition détecte arrivée à l'heure actuelle
  //   au lieu d'utiliser l'heure Notion (ex. 13h45 → 14h52).
  // wasInside est déjà initialisé à true si heureArrivee était connue au montage.
  useEffect(() => {
    if (!heureArrivee) return;
    const t = extractTime(heureArrivee);
    if (!t) return;
    // Utilise une mise à jour fonctionnelle pour ne pas écraser une arrivée GPS
    // déjà enregistrée si jamais les deux arrivent dans le même tick.
    setArrivalTime((current) => current ?? t);
    setStatus((s) => (s === "idle" || s === "watching") ? "arrived" : s);
    wasInside.current = true;
  }, [heureArrivee]);

  // Timeout de sécurité : stop automatique après 4h en mode "arrived".
  // Sur iOS, le navigateur cesse de livrer des mises à jour GPS quand
  // l'appli passe en arrière-plan — la sortie de zone n'est jamais détectée.
  useEffect(() => {
    if (status !== "arrived") return;
    const timeout = setTimeout(() => {
      if (statusRef.current === "arrived") {
        stopWatching();
        const time = getCurrentTime();
        setDepartureTime(time);
        setStatus("departed");
        wasInside.current = false;
        postGpsEvent("departure", time, null);
      }
    }, MAX_ONSITE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [status, stopWatching, postGpsEvent]);

  // Visibilité de page : quand l'onglet redevient visible après une période
  // cachée, on requête la position UNE FOIS pour vérifier si toujours sur site.
  // Cela compense l'arrêt des mises à jour GPS d'iOS en arrière-plan.
  useEffect(() => {
    if (status !== "arrived") return;
    const handleVisibilityChange = () => {
      if (document.hidden || statusRef.current !== "arrived") return;
      const coords = chantierCoordsRef.current;
      if (!coords || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const dist = haversineDistance(
            position.coords.latitude, position.coords.longitude,
            coords.lat, coords.lng,
          );
          setDistance(Math.round(dist));
          if (dist > GEOFENCE_RADIUS_METERS && wasInside.current) {
            wasInside.current = false;
            const time = getCurrentTime();
            setDepartureTime(time);
            setStatus("departed");
            stopWatching();
            postGpsEvent("departure", time, Math.round(dist));
          }
        },
        () => { /* position non dispo — on attend la prochaine update */ },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status, stopWatching, postGpsEvent]);

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
    stopWatching();
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
