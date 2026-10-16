#!/usr/bin/env python3
"""Máscara de tierra de 0,1° para el pipeline (E12.2).

Lee `data/land/land.bits` (el mismo formato que consume `web/src/core/routing/
landmask.ts`) y ofrece consultas O(1) de tierra y del **margen costero**,
dilatando k celdas. Reemplaza el raster de 110m de `landcheck.py` en el
detector de cruces y en el optimizador costero.

Formato: rejilla 3 600 × 1 800 bits, origen (-180, -90), filas de sur a norte y
1 = tierra. La celda c vive en el byte `c >> 3`, en el bit `7 - (c & 7)`
(MSB primero); `c = fila * 3600 + columna`, con fila = floor((lat+90)/0,1) y
columna = floor((lon+180)/0,1).

Uso: python3 tools/landmask.py            # detector sobre el catálogo v3
     python3 tools/landmask.py --src      # sobre data/epub/routes_v2.json
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BITS = os.path.join(ROOT, "data", "land", "land.bits")
GEO = os.path.join(ROOT, "data", "catalog", "v3", "routes.geojson")
SRC = os.path.join(ROOT, "data", "epub", "routes_v2.json")

CELL = 0.1
WIDTH = 3600
HEIGHT = 1800
PER_DEG = 1.0 / CELL

# Igual que `landcheck`/`optimize_coast`: un tramo interior de tierra a partir
# de este largo (nm) cuenta como cruce; una franja corta pegada a un extremo es
# el propio puerto sobre la máscara.
FLAG_NM = 3.0
ENDPOINT_LAND_NM = 6.0
# Margen costero del ADR (niveles 1 y 5): 1 celda de 0,1° ≈ 3 nm.
MARGIN_NM = 3.0


class LandMask:
    def __init__(self, path=BITS):
        if not os.path.exists(path):
            self.ok = False
            self.bits = b""
            return
        with open(path, "rb") as fh:
            data = fh.read()
        self.ok = len(data) == WIDTH * HEIGHT // 8
        self.bits = data

    def is_land(self, lon, lat):
        """¿La celda de (lon, lat) es tierra?"""
        col = int((lon + 180.0) * PER_DEG)
        col %= WIDTH
        row = int((lat + 90.0) * PER_DEG)
        row = 0 if row < 0 else (HEIGHT - 1 if row >= HEIGHT else row)
        i = row * WIDTH + col
        return bool((self.bits[i >> 3] >> (7 - (i & 7))) & 1)

    def is_land_margin(self, lon, lat, nm=MARGIN_NM):
        """¿Hay tierra a menos de `nm` millas náuticas (k = ceil(nm/6) celdas)?"""
        k = max(1, int(math.ceil(nm / 6.0)))
        col = int((lon + 180.0) * PER_DEG)
        row = int((lat + 90.0) * PER_DEG)
        r0 = row - k if row - k > 0 else 0
        r1 = row + k if row + k < HEIGHT - 1 else HEIGHT - 1
        for r in range(r0, r1 + 1):
            base = r * WIDTH
            for dc in range(-k, k + 1):
                c = (col + dc) % WIDTH
                i = base + c
                if (self.bits[i >> 3] >> (7 - (i & 7))) & 1:
                    return True
        return False

    def _sampler(self, nm):
        if nm <= 0:
            return lambda lon, lat: self.is_land(lon, lat)
        return lambda lon, lat: self.is_land_margin(lon, lat, nm)

    def segment(self, a, b, margin_nm=MARGIN_NM, step=0.02, interior_only=False):
        """Largo (nm) del mayor tramo interior de tierra-con-margen en a->b.

        Un tramo pegado a un extremo se ignora si mide hasta `ENDPOINT_LAND_NM`
        (con `interior_only`, siempre): el waypoint de un puerto está a menos
        del margen de la costa, y esa aproximación no es un cruce.
        """
        dlon = b[0] - a[0]
        if dlon > 180:
            dlon -= 360
        elif dlon < -180:
            dlon += 360
        dlat = b[1] - a[1]
        if abs(dlon) > 170:
            return 0.0
        m = max(int(abs(dlon) / step), int(abs(dlat) / step), 1)
        is_land = self._sampler(margin_nm)
        n = m + 1
        nm_per = step * 60.0 * max(0.02, math.cos(math.radians((a[1] + b[1]) / 2.0)))
        best = 0.0
        i = 0
        while i < n:
            if is_land(a[0] + dlon * i / m, a[1] + dlat * i / m):
                j = i
                while j < n and is_land(a[0] + dlon * j / m, a[1] + dlat * j / m):
                    j += 1
                run_nm = (j - i) * nm_per
                edge_run = i == 0 or j == n
                counted = (not edge_run) if interior_only else not (edge_run and run_nm <= ENDPOINT_LAND_NM)
                if counted:
                    best = max(best, run_nm)
                i = j
            else:
                i += 1
        return best

    def crossing_nm(self, coords, margin_nm=MARGIN_NM, step=0.02, interior_only=False):
        """Mayor tramo interior de tierra-con-margen (nm) de una polilínea."""
        return max(
            (self.segment(coords[i], coords[i + 1], margin_nm, step, interior_only)
             for i in range(len(coords) - 1)),
            default=0.0,
        )


def _variants_src():
    """Variantes (id, coords) del catálogo fuente, sin optimizar."""
    from build_v2_catalog import ERRATA, RENAME  # noqa: E402 (import tardío: pesa)
    for r in json.load(open(SRC, encoding="utf-8")):
        for t in r.get("waypointTable") or []:
            wps = t.get("waypoints") or []
            for w in wps:
                key = (t["id"], w["name"])
                if key in ERRATA:
                    w["lat"], w["lon"] = ERRATA[key]
                if key in RENAME:
                    w["name"] = RENAME[key]
            if len(wps) >= 2:
                yield t["id"], [(w["lon"], w["lat"]) for w in wps]


def _variants_geo():
    cat = json.load(open(GEO, encoding="utf-8"))
    for f in cat["features"]:
        if f["geometry"]["type"] == "LineString":
            yield f["properties"].get("variant", f["properties"]["code"]), f["geometry"]["coordinates"]


def measure(variants, margin_nm=MARGIN_NM):
    """Detector de cruces: variantes con tierra-con-margen interior.

    Los tramos que tocan un extremo (aproximación al puerto) no cuentan: el
    waypoint de un puerto está a menos del margen de su costa.
    """
    mask = LandMask()
    total = crossing = 0
    worst = []
    for vid, coords in variants:
        total += 1
        c = mask.crossing_nm(coords, margin_nm, interior_only=True)
        if c >= FLAG_NM:
            crossing += 1
            worst.append((c, vid))
    worst.sort(reverse=True)
    return total, crossing, worst


def main():
    if not LandMask().ok:
        print("falta data/land/land.bits: generá data/land/land.bits.", file=sys.stderr)
        return 1
    margin = MARGIN_NM
    for arg in sys.argv[1:]:
        if arg.startswith("--margin="):
            margin = float(arg.split("=", 1)[1])
    src = "--src" in sys.argv
    variants = list(_variants_src() if src else _variants_geo())
    where = "routes_v2.json (sin optimizar)" if src else "catálogo v3 (hoy)"
    total, crossing, worst = measure(variants, margin)
    print(f"máscara 10m · {where} · margen {margin:g} nm (1 celda = 0,1°)")
    print(f"cruzan tierra-con-margen ≥ {FLAG_NM:g} nm: {crossing} de {total} variantes")
    print("peores:", ", ".join(f"{v} ({c:.0f}nm)" for c, v in worst[:15]))


if __name__ == "__main__":
    main()
