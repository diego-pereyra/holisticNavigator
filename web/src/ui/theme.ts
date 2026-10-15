// Temas Día / Noche / Rojo (T11.5). La UI toma sus colores de variables CSS
// (`html[data-theme]`, ver app.css); acá viven la paleta del mapa y las dos
// piezas que hacen falta para aplicarla y para resolver el modo automático.

import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import { isNight } from "../core/sun.ts";

export type ThemeName = "day" | "night" | "red";
export type ThemeChoice = ThemeName | "auto";

// Orden del selector de un toque: Día → Noche → Rojo → Auto.
export const THEME_ORDER: ThemeChoice[] = ["day", "night", "red", "auto"];

export const THEME_LABEL: Record<ThemeChoice, string> = {
  day: "Día",
  night: "Noche",
  red: "Rojo",
  auto: "Auto",
};

export function themeIcon(name: ThemeName): string {
  return name === "day" ? "☀" : name === "night" ? "☾" : "●";
}

export type BathyShades = [string, string, string, string, string, string];

export interface MapPalette {
  background: string;
  bathy: BathyShades;
  countryFill: readonly [string, string, string, string, string, string, string];
  countryLine: string;
  coastLine: string;
  graticuleLine: string;
  graticuleLabel: string;
  countryLabel: string;
  cityLabel: string;
  detailPlace: string;
  detailWater: string;
  detailEarth: string;
  boundaryLine: string;
  catalog: string;
  routeWps: string;
  navToWp: string;
  voyage: string;
  myGps: string;
  myManual: string;
  mySim: string;
  basinLabel: string;
  imported: string;
  halo: string;
}

const RED_FILL: readonly [string, string, string, string, string, string, string] = ["#1a0000", "#1a0000", "#1a0000", "#1a0000", "#1a0000", "#1a0000", "#1a0000"];

const PALETTES: Record<ThemeName, MapPalette> = {
  night: {
    background: "#15263f",
    bathy: ["#13223a", "#0f1d33", "#0c182b", "#0a1425", "#081120", "#060d1a"],
    countryFill: ["#1c2733", "#202c3a", "#1a2a31", "#22293a", "#1e2f3a", "#242a33", "#1b2d38"],
    countryLine: "#3a4a5a",
    coastLine: "#3a4a5a",
    graticuleLine: "#17202b",
    graticuleLabel: "#44546a",
    countryLabel: "#6b7f96",
    cityLabel: "#9FB0C0",
    detailPlace: "#9FB0C0",
    detailWater: "#0b1626",
    detailEarth: "#1c2733",
    boundaryLine: "#3a4a5a",
    catalog: "#4FC3F7",
    routeWps: "#FFCC80",
    navToWp: "#00E676",
    voyage: "#FFD54F",
    myGps: "#2979FF",
    myManual: "#B388FF",
    mySim: "#FF8F00",
    basinLabel: "#4FC3F7",
    imported: "#B388FF",
    halo: "#0b1626",
  },
  day: {
    background: "#dbeaf6",
    bathy: ["#c3dbee", "#b4d0e7", "#a6c6e0", "#98bcd9", "#8bb3d3", "#7faacd"],
    countryFill: ["#ece9e0", "#e6e3d8", "#efe9dc", "#e9e5da", "#e4e2d6", "#ede7de", "#e8e4d9"],
    countryLine: "#b9b4a6",
    coastLine: "#6f8aa0",
    graticuleLine: "#c5d5e3",
    graticuleLabel: "#7a8a98",
    countryLabel: "#3c4a58",
    cityLabel: "#4a5a6a",
    detailPlace: "#4a5a6a",
    detailWater: "#cfe3f3",
    detailEarth: "#ece9e0",
    boundaryLine: "#b9b4a6",
    catalog: "#1565c0",
    routeWps: "#ef6c00",
    navToWp: "#00897b",
    voyage: "#f9a825",
    myGps: "#1e88e5",
    myManual: "#7e57c2",
    mySim: "#fb8c00",
    basinLabel: "#0b5aa8",
    imported: "#7e57c2",
    halo: "#ffffff",
  },
  red: {
    background: "#000000",
    bathy: ["#0a0000", "#080000", "#060000", "#050000", "#040000", "#030000"],
    countryFill: RED_FILL,
    countryLine: "#5a0000",
    coastLine: "#5a0000",
    graticuleLine: "#2a0000",
    graticuleLabel: "#8b0000",
    countryLabel: "#c62828",
    cityLabel: "#c62828",
    detailPlace: "#c62828",
    detailWater: "#000000",
    detailEarth: "#1a0000",
    boundaryLine: "#5a0000",
    catalog: "#ff5252",
    routeWps: "#ff8a80",
    navToWp: "#ff6e40",
    voyage: "#ff9e80",
    myGps: "#ff1744",
    myManual: "#ff5252",
    mySim: "#ff8a80",
    basinLabel: "#ff5252",
    imported: "#ff5252",
    halo: "#000000",
  },
};

