import test from "node:test";
import assert from "node:assert/strict";

import {
  addWaypoint,
  applyOptimization,
  copyName,
  copyOwnRoute,
  defaultName,
  insertWaypoint,
  isOwnCode,
  legBearingsDeg,
  legNm,
  mandatoryIndexes,
  moveWaypoint,
  newOwnRoute,
  ownRouteFromPoints,
  ownRouteToGpx,
  parseOwnRoute,
  removeWaypoint,
  renameRoute,
  renameWaypoint,
  replaceWaypoints,
  reverseRoute,
  setMandatory,
  totalNm,
  type OwnRoute,
} from "./routes-own.ts";
import { deleteOwnRoute, loadOwnRoutes, ownRouteKey, saveOwnRoute } from "../platform/routes-own.ts";
import { KEYS, type KeyValueStore } from "../platform/store.ts";

function memStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(map.get(k) ?? null),
    put: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    remove: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    putBlob: () => Promise.resolve(),
    getBlob: () => Promise.resolve(null),
    removeBlob: () => Promise.resolve(),
  };
}

function baseRoute(): OwnRoute {
  return newOwnRoute("MIA-aaaaaa", "Prueba", 1_700_000_000_000);
}

test("E11.4 crea ruta vacía con id propio y nombre saneado", () => {
  const r = baseRoute();
  assert.equal(r.id, "MIA-aaaaaa");
  assert.ok(isOwnCode(r.id));
  assert.equal(r.name, "Prueba");
  assert.equal(r.waypoints.length, 0);
  assert.equal(r.distanceNm, 0);
  assert.equal(newOwnRoute("MIA-b", "   ").name, "Ruta sin nombre");
});

test("E11.4 agrega waypoints con nombre automático y calcula la distancia", () => {
  let r = baseRoute();
  assert.equal(defaultName(r), "WP1");
  r = addWaypoint(r, 0, 0);
  r = addWaypoint(r, 1, 0);
  assert.deepEqual(r.waypoints.map((w) => w.name), ["WP1", "WP2"]);

  // Un grado de latitud ≈ 60,04 nm (haversine, R = 3440,065).
  const d = totalNm(r);
  assert.ok(Math.abs(d - 60.04) < 0.2, `distancia ${d}`);
  assert.equal(r.distanceNm, d);
  assert.equal(legNm(r).length, 1);
  assert.ok(Math.abs(legBearingsDeg(r)[0]! - 0) < 0.01, "rumbo al norte");
});

test("E11.4 edita: insertar, mover, renombrar, borrar e invertir", () => {
  let r = baseRoute();
  r = addWaypoint(r, 0, 0);
  r = addWaypoint(r, 0, 2);
  r = insertWaypoint(r, 1, 0, 1);
  assert.equal(r.waypoints.length, 3);
  assert.equal(r.waypoints[1]!.lon, 1);

  r = moveWaypoint(r, 1, 0, 1.5);
  assert.equal(r.waypoints[1]!.lon, 1.5);

  r = renameWaypoint(r, 0, "Salida");
  assert.equal(r.waypoints[0]!.name, "Salida");

  const before = totalNm(r);
  r = reverseRoute(r);
  assert.equal(r.waypoints[0]!.lon, 2, "invertida: arranca por el otro extremo");
  assert.ok(Math.abs(totalNm(r) - before) < 1e-9, "la distancia no cambia al invertir");

  r = removeWaypoint(r, 0);
  assert.equal(r.waypoints.length, 2);
  assert.equal(renameRoute(r, "Ida").name, "Ida");
  assert.equal(removeWaypoint(r, 9), r, "índice fuera de rango no cambia nada");
});

test("E11.4 exporta GPX con un rtept por waypoint y escapa el nombre", () => {
  let r = baseRoute();
  r = addWaypoint(r, -34.6, -58.4, "Buenos Aires");
  r = addWaypoint(r, -22.9, -43.2, "Río & mar");
  const gpx = ownRouteToGpx(r);
  assert.equal((gpx.match(/<rtept /g) ?? []).length, 2);
  assert.ok(gpx.includes('lat="-34.6" lon="-58.4"'), "coordenadas del waypoint");
  assert.ok(gpx.includes("<name>Río &amp; mar</name>"), "escapa XML");
  assert.ok(gpx.trimEnd().endsWith("</gpx>"));
});

