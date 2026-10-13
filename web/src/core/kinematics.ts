// Cinemática (T9.1): SOG, COG, VMG y ETA a partir de las últimas fijas (ventana 60 s).

import { haversineNm, initialBearingDeg, type NavFix } from "./navigation.ts";

export interface Fix {
  lat: number;
  lon: number;
  t: number;
  speedMps?: number | null;
  headingDeg?: number | null;
}

export interface Kinematics {
  sogKn: number | null;
  cogDeg: number | null;
  vmgKn: number | null;
  etaNextMs: number | null;
  etaDestMs: number | null;
}

const MPS_TO_KN = 1.943844;
const MIN_SOG_KN = 0.05;

const toRad = (d: number): number => (d * Math.PI) / 180;

export function kinematics(
  fixes: Fix[],
  nav: NavFix | null,
  remainingNm: number,
  nowMs: number,
  windowMs = 60_000,
): Kinematics {
  const empty: Kinematics = {
    sogKn: null,
    cogDeg: null,
    vmgKn: null,
    etaNextMs: null,
    etaDestMs: null,
  };
  const win = fixes
    .filter((f) => nowMs - f.t <= windowMs)
    .sort((a, b) => a.t - b.t);
  if (win.length === 0) return empty;

  const last = win[win.length - 1]!;
  const first = win[0]!;

  let sogKn: number | null = null;
  if (typeof last.speedMps === "number") {
    sogKn = last.speedMps * MPS_TO_KN;
  } else if (win.length >= 2) {
    const distNm = haversineNm(first.lat, first.lon, last.lat, last.lon);
    const hours = (last.t - first.t) / 3_600_000;
    if (hours > 0) sogKn = distNm / hours;
  }

  let cogDeg: number | null = null;
  if (typeof last.headingDeg === "number") cogDeg = last.headingDeg;
  else if (win.length >= 2) {
    const first = win[0]!;
    if (first.t !== last.t || first.lat !== last.lat || first.lon !== last.lon) {
      cogDeg = initialBearingDeg(first.lat, first.lon, last.lat, last.lon);
    }
  }

  let vmgKn: number | null = null;
  if (nav && sogKn != null && cogDeg != null) {
    vmgKn = sogKn * Math.cos(toRad(nav.bearingDeg - cogDeg));
  }

  const eta = (nm: number): number | null =>
    sogKn != null && sogKn > MIN_SOG_KN ? nowMs + (nm / sogKn) * 3_600_000 : null;

  return {
    sogKn,
    cogDeg,
    vmgKn,
    etaNextMs: nav ? eta(nav.distanceNm) : null,
    etaDestMs: nav ? eta(remainingNm) : null,
  };
}
