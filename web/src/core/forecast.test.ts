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

// --- E13.3: 16 días, 3-hourly de entrada y descarga robusta ------------------

import {
  FORECAST_DAYS,
  FORECAST_DAYS_MAX,
  FORECAST_TIMEOUT_MS,
  ForecastHttpError,
  forecastErrorMessage,
  forecastUrl,
  marineUrl,
} from "./forecast.ts";

test("E13.3 horizonte de 16 días en las constantes", () => {
  assert.equal(FORECAST_DAYS, 16);
  assert.equal(FORECAST_DAYS_MAX, 16);
});

test("E13.3 las dos URLs piden forecast_days=16 y temporal_resolution=hourly_3", () => {
  const pts = [{ lat: 16, lon: -24 }, { lat: 13, lon: -59 }];
  for (const url of [forecastUrl(pts, FORECAST_DAYS), marineUrl(pts, FORECAST_DAYS)]) {
    const u = new URL(url);
    assert.equal(u.searchParams.get("forecast_days"), "16");
    assert.equal(u.searchParams.get("temporal_resolution"), "hourly_3");
  }
});

test("E13.3 16 días a 3 h ⇒ 128 pasos", async () => {
  // El servidor devuelve 3-hourly (como con temporal_resolution=hourly_3): un
  // punto por paso, 128 pasos para 16 días.
  const days16 = Array.from({ length: 16 * 8 }, (_, i) => START + i * 3 * 3600);
  const fetch3h = (url: string): Promise<unknown> => {
    const u = new URL(url);
    const n = u.searchParams.get("latitude")!.split(",").length;
    const names = u.searchParams.get("hourly")!.split(",");
    return Promise.resolve(
      Array.from({ length: n }, () => {
        const hourly: Record<string, number[]> = { time: days16 };
        for (const nm of names) hourly[nm] = days16.map(() => (nm.startsWith("wave") ? 1.8 : 12.5));
        return { hourly };
      }),
    );
  };
  const pkg = await fetchForecast([-20, 20, -18, 22], 3, FORECAST_DAYS, {
    id: "e13-3",
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fetch3h,
  });
  assert.equal(pkg.times.length, 128, "128 pasos de 3 h cubren los 16 días");
  assert.equal(pkg.times[127]! - pkg.times[0]!, 127 * 3 * 3600 * 1000);
});

test("E13.3 reintenta un bloque que falla una vez (sale a la segunda)", async () => {
  // `fetchJson` falla la primera vez por bloque (viento y olas) y después anda.
  const seen = new Set<string>();
  let calls = 0;
  const flaky = (url: string): Promise<unknown> => {
    calls++;
    const key = new URL(url).pathname + new URL(url).searchParams.get("hourly")!.slice(0, 5);
    if (!seen.has(key)) {
      seen.add(key);
      return Promise.reject(new Error("tirón de red"));
    }
    return Promise.resolve([{ hourly: { time: Array.from({ length: 24 }, (_, i) => START + i * 3600) } }]);
  };
  // Con un solo punto la grilla es 1×1: 1 bloque de viento + 1 de olas = 2 keys.
  const pkg = await fetchForecast([-20, 20, -19.5, 20.5], 3, 1, {
    id: "retry",
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: flaky,
    wait: () => Promise.resolve(),
  });
  assert.equal(pkg.id, "retry");
  assert.ok(calls >= 4, `esperaba reintentos (calls=${calls})`);
});

test("E13.3 error honesto: HTTP y red dicen qué falló", () => {
  assert.equal(forecastErrorMessage(new ForecastHttpError("viento", 500)), "error de viento · HTTP 500");
  assert.equal(forecastErrorMessage(new ForecastHttpError("olas", 503)), "error de olas · HTTP 503");
  const redErr = Object.assign(new Error("Failed to fetch"), { kind: "olas" as const });
  assert.equal(forecastErrorMessage(redErr), "sin conexión · olas");
  assert.equal(forecastErrorMessage(new Error("Failed to fetch")), "sin conexión · viento");
});

test("E13.3 timeout por intento configurado a 30 s", () => {
  assert.equal(FORECAST_TIMEOUT_MS, 30_000);
});

