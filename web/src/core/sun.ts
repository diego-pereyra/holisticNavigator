// Salida y puesta del sol (T11.5): algoritmo NOAA simplificado (sunrise equation).

const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const J_EPOCH_UNIX = 2440587.5;
const DAY_MS = 86400000;

const sinDeg = (d: number): number => Math.sin(d * RAD);
const cosDeg = (d: number): number => Math.cos(d * RAD);

export interface SunTimes {
  sunriseMs: number;
  sunsetMs: number;
}

function julian(dateMs: number): number {
  return dateMs / DAY_MS + J_EPOCH_UNIX;
}

function fromJulian(jd: number): number {
  return (jd - J_EPOCH_UNIX) * DAY_MS;
}

export function sunTimes(lat: number, lon: number, dateMs: number): SunTimes | null {
  const jd = julian(dateMs);
  const n = Math.round(jd - J2000 + 0.0008);
  const jStar = n - lon / 360;

  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c = 1.9148 * sinDeg(m) + 0.02 * sinDeg(2 * m) + 0.0003 * sinDeg(3 * m);
  const lambda = ((m + c + 180 + 102.9372) % 360 + 360) % 360;

  const jTransit = J2000 + jStar + 0.0053 * sinDeg(m) - 0.0069 * sinDeg(2 * lambda);

  const sinDecl = sinDeg(lambda) * sinDeg(23.44);
  const cosDecl = Math.sqrt(Math.max(0, 1 - sinDecl * sinDecl));

  const cosH = (sinDeg(-0.833) - sinDeg(lat) * sinDecl) / (cosDeg(lat) * cosDecl);
  if (cosH < -1 || cosH > 1) return null;

  const h = Math.acos(cosH) / RAD;
  return {
    sunriseMs: fromJulian(jTransit - h / 360),
    sunsetMs: fromJulian(jTransit + h / 360),
  };
}

export function isNight(lat: number, lon: number, nowMs: number): boolean {
  const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const s = sunTimes(lat, lon, dayStart);
  if (!s) {
    const jd = julian(dayStart);
    const n = Math.round(jd - J2000 + 0.0008);
    const lambda =
      ((357.5291 + 0.98560028 * n + 102.9372 + 180) % 360 + 360) % 360;
    const sinDecl = sinDeg(lambda) * sinDeg(23.44);
    const cosH = (sinDeg(-0.833) - sinDeg(lat) * sinDecl) / (cosDeg(lat) * Math.sqrt(1 - sinDecl * sinDecl));
    return cosH > 1;
  }
  return nowMs < s.sunriseMs || nowMs > s.sunsetMs;
}