export function mapPalette(theme: ThemeName): MapPalette {
  return PALETTES[theme];
}

// Auto (punto 4): entre salida y puesta del sol → Día; si no → Noche (o Rojo si
// redAtNight). Sin posición se toma 40 N, 0 E.
export function resolveTheme(
  choice: ThemeChoice,
  redAtNight: boolean,
  lat: number,
  lon: number,
  nowMs: number,
): ThemeName {
  if (choice !== "auto") return choice;
  return isNight(lat, lon, nowMs) ? (redAtNight ? "red" : "night") : "day";
}

function bathyExpression(colors: BathyShades): ExpressionSpecification {
  return [
    "match", ["get", "depth"],
    200, colors[0],
    1000, colors[1],
    2000, colors[2],
    3000, colors[3],
    4000, colors[4],
    5000, colors[5],
    colors[5],
  ];
}

function countryExpression(colors: readonly [string, string, string, string, string, string, string]): ExpressionSpecification {
  return [
    "match",
    ["get", "mapcolor7"],
    1, colors[0], 2, colors[1], 3, colors[2], 4, colors[3], 5, colors[4], 6, colors[5], 7, colors[6],
    colors[0],
  ];
}

// Color de "yo" según la fuente de la posición (GPS / manual / simulada).
function meExpression(p: MapPalette): ExpressionSpecification {
  return ["case", ["==", ["get", "source"], "simulated"], p.mySim, ["==", ["get", "source"], "manual"], p.myManual, p.myGps];
}

// Aplica el tema sobre las capas ya presentes. No recrea el estilo: solo cambia
// las propiedades pintadas. Las capas que todavía no existen se saltean, así
// sirve tanto al arrancar como después (zonas descargadas, catálogo, etc.).
export function applyTheme(map: MlMap, theme: ThemeName): void {
  const p = mapPalette(theme);
  const setPaint = map.setPaintProperty.bind(map) as (id: string, prop: string, value: unknown) => void;
  const paint = (id: string, prop: string, value: unknown): void => {
    if (map.getLayer(id)) setPaint(id, prop, value);
  };
  const halo = (id: string): void => {
    paint(id, "text-halo-color", p.halo);
  };

  paint("background", "background-color", p.background);
  paint("bathy-fill", "fill-color", bathyExpression(p.bathy));
  paint("country-fill", "fill-color", countryExpression(p.countryFill));
  paint("country-line", "line-color", p.countryLine);
  paint("coast-line", "line-color", p.coastLine);
  paint("graticule-line", "line-color", p.graticuleLine);
  paint("graticule-label", "text-color", p.graticuleLabel);

  paint("detail-water", "fill-color", p.detailWater);
  paint("detail-earth", "fill-color", p.detailEarth);
  paint("detail-boundary", "line-color", p.boundaryLine);
  paint("detail-place", "text-color", p.detailPlace);
  halo("detail-place");

  paint("country-label", "text-color", p.countryLabel);
  halo("country-label");
  paint("city-dot", "circle-color", p.cityLabel);
  paint("city-label", "text-color", p.cityLabel);
  halo("city-label");

  paint("catalog-lines", "line-color", p.catalog);
  paint("route-lines", "line-color", p.catalog);
  paint("route-active", "line-color", p.catalog);

  paint("voyage-line", "line-color", p.voyage);
  paint("nav-to-wp", "line-color", p.navToWp);
  paint("imported-lines", "line-color", p.imported);

  paint("route-wps", "circle-color", p.routeWps);
  paint("route-wps", "circle-stroke-color", p.halo);
  paint("route-wps-selected", "circle-color", p.routeWps);
  paint("route-wps-selected", "circle-stroke-color", p.halo);
  paint("route-wp-selected", "circle-color", p.routeWps);
  paint("route-wp-selected", "circle-stroke-color", p.halo);
  paint("route-wp-selected-halo", "circle-color", p.routeWps);

  paint("basin-label", "text-color", p.basinLabel);
  halo("basin-label");

  paint("anchor-ring", "line-color", p.voyage);
  paint("anchor-dot", "circle-color", p.voyage);
  paint("anchor-dot", "circle-stroke-color", p.halo);
  paint("mob", "text-color", p.myGps);
  halo("mob");

  for (const id of ["my-accuracy", "my-halo", "my-dot"]) paint(id, "circle-color", meExpression(p));
  paint("my-accuracy", "circle-stroke-color", p.myGps);
  paint("my-dot", "circle-stroke-color", p.halo);

  // Zonas descargadas (E10.2/E10.3): repiten las capas de detalle con sufijo.
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (id === "detail-water" || id.startsWith("detail-water-")) paint(id, "fill-color", p.detailWater);
    else if (id === "detail-earth" || id.startsWith("detail-earth-")) paint(id, "fill-color", p.detailEarth);
    else if (id.startsWith("detail-boundary")) paint(id, "line-color", p.boundaryLine);
    else if (id.startsWith("detail-place") || id.endsWith("-poi")) {
      paint(id, "text-color", p.detailPlace);
      halo(id);
    }
  }
}
