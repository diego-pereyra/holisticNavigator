#!/usr/bin/env python3
"""Land-intersection check over the Natural Earth 110m land mask.

Coarse by design (110m): coastal waypoints may sit "on land" in the mask, so a
segment's endpoints are not reliable evidence. We only count runs of land that
are *interior* to a segment (bounded by water on both sides), which is what a
real missing waypoint / bad coordinate looks like.

Grid-indexed to keep the full-catalog scan to a few seconds.
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASK = os.path.join(ROOT, "data", "land", "ne_110m_land.geojson")

CELL = 2.0  # degrees
ENDPOINT_LAND_NM = 6.0  # land shorter than this touching an endpoint is shoreline


class Land:
    def __init__(self, path=MASK):
        self.polys = []
        self.grid = {}
        self.raster = None
        self.cell = 0.02
        if not os.path.exists(path):
            self.ok = False
            return
        self.ok = True
        for f in json.load(open(path, encoding="utf-8"))["features"]:
            g = f["geometry"]
            for poly in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
                ring = poly[0]
                holes = poly[1:]
                xs = [p[0] for p in ring]
                ys = [p[1] for p in ring]
                bbox = (min(xs), max(xs), min(ys), max(ys))
                idx = len(self.polys)
                self.polys.append((bbox, ring, holes))
                for cx in range(int(bbox[0] // CELL), int(bbox[1] // CELL) + 1):
                    for cy in range(int(bbox[2] // CELL), int(bbox[3] // CELL) + 1):
                        self.grid.setdefault((cx, cy), []).append(idx)
        self._build_raster()

    def _build_raster(self):
        """Rasterize the mask once so is_land() is an O(1) array lookup."""
        try:
            import numpy as np
            from PIL import Image, ImageDraw
        except Exception:
            return
        cell = self.cell
        w = int(round(360.0 / cell))
        h = int(round(180.0 / cell))
        img = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(img)

        def px(lon, lat):
            return ((lon + 180.0) / cell, (90.0 - lat) / cell)

        for _bbox, ring, holes in self.polys:
            draw.polygon([px(*p) for p in ring], fill=255)
            for hole in holes:
                draw.polygon([px(*p) for p in hole], fill=0)
        self.raster = np.asarray(img, dtype=np.uint8)

    @staticmethod
    def _pip(x, y, ring):
        ins = False
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                ins = not ins
        return ins

    def is_land(self, x, y):
        if self.raster is not None:
            xx = ((x + 180.0) % 360.0) - 180.0
            xi = int((xx + 180.0) / self.cell)
            yi = int((90.0 - y) / self.cell)
            if xi < 0:
                xi = 0
            elif xi >= self.raster.shape[1]:
                xi = self.raster.shape[1] - 1
            if yi < 0:
                yi = 0
            elif yi >= self.raster.shape[0]:
                yi = self.raster.shape[0] - 1
            return bool(self.raster[yi, xi])
        for idx in self.grid.get((int(x // CELL), int(y // CELL)), ()):
            bbox, ring, holes = self.polys[idx]
            if bbox[0] <= x <= bbox[1] and bbox[2] <= y <= bbox[3] and self._pip(x, y, ring):
                return not any(self._pip(x, y, hole) for hole in holes)
        return False

    def segment(self, a, b, step=0.02):
        """Return max interior-land run length in nm for segment a=(lon,lat)->b.

        A short land run that touches an endpoint is ignored: on the coarse
        110m mask ports and coastal waypoints sit "on land", and that shoreline
        strip is not evidence of a missing waypoint. A *long* land run touching
        an endpoint (>= ENDPOINT_LAND_NM) is real and counts.
        """
        dlon = b[0] - a[0]
        if dlon > 180:
            dlon -= 360
        elif dlon < -180:
            dlon += 360
        dlat = b[1] - a[1]
        m = max(int(abs(dlon) / step), int(abs(dlat) / step), 1)
        samples = [self.is_land(a[0] + dlon * k / m, a[1] + dlat * k / m) for k in range(m + 1)]
        n = len(samples)
        mn = step * 60 * max(0.02, math.cos(math.radians((a[1] + b[1]) / 2)))
        best = 0.0
        i = 0
        while i < n:
            if samples[i]:
                j = i
                while j < n and samples[j]:
                    j += 1
                run_nm = (j - i) * mn
                edge_run = i == 0 or j == n
                if not (edge_run and run_nm <= ENDPOINT_LAND_NM):
                    best = max(best, run_nm)
                i = j
            else:
                i += 1
        return best

    def crossing_nm(self, coords, step=0.02):
        """Max interior-land run (nm) over a whole polyline."""
        return max((self.segment(coords[i], coords[i + 1], step) for i in range(len(coords) - 1)), default=0.0)


if __name__ == "__main__":
    import time
    t = time.time()
    land = Land()
    print("polys", len(land.polys), "load %.1fs" % (time.time() - t))
    print("gran bretaña?", land.is_land(-0.1, 51.5), "| atlántico?", land.is_land(-30, 40))
