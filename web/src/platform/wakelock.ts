// Pantalla encendida (E9.3): mantiene la pantalla despierta con la Screen Wake
// Lock API mientras haya ruta activa, fondeo activo o MOB. Si el sistema la
// libera (p. ej. al pasar a segundo plano), se vuelve a pedir al hacerse visible
// mientras siga activada. Sin la API (Safari viejo, escritorio sin soporte) es
// un no-op silencioso.

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

interface WakeLockCapable {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
}

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;
let wired = false;

function nav(): WakeLockCapable | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as Navigator & WakeLockCapable;
  return n.wakeLock ? n : null;
}

async function acquire(): Promise<void> {
  const n = nav();
  if (!n?.wakeLock || sentinel) return;
  try {
    const s = await n.wakeLock.request("screen");
    s.addEventListener("release", () => {
      if (sentinel === s) sentinel = null;
    });
    sentinel = s;
  } catch {
    sentinel = null;
  }
}

export async function keepAwake(on: boolean): Promise<void> {
  wanted = on;
  if (!nav()) return;
  if (!wired && typeof document !== "undefined") {
    wired = true;
    document.addEventListener("visibilitychange", () => {
      if (wanted && document.visibilityState === "visible") void acquire();
    });
  }
  if (on) await acquire();
  else if (sentinel) {
    const s = sentinel;
    sentinel = null;
    try {
      await s.release();
    } catch {
      /* ya liberada */
    }
  }
}
