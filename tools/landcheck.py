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


class Land:
    def __init__(self, path=MASK):
        self.polys = []
        self.grid = {}
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
        for idx in self.grid.get((int(x // CELL), int(y // CELL)), ()):
            bbox, ring, holes = self.polys[idx]
            if bbox[0] <= x <= bbox[1] and bbox[2] <= y <= bbox[3] and self._pip(x, y, ring):
                if not any(self._pip(x, y, h) for h in holes):
                    return True
        return False

    def segment(self, a, b, step=0.02):
        """Return max interior-land run length in nm for segment a=(lon,lat)->b."""
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
        best = 0
        run = 0
        for i, land in enumerate(samples):
            if land and 0 < i < n - 1:  # ignore the two endpoints (coast/port)
                run += 1
                best = max(best, run)
            else:
                run = 0
        return best * mn

    def crossing_nm(self, coords, step=0.02):
        """Max interior-land run (nm) over a whole polyline."""
        return max((self.segment(coords[i], coords[i + 1], step) for i in range(len(coords) - 1)), default=0.0)


if __name__ == "__main__":
    import time
    t = time.time()
    land = Land()
    print("polys", len(land.polys), "load %.1fs" % (time.time() - t))
    print("gran bretaña?", land.is_land(-0.1, 51.5), "| atlántico?", land.is_land(-30, 40))
