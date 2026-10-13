// Carga del catálogo v3 desde web/public/catalog (servido en /catalog).

import { parseFact, parseIndex, type CatalogIndex, type RouteDetail } from "../core/catalog.ts";
import type { Basin } from "../core/context.ts";

const base = (): string => document.baseURI;

async function fetchText(path: string): Promise<string> {
  const res = await fetch(new URL(path, base()));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

export async function loadIndex(): Promise<CatalogIndex> {
  return parseIndex(await fetchText("catalog/index.json"));
}

export async function loadBasins(): Promise<Record<string, Basin>> {
  const doc = JSON.parse(await fetchText("catalog/basins.json")) as {
    regions: Record<string, Basin>;
  };
  return doc.regions;
}

export async function loadRoutesGeoJson(): Promise<string> {
  return fetchText("catalog/routes.geojson");
}

const factCache = new Map<string, RouteDetail[]>();

async function factsOf(chapter: string): Promise<RouteDetail[]> {
  const cached = factCache.get(chapter);
  if (cached) return cached;
  const text = await fetchText(`catalog/facts/${chapter}.jsonl`);
  const list: RouteDetail[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const detail = parseFact(line);
    if (detail) list.push(detail);
  }
  factCache.set(chapter, list);
  return list;
}

export async function loadFact(chapter: string, code: string): Promise<RouteDetail | null> {
  const list = await factsOf(chapter);
  return list.find((d) => d.code === code) ?? null;
}
