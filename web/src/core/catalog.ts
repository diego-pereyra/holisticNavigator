// Catálogo v3 (T0.3–T0.6): tipos, filtrado y armado de la ficha.

export interface IndexEntry {
  code: string;
  title: string;
  chapter: string;
  region: string;
  from: string;
  to: string;
  nmMin: number;
  nmMax: number;
  variantCount: number;
  bestMonths: number[];
  stormMonths: number[];
  bbox: number[];
  searchNames: string[];
}

export interface CatalogIndex {
  chapters: string[];
  routes: IndexEntry[];
}

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  dest: boolean;
  corrected: boolean;
}

export interface RouteVariant {
  id: string;
  from: string;
  to: string;
  nm: number;
  coastal: boolean;
  needsReview: boolean;
  waypoints: Waypoint[];
}

export interface RouteZone {
  label: string;
  months: number[];
}

export interface RouteWhen {
  bestEn: string;
  bestEs: string;
  bestMonths: number[];
  stormsEn: string;
  stormsEs: string;
  stormMonths: number[];
  zones: RouteZone[];
}

export interface RouteDetail {
  code: string;
  title: string;
  chapter: string;
  region: string;
  from: string;
  to: string;
  whenInfo: RouteWhen;
  charts: string[];
  guides: string[];
  planner: string[];
  variants: RouteVariant[];
  attribution: string;
  needsReview: boolean;
  quoteEn: string;
  quoteEs: string;
  quoteSource: string;
  chapterTip: string;
  tip: string;
}

const EMPTY_WHEN: RouteWhen = {
  bestEn: "",
  bestEs: "",
  bestMonths: [],
  stormsEn: "",
  stormsEs: "",
  stormMonths: [],
  zones: [],
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const numArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];

function parseWaypoint(v: unknown): Waypoint | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  return {
    name: typeof o["name"] === "string" ? o["name"] : "",
    lat: typeof o["lat"] === "number" ? o["lat"] : 0,
    lon: typeof o["lon"] === "number" ? o["lon"] : 0,
    dest: o["dest"] === true,
    corrected: o["corrected"] === true,
  };
}

function parseVariant(v: unknown): RouteVariant | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const wps = Array.isArray(o["waypoints"]) ? o["waypoints"] : [];
  return {
    id: typeof o["id"] === "string" ? o["id"] : "",
    from: typeof o["from"] === "string" ? o["from"] : "",
    to: typeof o["to"] === "string" ? o["to"] : "",
    nm: typeof o["nm"] === "number" ? o["nm"] : 0,
    coastal: o["coastal"] === true,
    needsReview: o["needsReview"] === true,
    waypoints: wps.map(parseWaypoint).filter((w): w is Waypoint => w !== null),
  };
}

function parseWhen(v: unknown): RouteWhen {
  if (typeof v !== "object" || v === null) return { ...EMPTY_WHEN };
  const o = v as Record<string, unknown>;
  const zones = Array.isArray(o["zones"])
    ? o["zones"]
        .map((z) => {
          if (typeof z !== "object" || z === null) return null;
          const zz = z as Record<string, unknown>;
          return {
            label: typeof zz["label"] === "string" ? z["label"] : "",
            months: numArray(z["months"]),
          };
        })
        .filter((z): z is RouteZone => z !== null)
    : [];
  return {
    bestEn: typeof o["bestEn"] === "string" ? o["bestEn"] : "",
    bestEs: typeof o["bestEs"] === "string" ? o["bestEs"] : "",
    bestMonths: numArray(o["bestMonths"]),
    stormsEn: typeof o["stormsEn"] === "string" ? o["stormsEn"] : "",
    stormsEs: typeof o["stormsEs"] === "string" ? o["stormsEs"] : "",
    stormMonths: numArray(o["stormMonths"]),
    zones,
  };
}

export function parseIndex(json: string): CatalogIndex {
  const root = JSON.parse(json) as Record<string, unknown>;
  const routes = Array.isArray(root["routes"]) ? root["routes"] : [];
  return {
    chapters: strArray(root["chapters"]),
    routes: routes
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => ({
        code: typeof r["code"] === "string" ? r["code"] : "",
        title: typeof r["title"] === "string" ? r["title"] : "",
        chapter: typeof r["chapter"] === "string" ? r["chapter"] : "",
        region: typeof r["region"] === "string" ? r["region"] : "",
        from: typeof r["from"] === "string" ? r["from"] : "",
        to: typeof r["to"] === "string" ? r["to"] : "",
        nmMin: typeof r["nmMin"] === "number" ? r["nmMin"] : 0,
        nmMax: typeof r["nmMax"] === "number" ? r["nmMax"] : 0,
        variantCount: typeof r["variantCount"] === "number" ? r["variantCount"] : 0,
        bestMonths: numArray(r["bestMonths"]),
        stormMonths: numArray(r["stormMonths"]),
        bbox: numArray(r["bbox"]),
        searchNames: strArray(r["searchNames"]),
      })),
  };
}

export function parseFact(line: string): RouteDetail | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof o["code"] !== "string") return null;
  const whenRaw = o["when"];
  return {
    code: o["code"],
    title: typeof o["title"] === "string" ? o["title"] : "",
    chapter: typeof o["chapter"] === "string" ? o["chapter"] : "",
    region: typeof o["region"] === "string" ? o["region"] : "",
    from: typeof o["from"] === "string" ? o["from"] : "",
    to: typeof o["to"] === "string" ? o["to"] : "",
    whenInfo: typeof whenRaw === "object" && whenRaw !== null ? parseWhen(whenRaw) : EMPTY_WHEN,
    charts: strArray(o["charts"]),
    guides: strArray(o["guides"]),
    planner: strArray(o["planner"]),
    variants: (Array.isArray(o["variants"]) ? o["variants"] : [])
      .map(parseVariant)
      .filter((v): v is RouteVariant => v !== null),
    attribution: typeof o["attribution"] === "string" ? o["attribution"] : "",
    needsReview: o["needsReview"] === true,
    quoteEn: typeof o["quoteEn"] === "string" ? o["quoteEn"] : "",
    quoteEs: typeof o["quoteEs"] === "string" ? o["quoteEs"] : "",
    quoteSource: typeof o["quoteSource"] === "string" ? o["quoteSource"] : "",
    chapterTip: typeof o["chapterTip"] === "string" ? o["chapterTip"] : "",
    tip: typeof o["tip"] === "string" ? o["tip"] : "",
  };
}

export interface CatalogFilter {
  query: string;
  region: string;
}

export function filterEntries(index: CatalogIndex, filter: CatalogFilter): IndexEntry[] {
  const q = filter.query.trim().toLowerCase();
  return index.routes.filter((e) => {
    if (filter.region !== "" && e.region !== filter.region) return false;
    if (q === "") return true;
    const hay = `${e.code} ${e.title} ${e.from} ${e.to} ${e.region} ${e.searchNames.join(" ")}`;
    return hay.toLowerCase().includes(q);
  });
}

export type MonthVerdict = "best" | "storm" | "off";

export function monthVerdict(best: number[], storms: number[], month: number): MonthVerdict {
  if (best.includes(month)) return "best";
  if (storms.includes(month)) return "storm";
  return "off";
}

