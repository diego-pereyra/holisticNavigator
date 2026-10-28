import test from "node:test";
import assert from "node:assert/strict";
import type { Map as MlMap } from "maplibre-gl";

import { CLIM_SCALES, type ClimMonth } from "../core/clim.ts";
import { FORECAST_MISSING, type ForecastPackage } from "../core/forecast.ts";
import {
  clearWeather,
  hourLabel,
  initWeatherLayers,
  isobarLabels,
  isobars,
  nearestSlot,
  slotTime,
  summarizeRoute,
  updateForecastWeather,
  updateWeather,
  waveArrows,
  waveHeads,
  WX_ARROW_OPACITY,
  WX_ARROW_WIDTH,
  WX_CURRENT_COLOR,
  WX_CURRENT_WIDTH,
  WX_CYCLONE_OPACITY,
  WX_FIELD_COLOR,
  WX_HEAD_CURRENT,
  WX_HEAD_WAVE,
  WX_HEAD_WIND,
  type HeadShape,
  WX_ICE_COLOR,
  WX_ISOBAR_COLOR,
  WX_WAVE_COLOR,
  WX_WAVE_COLORS,
  WX_WIND_LINE_WIDTH,
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
    getWest: () => -5,
    getEast: () => 5,
    getSouth: () => -5,
    getNorth: () => 5,
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
    getCanvas: () => ({ clientWidth: 1024 }),
    addImage: () => {},
  } as unknown as MlMap;
  return { map, paints, layers, data };
}

test("E8.3/E13.2 arma las siete capas wx con paint propio", () => {
  const m = mockMap(4);
  initWeatherLayers(m.map);
  const initial = (id: string): Record<string, unknown> => m.layers.get(id)?.paint ?? {};
  assert.equal(initial("wx-field")["fill-color"], WX_FIELD_COLOR);
  assert.equal(initial("wx-arrows")["line-opacity"], WX_ARROW_OPACITY);
  assert.equal(initial("wx-arrows-head")["fill-opacity"], WX_ARROW_OPACITY);
  assert.equal(initial("wx-current")["line-color"], WX_CURRENT_COLOR);
  assert.equal(initial("wx-current-head")["fill-color"], WX_CURRENT_COLOR);
  assert.equal(initial("wx-ice")["fill-color"], WX_ICE_COLOR);
  assert.ok(m.layers.has("wx-cyclone"), "falta wx-cyclone");
  assert.ok(!m.layers.has("wx-arrows-dot"), "el círculo viejo ya no va");
  assert.equal(initial("wx-isobars")["line-color"], WX_ISOBAR_COLOR);
  assert.equal(initial("wx-waves")["line-color"], WX_WAVE_COLOR);
  assert.equal(initial("wx-waves-head")["fill-color"], WX_WAVE_COLOR);
});

