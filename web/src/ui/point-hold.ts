// UX-N.1 — gesto de "mantener pulsado" sobre el mapa (D1). En táctil: ~500 ms
// de presión sin moverse. En escritorio: click derecho. Un toque corto no
// dispara nada (los flujos de hoy siguen intactos) y mover el dedo cancela.

export interface HoldCanvas {
  style: { cursor: string };
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface HoldMap {
  getCanvas(): HoldCanvas;
  unproject(point: [number, number]): { lat: number; lng: number };
}

interface HoldPointerEvent {
  pointerType?: string;
  clientX: number;
  clientY: number;
}

interface HoldMouseEvent {
  clientX: number;
  clientY: number;
  preventDefault(): void;
}

export function installMapHold(
  map: HoldMap,
  onPoint: (lat: number, lon: number) => void,
  holdMs = 500,
): () => void {
  const canvas = map.getCanvas();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  // Android a veces dispara el long-press nativo además del nuestro: el
  // segundo intento en menos de 400 ms se ignora.
  let lastAt = 0;

  const fire = (lat: number, lon: number): void => {
    const now = Date.now();
    if (now - lastAt < 400) return;
    lastAt = now;
    onPoint(lat, lon);
  };
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const onDown = (ev: Event): void => {
    const e = ev as unknown as HoldPointerEvent;
    if (e.pointerType === "mouse") return; // el mouse usa el click derecho
    startX = e.clientX;
    startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      const p = map.unproject([startX, startY]);
      fire(p.lat, p.lng);
    }, holdMs);
  };
  const onMove = (ev: Event): void => {
    const e = ev as unknown as HoldPointerEvent;
    if (timer === null) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) cancel();
  };
  const onUp = (): void => cancel();
  const onCtx = (ev: Event): void => {
    const e = ev as unknown as HoldMouseEvent;
    e.preventDefault(); // sin menú del navegador
    const p = map.unproject([e.clientX, e.clientY]);
    fire(p.lat, p.lng);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("contextmenu", onCtx);
  return () => {
    cancel();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("contextmenu", onCtx);
  };
}
