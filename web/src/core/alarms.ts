// Alarmas de desvío (XTE) y de llegada (E9.2): lógica pura, sin DOM ni audio.
// La UI decide cuándo suena; acá solo se resuelve el estado de la alarma.

import { haversineNm, initialBearingDeg, type NavFix } from "./navigation.ts";

export interface AlarmSettings {
  xteMaxNm: number;
  arrivalNm: number;
}

export const DEFAULT_ALARMS: AlarmSettings = { xteMaxNm: 2, arrivalNm: 1 };

// Vigilancia de fondeo (E9.3): ancla en un punto, radio en metros.
export interface AnchorWatch {
  lat: number;
  lon: number;
  radiusM: number;
}

const M_PER_NM = 1852;

export function anchorDistanceM(pos: { lat: number; lon: number }, w: AnchorWatch): number {
  return haversineNm(pos.lat, pos.lon, w.lat, w.lon) * M_PER_NM;
}

export function anchorAlarm(pos: { lat: number; lon: number }, w: AnchorWatch): boolean {
  return anchorDistanceM(pos, w) > w.radiusM;
}

// Hombre al agua (E9.3): punto y hora de la caída; el fix que la UI muestra
// rumbo, distancia y tiempo transcurrido.
export interface Mob {
  lat: number;
  lon: number;
  t: number;
}

export interface MobFix {
  bearingDeg: number;
  distanceNm: number;
  elapsedS: number;
}

export function mobFix(pos: { lat: number; lon: number; t?: number }, mob: Mob): MobFix {
  const distanceNm = haversineNm(pos.lat, pos.lon, mob.lat, mob.lon);
  const bearingDeg = initialBearingDeg(pos.lat, pos.lon, mob.lat, mob.lon);
  const elapsedS = Math.max(0, Math.round(((pos.t ?? Date.now()) - mob.t) / 1000));
  return { bearingDeg, distanceNm, elapsedS };
}

export type AlarmKind = "xte" | "arrival";

export interface AlarmState {
  active: AlarmKind | null;
  silencedFor: AlarmKind | null;
}

// Reglas: |xteNm| > xteMaxNm → "xte"; distanceNm < arrivalNm → "arrival", que
// tiene prioridad. Si la condición desaparece, se limpia todo (vuelve a poder
// sonar). Una alarma silenciada sigue activa pero no vuelve a sonar; un cambio
// de tipo de alarma arranca de cero (sin silencio).
export function evalAlarms(
  fix: NavFix | null,
  s: AlarmSettings,
  prev: AlarmState,
): AlarmState {
  if (!fix) return { active: null, silencedFor: null };
  const kind: AlarmKind | null =
    fix.distanceNm < s.arrivalNm
      ? "arrival"
      : Math.abs(fix.xteNm) > s.xteMaxNm
        ? "xte"
        : null;
  if (!kind) return { active: null, silencedFor: null };
  if (prev.active === kind) return { active: kind, silencedFor: prev.silencedFor };
  return { active: kind, silencedFor: null };
}
