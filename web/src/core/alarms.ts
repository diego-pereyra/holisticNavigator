// Alarmas de desvío (XTE) y de llegada (E9.2): lógica pura, sin DOM ni audio.
// La UI decide cuándo suena; acá solo se resuelve el estado de la alarma.

import type { NavFix } from "./navigation.ts";

export interface AlarmSettings {
  xteMaxNm: number;
  arrivalNm: number;
}

export const DEFAULT_ALARMS: AlarmSettings = { xteMaxNm: 2, arrivalNm: 1 };

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
