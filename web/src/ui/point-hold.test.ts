import test from "node:test";
import assert from "node:assert/strict";

import { installMapHold, type HoldMap } from "./point-hold.ts";

interface MockHold {
  map: HoldMap;
  emit(type: string, e: object): void;
}

function mockHold(): MockHold {
  const listeners = new Map<string, EventListener[]>();
  const canvas = {
    style: { cursor: "" },
    addEventListener(type: string, fn: EventListener): void {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: EventListener): void {
      const list = listeners.get(type) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
  const map: HoldMap = {
    getCanvas: () => canvas,
    // El mapa de prueba escala x/10, y/10 → coordenadas fáciles de verificar.
    unproject: ([x, y]) => ({ lat: y / 10, lng: x / 10 }),
  };
  return {
    map,
    emit(type, e) {
      for (const fn of listeners.get(type) ?? []) fn(e as unknown as Event);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("UX-N.1 un toque corto no dispara la hoja de acciones", async () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  m.emit("pointerdown", { pointerType: "touch", clientX: 100, clientY: 200 });
  m.emit("pointerup", {});
  await sleep(60);
  assert.equal(seen.length, 0);
});

test("UX-N.1 mantener pulsado dispara con las coordenadas del punto", async () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  m.emit("pointerdown", { pointerType: "touch", clientX: 100, clientY: 200 });
  await sleep(60);
  assert.deepEqual(seen, [[20, 10]]);
});

test("UX-N.1 mover el dedo cancela el long-press", async () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  m.emit("pointerdown", { pointerType: "touch", clientX: 100, clientY: 200 });
  m.emit("pointermove", { pointerType: "touch", clientX: 140, clientY: 220 });
  await sleep(60);
  assert.equal(seen.length, 0);
});

test("UX-N.1 click derecho dispara y cancela el menú del navegador", () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  let prevented = false;
  m.emit("contextmenu", {
    clientX: 50,
    clientY: 70,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.deepEqual(seen, [[7, 5]]);
  assert.equal(prevented, true);
});

test("UX-N.1 el gesto nativo posterior no duplica la hoja", async () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  m.emit("pointerdown", { pointerType: "touch", clientX: 100, clientY: 200 });
  await sleep(60);
  // Algunos navegadores móviles disparan además su propio contextmenu.
  m.emit("contextmenu", {
    clientX: 100,
    clientY: 200,
    preventDefault: () => {},
  });
  assert.equal(seen.length, 1);
});

test("UX-N.1 el mouse solo dispara por click derecho (no por mantener apretado)", async () => {
  const m = mockHold();
  const seen: Array<[number, number]> = [];
  installMapHold(m.map, (lat, lon) => seen.push([lat, lon]), 30);
  m.emit("pointerdown", { pointerType: "mouse", clientX: 100, clientY: 200 });
  await sleep(60);
  assert.equal(seen.length, 0);
});
