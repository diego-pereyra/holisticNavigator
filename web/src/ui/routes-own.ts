// Rutas propias en la UI (E11.4 / T11.4): lista "Mis rutas", editor de
// waypoints sobre el mapa y ficha con distancia por tramo. La lógica pura vive
// en core/routes-own.ts; acá solo hay DOM y estado de edición.
import type { Map as MlMap, MapMouseEvent } from "maplibre-gl";

import { signal } from "../core/store.ts";
import {
  addWaypoint,
  copyName,
  copyOwnRoute,
  importedToOwn,
  insertWaypoint,
  legBearingsDeg,
  legNm,
  moveWaypoint,
  newOwnRoute,
  ownRouteFromPoints,
  ownRouteToGpx,
  removeWaypoint,
  replaceWaypoints,
  renameRoute,
  renameWaypoint,
  reverseRoute,
  type OwnRoute,
} from "../core/routes-own.ts";
import { parseRouteFile } from "../core/gpx.ts";
import { downloadText, pickTextFile } from "../platform/download.ts";
import {
  deleteOwnRoute as deleteOwnRouteFromStore,
  loadOwnRoutes as loadOwnRoutesFromStore,
  saveOwnRoute,
} from "../platform/routes-own.ts";
import type { KeyValueStore } from "../platform/store.ts";
import { formatLat, formatLon } from "../core/coords.ts";
import { MONTH_ABBR, nmDecimal } from "./format.ts";

export const ownRoutes = signal<OwnRoute[]>([]);
export const ownEdit = signal<OwnRoute | null>(null);

// Lo que la UI de rutas propias necesita del resto de la app.
export interface OwnCtx {
  store: KeyValueStore;
  map: MlMap;
  open(route: OwnRoute): void;
  follow(route: OwnRoute): void;
  redraw(): void;
  close(): void;
}

export async function loadOwnRoutes(store: KeyValueStore): Promise<OwnRoute[]> {
  const list = await loadOwnRoutesFromStore(store);
  ownRoutes.set(list);
  return list;
}

export function ownRouteById(id: string): OwnRoute | null {
  return ownRoutes().find((r) => r.id === id) ?? null;
}

