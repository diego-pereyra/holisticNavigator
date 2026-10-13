// Formato de coordenadas (T3.4): grados y minutos a 0,1' con hemisferio.

function parts(absDeg: number): { deg: number; min: number } {
  let deg = Math.floor(absDeg);
  let min = Math.round((absDeg - deg) * 600) / 10;
  if (min >= 60) {
    deg += 1;
    min -= 60;
  }
  return { deg, min };
}

function format(absDeg: number, degWidth: number, hemi: string): string {
  const { deg, min } = parts(absDeg);
  const mi = Math.floor(min);
  const mf = Math.round((min - mi) * 10);
  const degStr = String(deg).padStart(degWidth, "0");
  const minStr = `${String(mi).padStart(2, "0")}.${mf}`;
  return `${degStr}°${minStr}'${hemi}`;
}

export function formatLat(lat: number): string {
  return format(Math.abs(lat), 2, lat < 0 ? "S" : "N");
}

export function formatLon(lon: number): string {
  return format(Math.abs(lon), 3, lon < 0 ? "W" : "E");
}

// CoordParse (T2.2): acepta `15.5 -60.2`, `15°30'N 60°12'W`, `15 30.0 N 60 12.0 W`.

interface Hemi {
  value: number;
  hemi: string;
}

function parseHemi(deg: string, min: string | undefined, hemi: string): Hemi {
  const d = Number(deg);
  const m = min === undefined ? 0 : Number(min);
  const value = d + m / 60;
  return { value, hemi };
}

export function parseCoords(input: string): { lat: number; lon: number } | null {
  const s = input
    .trim()
    .toUpperCase()
    .replace(/[°º]/g, " ")
    .replace(/['′]/g, " ");
  const re = /(-?\d+(?:\.\d+)?)\s*(?:(\d+(?:\.\d+)?))?\s*([NSEW])/g;
  const groups = [...s.matchAll(re)];
  if (groups.length >= 2) {
    const parsed = groups.slice(0, 2).map((m) => parseHemi(m[1]!, m[2], m[3]!));
    let lat: number | null = null;
    let lon: number | null = null;
    for (const p of parsed) {
      const sign = p.hemi === "S" || p.hemi === "W" ? -1 : 1;
      if ((p.hemi === "N" || p.hemi === "S") && lat === null) lat = sign * p.value;
      else if ((p.hemi === "E" || p.hemi === "W") && lon === null) lon = sign * p.value;
    }
    if (lat !== null && lon !== null) return { lat, lon };
    if (lat === null && lon === null) return null;
  }
  const nums = s
    .split(/[\s,;]+/)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n));
  const a = nums[0];
  const b = nums[1];
  if (a !== undefined && b !== undefined) return { lat: a, lon: b };
  return null;
}

