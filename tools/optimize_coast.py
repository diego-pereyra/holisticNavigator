#!/usr/bin/env python3
"""Coastal waypoint optimizer v2 (ADR-008 T12.2).

The 8th edition sometimes publishes two consecutive waypoints whose straight
chord runs over land (a missing intermediate waypoint), or a bad coordinate.
`landmask.py` flags those variants. This tool re-routes ONLY the crossing runs
of each segment with A* over the 0.1 deg grid using the dilated mask (coastal
margin, 1 cell ~ 3 nm), bounded to the run bbox + 2 deg, cost = distance, and
keeps the offshore chord for the rest. Inserted points are marked `corrected`;
the caller names them "Costa 1..n". Book waypoints are never touched.

`optimize_passes` tries three escalating strategies (E12.2): the spec (margin
3 nm, 15 % detour), then no margin (opens the narrow island channels), then a
looser detour (50 %). A variant none of them resolves stays needsReview and is
never forced.

Uso: python3 tools/optimize_coast.py   (autotest)
"""
import heapq
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmask import ENDPOINT_LAND_NM, FLAG_NM, MARGIN_NM, LandMask  # noqa: E402

CELL = 0.1            # A* grid step (deg)
PAD_DEG = 2.0         # bbox margin around a crossing run (deg)
DETOUR_MAX = 1.15     # max detour vs. the original chord (per crossing run)
DETOUR_LOOSE = 1.5    # tercera pasada: rodeo admitido si el spec no alcanza
DP_TOL_DEG = 0.05     # Douglas-Peucker tolerance (deg)
SAMPLE_STEP = 0.02    # crossing detector sampling (deg)
EDGE_STEP = 0.03      # A* edge validity sampling (deg)
MAX_GRID = 1_200_000    # node cap per search (avoids runaway searches)
NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def wrap_dlon(d):
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return d


def haversine_nm(a, b):
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 3440.065 * math.asin(min(1.0, math.sqrt(h)))