test("E8.3 repinta diez celdas de prueba y setea el paint de cada capa", () => {
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateWeather(m.map, miniClim(), 1);

  assert.equal(m.data.get("wx-field")?.features.length, 10, "celdas de campo");
  // E13.5: viento y corriente salen como líneas de flujo (polilíneas).
  assert.ok((m.data.get("wx-arrows")?.features.length ?? 0) > 0, "líneas de viento");
  assert.equal(
    m.data.get("wx-arrows-head")?.features.length,
    m.data.get("wx-arrows")?.features.length,
    "una punta por línea de viento",
  );
  assert.ok((m.data.get("wx-current")?.features.length ?? 0) > 0, "líneas de corriente");
  assert.equal(
    m.data.get("wx-current-head")?.features.length,
    m.data.get("wx-current")?.features.length,
    "una punta por línea de corriente",
  );
  assert.equal(m.data.get("wx-cyclone")?.features.length, 10, "celdas con ciclones");
  assert.equal(m.data.get("wx-ice")?.features.length, 0, "sin hielo");

  const paint = (layer: string, name: string): PaintCall | undefined =>
    m.paints.find((p) => p.layer === layer && p.name === name);
  assert.equal(paint("wx-field", "fill-color")?.value, WX_FIELD_COLOR);
  assert.equal(paint("wx-arrows", "line-width")?.value, WX_ARROW_WIDTH);
  assert.equal(paint("wx-arrows", "line-opacity")?.value, WX_ARROW_OPACITY);
  assert.equal(paint("wx-arrows-head", "fill-opacity")?.value, WX_ARROW_OPACITY);
  assert.equal(paint("wx-current", "line-color")?.value, WX_CURRENT_COLOR);
  assert.equal(paint("wx-current-head", "fill-color")?.value, WX_CURRENT_COLOR);
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

// --- E13.2: pronóstico en el mapa -------------------------------------

// Paquete sintético: grilla 3×3 sobre [0,0,2,2], presión que sube 3 hPa por
// columna (isobara a 1004 hPa), olas de 1,8 m del este (90°).
function fcPackage(steps = 4): ForecastPackage {
  const cols = 3;
  const rows = 3;
  const count = cols * rows * steps;
  const times = Array.from({ length: steps }, (_, t) => (1_700_000_000 + t * 3 * 3600) * 1000);
  const mk = (fn: (c: number, r: number, t: number) => number | null): Int16Array => {
    const a = new Int16Array(count).fill(FORECAST_MISSING);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (let t = 0; t < steps; t++) {
          const v = fn(c, r, t);
          a[(r * cols + c) * steps + t] = v === null ? FORECAST_MISSING : Math.round(v * 10);
        }
      }
    }
    return a;
  };
  return {
    id: "test",
    issuedAt: times[0]!,
    fetchedAt: times[0]!,
    bbox: [0, 0, 2, 2],
    stepHours: 3,
    cols,
    rows,
    times,
    vars: {
      wind_speed: mk(() => 15),
      wind_direction: mk(() => 90),
      wind_gusts: new Int16Array(count),
      pressure: mk((c) => 1000 + c * 3),
      wave_height: mk(() => 1.8),
      wave_direction: mk(() => 90),
      wave_period: new Int16Array(count),
      current_velocity: mk(() => 1.2),
      current_direction: mk(() => 0),
    },
  };
}

test("E13.2 deslizador: hora, paso y etiqueta", () => {
  const pkg = fcPackage(8);
  assert.equal(slotTime(pkg, 3) - slotTime(pkg, 0), 3 * 3 * 3600 * 1000, "paso 3 h");
  assert.equal(slotTime(pkg, 0), pkg.times[0]);
  const now = slotTime(pkg, 5);
  assert.equal(nearestSlot(pkg, now), 5);
  assert.equal(nearestSlot(pkg, slotTime(pkg, 0) - 10 * 3600 * 1000), 0, "antes del inicio");
  assert.ok(nearestSlot(pkg, slotTime(pkg, 0) + 400 * 24 * 3600 * 1000) > 100, "lejos, dentro del rango");
  assert.equal(hourLabel(Date.UTC(2026, 9, 14, 15, 0)), "mié 14 · 15:00 UTC");
});

test("E13.2 isobaras cada 4 hPa", () => {
  const lines = isobars(fcPackage(4), 0);
  assert.ok(lines.length > 0, "sin isobaras");
  for (const f of lines) {
    const hpa = (f as { properties: { hpa: number } }).properties.hpa;
    assert.equal(hpa, 1004, `nivel ${hpa} no es 1004`);
  }
});