test("E13.3 mock mudo: 3 intentos y error 'sin conexión · viento'", async () => {
  let calls = 0;
  const mute = (): Promise<unknown> => {
    calls++;
    return Promise.reject(new Error("Failed to fetch"));
  };
  await assert.rejects(
    fetchForecast([-20, 20, -19.5, 20.5], 3, 1, {
      id: "mudo",
      marginNm: 0,
      now: () => START * 1000,
      fetchJson: mute,
      wait: () => Promise.resolve(),
    }),
    (err: unknown) => {
      assert.equal(forecastErrorMessage(err), "sin conexión · viento");
      return true;
    },
  );
  // 3 intentos (1 + 2 reintentos) por bloque antes de rendirse. Viento y olas
  // corren en paralelo, así que el total es >= 3.
  assert.ok(calls >= 3, `esperaba >= 3 intentos, hubo ${calls}`);
});

// --- E13.4: 429, pacing y chunks de 50 --------------------------------------

import {
  FORECAST_CHUNK,
  FORECAST_RATE_LIMIT,
  FORECAST_RATE_WINDOW_MS,
  FORECAST_429_WAIT_MS,
  ForecastBudget,
} from "./forecast.ts";

test("E13.4 chunk de 50 en las URLs", () => {
  assert.equal(FORECAST_CHUNK, 50);
  const pts = Array.from({ length: FORECAST_CHUNK }, (_, i) => ({ lat: 10 + i * 0.01, lon: -30 }));
  const u = new URL(forecastUrl(pts, FORECAST_DAYS));
  assert.equal(u.searchParams.get("latitude")!.split(",").length, 50);
});

test("E13.4 el pacing respeta el presupuesto de 60 s", async () => {
  let clock = 0;
  const waits: number[] = [];
  const budget = new ForecastBudget(
    FORECAST_RATE_LIMIT,
    FORECAST_RATE_WINDOW_MS,
    () => clock,
    (ms) => {
      waits.push(ms);
      clock += ms; // avanzar el reloj al dormir
      return Promise.resolve();
    },
  );
  // Dos requests de 300 unidades llenan la ventana (600 > 450 ⇒ el segundo ya
  // espera). Con 300 <= 450 el primero pasa; el segundo debe dormir.
  await budget.acquire(300);
  await budget.acquire(300);
  assert.equal(waits.length, 1, "el segundo request tuvo que esperar");
  assert.ok(waits[0]! <= FORECAST_RATE_WINDOW_MS, "la espera no supera la ventana");
  // Ya pasó la ventana: entra de nuevo sin esperar.
  assert.ok(clock >= FORECAST_RATE_WINDOW_MS);
});

test("E13.4 el 429 espera 60 s y sale a la segunda (reintentable)", async () => {
  let n = 0;
  const waits: number[] = [];
  // El primer intento da 429; el segundo devuelve datos.
  const fetch429then = (): Promise<unknown> => {
    n++;
    if (n === 1) return Promise.reject(new ForecastHttpError("viento", 429));
    return Promise.resolve([{ hourly: { time: [START, START + 3600] } }]);
  };
  const pkg = await fetchForecast([-20, 20, -19.5, 20.5], 3, 1, {
    id: "429ok",
    marginNm: 0,
    now: () => START * 1000,
    fetchJson: fetch429then,
    budget: new ForecastBudget(),
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  assert.equal(pkg.id, "429ok");
  assert.ok(waits.includes(FORECAST_429_WAIT_MS), "esperó los 60 s del 429");
});

test("E13.4 tres 429 seguidos es error definitivo con el mensaje nuevo", async () => {
  let n = 0;
  const always429 = (): Promise<unknown> => {
    n++;
    return Promise.reject(new ForecastHttpError("viento", 429));
  };
  await assert.rejects(
    fetchForecast([-20, 20, -19.5, 20.5], 3, 1, {
      id: "429fail",
      marginNm: 0,
      now: () => START * 1000,
      fetchJson: always429,
      budget: new ForecastBudget(),
      wait: () => Promise.resolve(),
    }),
    (err: unknown) => {
      assert.equal(
        forecastErrorMessage(err),
        "límite gratuito de la API (429) — esperá un minuto y tocá Reintentar",
      );
      return true;
    },
  );
  // 1 intento + 2 reintentos = 3 por bloque (viento y olas comparten contador).
  assert.ok(n >= 3, `esperaba >=3 intentos, hubo ${n}`);
});

test("E13.4 el 429 espera el tiempo configurado", () => {
  assert.equal(FORECAST_429_WAIT_MS, 60_000);
});