test("E11.4 round-trip de serialización", () => {
  let r = baseRoute();
  r = addWaypoint(r, -34.6, -58.4, "Buenos Aires");
  r = addWaypoint(r, -22.9, -43.2);
  const back = parseOwnRoute(JSON.stringify(r));
  assert.ok(back !== null);
  assert.equal(back.name, r.name);
  assert.deepEqual(back.waypoints, r.waypoints);
  assert.ok(Math.abs(back.distanceNm - r.distanceNm) < 1e-9);
  assert.equal(parseOwnRoute("no es json"), null);
});

test("E11.4 guarda, lee y borra rutas propias del índice", async () => {
  const store = memStore();
  const a = addWaypoint(baseRoute(), 0, 0);
  const b = addWaypoint(newOwnRoute("MIA-bbbbbb", "Otra"), 10, 10);
  await saveOwnRoute(store, a);
  await saveOwnRoute(store, b);

  assert.equal(await store.get(ownRouteKey("MIA-aaaaaa")), JSON.stringify(a));
  assert.deepEqual(JSON.parse((await store.get(KEYS.myRoutes))!), ["MIA-aaaaaa", "MIA-bbbbbb"]);

  const loaded = await loadOwnRoutes(store);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]!.name, "Prueba");
  assert.equal(loaded[1]!.waypoints.length, 1);

  await deleteOwnRoute(store, "MIA-aaaaaa");
  const after = await loadOwnRoutes(store);
  assert.deepEqual(after.map((r) => r.id), ["MIA-bbbbbb"]);
  assert.equal(await store.get(ownRouteKey("MIA-aaaaaa")), null);
});

test("E11.5 copiar una ruta del libro produce una propia idéntica", () => {
  const points = [
    { name: "Inicio", lat: 0, lon: 0 },
    { name: "Medio", lat: 0, lon: 1 },
    { name: "Fin", lat: 0, lon: 2 },
  ];
  const r = ownRouteFromPoints("MIA-copia1", copyName("AN12"), points, 1_700_000_000_000);
  assert.ok(isOwnCode(r.id), "queda marcada como propia");
  assert.equal(r.name, "AN12 (copia)");
  assert.deepEqual(r.waypoints.map((w) => w.name), ["Inicio", "Medio", "Fin"]);
  assert.deepEqual(r.waypoints.map((w) => [w.lat, w.lon]), [[0, 0], [0, 1], [0, 2]]);
  assert.ok(Math.abs(r.distanceNm - 120.08) < 0.6, `distancia ${r.distanceNm}`);

  // Los puntos de origen no se comparten: tocar el origen no toca la copia.
  points[0]!.lat = 99;
  assert.equal(r.waypoints[0]!.lat, 0, "copia independiente del origen");
});

test("E11.5 copiar una ruta propia da dos rutas independientes", () => {
  let a = newOwnRoute("MIA-aaaaaa", "Original", 1);
  a = addWaypoint(a, 0, 0);
  a = addWaypoint(a, 0, 1);
  const b = copyOwnRoute(a, "MIA-bbbbbb", copyName(a.name), 2);
  assert.equal(b.id, "MIA-bbbbbb");
  assert.equal(b.name, "Original (copia)");
  assert.deepEqual(b.waypoints, a.waypoints, "mismos waypoints");

  // Editar la copia (mover un waypoint) no toca la original.
  const b2 = moveWaypoint(b, 0, 5, 5);
  assert.equal(a.waypoints[0]!.lat, 0, "la original sigue igual");
  assert.equal(b.waypoints[0]!.lat, 0, "la copia previa sigue igual");
  assert.equal(b2.waypoints[0]!.lat, 5);
  assert.notEqual(b.waypoints[0], a.waypoints[0], "waypoints de objetos distintos");
});

