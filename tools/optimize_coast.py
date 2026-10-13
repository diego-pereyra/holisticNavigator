#!/usr/bin/env python3
"""Coastal waypoint optimizer.

The 8th edition sometimes publishes two consecutive waypoints whose straight
chord runs over land: a missing intermediate waypoint (the real route rounds a
cape/peninsula) or a bad coordinate. `landcheck.py` flags those variants as
`needsReview`.

This tool inserts the minimal synthetic waypoints needed so the track follows
water, a safety margin offshore. Primary method pushes the offending chord
offshore (parallel) until it clears the land; a local visibility graph (Dijkstra
among seaward-offset coastline vertices) is the fallback. Inserted points are
NOT in the book; the caller marks them `approx`.

Scoped to coastal geometry: unreachable/gross crossings (whole continents, bad
tables) are left flagged for human review.
"""
import heapq
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landcheck import Land

FLAG_NM = 3.0      # interior-land run at/above this counts as a crossing
ENDPOINT_LAND_NM = 6.0  # a land run touching an endpoint up to this nm is a port
SAFE_NM = 3.0      # offset distance seaward from the coastline
STEP = 0.02        # sampling resolution for run detection (deg)
EDGE_STEP = 0.04   # sampling resolution for edge validity (deg)
D_MAX_NM = 150.0   # max offshore push for the parallel method
PAD = 0.6          # deg around the run bounding box for candidate vertices
MAX_NODES = 80     # cap on visibility-graph nodes per segment
MAX_RUN_NM = 120.0   # a longer land run is a gross crossing, not a missing waypoint
MAX_CHORD_DEG = 30.0  # skip optimization on segments longer than this (whole basins)
# Total land lookups allowed per segment before we give up (leave it flagged).
# Bounds the worst case so the catalog build terminates in reasonable time.
MAX_LOOKUPS = int(os.environ.get("COAST_MAX_LOOKUPS", 120000))


class _Budget(Exception):
    pass


def wrap_dlon(d):
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return d


