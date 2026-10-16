// Persistencia de rutas propias (E11.4): registro por id en IndexedDB
// (`hn.routes-own.<id>`) y un índice de ids en `hn.myRoutes`.
import { KEYS } from "./store.ts";
import type { KeyValueStore } from "./store.ts";
import { parseOwnRoute, serializeOwnRoute, type OwnRoute } from "../core/routes-own.ts";

export const ROUTES_OWN_PREFIX = "hn.routes-own.";

export function ownRouteKey(id: string): string {
  return `${ROUTES_OWN_PREFIX}${id}`;
}

export async function readOwnIndex(store: KeyValueStore): Promise<string[]> {
  const text = await store.get(KEYS.myRoutes);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadOwnRoutes(store: KeyValueStore): Promise<OwnRoute[]> {
  const index = await readOwnIndex(store);
  const routes: OwnRoute[] = [];
  for (const id of index) {
    const text = await store.get(ownRouteKey(id));
    const route = text ? parseOwnRoute(text) : null;
    if (route) routes.push(route);
  }
  return routes;
}

export async function saveOwnRoute(store: KeyValueStore, route: OwnRoute): Promise<void> {
  await store.put(ownRouteKey(route.id), serializeOwnRoute(route));
  const index = await readOwnIndex(store);
  if (!index.includes(route.id)) {
    index.push(route.id);
    await store.put(KEYS.myRoutes, JSON.stringify(index));
  }
}

export async function deleteOwnRoute(store: KeyValueStore, id: string): Promise<void> {
  await store.remove(ownRouteKey(id));
  const index = (await readOwnIndex(store)).filter((x) => x !== id);
  if (index.length === 0) await store.remove(KEYS.myRoutes);
  else await store.put(KEYS.myRoutes, JSON.stringify(index));
}
