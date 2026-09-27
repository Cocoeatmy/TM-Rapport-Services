"use client";

/**
 * Carte d'une tournée — quelques points seulement.
 *
 * Pourquoi celle-ci fonctionne alors que la carte de tous les chantiers ne
 * fonctionnait pas : on ne résout ici que les 2 à 6 adresses de la tournée
 * proposée, et les coordonnées sont mises en cache côté serveur (/api/geocode).
 * Une adresse déjà vue revient instantanément ; une nouvelle prend une seconde.
 * L'ancienne carte tentait d'en résoudre des dizaines à chaque affichage.
 *
 * Le bouton « Itinéraire dans Google Maps » ouvre le trajet complet, dans
 * l'ordre de visite, avec les kilomètres et le temps de route réels — ce que
 * l'approximation par code postal ne sait pas donner.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Navigation, MapPin } from "lucide-react";

type Point = { id: string; label: string; adresse: string; lat?: number; lng?: number };

/** Charge Leaflet depuis le CDN, une seule fois pour la page. */
function useLeaflet() {
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if ((window as any).L) { setPret(true); return; }
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => setPret(true);
    document.body.appendChild(s);
  }, []);
  return pret;
}

export function TourneeCarte({ etapes, depart }: {
  etapes: { id: string; adresse: string; localite: string }[];
  /** Dépôt : la journée en part et y revient. */
  depart?: string;
}) {
  const leafletPret = useLeaflet();
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [chargement, setChargement] = useState(true);
  const [restant, setRestant] = useState(0);

  /* Le tableau d'étapes est recréé à chaque rendu du parent : on dépend d'une
     signature stable, sinon l'effet se relancerait sans fin. */
  const signature = etapes.map((e) => e.id).join("|");

  // 1. Coordonnées (cache serveur d'abord, résolution ensuite).
  useEffect(() => {
    let vivant = true;
    setChargement(true);
    const adresses = etapes.map((e) => e.adresse || e.localite).filter(Boolean);
    if (adresses.length === 0) { setChargement(false); return; }

    const demander = async () => {
      const r = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresses }),
      }).then((x) => (x.ok ? x.json() : { resultats: {}, restant: 0 })).catch(() => ({ resultats: {}, restant: 0 }));
      if (!vivant) return;
      setPoints(etapes.map((e, i) => {
        const a = e.adresse || e.localite;
        const pos = r.resultats?.[a];
        return { id: e.id, label: String(i + 1), adresse: a, lat: pos?.lat, lng: pos?.lng };
      }));
      setRestant(r.restant || 0);
      setChargement(false);
      // Reste des adresses jamais vues : on relance, le cache se remplit.
      if (r.restant > 0 && vivant) demander();
    };
    demander();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // 2. Rendu de la carte.
  useEffect(() => {
    const L = (window as any).L;
    if (!leafletPret || !L || !divRef.current) return;
    const avecPos = points.filter((p) => p.lat != null && p.lng != null);
    if (avecPos.length === 0) return;

    if (!mapRef.current) {
      mapRef.current = L.map(divRef.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(mapRef.current);
    }
    const map = mapRef.current;
    // On repart d'une carte propre à chaque nouvelle tournée.
    map.eachLayer((l: any) => { if (l instanceof L.Marker || l instanceof L.Polyline) map.removeLayer(l); });

    const latlngs = avecPos.map((p) => [p.lat, p.lng]);
    avecPos.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:999px;background:#0c1626;color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px/1 ui-monospace,monospace;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${p.label}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map).bindPopup(p.adresse);
    });
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: "#1b63ff", weight: 3, opacity: 0.75, dashArray: "6 6" }).addTo(map);
    }
    map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
    setTimeout(() => map.invalidateSize(), 60);
  }, [leafletPret, points]);

  // Nettoyage à la fermeture du panneau.
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  /* Itinéraire complet : dépôt → chantiers → dépôt, comme se déroule la
     journée. Sans dépôt, on relie simplement les chantiers entre eux. */
  const lienGoogle = (() => {
    const etapesEnc = etapes.map((e) => encodeURIComponent(e.adresse || e.localite)).filter(Boolean);
    if (etapesEnc.length === 0) return null;
    if (depart) {
      const d = encodeURIComponent(depart);
      return `https://www.google.com/maps/dir/?api=1&origin=${d}&destination=${d}`
        + `&waypoints=${etapesEnc.join("|")}&travelmode=driving`;
    }
    if (etapesEnc.length === 1) return `https://www.google.com/maps/search/?api=1&query=${etapesEnc[0]}`;
    const inter = etapesEnc.slice(1, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${etapesEnc[0]}&destination=${etapesEnc[etapesEnc.length - 1]}`
      + (inter ? `&waypoints=${inter}` : "") + "&travelmode=driving";
  })();

  const introuvables = points.filter((p) => p.lat == null).length;

  return (
    <div className="sgt-carte-bloc">
      <div className="sgt-carte" ref={divRef} />
      {chargement && (
        <p className="sgt-note sgt-carte-etat">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Localisation des adresses{restant > 0 ? ` — ${restant} restante${restant > 1 ? "s" : ""}` : ""}…
        </p>
      )}
      {!chargement && introuvables > 0 && (
        <p className="sgt-note sgt-carte-etat">
          <MapPin className="w-3.5 h-3.5" />
          {introuvables} adresse{introuvables > 1 ? "s" : ""} non localisée{introuvables > 1 ? "s" : ""} — vérifiez-la dans Notion.
        </p>
      )}
      {lienGoogle && (
        <a href={lienGoogle} target="_blank" rel="noopener noreferrer" className="sgt-gmaps">
          <Navigation className="w-4 h-4" />
          Itinéraire dans Google Maps
        </a>
      )}
    </div>
  );
}
