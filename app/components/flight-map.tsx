"use client";

import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lon: number;
  flightNumber: string;
};

// DXB and BEG coordinates
const DXB = { lat: 25.2528, lon: 55.3644 };
const BEG = { lat: 44.8184, lon: 20.3091 };

function progressPercent(lat: number, lon: number): number {
  const totalDist = Math.sqrt(
    (BEG.lat - DXB.lat) ** 2 + (BEG.lon - DXB.lon) ** 2
  );
  const coveredDist = Math.sqrt(
    (lat - DXB.lat) ** 2 + (lon - DXB.lon) ** 2
  );
  return Math.min(100, Math.round((coveredDist / totalDist) * 100));
}

export function FlightMap({ lat, lon, flightNumber }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Dynamic import to avoid SSR issues with Leaflet
    import("leaflet").then((L) => {
      // Import Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Clean up previous map instance
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as L.Map).remove();
      }

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([lat, lon], 5);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 18,
      }).addTo(map);

      // Route line DXB → BEG
      L.polyline(
        [
          [DXB.lat, DXB.lon],
          [BEG.lat, BEG.lon],
        ],
        { color: "#3B82F6", weight: 2, opacity: 0.5, dashArray: "8 4" }
      ).addTo(map);

      // DXB marker
      L.circleMarker([DXB.lat, DXB.lon], {
        radius: 5,
        color: "#6B7280",
        fillColor: "#6B7280",
        fillOpacity: 1,
      })
        .bindTooltip("DXB", { permanent: true, direction: "bottom", className: "map-label" })
        .addTo(map);

      // BEG marker
      L.circleMarker([BEG.lat, BEG.lon], {
        radius: 5,
        color: "#6B7280",
        fillColor: "#6B7280",
        fillOpacity: 1,
      })
        .bindTooltip("BEG", { permanent: true, direction: "bottom", className: "map-label" })
        .addTo(map);

      // Aircraft marker
      const aircraftIcon = L.divIcon({
        html: `<div style="font-size: 20px; filter: drop-shadow(0 0 4px rgba(59,130,246,0.6));">✈</div>`,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([lat, lon], { icon: aircraftIcon })
        .bindTooltip(flightNumber, { permanent: true, direction: "top", className: "map-label" })
        .addTo(map);

      // Fit bounds to show full route
      map.fitBounds(
        L.latLngBounds([DXB.lat, DXB.lon], [BEG.lat, BEG.lon]).pad(0.15)
      );

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lon, flightNumber]);

  const progress = progressPercent(lat, lon);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div ref={mapRef} className="h-64 w-full" />
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <span className="text-gray-400">
          {flightNumber} — {progress}% of route
        </span>
        <span className="text-blue-400 animate-pulse-dot">Live tracking</span>
      </div>
    </div>
  );
}
