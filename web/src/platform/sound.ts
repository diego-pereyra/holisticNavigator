// Sonido de alarma (E9.2): tono 880 Hz vía AudioContext. El contexto se crea o
// reanuda con el primer gesto del usuario (política de autoplay); si no hay
// AudioContext o el navegador lo bloquea, queda en silencio. Suma vibración.

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;

function makeContext(): AudioContext | null {
  const w = window as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function arm(): void {
  if (!ctx) makeContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

if (typeof document !== "undefined") {
  const onGesture = (): void => arm();
  document.addEventListener("pointerdown", onGesture);
  document.addEventListener("keydown", onGesture);
}

export function beep(times: number): void {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* sin vibración */
  }
  const ac = ctx;
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  for (let i = 0; i < times; i++) {
    const at = t0 + i * 0.25;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.3, at + 0.01);
    gain.gain.setValueAtTime(0.3, at + 0.13);
    gain.gain.linearRampToValueAtTime(0, at + 0.15);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(at);
    osc.stop(at + 0.16);
  }
}