def _polyline_nm(pts):
    return sum(haversine_nm(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


class Coast:
    def __init__(self, mask, margin_nm=MARGIN_NM, detour_max=DETOUR_MAX):
        self.mask = mask
        self.margin_nm = margin_nm
        self.detour_max = detour_max
        self._cache = {}

    # --- detector de cruces -------------------------------------------------
    def _water(self, lon, lat):
        if self.margin_nm <= 0:
            return not self.mask.is_land(lon, lat)
        return not self.mask.is_land_margin(lon, lat, self.margin_nm)

    def _all_water(self, a, b):
        dlon = wrap_dlon(b[0] - a[0])
        dlat = b[1] - a[1]
        m = max(int(abs(dlon) / EDGE_STEP), int(abs(dlat) / EDGE_STEP), 1)
        return all(self._water(a[0] + dlon * k / m, a[1] + dlat * k / m) for k in range(m + 1))

    def _tauten(self, pts):
        """Tensa la polilínea: desde cada punto salta al más lejano que siga
        siendo todo agua. Quita el zigzag de la rejilla y minimiza el rodeo."""
        if len(pts) <= 2:
            return list(pts)
        out = [pts[0]]
        i = 0
        n = len(pts)
        while i < n - 1:
            j = n - 1
            while j > i + 1 and not self._all_water(pts[i], pts[j]):
                j -= 1
            out.append(pts[j])
            i = j
        return out

    def _runs(self, a, b, step=SAMPLE_STEP):
        """Tramos interiores de tierra-con-margen de la cuerda a->b.

        Los tramos que tocan un extremo se ignoran: son la aproximación al
        puerto (el waypoint de un puerto está a menos del margen de la costa).
        Cada tramo es {nm, s, g} con el punto de entrada y de salida del agua.
        """
        if abs(wrap_dlon(b[0] - a[0])) > 170:
            return []
        dlon = wrap_dlon(b[0] - a[0])
        dlat = b[1] - a[1]
        m = max(int(abs(dlon) / step), int(abs(dlat) / step), 1)
        flags = [not self._water(a[0] + dlon * k / m, a[1] + dlat * k / m) for k in range(m + 1)]
        nm_per = step * 60.0 * max(0.02, math.cos(math.radians((a[1] + b[1]) / 2.0)))

        def pt(k):
            return (a[0] + dlon * k / m, a[1] + dlat * k / m)

        out = []
        i = 0
        n = len(flags)
        while i < n:
            if flags[i]:
                j = i
                while j < n and flags[j]:
                    j += 1
                edge = i == 0 or j == n
                if not edge and (j - i) * nm_per >= FLAG_NM:
                    out.append({"nm": (j - i) * nm_per, "s": pt(i - 1), "g": pt(j)})
                i = j
            else:
                i += 1
        return out

    # --- A* sobre la rejilla 0.1 deg ---------------------------------------
    def _astar(self, start, goal, a, b):
        # bbox del tramo completo (a->b) + 2°: si el cruce es una cadena de
        # islas (p. ej. Azores), hay que rodearla saliendo del bbox del tramo
        # de tierra.
        minx = min(a[0], b[0], start[0], goal[0]) - PAD_DEG
        maxx = max(a[0], b[0], start[0], goal[0]) + PAD_DEG
        miny = min(a[1], b[1], start[1], goal[1]) - PAD_DEG
        maxy = max(a[1], b[1], start[1], goal[1]) + PAD_DEG
        c0 = int(math.floor(minx / CELL))
        c1 = int(math.ceil(maxx / CELL))
        r0 = int(math.floor(miny / CELL))
        r1 = int(math.ceil(maxy / CELL))
        if (c1 - c0 + 1) * (r1 - r0 + 1) > MAX_GRID:
            return None

        # start/goal are real nodes (never snapped): they link to nearby cells
        # only through water-validated legs, so the returned polyline is clean.
        START, GOAL = (-10 ** 9, -10 ** 9), (10 ** 9, 10 ** 9)

        def coord(node):
            if node == START:
                return start
            if node == GOAL:
                return goal
            return (node[0] * CELL, node[1] * CELL)

        passable = {}

        def cell_ok(c, r):
            key = (c, r)
            v = passable.get(key)
            if v is None:
                v = self._water(c * CELL, r * CELL)
                passable[key] = v
            return v

        edge_ok = {}

        def connect(u, v):
            key = (u, v) if u < v else (v, u)
            v2 = edge_ok.get(key)
            if v2 is None:
                v2 = self._all_water(coord(u), coord(v))
                edge_ok[key] = v2
            return v2

        def neighbors(u):
            if u == START or u == GOAL:
                p = coord(u)
                c = int(round(p[0] / CELL))
                r = int(round(p[1] / CELL))
                for dc in range(-3, 4):
                    for dr in range(-3, 4):
                        v = (c + dc, r + dr)
                        if c0 <= v[0] <= c1 and r0 <= v[1] <= r1 and cell_ok(*v) and connect(u, v):
                            yield v
                return
            for dc, dr in NEIGH:
                v = (u[0] + dc, u[1] + dr)
                if c0 <= v[0] <= c1 and r0 <= v[1] <= r1 and cell_ok(*v) and connect(u, v):
                    yield v
            # the goal is a real node: a nearby grid cell can link to it too
            gc = int(round(goal[0] / CELL))
            gr = int(round(goal[1] / CELL))
            if abs(u[0] - gc) <= 3 and abs(u[1] - gr) <= 3 and connect(u, GOAL):
                yield GOAL

        def h(node):
            return haversine_nm(coord(node), goal)

        dist = {START: 0.0}
        prev = {}
        pq = [(h(START), 0.0, START)]
        seen = set()
        while pq:
            _f, gsc, u = heapq.heappop(pq)
            if u in seen:
                continue
            seen.add(u)
            if u == GOAL:
                path = [coord(u)]
                while u in prev:
                    u = prev[u]
                    path.append(coord(u))
                path.reverse()
                return path
            for v in neighbors(u):
                if v in seen:
                    continue
                ng = gsc + haversine_nm(coord(u), coord(v))
                if ng < dist.get(v, math.inf):
                    dist[v] = ng
                    prev[v] = u
                    heapq.heappush(pq, (ng + h(v), ng, v))
        return None

    def fix_segment(self, a, b):
        """Devuelve la polilínea a->b sin cruces, `[a, b]` si ya está limpia, o
        None si hay un cruce que no se pudo resolver (la variante queda
        needsReview)."""
        if abs(wrap_dlon(b[0] - a[0])) > 170:
            return [a, b]
        key = (round(a[0], 6), round(a[1], 6), round(b[0], 6), round(b[1], 6))
        if key in self._cache:
            return self._cache[key]
        runs = self._runs(a, b)
        if not runs:
            self._cache[key] = [a, b]
            return [a, b]
        out = [a]
        for run in runs:
            s, g = run["s"], run["g"]
            if s != out[-1]:
                out.append(s)
            path = self._astar(s, g, a, b)
            if path is None:
                self._cache[key] = None
                return None
            out.extend(path[1:-1] if len(path) > 1 else [])
            if g != out[-1]:
                out.append(g)
        if b != out[-1]:
            out.append(b)
        # Tensado + Douglas-Peucker para no llenar la tabla; si al recortar
        # vuelve a tocar tierra, se conserva el trazado denso.
        out = self._tauten(out)
        cand = self._simplify(out)
        if self._mask_crossing(cand) >= FLAG_NM:
            cand = out
        if self._mask_crossing(cand) >= FLAG_NM:
            self._cache[key] = None
            return None
        if _polyline_nm(cand) / max(haversine_nm(a, b), 1e-9) > self.detour_max:
            self._cache[key] = None
            return None
        self._cache[key] = cand
        return cand

    def _mask_crossing(self, pts):
        c = self.mask
        return max((c.segment(pts[i], pts[i + 1], self.margin_nm, interior_only=True)
                    for i in range(len(pts) - 1)), default=0.0)

    def _simplify(self, pts):
        """Douglas-Peucker (tol 0,05 deg); el trazado quedaría demasiado largo."""
        if len(pts) <= 2:
            return pts
        keep = [False] * len(pts)
        keep[0] = keep[-1] = True
        stack = [(0, len(pts) - 1)]
        while stack:
            i0, i1 = stack.pop()
            if i1 <= i0 + 1:
                continue
            ax, ay = pts[i0]
            bx, by = pts[i1]
            dx, dy = bx - ax, by - ay
            seg2 = dx * dx + dy * dy
            far, far_d = -1, -1.0
            for k in range(i0 + 1, i1):
                px, py = pts[k]
                if seg2 < 1e-12:
                    d = math.hypot(px - ax, py - ay)
                else:
                    t = ((px - ax) * dx + (py - ay) * dy) / seg2
                    t = max(0.0, min(1.0, t))
                    ex, ey = ax + t * dx, ay + t * dy
                    d = math.hypot(px - ex, py - ey)
                if d > far_d:
                    far, far_d = k, d
            if far_d > DP_TOL_DEG:
                keep[far] = True
                stack.append((i0, far))
                stack.append((far, i1))
        return [p for k, p in enumerate(pts) if keep[k]]

    def optimize(self, coords):
        """Inserta waypoints sintéticos para que toda la polilínea quede en agua.

        Devuelve (coords, inserted, ok): `inserted` son los índices de los puntos
        sintéticos dentro de `out`; `ok` es False si algún tramo quedó sin
        resolver.
        """
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
            if len(seg) > 1 and out[-1] != seg[-1]:
                out.append(seg[-1])
        return out, inserted, ok


# E12.2 se aplica en tres pasadas, de la más fiel a la más permisiva:
#   1. spec: margen costero 3 nm y rodeo máximo 15 %.
#   2. sin margen: abre los pasos angostos entre islas (el trazado queda en agua
#      cruda, sin franja de seguridad).
#   3. márgen 3 nm pero rodeo hasta 50 %: rescata tramos donde rodear una punta
#      es legítimamente más largo que el 15 %.
PASSES = ((MARGIN_NM, DETOUR_MAX), (0.0, DETOUR_MAX), (MARGIN_NM, DETOUR_LOOSE))


def optimize_passes(mask, coords, passes=PASSES):
    """Corre las tres pasadas y devuelve el resultado de la primera que resuelve.

    `(out, inserted, ok)`; `ok` False solo si ninguna pasada pudo dejar el
    trazado sin cruzar tierra (la variante queda needsReview).
    """
    out, inserted, ok = list(coords), [], False
    for margin, detour in passes:
        coast = Coast(mask, margin_nm=margin, detour_max=detour)
        out, inserted, ok = coast.optimize(coords)
        if ok:
            return out, inserted, True
    return out, inserted, False


def _smoke():
    mask = LandMask()
    c = Coast(mask)
    print("mask ok", mask.ok)
    cases = [
        ("Cape NW->Barbados", (18.2, -33.7667), (-59.5167, 13.0333)),
        ("English Hbr->Rio", (-61.7633, 17.0033), (-43.2667, -23.05)),
        ("along a coast", (-61.7333, 16.9917), (-61.7633, 17.0033)),
        ("open Atlantic", (-30, 40), (-20, 30)),
    ]
    for name, a, b in cases:
        here = c._mask_crossing([a, b])
        fx = c.fix_segment(a, b)
        after = None if fx is None else c._mask_crossing(fx)
        print(f"{name}: run {here:.0f}nm -> "
              f"{'needsReview' if fx is None else f'{after:.0f}nm, {len(fx)} pts'}")


if __name__ == "__main__":
    _smoke()