test("E13.2 flechas de ola por altura y dirección", () => {
  const arrows = waveArrows(fcPackage(4), 0, 1);
  assert.equal(arrows.length, 9, "una por celda marina");
  for (const f of arrows) {
    const props = (f as { properties: { h: number; dir: number } }).properties;
    assert.equal(props.h, 1.8);
    assert.equal(props.dir, 90);
    const c = (f as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
    assert.ok(c[0]![0] > c[1]![0], "la ola viene del E: la flecha apunta al O");
  }
});

test("E13.2 dentro del horizonte pinta isobaras y olas; fuera, clima medio", () => {
  const pkg = fcPackage(4);
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateWeather(m.map, miniClim(), 1);

  const inside = slotTime(pkg, 2);
  const beyond = updateForecastWeather(m.map, miniClim(), pkg, inside);
  assert.equal(beyond, false);
  assert.ok((m.data.get("wx-isobars")?.features.length ?? 0) > 0, "sin isobaras");
  assert.ok((m.data.get("wx-waves")?.features.length ?? 0) > 0, "sin olas");
  assert.equal(m.data.get("wx-waves-head")?.features.length, m.data.get("wx-waves")?.features.length, "una punta por ola");
  assert.equal(m.data.get("wx-field")?.features.length, 9, "viento del pronóstico (3×3)");

  const outside = updateForecastWeather(m.map, miniClim(), pkg, pkg.times[3]! + 3 * 3600 * 1000);
  assert.equal(outside, true, "más allá del horizonte");
  assert.equal(m.data.get("wx-isobars")?.features.length, 0, "sin isobaras fuera del horizonte");
  assert.equal(m.data.get("wx-waves")?.features.length, 10, "olas de climatología");
  assert.equal(m.data.get("wx-waves-head")?.features.length, 0, "climatología sin dirección: sin punta");
});

test("E13.4 el pronóstico dibuja viento y corrientes del paquete", () => {
  const pkg = fcPackage(4);
  const m = mockMap(4);
  initWeatherLayers(m.map);
  const inside = slotTime(pkg, 1);
  assert.equal(updateForecastWeather(m.map, null, pkg, inside), false);

  assert.equal(m.data.get("wx-field")?.features.length, 9, "campo de viento");
  const windLines = m.data.get("wx-arrows")!.features;
  const windHeads = m.data.get("wx-arrows-head")!.features;
  const curLines = m.data.get("wx-current")!.features;
  const curHeads = m.data.get("wx-current-head")!.features;
  assert.ok(windLines.length > 0, "líneas de viento");
  assert.equal(windHeads.length, windLines.length, "una punta por línea");
  assert.ok(curLines.length > 0, "líneas de corriente");
  assert.equal(curHeads.length, curLines.length, "una punta por corriente");
  const waveArrowsN = m.data.get("wx-waves")!.features.length;
  assert.equal(m.data.get("wx-waves-head")?.features.length, waveArrowsN, "una punta por ola");

  // Viento del E (90°): la flechita va hacia el O y lleva st:100.
  const wl = windLines[0] as {
    properties: { ws: number; st: number };
    geometry: { type: string; coordinates: [number, number][] };
  };
  assert.equal(wl.geometry.type, "LineString", "viento = segmento");
  assert.equal(wl.geometry.coordinates.length, 2, "flechita de dos puntos");
  assert.equal(wl.properties.st, 100, "opacidad plena en pronóstico");
  assert.equal(wl.properties.ws, 15);
  const wc = wl.geometry.coordinates;
  assert.ok(wc[1]![0] < wc[0]![0], "el viento viene del E, fluye hacia el O");

  // Corriente hacia el N (0°): la raya va hacia el norte.
  const cl = curLines[0] as { geometry: { coordinates: [number, number][] } };
  const cc = cl.geometry.coordinates;
  assert.ok(cc[1]![1] > cc[0]![1], "la corriente fluye hacia el norte");

  // Fuera del horizonte, el viento y la corriente salen de la climatología.
  const beyond = updateForecastWeather(m.map, miniClim(), pkg, pkg.times[3]! + 3600_000);
  assert.equal(beyond, true);
  assert.equal(m.data.get("wx-field")?.features.length, 10, "viento de climatología");
  assert.ok((m.data.get("wx-current")?.features.length ?? 0) > 0, "corriente de climatología");
});

test("E13.4 isobaras cosidas: polilíneas continuas con una etiqueta por línea", () => {
  const lines = isobars(fcPackage(4), 0);
  const labels = isobarLabels(fcPackage(4), 0);
  assert.ok(lines.length > 0, "hay isobaras");
  assert.equal(labels.length, lines.length, "una etiqueta hPa por polilínea");
  for (const line of lines) {
    const geom = (line as { geometry: { type: string; coordinates: [number, number][] } }).geometry;
    assert.equal(geom.type, "LineString");
    assert.ok(geom.coordinates.length >= 3, "cosida en polilínea, no segmentitos de 2 puntos");
  }
  for (const label of labels) {
    assert.equal((label as { properties: { label: string } }).properties.label, "1004");
  }
});

test("E13.4 silla: dos diagonales dan dos tramos, sin descartar puntos", () => {
  const cols = 2;
  const rows = 2;
  const count = cols * rows;
  const pressure = new Int16Array(count).fill(FORECAST_MISSING);
  // Esquinas opuestas altas (1005) y las otras bajas (1003): isobara de 1004 en silla.
  pressure[0] = 10050; // (c0,r0)
  pressure[1] = 10030; // (c1,r0)
  pressure[2] = 10030; // (c0,r1)
  pressure[3] = 10050; // (c1,r1)
  const empty = new Int16Array(count);
  const pkg: ForecastPackage = {
    id: "saddle",
    issuedAt: 0,
    fetchedAt: 0,
    bbox: [0, 0, 1, 1],
    stepHours: 3,
    cols,
    rows,
    times: [0],
    vars: {
      wind_speed: empty,
      wind_direction: empty,
      wind_gusts: empty,
      pressure,
      wave_height: empty,
      wave_direction: empty,
      wave_period: empty,
      current_velocity: empty,
      current_direction: empty,
    },
  };
  const lines = isobars(pkg, 0);
  assert.equal(lines.length, 2, "dos tramos (no se descarta el tercer punto)");
  assert.equal(isobarLabels(pkg, 0).length, 2);
});

test("E13.2 rampa de olas y constante de isobaras", () => {
  assert.equal(WX_WAVE_COLORS.length, 6);
  assert.equal(WX_ISOBAR_COLOR, "#9FB0C0");
});

test("E13.6 corrientes finas y discretas", () => {
  // Fina y sólida: el ancho ya no escala con la velocidad.
  assert.equal(WX_CURRENT_WIDTH, WX_WIND_LINE_WIDTH, "mismo grosor fino que el viento");
  assert.equal(WX_CURRENT_COLOR, "#2e9bff");
  const m = mockMap(4);
  initWeatherLayers(m.map);
  assert.equal(m.layers.get("wx-current")?.paint?.["line-color"], WX_CURRENT_COLOR);
  assert.equal((m.layers.get("wx-current")?.paint as Record<string, unknown>)["line-dasharray"], undefined, "sin guiones");
});

// --- E13.6/E13.7: punta de flecha (viento, corriente y olas) ----------

// Verifica que un triángulo de punta salga del vector (a→b) según su `shape`:
// ápice en el extremo `b`, alas atrás (a `back`·largo, con tope `maxDeg`) y
// separadas perpendicularmente (`half`·largo a cada lado).
function checkHead(
  ring: [number, number][],
  a: [number, number],
  b: [number, number],
  shape: HeadShape,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  const ux = dx / d;
  const uy = dy / d;
  const raw = shape.back * d;
  const back = Math.min(raw, shape.maxDeg);
  const k = raw > 0 ? back / raw : 0;
  const half = shape.half * d * k;
  assert.deepEqual(ring[0], b, "ápice en el extremo");
  assert.deepEqual(ring[3], ring[0], "anillo cerrado");
  const w1 = ring[1]!;
  const w2 = ring[2]!;
  const mid: [number, number] = [(w1[0] + w2[0]) / 2, (w1[1] + w2[1]) / 2];
  const expe: [number, number] = [b[0] - ux * back, b[1] - uy * back];
  assert.ok(Math.abs(mid[0] - expe[0]) < 1e-9 && Math.abs(mid[1] - expe[1]) < 1e-9, `alas detrás: ${mid}`);
  // Alas perpendiculares: (w1−w2)·dir ≈ 0.
  assert.ok(Math.abs((w1[0] - w2[0]) * ux + (w1[1] - w2[1]) * uy) < 1e-9, "alas perpendiculares");
  // Separación entre alas = 2·half·largo.
  assert.ok(Math.abs(Math.hypot(w1[0] - w2[0], w1[1] - w2[1]) - 2 * half) < 1e-9, "ancho de alas");
  // Alas detrás del ápice.
  assert.ok((mid[0] - b[0]) * ux + (mid[1] - b[1]) * uy < 0, "alas hacia atrás");
}

test("E13.6 la punta sale del vector (viento y corriente)", () => {
  const pkg = fcPackage(4);
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateForecastWeather(m.map, null, pkg, slotTime(pkg, 1));

  const arrow = m.data.get("wx-arrows")!.features[0] as {
    geometry: { coordinates: [number, number][] };
  };
  const windHead = m.data.get("wx-arrows-head")!.features[0] as {
    properties: { st: number };
    geometry: { coordinates: [number, number][][] };
  };
  assert.equal(windHead.properties.st, 100, "pronóstico: opacidad plena");
  const wa = arrow.geometry.coordinates;
  checkHead(
    windHead.geometry.coordinates[0]!,
    wa[0]!,
    wa[1]!,
    WX_HEAD_WIND,
  );

  const cur = m.data.get("wx-current")!.features[0] as {
    geometry: { coordinates: [number, number][] };
  };
  const curHead = m.data.get("wx-current-head")!.features[0] as {
    geometry: { coordinates: [number, number][][] };
  };
  const ca = cur.geometry.coordinates;
  checkHead(
    curHead.geometry.coordinates[0]!,
    ca[0]!,
    ca[1]!,
    WX_HEAD_CURRENT,
  );
});

test("E13.6 el pilot chart también lleva puntas", () => {
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateWeather(m.map, miniClim(), 1);
  const windLines = m.data.get("wx-arrows")?.features.length ?? 0;
  const curLines = m.data.get("wx-current")?.features.length ?? 0;
  assert.equal(m.data.get("wx-arrows-head")?.features.length, windLines, "puntas de viento (clima)");
  assert.equal(m.data.get("wx-current-head")?.features.length, curLines, "puntas de corriente (clima)");
  assert.ok(windLines > 0 && curLines > 0, "hay líneas de clima");
  assert.ok(!m.layers.has("wx-arrows-dot"), "el círculo viejo ya no va");
});

// --- E13.7: olas con punta y puntas de corriente más chicas ------------

test("E13.7 las olas del pronóstico llevan punta por altura", () => {
  const pkg = fcPackage(4);
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateForecastWeather(m.map, null, pkg, slotTime(pkg, 1));

  const arrows = m.data.get("wx-waves")!.features;
  const heads = m.data.get("wx-waves-head")!.features;
  assert.ok(heads.length > 0, "sin olas");
  assert.equal(heads.length, arrows.length, "una punta por flecha de ola");
  for (let i = 0; i < heads.length; i++) {
    const arrow = arrows[i] as { geometry: { coordinates: [number, number][] } };
    const head = heads[i] as {
      properties: { h: number };
      geometry: { coordinates: [number, number][][] };
    };
    assert.equal(head.properties.h, 1.8, "misma altura que la ola, para la rampa de color");
    checkHead(
      head.geometry.coordinates[0]!,
      arrow.geometry.coordinates[0]!,
      arrow.geometry.coordinates[1]!,
      WX_HEAD_WAVE,
    );
  }
});

test("E13.7 las olas de climatología no llevan punta (sin dirección)", () => {
  const pkg = fcPackage(4);
  const m = mockMap(4);
  initWeatherLayers(m.map);
  updateForecastWeather(m.map, miniClim(), pkg, pkg.times[3]! + 3600_000);
  assert.ok((m.data.get("wx-waves")?.features.length ?? 0) > 0, "hay olas de clima");
  assert.equal(m.data.get("wx-waves-head")?.features.length, 0, "cajas sin dirección: sin punta");
});

test("E13.7 la punta de corriente es más chica que la de viento", () => {
  assert.ok(WX_HEAD_CURRENT.back < WX_HEAD_WIND.back, "las alas van menos atrás");
  assert.ok(WX_HEAD_CURRENT.half < WX_HEAD_WIND.half, "alas más angostas");
  assert.ok(Math.abs(WX_HEAD_CURRENT.back - 0.12) < 1e-9, "~12 % del largo, punta chica");
  assert.ok(WX_HEAD_CURRENT.maxDeg < Infinity, "con tope absoluto en grados");
  assert.ok(WX_HEAD_WAVE.back > 0 && WX_HEAD_WAVE.back < WX_HEAD_WIND.back, "olas: punta intermedia");
});

// --- E13.6: flechitas discretas, finas y de largo fijo ------------------

test("E13.6 el viento va fino (1,25 px) y el color no engorda el trazo", () => {
  assert.equal(WX_WIND_LINE_WIDTH, 1.25);
  assert.equal(WX_ARROW_WIDTH, WX_WIND_LINE_WIDTH, "ancho fijo, no escala con la fuerza");
  const m = mockMap(4);
  initWeatherLayers(m.map);
  assert.equal(m.layers.get("wx-arrows")?.paint?.["line-width"], WX_ARROW_WIDTH);
});

test("E13.6 la flechita de viento tiene largo fijo (no depende de la velocidad)", () => {
  const pkg = fcPackage(4);
  const slow = { ...pkg, vars: { ...pkg.vars, wind_speed: new Int16Array(pkg.vars.wind_speed.length).fill(50) } };
  const fast = { ...pkg, vars: { ...pkg.vars, wind_speed: new Int16Array(pkg.vars.wind_speed.length).fill(400) } };
  const lenOf = (p: ForecastPackage): number => {
    const m = mockMap(4);
    initWeatherLayers(m.map);
    updateForecastWeather(m.map, null, p, slotTime(p, 1));
    const a = m.data.get("wx-arrows")!.features[0] as { geometry: { coordinates: [number, number][] } };
    const [x0, y0] = a.geometry.coordinates[0]!;
    const [x1, y1] = a.geometry.coordinates[1]!;
    return Math.hypot(x1 - x0, y1 - y0);
  };
  const l1 = lenOf(slow);
  const l2 = lenOf(fast);
  assert.ok(Math.abs(l1 - l2) < 1e-9, `mismo largo a 5 y 40 kn: ${l1} vs ${l2}`);
  assert.ok(Math.abs(l1 - 0.4) < 1e-9, `largo fijo ~0,4°: ${l1}`);
});

test("E13.6 las flechitas caen cada ~80 px a cualquier zoom", () => {
  const countAt = (zoom: number): number => {
    const m = mockMap(zoom);
    initWeatherLayers(m.map);
    updateWeather(m.map, miniClim(), 1);
    return m.data.get("wx-arrows")?.features.length ?? 0;
  };
  // A más zoom el mismo encuadre en grados=menos, pero el canvas fijo: menos celdas.
  assert.ok(countAt(3) >= countAt(6), "a más zoom, menos flechitas (mismo espaciado en px)");
  assert.ok(countAt(4) > 0, "siempre hay flechitas");
});

