import test from "node:test";
import assert from "node:assert/strict";
import type { Map as MlMap } from "maplibre-gl";

import { CLIM_SCALES, type ClimMonth } from "../core/clim.ts";
import {
  clearWeather,
  initWeatherLayers,
  summarizeRoute,
  updateWeather,
  WX_ARROW_OPACITY,
  WX_ARROW_WIDTH,
  WX_CURRENT_COLOR,
  WX_CYCLONE_OPACITY,
  WX_FIELD_COLOR,
  WX_ICE_COLOR,
} from "./weather.ts";

interface PaintCall {
  layer: string;
  name: string;
  value: unknown;
}

interface MockMap {
  map: MlMap;
  paints: PaintCall[];
  layers: Map<string, { paint?: Record<string, unknown> }>;
  data: Map<string, { features: unknown[] }>;
}

// Diez celdas de prueba (5 × 2) en el Atlántico ecuatorial, todas de mar:
// viento medio de 15 kn del ENE, constancia 80 %, corriente de 0,5 kn al E,
// dos tormentas por década (riesgo ciclónico) y sin hielo.
function miniClim(): ClimMonth {
  const nx = 5;
  const ny = 2;
  const data = new Uint8Array(nx * ny * 9);
  const i8 = (v: number): number => (v < 0 ? v + 256 : v);
  for (let i = 0; i < ny; i++) {
    for (let j = 0; j < nx; j++) {
      const b = (i * nx + j) * 9;
      data[b] = i8(-22);
      data[b + 1] = i8(-9);
      data[b + 2] = 30;
      data[b + 3] = 80;
      data[b + 4] = 20;
      data[b + 5] = 10;
      data[b + 6] = 0;
      data[b + 7] = 2;
      data[b + 8] = 0;
    }
  }
  return { grid: [nx, ny], origin: [0, 0], fields: 9, scales: CLIM_SCALES, data };
}

function mockMap(zoom: number): MockMap {
  const layers = new Map<string, { paint?: Record<string, unknown> }>();
  const data = new Map<string, { features: unknown[] }>();
  const paints: PaintCall[] = [];
  const bounds = {
    getWest: () => -180,
    getEast: () => 180,
    getSouth: () => -90,
    getNorth: () => 90,
  };
  const map = {
    getLayer: (id: string) => layers.get(id),
    addSource: (id: string) => {
      data.set(id, { features: [] });
    },
    addLayer: (spec: { id: string; paint?: Record<string, unknown> }) => {
      layers.set(spec.id, spec);
    },
    getSource: (id: string) => ({
      setData: (fc: { features: unknown[] }) => data.set(id, fc),
    }),
    setPaintProperty: (layer: string, name: string, value: unknown) => {
      paints.push({ layer, name, value });
    },
    getZoom: () => zoom,
    getBounds: () => bounds,
    addImage: () => {},
  } as unknown as MlMap;
  return { map, paints, layers, data };
}

test("E8.3 arma las cinco capas wx con paint propio", () => {
  const m = mockMap(4);
  initWeatherLayers(m.map);
  const initial = (id: string): Record<string, unknown> => m.layers.get(id)?.paint ?? {};
  assert.equal(initial("wx-field")["fill-color"], WX_FIELD_COLOR);
  assert.equal(initial("wx-arrows")["line-opacity"], WX_ARROW_OPACITY);
  assert.equal(initial("wx-current")["line-color"], WX_CURRENT_COLOR);
  assert.equal(initial("wx-ice")["fill-color"], WX_ICE_COLOR);
  assert.ok(m.layers.has("wx-cyclone"), "falta wx-cyclone");
});

test("E8.3 repinta diez celdas de prueba y setea el paint de cada capa", () => {
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateWeather(m.map, miniClim(), 1);

  assert.equal(m.data.get("wx-field")?.features.length, 10, "celdas de campo");
  assert.equal(m.data.get("wx-arrows")?.features.length, 10, "flechas de viento");
  assert.equal(m.data.get("wx-current")?.features.length, 10, "flechas de corriente");
  assert.equal(m.data.get("wx-cyclone")?.features.length, 10, "celdas con ciclones");
  assert.equal(m.data.get("wx-ice")?.features.length, 0, "sin hielo");

  const paint = (layer: string, name: string): PaintCall | undefined =>
    m.paints.find((p) => p.layer === layer && p.name === name);
  assert.equal(paint("wx-field", "fill-color")?.value, WX_FIELD_COLOR);
  assert.equal(paint("wx-arrows", "line-width")?.value, WX_ARROW_WIDTH);
  assert.equal(paint("wx-arrows", "line-opacity")?.value, WX_ARROW_OPACITY);
  assert.equal(paint("wx-current", "line-color")?.value, WX_CURRENT_COLOR);
  assert.equal(paint("wx-cyclone", "fill-opacity")?.value, WX_CYCLONE_OPACITY);
  assert.equal(paint("wx-ice", "fill-color")?.value, WX_ICE_COLOR);

  clearWeather(m.map);
  assert.equal(m.data.get("wx-field")?.features.length, 0, "clearWeather vacía");
});

test("E8.3 resumen de viento medio en ruta", () => {
  const route = { type: "LineString", coordinates: [[0, 0], [4, 1]] as [number, number][] };
  const s = summarizeRoute(miniClim(), route);
  assert.ok(s !== null, "sin resumen");
  assert.ok(Math.abs(s.ws - 15) < 0.01, `ws=${s.ws}`);
  assert.ok(Math.abs(s.st - 80) < 0.01, `st=${s.st}`);
  assert.equal(s.dirLabel, "ENE");
  assert.ok(Math.abs(s.currentKn - 0.5) < 0.01, `corriente=${s.currentKn}`);
  assert.equal(s.currentFwd, true);
  assert.equal(s.risk, "moderado");
});