test("E11.5 eliminar quita del store y no reaparece tras recargar", async () => {
  const store = memStore();
  await saveOwnRoute(store, addWaypoint(newOwnRoute("MIA-x1", "A"), 0, 0));
  await saveOwnRoute(store, addWaypoint(newOwnRoute("MIA-x2", "B"), 1, 1));
  await deleteOwnRoute(store, "MIA-x1");
  const reloaded = await loadOwnRoutes(store);
  assert.deepEqual(reloaded.map((r) => r.id), ["MIA-x2"]);
});

test("E12.6 los waypoints nacen obligatorios y se pueden marcar opcionales", () => {
  let r = newOwnRoute("MIA-m1", "Modos", 1);
  r = addWaypoint(r, 0, 0);
  r = addWaypoint(r, 0, 1);
  r = addWaypoint(r, 0, 2);
  assert.deepEqual(r.waypoints.map((w) => w.mandatory), [true, true, true]);

  r = setMandatory(r, 1, false);
  assert.deepEqual(r.waypoints.map((w) => w.mandatory), [true, false, true]);
  assert.deepEqual(mandatoryIndexes(r), [0, 2]);
  assert.equal(setMandatory(r, 9, false), r, "índice fuera de rango no cambia nada");

  // Rutas guardadas antes de E12.6 no traen el flag: nacen obligatorias.
  const legacy = parseOwnRoute(
    JSON.stringify({ id: "MIA-old", name: "Vieja", waypoints: [{ name: "WP1", lat: 0, lon: 0 }] }),
  );
  assert.equal(legacy?.waypoints[0]?.mandatory, true);
});

test("E12.6 aplicar optimización conserva obligatorios y descarta opcionales", () => {
  let r = newOwnRoute("MIA-o1", "Óptima", 1);
  r = addWaypoint(r, 0, 0, "Inicio");
  r = addWaypoint(r, 0, 1, "Opci");
  r = addWaypoint(r, 1, 1, "Opci2");
  r = addWaypoint(r, 0, 2, "Fin");
  r = setMandatory(r, 1, false);
  r = setMandatory(r, 2, false);

  // Un tramo entre Inicio y Fin, con dos puntos intermedios optimizados.
  const out = applyOptimization(r, [[{ lat: 0.1, lon: 0.5 }, { lat: 0.2, lon: 1.5 }]], 2);
  assert.deepEqual(out.waypoints.map((w) => w.name), ["Inicio", "WP2", "WP3", "Fin"]);
  assert.deepEqual(out.waypoints.map((w) => w.mandatory), [true, false, false, true]);
  assert.deepEqual(out.waypoints.map((w) => [w.lat, w.lon]), [
    [0, 0],
    [0.1, 0.5],
    [0.2, 1.5],
    [0, 2],
  ]);
  assert.equal(out.updatedAt, 2);
});

test("E12.11 las maniobras se bautizan 'Virada n' o 'Trasluchada n'", () => {
  let r = newOwnRoute("MIA-bordo", "Bordos", 1);
  r = addWaypoint(r, 0, 0, "Inicio");
  r = addWaypoint(r, 0, 2, "Fin");

  const out = applyOptimization(
    r,
    [[
      { lat: 0.1, lon: 0.5, tack: true, maneuver: "tack" },
      { lat: 0.2, lon: 1, tack: false },
      { lat: 0.3, lon: 1.5, tack: true, maneuver: "gybe" },
      { lat: 0.35, lon: 1.7, tack: true, maneuver: "tack" },
    ]],
    2,
  );
  assert.deepEqual(out.waypoints.map((w) => w.name), ["Inicio", "Virada 1", "WP3", "Trasluchada 1", "Virada 2", "Fin"]);
  assert.deepEqual(out.waypoints.map((w) => w.mandatory), [true, false, false, false, false, true]);
  // El sufijo de la maniobra no queda pegado a los waypoints existentes.
  assert.deepEqual(out.waypoints.map((w) => [w.lat, w.lon]), [
    [0, 0],
    [0.1, 0.5],
    [0.2, 1],
    [0.3, 1.5],
    [0.35, 1.7],
    [0, 2],
  ]);
});

