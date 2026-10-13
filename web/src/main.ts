import { Map, NavigationControl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const LAND = "basemap/land.geojson";
const GRATICULE = "basemap/graticule.geojson";

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: "geojson", data: LAND },
      graticule: { type: "geojson", data: GRATICULE },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0b1626" },
      },
      {
        id: "land-fill",
        type: "fill",
        source: "land",
        paint: { "fill-color": "#1c2733" },
      },
      {
        id: "coast-line",
        type: "line",
        source: "land",
        paint: { "line-color": "#3a4a5a", "line-width": 0.8 },
      },
      {
        id: "graticule-line",
        type: "line",
        source: "graticule",
        paint: { "line-color": "#17202b", "line-width": 0.6 },
      },
      {
        id: "graticule-label",
        type: "symbol",
        source: "graticule",
        minzoom: 2,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10,
          "symbol-placement": "line",
        },
        paint: { "text-color": "#44546a" },
      },
    ],
  };
}

const map = new Map({
  container: "map",
  style: baseMapStyle(),
  center: [0, 20],
  zoom: 1.2,
  minZoom: 0,
  maxZoom: 12,
  attributionControl: false,
});

map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");

map.on("load", () => {
  const el = document.getElementById("hn-loading");
  if (el) el.classList.add("done");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
  });
}
