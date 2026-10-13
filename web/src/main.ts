import { Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { mountApp } from "./ui/app.ts";
import { loadBasins, loadIndex, loadRoutesGeoJson } from "./platform/catalog.ts";
import { openStore } from "./platform/store.ts";

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

// MapLibre 6 corre en un Web Worker servido como archivo aparte (esbuild no lo
// incluye en el bundle). build-web.sh lo copia a dist/; acá se fija su URL
// relativa a la base de la app (funciona en Pages bajo /holisticNavigator/).
setWorkerUrl(new URL("maplibre-gl-worker.mjs", document.baseURI).toString());

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

async function boot(): Promise<void> {
  try {
    const [index, basins, routesGeoJson, store] = await Promise.all([
      loadIndex(),
      loadBasins(),
      loadRoutesGeoJson(),
      openStore(),
    ]);
    mountApp(map, { index, basins, routesGeoJson, store });
  } catch (err) {
    console.error("No pude iniciar la app:", err);
  } finally {
    document.getElementById("hn-loading")?.classList.add("done");
  }
}

if (map.loaded()) void boot();
else map.on("load", () => void boot());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
  });
}
