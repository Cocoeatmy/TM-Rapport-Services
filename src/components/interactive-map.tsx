"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";

// --- Types ---
interface LatLng {
  lat: number;
  lng: number;
}

interface GeoCache {
  [address: string]: LatLng | null;
}

// --- Status color mapping ---
type StatusColor = "green" | "yellow" | "red" | "blue" | "gray";

const STATUS_COLOR_MAP: Record<string, StatusColor> = {
  "RDV - fixé": "green",
  "Cabine à aller chercher": "yellow",
  "Récéptionné - RDV à fixer": "yellow",
  "Soucis montage": "red",
  "Cabines à recevoir": "blue",
  "Cabines en CMD": "blue",
  "Livraison partielle": "blue",
};

const COLOR_HEX: Record<StatusColor, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  gray: "#9ca3af",
};

const STATUS_LABELS: Record<StatusColor, string> = {
  green: "RDV fixé",
  yellow: "RDV à fixer / À chercher",
  red: "Soucis montage",
  blue: "En attente / CMD",
  gray: "Autre",
};

function getStatusColor(p: Project): StatusColor {
  return STATUS_COLOR_MAP[p.etatCMD] || "gray";
}

// --- Geocoding with localStorage cache and rate limiting ---
const GEO_CACHE_KEY = "tm-geocode-cache";

