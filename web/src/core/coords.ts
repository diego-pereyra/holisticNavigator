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