function newId(): string {
  return `MIA-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function commit(ctx: OwnCtx, next: OwnRoute): void {
  const stamped: OwnRoute = { ...next, updatedAt: Date.now() };
  ownEdit.set(stamped);
  ownRoutes.update((list) => list.map((r) => (r.id === stamped.id ? stamped : r)));
  void saveOwnRoute(ctx.store, stamped);
  ctx.redraw();
}

export function startOwnCreate(ctx: OwnCtx): void {
  const r = newOwnRoute(newId(), `Ruta ${ownRoutes().length + 1}`);
  ownRoutes.update((list) => [r, ...list]);
  void saveOwnRoute(ctx.store, r);
  ownEdit.set(r);
  ctx.open(r);
  armAddWaypoint(ctx);
}

export function openOwnEditor(ctx: OwnCtx, route: OwnRoute): void {
  ownEdit.set(route);
  ctx.open(route);
}

export function endOwnEdit(): void {
  ownEdit.set(null);
}

export function removeOwnRoute(ctx: OwnCtx, id: string): void {
  ownRoutes.update((list) => list.filter((r) => r.id !== id));
  if (ownEdit()?.id === id) ownEdit.set(null);
  void deleteOwnRouteFromStore(ctx.store, id);
  endOwn();
  ctx.close();
}

// E11.5 — borrado con confirmación en banda (sin modal del navegador).
export function confirmDeleteOwnRoute(ctx: OwnCtx, route: OwnRoute): void {
  confirmBand(`¿Eliminar ${route.name}?`, "Eliminar", () => removeOwnRoute(ctx, route.id));
}

export async function importOwnFromGpx(ctx: OwnCtx): Promise<void> {
  const file = await pickTextFile(".gpx,.kml,.csv,.txt,text/plain");
  if (!file) return;
  const parsed = parseRouteFile(file.name, file.text);
  if (!parsed) return;
  const route = importedToOwn(parsed, newId());
  ownRoutes.update((list) => [route, ...list]);
  void saveOwnRoute(ctx.store, route);
  openOwnEditor(ctx, route);
}

export function exportOwnRoute(route: OwnRoute): void {
  const name = route.name.replace(/\s+/g, "_");
  downloadText(`${name}.gpx`, "application/gpx+xml", ownRouteToGpx(route));
}

// Copia una ruta del libro a "Mis rutas" (los datos del catálogo no se tocan).
export function copyToOwn(
  ctx: OwnCtx,
  name: string,
  coords: [number, number][],
  names: string[],
): OwnRoute {
  const points = coords.map((c, i) => ({ name: names[i] ?? `WP${i + 1}`, lat: c[1], lon: c[0] }));
  const r = ownRouteFromPoints(newId(), copyName(name), points);
  ownRoutes.update((list) => [r, ...list]);
  void saveOwnRoute(ctx.store, r);
  openOwnEditor(ctx, r);
  return r;
}

// E12.5 — aplica el resultado de la optimización a una ruta propia: reemplaza
// sus waypoints (recálculo de nm) conservando id y nombre. Devuelve la ruta
// previa para la banda de deshacer.
export function replaceOwnRoute(
  ctx: OwnCtx,
  route: OwnRoute,
  points: { name: string; lat: number; lon: number }[],
): OwnRoute {
  const updated = replaceWaypoints(route, points);
  ownRoutes.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  if (ownEdit()?.id === updated.id) ownEdit.set(updated);
  void saveOwnRoute(ctx.store, updated);
  ctx.redraw();
  return updated;
}

// Copia una ruta propia (o una copia) a una nueva ruta propia independiente.
export function copyOwnRouteToOwn(ctx: OwnCtx, route: OwnRoute): OwnRoute {
  const r = copyOwnRoute(route, newId(), copyName(route.name));
  ownRoutes.update((list) => [r, ...list]);
  void saveOwnRoute(ctx.store, r);
  openOwnEditor(ctx, r);
  return r;
}

// ------------------------------------------------------- lista "Mis rutas"

export function renderMisRutas(host: HTMLElement, ctx: OwnCtx): void {
  const list = ownRoutes();
  const head = el("div", { class: "hn-own-head" });
  head.append(el("h3", { class: "hn-h3" }, "Mis rutas"));
  const now = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "+ Nueva ruta");
  now.addEventListener("click", () => startOwnCreate(ctx));
  head.append(now);
  host.append(head);

  if (list.length === 0) {
    host.append(el("p", { class: "hn-muted" }, "Todavía no tenés rutas propias."));
  }
  for (const r of list) {
    const wrap = el("div", { class: "hn-own-row" });
    const row = el("button", { class: "hn-row", type: "button" });
    const main = el("div", { class: "hn-row-main" });
    main.append(
      el("div", { class: "hn-row-title" }, r.name),
      el("div", { class: "hn-row-sub" }, `${r.waypoints.length} wp · ${nmDecimal(r.distanceNm)}`),
    );
    row.append(main, el("span", { class: "hn-own-sig" }, dateShort(r.updatedAt)));
    row.addEventListener("click", () => openOwnEditor(ctx, r));
    // E11.5: eliminar al final de la fila (solo en Mis rutas), con confirmación.
    const del = el("button", { class: "hn-row-act hn-row-danger", type: "button", title: `Eliminar ${r.name}` }, "Eliminar");
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      confirmDeleteOwnRoute(ctx, r);
    });
    wrap.append(row, del);
    host.append(wrap);
  }

  const imp = el("button", { class: "hn-row hn-row-import", type: "button" });
  imp.append(el("span", { class: "hn-row-import-plus" }, "+"), el("span", {}, "Importar GPX a Mis rutas"));
  imp.addEventListener("click", () => void importOwnFromGpx(ctx));
  host.append(imp);
}

// ----------------------------------------------------------- ficha/editor

export function renderOwnFicha(host: HTMLElement, ctx: OwnCtx, base: OwnRoute): void {
  const editing = ownEdit();
  const r = editing && editing.id === base.id ? editing : base;

  const nameRow = el("div", { class: "hn-own-name" });
  const nameInput = el("input", { class: "hn-search hn-own-input", type: "text" });
  nameInput.value = r.name;
  nameInput.setAttribute("aria-label", "Nombre de la ruta");
  nameInput.addEventListener("change", () => commit(ctx, renameRoute(r, nameInput.value)));
  nameRow.append(el("span", { class: "hn-field-label" }, "Nombre"), nameInput);
  host.append(nameRow);

  const wps = el("div", { class: "hn-own-wps" });
  if (r.waypoints.length === 0) {
    wps.append(el("p", { class: "hn-muted" }, "Tocá el mapa para agregar waypoints."));
  }
  const legs = legNm(r);
  const brgs = legBearingsDeg(r);
  r.waypoints.forEach((w, i) => {
    const row = el("div", { class: "hn-own-wp" });
    row.append(el("span", { class: "hn-own-dot" }, String(i + 1)));
    const fields = el("div", { class: "hn-own-fields" });

    const name = el("input", { class: "hn-search hn-own-input", type: "text" });
    name.value = w.name;
    name.setAttribute("aria-label", `Nombre del waypoint ${i + 1}`);
    name.addEventListener("change", () => commit(ctx, renameWaypoint(r, i, name.value)));

    const lat = el("input", { class: "hn-search hn-own-coord", type: "number", step: "0.001" });
    lat.value = String(round4(w.lat));
    lat.setAttribute("aria-label", `Latitud del waypoint ${i + 1}`);
    lat.addEventListener("change", () => {
      const v = Number(lat.value);
      if (Number.isFinite(v)) commit(ctx, moveWaypoint(r, i, v, w.lon));
    });

    const lon = el("input", { class: "hn-search hn-own-coord", type: "number", step: "0.001" });
    lon.value = String(round4(w.lon));
    lon.setAttribute("aria-label", `Longitud del waypoint ${i + 1}`);
    lon.addEventListener("change", () => {
      const v = Number(lon.value);
      if (Number.isFinite(v)) commit(ctx, moveWaypoint(r, i, w.lat, v));
    });

    fields.append(
      name,
      el("div", { class: "hn-own-coords" }, lat, lon),
      el("div", { class: "hn-muted hn-own-fmt" }, `${formatLat(w.lat)} ${formatLon(w.lon)}`),
    );
    row.append(fields);

    const acts = el("div", { class: "hn-own-wp-acts" });
    const mv = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "Mover");
    mv.addEventListener("click", () => armMoveWaypoint(ctx, i));
    const ins = el("button", { class: "hn-btn hn-btn-mini", type: "button", title: "Agregar un tramo hasta acá" }, "Insertar");
    ins.addEventListener("click", () => armAddWaypoint(ctx, i + 1));
    const del = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "Borrar");
    del.addEventListener("click", () => commit(ctx, removeWaypoint(r, i)));
    acts.append(mv, ins, del);
    row.append(acts);
    wps.append(row);

    if (i < legs.length) {
      wps.append(
        el(
          "div",
          { class: "hn-own-leg hn-muted" },
          `↓ ${nmDecimal(legs[i]!)} · ${Math.round(brgs[i]!).toString().padStart(3, "0")}°`,
        ),
      );
    }
  });
  host.append(wps);

  host.append(
    el(
      "div",
      { class: "hn-own-total" },
      el("span", { class: "hn-field-label" }, "Total"),
      el("span", {}, nmDecimal(r.distanceNm)),
    ),
  );

  const actions = el("div", { class: "hn-actions" });
  const add = el("button", { class: "hn-btn hn-btn-primary", type: "button" }, "Agregar waypoint");
  add.addEventListener("click", () => armAddWaypoint(ctx));
  const inv = el("button", { class: "hn-btn", type: "button" }, "Invertir");
  inv.addEventListener("click", () => commit(ctx, reverseRoute(r)));
  const exp = el("button", { class: "hn-btn", type: "button" }, "Exportar GPX");
  exp.addEventListener("click", () => exportOwnRoute(r));
  const seguir = el("button", { class: "hn-btn", type: "button" }, "Seguir");
  seguir.disabled = r.waypoints.length < 2;
  seguir.addEventListener("click", () => {
    endOwn();
    ctx.follow(r);
  });
  // E11.5: copiar la propia a otra ruta (con "(copia)") y eliminar con confirmación.
  const copiar = el("button", { class: "hn-btn", type: "button" }, "Copiar ruta");
  copiar.addEventListener("click", () => copyOwnRouteToOwn(ctx, r));
  const borrar = el("button", { class: "hn-btn", type: "button" }, "Eliminar ruta");
  borrar.addEventListener("click", () => confirmDeleteOwnRoute(ctx, r));
  actions.append(add, inv, exp, copiar, seguir, borrar);
  host.append(actions);
}

// ------------------------------------------------ edición sobre el mapa

let addArmed = false;
let moveIndex: number | null = null;
let band: HTMLElement | null = null;
let activeCtx: OwnCtx | null = null;
let clickHandler: ((e: MapMouseEvent) => void) | null = null;

export function ownArmActive(): boolean {
  return addArmed || moveIndex !== null;
}

// Arma el siguiente toque en el mapa para mover un waypoint (acción puntual).
export function armMoveWaypoint(ctx: OwnCtx, index: number): void {
  endOwn();
  activeCtx = ctx;
  moveIndex = index;
  const name = ownEdit()?.waypoints[index]?.name ?? "el waypoint";
  clickHandler = (e) => {
    const r = ownEdit();
    if (!r) return;
    const i = index;
    endOwn();
    commit(ctx, moveWaypoint(r, i, e.lngLat.lat, e.lngLat.lng));
  };
  showBand(`Tocá el mapa para mover ${name}`);
  ctx.map.getCanvas().style.cursor = "crosshair";
  ctx.map.on("click", clickHandler);
}

// Arma toques sucesivos para agregar waypoints (insertAt < 0 ⇒ al final).
export function armAddWaypoint(ctx: OwnCtx, insertAt = -1): void {
  endOwn();
  activeCtx = ctx;
  addArmed = true;
  clickHandler = (e) => {
    const r = ownEdit();
    if (!r) return;
    const next =
      insertAt < 0
        ? addWaypoint(r, e.lngLat.lat, e.lngLat.lng)
        : insertWaypoint(r, insertAt, e.lngLat.lat, e.lngLat.lng);
    commit(ctx, next);
  };
  showBand("Tocá el mapa para agregar waypoints");
  ctx.map.getCanvas().style.cursor = "crosshair";
  ctx.map.on("click", clickHandler);
}

// Cancela cualquier armado en curso (al cerrar la ficha, seguir, etc.).
export function endOwn(): void {
  const ctx = activeCtx;
  if (clickHandler && ctx) ctx.map.off("click", clickHandler);
  clickHandler = null;
  addArmed = false;
  moveIndex = null;
  band?.remove();
  band = null;
  if (ctx) ctx.map.getCanvas().style.cursor = "";
  activeCtx = null;
}

function showBand(text: string): void {
  band?.remove();
  band = el("div", { class: "hn-fixband" });
  band.append(el("span", { class: "hn-fixband-text" }, text));
  const done = el("button", { class: "hn-alarm-btn", type: "button" }, "Listo");
  done.addEventListener("click", () => endOwn());
  band.append(done);
  document.body.append(band);
}

// E11.5 — banda de confirmación destructiva (sin modal del navegador).
function confirmBand(text: string, actionLabel: string, onConfirm: () => void): void {
  band?.remove();
  band = el("div", { class: "hn-fixband hn-danger" });
  band.append(el("span", { class: "hn-fixband-text" }, text));
  const cancel = el("button", { class: "hn-alarm-btn", type: "button" }, "Cancelar");
  cancel.addEventListener("click", () => endOwn());
  const go = el("button", { class: "hn-alarm-btn", type: "button" }, actionLabel);
  go.addEventListener("click", () => {
    endOwn();
    onConfirm();
  });
  band.append(cancel, go);
  document.body.append(band);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function dateShort(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()] ?? ""}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v ?? "";
    else if (v !== undefined) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}
