import test from "node:test";
import assert from "node:assert/strict";

import {
  bboxCovers,
  bboxOfTrack,
  decodeForecast,
  empalmeConClimatología,
  encodeForecast,
  expandBbox,
  fetchForecast,
  forecastBytes,
  forecastIdPoint,
  forecastIdView,
  forecastKind,
  forecastOwnerName,
  forecastResolution,
  getForecastAge,
  marginBbox,
  packForecast,
  pointBbox,
  unpackForecast,
  type BBox,
  type ForecastPackage,
} from "./forecast.ts";
import {
  listForecasts,
  loadForecast,
  removeForecast,
  storeForecast,
} from "../platform/forecast.ts";
import type { KeyValueStore } from "../platform/store.ts";

// Canarias (16-28N, 13-18W) a Caribe (12-22N, 59-64W): la caja de la travesía.
const CANARIAS_CARIBE: BBox = [-63, 13, -14, 28];

const START = 1_700_000_000; // segundos epoch

function fakeFetch(url: string): Promise<unknown> {
  const u = new URL(url);
  const n = u.searchParams.get("latitude")!.split(",").length;
  const names = u.searchParams.get("hourly")!.split(",");
  const time = Array.from({ length: 168 }, (_, i) => START + i * 3600);
  return Promise.resolve(
    Array.from({ length: n }, () => {
      const hourly: Record<string, number[]> = { time };
      for (const nm of names) {
        const value = nm.startsWith("wave") ? 1.8 : nm.startsWith("ocean") ? 0.3 : 12.5;
        hourly[nm] = time.map(() => value);
      }
      return { hourly };
    }),
  );
}

function memStore(): KeyValueStore {
  const strings = new Map<string, string>();
  const blobs = new Map<string, Blob>();
  return {
    get(k: string): Promise<string | null> {
      return Promise.resolve(strings.get(k) ?? null);
    },
    put(k: string, v: string): Promise<void> {
      strings.set(k, v);
      return Promise.resolve();
    },
    remove(k: string): Promise<void> {
      strings.delete(k);
      return Promise.resolve();
    },
    putBlob(k: string, b: Blob): Promise<void> {
      blobs.set(k, b);
      return Promise.resolve();
    },
    getBlob(k: string): Promise<Blob | null> {
      return Promise.resolve(blobs.get(k) ?? null);
    },
    removeBlob(k: string): Promise<void> {
      blobs.delete(k);
      return Promise.resolve();
    },
  };
}

test("E13.1 descarga simulada Canarias–Caribe a 1°/3 h/7 d con progreso", async () => {
  const steps: number[] = [];
  const pkg = await fetchForecast(CANARIAS_CARIBE, 3, 7, {
    id: "canarias-caribe",
    marginNm: 0,
    onProgress: (r) => steps.push(r),
    now: () => START * 1000,
    fetchJson: fakeFetch,
  });

  // 300 nm de margen con la caja ya ancha ⇒ resolución 1°.
  assert.equal(forecastResolution(CANARIAS_CARIBE), 1);
  assert.equal(pkg.id, "canarias-caribe");
  assert.equal(pkg.stepHours, 3);
  // 7 días a 3 h ⇒ 56 pasos.
  assert.equal(pkg.times.length, 56);
  assert.equal(pkg.times[1]! - pkg.times[0]!, 3 * 3600 * 1000);

  // Cada var tiene cols*rows*pasos valores.
  const expect = pkg.cols * pkg.rows * pkg.times.length;
  assert.equal(pkg.vars.wind_speed.length, expect);
  // Punto 0 del paquete: viento 12,5 kn; ola 1,8 m (escala 0,1).
  assert.equal(decodeForecast(pkg.vars.wind_speed[0]!), 12.5);
  assert.equal(decodeForecast(pkg.vars.wave_height[0]!), 1.8);
  assert.equal(decodeForecast(pkg.vars.current_velocity[0]!), 0.3);

  // Progreso monótono que llega a 1.
  assert.ok(steps.length >= 2, `pocos avisos de progreso: ${steps.length}`);
  assert.equal(steps[steps.length - 1], 1);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i]! >= steps[i - 1]!, "el progreso retrocedió");
  }
});

test("E13.1 caja con 300 nm de margen", () => {
  const box = expandBbox([-20, 15, -16, 20], 300);
  assert.ok(box[0]! < -20 && box[1]! < 15 && box[2]! > -16 && box[3]! > 20);
  // 300 nm = 5° de latitud.
  assert.ok(Math.abs(15 - 5 - box[1]!) < 1e-6);

  const route: [number, number][] = [
    [-18, 16],
    [-40, 24],
    [-62, 18],
  ];
  const bb = bboxOfTrack(route);
  assert.deepEqual(bb, [-62, 16, -18, 24]);
  assert.equal(bboxOfTrack([]), null);
});

test("E13.1 guardado y lectura desde IndexedDB (almacén simulado)", async () => {
  const store = memStore();
  const pkg = await fetchForecast([-20, 20, -18, 22], 3, 7, {
    id: "travesia-1",
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fakeFetch,
  });
  await storeForecast(store, pkg);
  const back = await loadForecast(store, "travesia-1");
  assert.ok(back !== null, "no se recuperó el paquete");
  assert.equal(back.id, pkg.id);
  assert.equal(back.cols, pkg.cols);
  assert.equal(back.rows, pkg.rows);
  assert.deepEqual(back.times, pkg.times);
  assert.deepEqual(Array.from(back.vars.wind_speed), Array.from(pkg.vars.wind_speed));

  // "Actualizar" reemplaza el paquete actual de esa travesía.
  const newer = await fetchForecast([-20, 20, -18, 22], 3, 7, {
    id: "travesia-1",
    marginNm: 0,
    now: () => (START + 6 * 3600) * 1000,
    fetchJson: fakeFetch,
  });
  await storeForecast(store, back);
  await storeForecast(store, newer);
  const replaced = await loadForecast(store, "travesia-1");
  assert.ok(replaced !== null, "no se recuperó el paquete actualizado");
  assert.equal(replaced.fetchedAt, newer.fetchedAt);
  assert.equal(getForecastAge(replaced, newer.fetchedAt + 6 * 3600 * 1000), "hace 6 h");

  await removeForecast(store, "travesia-1");
  assert.equal(await loadForecast(store, "travesia-1"), null);
});