class Coast:
    def __init__(self, land):
        self.land = land
        self._memo = {}
        self._lookups = 0

    def _is_land(self, x, y):
        key = (round(x, 3), round(y, 3))
        v = self._memo.get(key)
        if v is not None:
            return v
        self._lookups += 1
        if self._lookups > MAX_LOOKUPS:
            raise _Budget()
        if len(self._memo) > 2_000_000:
            self._memo.clear()
        v = self.land.is_land(x, y)
        self._memo[key] = v
        return v

    def _delta(self, a, b, step):
        dlon = wrap_dlon(b[0] - a[0])
        dlat = b[1] - a[1]
        m = max(int(abs(dlon) / step), int(abs(dlat) / step), 1)
        return dlon, dlat, m

    def longest_run(self, a, b, step=STEP):
        """Longest counted interior-land run of segment a->b, or None.

        A short land run touching an endpoint (< ENDPOINT_LAND_NM, i.e. a port
        sitting on the coarse mask) is ignored, matching `landcheck.segment`.
        """
        if abs(wrap_dlon(b[0] - a[0])) > 170:
            return None
        dlon, dlat, m = self._delta(a, b, step)
        flags = [self._is_land(a[0] + dlon * k / m, a[1] + dlat * k / m) for k in range(m + 1)]
        n = len(flags)
        nm_per = step * 60 * max(0.02, math.cos(math.radians((a[1] + b[1]) / 2)))
        best = (0, 0, 0)
        i = 0
        while i < n:
            if flags[i]:
                j = i
                while j < n and flags[j]:
                    j += 1
                run_nm = (j - i) * nm_per
                edge_run = i == 0 or j == n
                if (not (edge_run and run_nm <= ENDPOINT_LAND_NM)) and (j - i) > best[0]:
                    best = (j - i, i, j - 1)
                i = j
            else:
                i += 1
        if best[0] == 0:
            return None

        def pt(k):
            return (a[0] + dlon * k / m, a[1] + dlat * k / m)

        return {"nm": best[0] * nm_per, "a": pt(best[1]), "b": pt(best[2]), "mid": pt((best[1] + best[2]) // 2)}

    def crossing_nm(self, coords):
        best = 0.0
        for i in range(len(coords) - 1):
            r = self.longest_run(coords[i], coords[i + 1])
            if r:
                best = max(best, r["nm"])
        return best

    def _edge_ok(self, p, q, step=EDGE_STEP):
        """True if chord p->q has no significant interior land.

        Leading/trailing land is ignored (ports sit on the coarse mask), so an
        edge leaving a harbour stays valid.
        """
        r = self.longest_run(p, q, step)
        return r is None or r["nm"] < FLAG_NM

    def _push_offshore(self, a, b, run):
        """Move the offending run perpendicular (seaward) until the polyline clears."""
        cs = max(0.05, math.cos(math.radians((a[1] + b[1]) / 2)))

        def to_xy(p):
            return (p[0] * cs, p[1])

        def to_ll(p):
            return (p[0] / cs, p[1])

        ax, ay = to_xy(a)
        bx, by = to_xy(b)
        ux, uy = bx - ax, by - ay
        length = math.hypot(ux, uy)
        if length < 1e-9:
            return None
        ux, uy = ux / length, uy / length
        nx, ny = -uy, ux
        r1, r2 = to_xy(run["a"]), to_xy(run["b"])
        margin = max(0.5 * math.hypot(r2[0] - r1[0], r2[1] - r1[1]), SAFE_NM / 60.0)
        best = None
        for sign in (1.0, -1.0):
            d = SAFE_NM
            while d <= D_MAX_NM:
                dd = d / 60.0
                p1 = to_ll((r1[0] - ux * margin + nx * sign * dd, r1[1] - uy * margin + ny * sign * dd))
                p2 = to_ll((r2[0] + ux * margin + nx * sign * dd, r2[1] + uy * margin + ny * sign * dd))
                if self._is_land(*p1) or self._is_land(*p2):
                    d *= 1.4
                    continue
                if self._edge_ok(a, p1) and self._edge_ok(p1, p2) and self._edge_ok(p2, b):
                    path = [a, p1, p2, b]
                    if self.crossing_nm(path) < FLAG_NM:
                        return path
                d *= 1.4
        return best

    def _offshore(self, v, centroid):
        dx, dy = v[0] - centroid[0], v[1] - centroid[1]
        n = math.hypot(dx, dy)
        if n < 1e-9:
            return None
        dlat = SAFE_NM / 60.0
        dlon = SAFE_NM / (60.0 * max(0.05, math.cos(math.radians(v[1]))))
        return (v[0] + dx / n * dlon, v[1] + dy / n * dlat)

    def _nodes(self, a, b, run):
        xs = [run["a"][0], run["b"][0], run["mid"][0]]
        ys = [run["a"][1], run["b"][1], run["mid"][1]]
        minx, maxx = min(xs) - PAD, max(xs) + PAD
        miny, maxy = min(ys) - PAD, max(ys) + PAD
        nodes = [a, b]
        seen = {(round(a[0], 4), round(a[1], 4)), (round(b[0], 4), round(b[1], 4))}
        for bbox, ring, holes in self.land.polys:
            if bbox[0] > maxx or bbox[1] < minx or bbox[2] > maxy or bbox[3] < miny:
                continue
            cx = sum(p[0] for p in ring) / len(ring)
            cy = sum(p[1] for p in ring) / len(ring)
            for v in ring:
                if not (minx <= v[0] <= maxx and miny <= v[1] <= maxy):
                    continue
                off = self._offshore(v, (cx, cy))
                if off is None:
                    continue
                key = (round(off[0], 4), round(off[1], 4))
                if key in seen:
                    continue
                seen.add(key)
                nodes.append(off)
        if len(nodes) > MAX_NODES:
            mx, my = run["mid"]
            rest = sorted(nodes[2:], key=lambda p: (p[0] - mx) ** 2 + (p[1] - my) ** 2)
            nodes = [a, b] + rest[:MAX_NODES - 2]
        return nodes

    def _dijkstra(self, nodes):
        n = len(nodes)
        dist = [math.inf] * n
        prev = [-1] * n
        dist[0] = 0.0
        pq = [(0.0, 0)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            if u == 1:
                break
            for v in range(n):
                if v == u or not self._edge_ok(nodes[u], nodes[v]):
                    continue
                nd = d + math.hypot(nodes[u][0] - nodes[v][0], nodes[u][1] - nodes[v][1])
                if nd < dist[v]:
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        if dist[1] == math.inf:
            return None
        path = []
        k = 1
        while k != -1:
            path.append(nodes[k])
            k = prev[k]
        path.reverse()
        return path

    def _simplify(self, path):
        out = [path[0]]
        i = 0
        while i < len(path) - 1:
            j = len(path) - 1
            while j > i + 1 and not self._edge_ok(path[i], path[j]):
                j -= 1
            out.append(path[j])
            i = j
        return out

    def _grid_detour(self, a, b, run, coarse=0.1, fine=0.03):
        """Find the cheapest single waypoint p so that a->p->b stay in water.

        Coarse grid around the offending run, then refine around the best
        candidate. Robust where the coastline is smooth (no vertex at the cape,
        e.g. the Lizard on the 110m mask).
        """
        xs = [run["a"][0], run["b"][0]]
        ys = [run["a"][1], run["b"][1]]
        span = math.hypot(xs[1] - xs[0], ys[1] - ys[0])
        pad = max(0.25, min(1.2, 0.7 * span))
        minx, maxx = min(xs) - pad, max(xs) + pad
        miny, maxy = min(ys) - pad, max(ys) + pad
        best = None
        for step in (coarse, fine):
            estep = EDGE_STEP if step > 0.05 else 0.02
            if best is None:
                gx0, gx1, gy0, gy1 = minx, maxx, miny, maxy
            else:
                bx, by = best[1]
                w = max(fine * 6, 0.2)
                gx0, gx1, gy0, gy1 = bx - w, bx + w, by - w, by + w
            nx = int((gx1 - gx0) / step) + 1
            ny = int((gy1 - gy0) / step) + 1
            if nx * ny > 12000:
                continue
            for i in range(nx):
                x = gx0 + i * step
                for j in range(ny):
                    y = gy0 + j * step
                    if self._is_land(x, y):
                        continue
                    if self._edge_ok(a, (x, y), estep) and self._edge_ok((x, y), b, estep):
                        add = math.hypot(x - a[0], y - a[1]) + math.hypot(b[0] - x, b[1] - y)
                        if best is None or add < best[0]:
                            best = (add, (x, y))
        if best is None:
            return None
        p = best[1]
        if self.crossing_nm([a, p, b]) < FLAG_NM:
            return [a, p, b]
        return None

    def _graph(self, a, b, run):
        nodes = self._nodes(a, b, run)
        if len(nodes) <= 2:
            return None
        path = self._dijkstra(nodes)
        if path is None:
            return None
        return self._simplify(path)

    def fix_segment(self, a, b):
        # Gross crossings (whole continents, bad tables) are not a missing
        # coastal waypoint; leave them flagged instead of searching forever.
        if math.hypot(wrap_dlon(b[0] - a[0]), b[1] - a[1]) > MAX_CHORD_DEG:
            return None
        self._lookups = 0
        try:
            run = self.longest_run(a, b)
            if run is None:
                return [a, b]
            if run["nm"] > MAX_RUN_NM:
                return None
            for path in (self._grid_detour(a, b, run), self._push_offshore(a, b, run), self._graph(a, b, run)):
                if path and len(path) >= 2 and self.crossing_nm(path) < FLAG_NM:
                    return path
        except _Budget:
            return None
        return None

    def optimize(self, coords):
        """Insert synthetic waypoints so the whole polyline stays in water."""
        out = [coords[0]]
        inserted = []
        ok = True
        for i in range(len(coords) - 1):
            seg = self.fix_segment(coords[i], coords[i + 1])
            if seg is None:
                ok = False
                out.append(coords[i + 1])
                continue
            for p in seg[1:-1]:
                inserted.append(len(out))
                out.append(p)
            if len(seg) > 1 and (len(out) == 0 or out[-1] != seg[-1]):
                out.append(seg[-1])
        return out, inserted, ok


if __name__ == "__main__":
    land = Land()
    c = Coast(land)
    print("land ok", land.ok, "polys", len(land.polys))
    for name, a, b in [
        ("Falmouth->Lizard", (-5.06, 50.15), (-5.2, 49.95)),
        ("island crossing", (-8.0, 28.0), (-14.0, 29.5)),
        ("open Atlantic", (-30, 40), (-20, 30)),
    ]:
        run = c.longest_run(a, b)
        fx = c.fix_segment(a, b)
        after = None if fx is None else round(c.crossing_nm(fx), 1)
        print(name, "| run", None if not run else round(run["nm"], 1),
              "| after", after, "| npts", None if fx is None else len(fx))