function loadGeoCache(): GeoCache {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGeoCache(cache: GeoCache) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable
  }
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=ch,fr,de,it,at`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TM-Rapport-Services/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Component ---
interface InteractiveMapProps {
  projects: Project[];
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

export function InteractiveMap({ projects }: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersLayerRef = useRef<any>(null);

  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });
  const [geocodedProjects, setGeocodedProjects] = useState<
    { project: Project; latlng: LatLng }[]
  >([]);

  // Filters
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusColor>>(
    new Set(["green", "yellow", "red", "blue", "gray"])
  );
  const [selectedCollaborator, setSelectedCollaborator] = useState<string>("all");

  // Get unique collaborators
  const collaborators = Array.from(
    new Set(projects.map((p) => p.collaborateurs).filter(Boolean))
  ).sort();

  // Load Leaflet from CDN
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = () => setLeafletLoaded(true);
    script.onerror = () => console.error("Failed to load Leaflet");
    document.head.appendChild(script);

    return () => {
      // Don't remove - other instances might need them
    };
  }, []);

  // Geocode projects
  useEffect(() => {
    const projectsWithAddress = projects.filter((p) => p.adresseChantier?.trim());
    if (projectsWithAddress.length === 0) return;

    let cancelled = false;

    async function doGeocode() {
      setGeocoding(true);
      const cache = loadGeoCache();
      const results: { project: Project; latlng: LatLng }[] = [];
      let needsSave = false;
      let done = 0;

      setGeocodeProgress({ done: 0, total: projectsWithAddress.length });

      for (const p of projectsWithAddress) {
        if (cancelled) break;
        const addr = p.adresseChantier.trim();

        if (addr in cache) {
          const cached = cache[addr];
          if (cached) results.push({ project: p, latlng: cached });
          done++;
          setGeocodeProgress({ done, total: projectsWithAddress.length });
          continue;
        }

        // Rate limit: 1 req/sec for Nominatim
        await sleep(1100);
        if (cancelled) break;

        const latlng = await geocodeAddress(addr);
        cache[addr] = latlng;
        needsSave = true;
        if (latlng) results.push({ project: p, latlng });
        done++;
        setGeocodeProgress({ done, total: projectsWithAddress.length });
      }

      if (needsSave) saveGeoCache(cache);
      if (!cancelled) {
        setGeocodedProjects(results);
        setGeocoding(false);
      }
    }

    doGeocode();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Initialize map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const L = window.L;

    const map = L.map(mapContainerRef.current).setView([46.8, 7.1], 8); // Center on Switzerland
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, [leafletLoaded]);

  // Update markers when data or filters change
  const updateMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !window.L) return;
    const L = window.L;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const filtered = geocodedProjects.filter((gp) => {
      const statusColor = getStatusColor(gp.project);
      if (!activeStatuses.has(statusColor)) return false;
      if (selectedCollaborator !== "all" && gp.project.collaborateurs !== selectedCollaborator)
        return false;
      return true;
    });

    if (filtered.length === 0) return;

    const bounds: [number, number][] = [];

    filtered.forEach((gp) => {
      const { project, latlng } = gp;
      const color = COLOR_HEX[getStatusColor(project)];
      const names = (project.collaborateurs || "Non assigné").split(" & ");

      const marker = L.circleMarker([latlng.lat, latlng.lng], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      const collabBadges = names
        .map((n) => {
          const c = getCollaboratorColor(n.trim());
          return `<span style="display:inline-block;background:${c.bg};color:${c.text};padding:1px 6px;border-radius:9999px;font-size:10px;font-weight:600;margin-right:2px;">${n.trim()}</span>`;
        })
        .join("");

      marker.bindPopup(
        `<div style="font-size:13px;min-width:180px;">
          <strong style="font-size:14px;">${project.projet || project.nomChantier || "Sans nom"}</strong><br/>
          <span style="color:#6b7280;font-size:11px;">${project.adresseChantier}</span><br/>
          <div style="margin:4px 0;">${collabBadges}</div>
          <div style="display:flex;align-items:center;gap:4px;margin:4px 0;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
            <span style="font-size:11px;">${project.etatCMD || "Non défini"}</span>
          </div>
          <span style="font-size:11px;color:#6b7280;">${project.nbCabines || 0} cabine(s)</span>
          ${project.dateMontage ? `<br/><span style="font-size:11px;color:#6b7280;">Montage : ${project.dateMontage.slice(0, 10)}</span>` : ""}
        </div>`,
        { maxWidth: 280 }
      );

      marker.addTo(layer);
      bounds.push([latlng.lat, latlng.lng]);
    });

    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }, [geocodedProjects, activeStatuses, selectedCollaborator]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  const toggleStatus = (status: StatusColor) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const projectsWithAddress = projects.filter((p) => p.adresseChantier?.trim());

  return (
    <div className="space-y-3">
      {/* Filter controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.entries(STATUS_LABELS) as [StatusColor, string][]).map(
          ([color, label]) => (
            <button
              key={color}
              onClick={() => toggleStatus(color)}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-all ${
                activeStatuses.has(color)
                  ? "border-gray-300 bg-white shadow-sm"
                  : "border-gray-200 bg-gray-50 opacity-50"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLOR_HEX[color] }}
              />
              {label}
            </button>
          )
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedCollaborator}
          onChange={(e) => setSelectedCollaborator(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
        >
          <option value="all">Tous les collaborateurs</option>
          {collaborators.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-gray-400">
          {geocodedProjects.filter((gp) => {
            const sc = getStatusColor(gp.project);
            if (!activeStatuses.has(sc)) return false;
            if (selectedCollaborator !== "all" && gp.project.collaborateurs !== selectedCollaborator) return false;
            return true;
          }).length}{" "}
          / {projectsWithAddress.length} chantiers affichés
        </span>
      </div>

      {/* Geocoding progress */}
      {geocoding && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Géocodage des adresses... {geocodeProgress.done}/{geocodeProgress.total}
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-300"
              style={{
                width: `${geocodeProgress.total > 0 ? (geocodeProgress.done / geocodeProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Map container */}
      <div
        ref={mapContainerRef}
        className="w-full rounded-xl border border-gray-200 overflow-hidden"
        style={{ height: 420 }}
      />

      {!leafletLoaded && (
        <div className="flex items-center justify-center py-8 text-sm text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mr-2" />
          Chargement de la carte...
        </div>
      )}

      {!geocoding && geocodedProjects.length === 0 && projectsWithAddress.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Aucune adresse n&apos;a pu être géocodée. Vérifiez les adresses des chantiers.
        </p>
      )}

      {projectsWithAddress.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          Aucun projet avec adresse de chantier.
        </p>
      )}
    </div>
  );
}