test("E13.1 edad visible y correcta", () => {
  const base = START * 1000;
  const pkg = { fetchedAt: base } as ForecastPackage;
  assert.equal(getForecastAge(pkg, base + 30_000), "recién actualizado");
  assert.equal(getForecastAge(pkg, base + 25 * 60_000), "hace 25 min");
  assert.equal(getForecastAge(pkg, base + 4 * 3_600_000), "hace 4 h");
  assert.equal(getForecastAge(pkg, base + 3 * 86_400_000), "hace 3 días");
});

test("E13.1 empalme con climatología más allá del horizonte", async () => {
  const pkg = await fetchForecast([-20, 20, -18, 22], 3, 7, {
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fakeFetch,
  });
  const last = pkg.times[pkg.times.length - 1]!;
  assert.equal(empalmeConClimatología(pkg, last), false);
  assert.equal(empalmeConClimatología(pkg, last + 1), true);
  assert.equal(empalmeConClimatología(pkg, pkg.times[0]!), false);
});

test("UX-N.2 ids de caja: punto, vista y ruta", () => {
  const id = forecastIdPoint(12.34, -45.67);
  assert.match(id, /^punto-[0-9a-z]+$/);
  assert.equal(forecastIdPoint(12.34, -45.67), id, "el mismo punto reusa su id");
  assert.notEqual(forecastIdPoint(12.34, -45.68), id, "un punto distinto no comparte caja");
  assert.equal(forecastIdView(), "vista");
  assert.equal(forecastKind(id), "punto");
  assert.equal(forecastKind("vista"), "vista");
  assert.equal(forecastKind("CANAL-01"), "ruta");
});

test("UX-N.5b el dueño de cada paquete se nombra por su vínculo", () => {
  // Ruta: el código, sin adornos.
  assert.equal(forecastOwnerName("AN12"), "AN12");
  // Vista: etiqueta fija.
  assert.equal(forecastOwnerName("vista"), "Vista");
  // Punto: "Clima acá" + coordenadas formateadas.
  const id = forecastIdPoint(15, -60);
  assert.equal(forecastOwnerName(id, { lat: 15, lon: -60 }), "Clima acá · 15°00.0'N 060°00.0'W");
  // Punto sin centro disponible: no inventa coordenadas.
  assert.equal(forecastOwnerName(id, null), "Clima acá");
});

test("UX-N.2 la caja del punto lleva 300 nm de margen", () => {
  const lat = 12.5;
  const lon = -45.25;
  const box = pointBbox(lat, lon);
  assert.ok(bboxCovers(box, lat, lon));
  // 300 nm = 5° de latitud hacia cada lado.
  assert.ok(Math.abs(box[3]! - (lat + 5)) < 1e-6, `norte ${box[3]}`);
  assert.ok(Math.abs(box[1]! - (lat - 5)) < 1e-6, `sur ${box[1]}`);
  assert.ok(box[0]! < lon && box[2]! > lon);
  // Un punto justo afuera de la caja no queda cubierto.
  assert.equal(bboxCovers(box, lat + 6, lon), false);

  // La caja combinada pin→destino cubre los dos extremos.
  const combo = marginBbox([
    [lon, lat],
    [lon - 10, lat + 8],
  ]);
  assert.ok(combo);
  assert.ok(bboxCovers(combo, lat, lon));
  assert.ok(bboxCovers(combo, lat + 8, lon - 10));
  assert.equal(marginBbox([]), null);
});

test("UX-N.2 borrar saca la caja del almacén y no reaparece", async () => {
  const store = memStore();
  const pkg = await fetchForecast([-20, 20, -18, 22], 3, 7, {
    id: forecastIdView(),
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fakeFetch,
  });
  await storeForecast(store, pkg);
  let list = await listForecasts(store);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, "vista");
  assert.equal(list[0]!.kind, "vista");
  assert.equal(list[0]!.bytes, forecastBytes(pkg));
  assert.equal(list[0]!.savedAt, pkg.fetchedAt);

  // Re-guardar la misma caja la actualiza, no la duplica.
  await storeForecast(store, pkg);
  list = await listForecasts(store);
  assert.equal(list.length, 1);

  await removeForecast(store, forecastIdView());
  assert.deepEqual(await listForecasts(store), []);
  assert.equal(await loadForecast(store, forecastIdView()), null);
});

test("E13.1 empaquetado binario sobrevive el viaje", async () => {
  const pkg = await fetchForecast([-20, 20, -18, 22], 3, 7, {
    id: "bin",
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fakeFetch,
  });
  const back = unpackForecast(packForecast(pkg));
  assert.deepEqual(back.times, pkg.times);
  assert.deepEqual(back.vars.wind_speed, pkg.vars.wind_speed);
  assert.deepEqual(back.vars.current_direction, pkg.vars.current_direction);
  assert.equal(encodeForecast(null), -32768);
  assert.equal(decodeForecast(-32768), null);
});
