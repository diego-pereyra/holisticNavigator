// Importación de rutas (GPX/KML/CSV) — portado de Gpx.kt.
import type { TrackPoint, VoyageLog } from "./voyage.ts";

export interface ImportedRoute {
  id: string;
  name: string;
  points: TrackPoint[];
}

export interface RouteDuplicate {
  route: ImportedRoute;
  sameName: boolean;
  matchRatio: number;
}

function attr(attrs: string, key: string): number | null {
  const m = new RegExp(`\\b${key}\\s*=\\s*"([-\\d.eE+]+)"`, "i").exec(attrs);
  const v = m?.[1];
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanName(name: string, xml: string): string {
  const m = /<name>([^<]*)<\/name>/i.exec(xml);
  const found = m?.[1]?.trim();
  if (found) return found;
  const base = name.slice(0, name.lastIndexOf(".") === -1 ? name.length : name.lastIndexOf("."));
  return base.trim() === "" ? name : base;
}

function routeId(name: string, seed: number): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  const mixed = (h * 31 + seed) >>> 0;
  return "IMP-" + mixed.toString(16).padStart(6, "0").slice(0, 6);
}

function makeRoute(name: string, content: string, points: PointLike[]): ImportedRoute | null {
  if (points.length < 2) return null;
  const label = cleanName(name, content);
  return {
    id: routeId(label, content.length),
    name: label,
    points: points.map((p) => ({ t: 0, lat: p.lat, lon: p.lon })),
  };
}

interface PointLike {
  lat: number;
  lon: number;
}

const POINT_TAG_RE = /<(?:trkpt|rtept|wpt)\b([^>]*)>/gi;

export function parseGpx(name: string, xml: string): ImportedRoute | null {
  const points: PointLike[] = [];
  POINT_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POINT_TAG_RE.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    const lat = attr(attrs, "lat");
    const lon = attr(attrs, "lon");
    if (lat === null || lon === null) continue;
    points.push({ lat, lon });
  }
  return makeRoute(name, xml, points);
}

export function parseKml(name: string, xml: string): ImportedRoute | null {
  const points: PointLike[] = [];
  const block = /<coordinates>\s*([^<]+?)\s*<\/coordinates>/gi;
  let m: RegExpExecArray | null;
  while ((m = block.exec(xml)) !== null) {
    for (const token of (m[1] ?? "").split(/\s+/)) {
      if (token === "") continue;
      const parts = token.split(",");
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) points.push({ lat, lon });
    }
  }
  return makeRoute(name, xml, points);
}

export function parseCsv(name: string, text: string): ImportedRoute | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) return null;
  const header = lines[0]!;
  const delim = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";

  const cells0 = splitCsvLine(header, delim).map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
  let latIdx = cells0.findIndex((c) => ["lat", "latitude", "lat_deg", "y"].includes(c));
  let lonIdx = cells0.findIndex((c) =>
    ["lon", "lng", "long", "longitude", "lon_deg", "x"].includes(c),
  );
  let start = 0;
  if (latIdx >= 0 && lonIdx >= 0) {
    start = 1;
  } else {
    const words = splitCsvLine(lines[0]!, delim);
    const a = Number(words[0]?.trim().replace(/^"|"$/g, ""));
    const b = Number(words[1]?.trim().replace(/^"|"$/g, ""));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
      lonIdx = 0;
      latIdx = 1;
    } else {
      latIdx = 0;
      lonIdx = 1;
    }
  }

  const points: PointLike[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delim);
    const lat = Number(cells[latIdx]?.trim().replace(/^"|"$/g, ""));
    const lon = Number(cells[lonIdx]?.trim().replace(/^"|"$/g, ""));
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ lat, lon });
  }
  return makeRoute(name, text, points);
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const c of line) {
    if (c === '"') {
      inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseRouteFile(name: string, content: string): ImportedRoute | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".kml")) return parseKml(name, content);
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return parseCsv(name, content);
  return parseGpx(name, content);
}

export function importedRouteToGeoJson(route: ImportedRoute): string {
  const safe = route.name.replace(/"/g, "'").replace(/\\/g, " ");
  const coords = route.points.map((p) => `[${p.lon},${p.lat}]`).join(",");
  return (
    `{"type":"FeatureCollection","features":[{"type":"Feature",` +
    `"properties":{"code":"${route.id}","variant":"${route.id}","title":"${safe}",` +
    `"from":"","to":"","needsReview":false,"landNm":0},` +
    `"geometry":{"type":"LineString","coordinates":[${coords}]}}]}`
  );
}

function isoUtc(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
  );
}

function xmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function voyageToGpx(log: VoyageLog): string {
  const sb: string[] = [];
  sb.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  sb.push(
    '<gpx version="1.1" creator="Holistic Navigator" ' +
      'xmlns="http://www.topografix.com/GPX/1/1">\n',
  );
  for (const n of log.notes ?? []) {
    sb.push(
      `  <wpt lat="${n.lat}" lon="${n.lon}"><time>${isoUtc(n.t)}</time>` +
        `<name>Nota</name><desc>${xmlText(n.text)}</desc></wpt>\n`,
    );
  }
  sb.push(`  <trk>\n    <name>${xmlText(log.name)}</name>\n`);
  sb.push("    <trkseg>\n");
  for (const p of log.points) {
    sb.push(
      `      <trkpt lat="${p.lat}" lon="${p.lon}"><time>${isoUtc(p.t)}</time></trkpt>\n`,
    );
  }
  sb.push("    </trkseg>\n  </trk>\n</gpx>\n");
  return sb.join("");
}
