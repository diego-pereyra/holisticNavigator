#!/usr/bin/env python3
"""Quality report for the georeferenced route catalog (P1).

Three independent checks over data/epub/routes_v2.json / routes.geojson:

  1. anchor outliers  A waypoint name that appears in several routes but whose
                      longitude sits far (>--min-lon deg at ~same latitude) from
                      the dominant cluster of that name -> erratum or a
                      multi-destination table that mixed coordinates.
  2. hemisphere       A name whose latitude sign flips across routes.
  3. land crossings   Segments crossing land for more than --land-nm nm on the
                      low-res Natural Earth 110m mask. Coarse: coastal ports and
                      "round the cape" chords are false positives; only large
                      runs (>50 nm) hint at a missing waypoint or a bad coord.

Usage: python3 tools/check_quality.py [--land-nm 50] [--min-lon 4] [--max-lat 1]
"""
import argparse
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "epub", "routes_v2.json")
GEO = os.path.join(ROOT, "data", "catalog", "v2", "routes.geojson")
LAND = "/tmp/opencode/ne_110m_land.geojson"


def waypoints():
    for r in json.load(open(SRC, encoding="utf-8")):
        for t in r.get("waypointTable") or []:
            for w in t.get("waypoints") or []:
                yield t["id"], w


def check_anchor(min_lon, max_lat):
    occ = {}
    for vid, w in waypoints():
        occ.setdefault(w["name"], []).append((vid, round(w["lat"], 3), round(w["lon"], 3)))
    print("== anchor outliers (mismo nombre, lat ~igual, lon separada) ==")
    n = 0
    for nm, vs in sorted(occ.items()):
        if len(vs) < 2:
            continue
        lats = [v[1] for v in vs]
        if max(lats) - min(lats) > max_lat:
            continue
        lons = sorted(v[2] for v in vs)
        if lons[-1] - lons[0] < min_lon:
            continue
        n += 1
        med = lons[len(lons) // 2]
        hits = [v for v in vs if abs(v[2] - med) >= min_lon]
        print(f"   {nm}: ancla lon~{med}  outliers {hits}")
    print(f"   -> {n} nombres")

    print("== hemisphere flips (lat + <-> -) ==")
    m = 0
    for nm, vs in sorted(occ.items()):
        lats = [v[1] for v in vs]
        if lats and min(lats) < -0.5 and max(lats) > 0.5:
            m += 1
            print(f"   {nm}: {vs}")
    print(f"   -> {m} nombres")


def load_polys():
    from landcheck import Land
    return Land()


def check_land(min_nm):
    land = load_polys()
    cat = json.load(open(GEO, encoding="utf-8"))
    print(f"== land crossings > {min_nm} nm (máscara 110m, orientativo) ==")
    routes = set()
    n = 0
    for f in cat["features"]:
        g = f["geometry"]
        if g["type"] != "LineString":
            continue
        c = g["coordinates"]
        code = f["properties"]["code"]
        for i in range(len(c) - 1):
            if land.segment(c[i], c[i + 1]) >= min_nm:
                n += 1
                routes.add(code)
    print(f"   -> {n} segmentos en {len(routes)} rutas")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--land-nm", type=float, default=50.0)
    ap.add_argument("--min-lon", type=float, default=4.0)
    ap.add_argument("--max-lat", type=float, default=1.0)
    ap.add_argument("--skip-land", action="store_true")
    a = ap.parse_args()
    check_anchor(a.min_lon, a.max_lat)
    if not a.skip_land:
        check_land(a.land_nm)


if __name__ == "__main__":
    main()
