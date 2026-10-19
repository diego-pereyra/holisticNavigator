// Web Worker del enrutado por isócronas (E12.5, E12.6, ADR-008 componente 4).
//
// Corre `routeOptimalMultiSteps` (tramo a tramo, E12.6) fuera del hilo principal,
// con progreso por frontera y cancelación. Recibe el pronóstico (E13.1), la
// climatología del mes, la polar (E12.3) y los bytes de la máscara de tierra
// (E12.1) ya serializados; reconstruye el campo de viento y decodifica la
// máscara. Es un bundle aparte (ver scripts/build-web.sh): el core queda puro
// para node:test.

import { decodeLandmask } from "./landmask.ts";
import {
  routeOptimalMultiSteps,
  traverseRoute,
  type IsoBaseline,
  type IsoWorkerRequest,
  type IsoWorkerResponse,
} from "./isochrones.ts";
import { climateWindField, forecastWindField, type WindField } from "./windfield.ts";
import { getCell } from "../clim.ts";

interface WorkerScope {
  postMessage(msg: IsoWorkerResponse): void;
  onmessage: ((ev: MessageEvent) => void) | null;
}

const ctx = self as unknown as WorkerScope;

let cancelled = false;

function post(msg: IsoWorkerResponse): void {
  ctx.postMessage(msg);
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function run(msg: Extract<IsoWorkerRequest, { type: "run" }>): Promise<void> {
  cancelled = false;
  try {
    const land = decodeLandmask(new Uint8Array(msg.landBytes));
    const clim = msg.clim;
    const wind: WindField =
      msg.pkg && !msg.climateOnly
        ? forecastWindField(msg.pkg, clim)
        : clim
          ? climateWindField(clim)
          : () => null;
    const ice = clim
      ? (lat: number, lon: number): number | null => {
          const c = getCell(clim, lat, lon);
          return c ? c.ice : null;
        }
      : undefined;

    const gen = routeOptimalMultiSteps({
      anchors: msg.anchors,
      startMs: msg.startMs,
      wind,
      polar: msg.polar,
      land,
      ice,
      config: msg.config,
    });

    let lastPost = 0;
    let cur = gen.next();
    while (!cur.done) {
      if (cancelled) {
        post({ type: "cancelled", id: msg.id });
        return;
      }
      const now = Date.now();
      if (now - lastPost > 60) {
        post({ type: "progress", id: msg.id, progress: cur.value });
        lastPost = now;
        await tick();
      }
      cur = gen.next();
    }
    const baseline: IsoBaseline = traverseRoute(msg.original, msg.startMs, wind, msg.polar);
    post({ type: "done", id: msg.id, result: cur.value, baseline });
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
}

ctx.onmessage = (ev: MessageEvent): void => {
  const msg = ev.data as IsoWorkerRequest;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type === "run") void run(msg);
};
