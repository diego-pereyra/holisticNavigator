#!/usr/bin/env python3
"""Extract routes (with waypoint coordinates) from the 8th-edition EPUB
"World Cruising Routes: 1,000 Sailing Routes in All Oceans of the World".

Kobo renders virtually the whole book as tables, so a route block looks like:

    <prose text token ending with> "• AN11 Europe to North America (northern routes)"
    row (BEST TIME:, "June to August")
    row (TROPICAL STORMS:, ...)
    row (CHARTS:, ...)
    row (World Voyage Planner:, ...)
    row (CRUISING GUIDES:, ...)
    row (WAYPOINTS:,)
    row (Start, Departure, Intermediate, Landfall, Arrival, Distance)
    row (Route AN11A,)
    row (Falmouth, Lizard, "Land's End", ..., "St John's X", 1973)   # names
    row (50°00.0'N 5°02.0'W, ...)                                    # coords
    ...

Outputs data/epub/routes_v2.json (one object per route).
"""
import html.parser
import json
import os
import re
from collections import Counter

EPUB_HTML = "/tmp/opencode/epub/epub_x/OEBPS/html"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "epub", "routes_v2.json")

COORD_RE = re.compile(
    r"(\d{1,3})°\s?(\d{1,2}(?:\.\d+)?)?['’]\s*([NS]),\s*(\d{1,3})°\s?(\d{1,2}(?:\.\d+)?)?['’]\s*([WE])"
)
HEADING_RE = re.compile(r"(?:[•·]\s*)?([A-Z]{2})\s*(\d{1,3})?\s+([A-Z][^•]*)")
DIST_RE = re.compile(r"^\d{3,4}$")


def parse_coord(text):
    m = COORD_RE.search(text)
    if not m:
        return None
    dega, mina, ns, dego, mino, we = m.groups()
    lat = float(dega) + float(mina or 0) / 60.0
    lon = float(dego) + float(mino or 0) / 60.0
    if ns == "S":
        lat = -lat
    if we == "W":
        lon = -lon
    return {"lat": round(lat, 6), "lon": round(lon, 6)}


class KoboTables(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tokens = []
        self.skip = 0
        self.in_tr = False
        self.in_td = False
        self.cell = []
        self.row = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg", "head"):
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "tr":
            self.in_tr = True
            self.row = []
        elif tag == "td":
            self.in_td = True
            self.cell = []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "head"):
            if self.skip:
                self.skip -= 1
            return
        if self.skip:
            return
        if tag == "td" and self.in_td:
            self.in_td = False
            self.row.append("".join(self.cell).strip())
        elif tag == "tr" and self.in_tr:
            self.in_tr = False
            self.tokens.append(("row", tuple(self.row)))

    def handle_data(self, data):
        if self.in_td:
            self.cell.append(data)
        elif not self.skip and data.strip() and not self.in_tr:
            self.tokens.append(("text", data.strip()))


def refine(tokens):
    out = []
    buf = []
    for kind, val in tokens:
        if kind == "row":
            if buf:
                out.append(("text", " ".join(buf)))
                buf = []
            out.append(("row", tuple(c for c in val if c != "")))
        else:
            buf.append(val)
    if buf:
        out.append(("text", " ".join(buf)))
    return out


def find_heading(text):
    """Return (code, title) if the text ends with a route heading."""
    m = re.search(r"(?:[•·]\s*)?([A-Z]{2})\s*(\d{1,3})?\s+([A-Z][^•]*?)\s*$", text)
    if not m:
        return None
    code = (m.group(1) or "") + (m.group(2) or "")
    title = m.group(3).strip()
    if len(title) > 70 or title.startswith("•") or title.startswith("·"):
        return None
    return code, title


COORD_SPLIT = re.compile(
    r"(\d{1,2})\s*°\s*(\d{1,2}(?:\.\d+)?)\s*['’‘]?\s*([NS])\s*,?\s+"
    r"(\d{1,3})\s*°\s*(\d{1,2}(?:\.\d+)?)\s*['’‘]?\s*([WE])"
)


def cell_tokens(text):
    """Split a table cell into (name|coord) tokens, handling several
    coordinates packed in a single cell (e.g. "12°18'N, 43°46'E Bab
    el Mandeb S 12°33'N, 43°27'E")."""
    out = []
    pos = 0
    for m in COORD_SPLIT.finditer(text):
        pre = text[pos:m.start()].strip(" ,;.")
        if pre:
            out.append(("name", pre))
        lat = float(m.group(1)) + float(m.group(2)) / 60.0
        lon = float(m.group(4)) + float(m.group(5)) / 60.0
        if m.group(3) == "S":
            lat = -lat
        if m.group(6) == "W":
            lon = -lon
        out.append(("coord", round(lat, 6), round(lon, 6)))
        pos = m.end()
    post = text[pos:].strip(" ,;.")
    if post:
        out.append(("name", post))
    return out


_STOP_WORDS = {
    "san", "santa", "santo", "la", "el", "del", "de", "las", "los",
    "isla", "isle", "pt", "cabo", "cap", "cape", "rocks", "rock",
    "puerto", "punta", "ponta", "port", "vila", "grand", "grande",
    "fort", "bay", "cove", "island", "point",
}
_CARDINAL = {
    "N", "S", "E", "W", "NE", "NW", "SE", "SW", "NNW", "NNE", "SSW", "SSE",
    "WNW", "ENE", "WSW", "ESE",
}
_STATION_GATE_NM = 45.0


def _name_words(name):
    words = name.strip().rstrip("*.").strip().split()
    while words and words[-1].upper().rstrip(".") in _CARDINAL:
        words = words[:-1]
    return [w.lower().rstrip(".,") for w in words if w.lower().strip(".,") not in _STOP_WORDS]


def _same_station(words_a, words_b):
    return bool(set(words_a) & set(words_b))


def _nm(lat1, lon1, lat2, lon2):
    import math

    return math.hypot(
        (lon2 - lon1) * 60 * math.cos(math.radians((lat1 + lat2) / 2)),
        (lat2 - lat1) * 60,
    )


def _name_key(name):
    s = name.strip().strip("[]").strip().lower()
    s = s.rstrip("*.")
    return s[:-1].rstrip() if s.endswith("x") else s


def _heal_lat_sign(seq):
    # A waypoint whose printed latitude sign contradicts every neighbour at
    # extreme latitudes (e.g. a typo "58°35.0'S" for Lewis, Scotland) is
    # unambiguous: flip it so the route stays in its corridor. Only INTERIOR
    # waypoints are healed (both neighbours required) so a lone book typo in a
    # neighbour cannot cascade into endpoints; routes that genuinely cross the
    # Equator do it at low latitudes and are never touched.
    out = []
    for i, (nm, la, lo) in enumerate(seq):
        if abs(la) <= 50:
            out.append((nm, la, lo))
            continue
        nbrs = []
        if i > 0:
            nbrs.append(seq[i - 1][1])
        if i < len(seq) - 1:
            nbrs.append(seq[i + 1][1])
        if (
            len(nbrs) >= 2
            and abs(nbrs[0]) > 40
            and abs(nbrs[1]) > 40
            and (nbrs[0] > 0) == (nbrs[1] > 0)
            and (nbrs[0] > 0) != (la > 0)
        ):
            la = -la
        out.append((nm, la, lo))
    return out


def _ang_nm(a, b):
    dlon = (b[1] - a[1] + 180) % 360 - 180
    import math

    return math.hypot(
        dlon * 60 * math.cos(math.radians((a[0] + b[0]) / 2)),
        (b[0] - a[0]) * 60,
    )


def _gathered(routes):
    out = []
    for r in routes:
        for vt in r.get("waypointTable") or []:
            for w in vt.get("waypoints") or []:
                if w["name"]:
                    out.append((w, _name_words(w["name"])))
    return out


def _majority_hemi_heal(routes):
    # The same place is usually printed with identical coordinates several
    # times across the catalogue. When a book typo swaps the hemisphere
    # letter (e.g. "Williams N 54°54.0'S, 67°35.8'E" while every other
    # occurrence of those coordinates prints 67°35.8'W), the typo is the lone
    # minority. Group by word-token + absolute coordinates and flip the
    # minority hemisphere back to the majority. Homonyms (London UK vs London
    # Kiritimati) occupy different (|lat|, |lon|) cells and never conflict.
    from collections import defaultdict

    occ = defaultdict(list)
    for w, toks in _gathered(routes):
        for t in toks:
            occ[t].append(w)
    n_done = 0
    for tok, items in occ.items():
        groups = defaultdict(list)  # (|lat|,|lon|) -> [waypoints]
        for w in items:
            groups[(round(abs(w["lat"]), 2), round(abs(w["lon"]), 2))].append(w)
        for (ala, alo), g in groups.items():
            if len(g) < 2:
                continue
            if abs(ala) >= 0.5:
                lat_pos = sum(1 for w in g if w["lat"] > 0)
                lat_neg = len(g) - lat_pos
                if lat_pos and lat_neg and max(lat_pos, lat_neg) >= 2:
                    for w in g:
                        if (w["lat"] < 0) == (lat_pos > lat_neg):
                            w["lat"] = -w["lat"]
                            n_done += 1
            if abs(alo) >= 179.0:
                continue  # ambiguous across the antimeridian
            lon_pos = sum(1 for w in g if w["lon"] > 0)
            lon_neg = len(g) - lon_pos
            if lon_pos and lon_neg and max(lon_pos, lon_neg) >= 2:
                for w in g:
                    if (w["lon"] < 0) == (lon_pos > lon_neg):
                        w["lon"] = -w["lon"]
                        n_done += 1
    print(f"sign heal (hemi majority): {n_done} waypoints")


def _corridor_heal(routes):
    # A waypoint whose sign flips isolates it from BOTH neighbours (both
    # adjacent segments implausibly long) is unambiguously typo'd: flipping
    # that sign makes both segments short again (e.g. Snipe printed at 67°E
    # between Williams E and Beagle E at 66/67°W). Iterate to a fixpoint so a
    # healed neighbour can support the next one in the same corridor.
    n_done = 0
    changed = True
    while changed:
        changed = False
        for r in routes:
            for vt in r.get("waypointTable") or []:
                ws = vt.get("waypoints") or []
                for i in range(1, len(ws) - 1):
                    w = ws[i]
                    if abs(w["lon"]) >= 179.0:
                        continue
                    a = (ws[i - 1]["lat"], ws[i - 1]["lon"])
                    b = (ws[i + 1]["lat"], ws[i + 1]["lon"])
                    d1, d2 = _ang_nm(a, (w["lat"], w["lon"])), _ang_nm(
                        (w["lat"], w["lon"]), b
                    )
                    if d1 < 800.0 or d2 < 800.0:
                        continue
                    dl1, dl2 = _ang_nm(a, (-w["lat"], w["lon"])), _ang_nm(
                        (-w["lat"], w["lon"]), b
                    )
                    do1, do2 = _ang_nm(a, (w["lat"], -w["lon"])), _ang_nm(
                        (w["lat"], -w["lon"]), b
                    )
                    if dl1 < 400.0 and dl2 < 400.0:
                        w["lat"] = -w["lat"]
                        changed, n_done = True, n_done + 1
                    elif do1 < 400.0 and do2 < 400.0:
                        w["lon"] = -w["lon"]
                        changed, n_done = True, n_done + 1
    print(f"sign heal (corridor): {n_done} waypoints")


def sanitize_signs(routes):
    _majority_hemi_heal(routes)
    _corridor_heal(routes)


def _order_lines(seq, lines):
    # A mixed row can introduce a waypoint inline (e.g. "Kiritimati SE")
    # whose coordinate is emitted before the trailing coordinates of the
    # names listed in an earlier row. Restore the printed name order so the
    # polyline does not jump to the destination and back.
    pos = {}
    for i, s in enumerate(seq):
        k = _name_key(s)
        if k not in pos:
            pos[k] = float(i)
    out = []
    prev = -1.0
    for nm, la, lo in lines:
        k = pos.get(_name_key(nm), prev) if nm else prev
        out.append((k, nm, la, lo))
        prev = k + 0.01
    out.sort(key=lambda t: t[0])
    return [(nm, la, lo) for _, nm, la, lo in out]


def parse_waypoints(route, rows):
    variants = []
    cur = None  # {"id", "lines": [(name,lat,lon)], "seq": [names printed], "used": [names paired]}

    def close():
        nonlocal cur
        if cur is not None and cur["lines"]:
            used_keys = Counter(_name_key(u) for u in cur["used"])
            dropped = []
            for s in cur["seq"]:
                k = _name_key(s)
                if used_keys[k] > 0:
                    used_keys[k] -= 1
                else:
                    dropped.append(s)
            cur["dropped"] = dropped
            cur["lines"] = _order_lines(cur["seq"], cur["lines"])
            variants.append(cur)
        cur = None

    in_matrix = False
    for row in rows:
        if not row:
            continue
        if in_matrix:
            first = (row[0] or "").strip()
            if first.startswith("Route ") or first.startswith("Start") or first.endswith(":"):
                in_matrix = False
            else:
                continue
        if row[0].startswith("Route "):
            close()
            cur = {"id": row[0][len("Route "):].strip(), "lines": [], "seq": [], "used": []}
            pend = []
            ridx = 0
            continue
        if row[0] == "Start" or row[0].startswith("Start "):
            continue  # table header
        if cur is None:
            cur = {"id": None, "lines": [], "seq": [], "used": []}
            pend = []
            ridx = 0
        # Skip "Distances" matrices: a header cell named "Distances" and the
        # rows that follow it (mostly bare integers, e.g.
        # "St John's | 2235 | 2706 | ...") until the next route/section.
        rawcells = [(c or "").strip() for c in row]
        if any(c == "Distances" for c in rawcells):
            in_matrix = True
            continue
        if sum(1 for c in rawcells if re.fullmatch(r"\d+", c)) >= 3:
            continue
        ridx += 1
        # Flatten this row's tokens in printed (column) order.
        toks = []
        for col, raw in enumerate(row):
            cell = (raw or "").strip()
            if not cell:
                continue
            if re.fullmatch(r"[\d/]+(?:\s+[\d/]+)*", cell):
                continue  # distance column
            toks.extend(cell_tokens(cell))
        has_names = any(t[0] == "name" for t in toks)
        if not has_names:
            # A pure coordinate row is right-aligned under the block of pending
            # names: the book prints "Dakar, Dakar S, Senegal W, Amazon NE,
            # Belém X" then only the two Amazon/Belém coordinates, so the
            # coords belong to the RIGHTMOST names, in order.
            n_coords = sum(1 for t in toks if t[0] == "coord")
            start = max(0, len(pend) - n_coords)
            j = 0
            for t in toks:
                if t[0] != "coord":
                    continue
                name = pend[start + j][0] if start + j < len(pend) else None
                j += 1
                if name:
                    cur["used"].append(name)
                cur["lines"].append((name or "", t[1], t[2]))
            del pend[start:]
        else:
            # A mixed row carries both names and coordinates. A "name coord"
            # printed adjacently is an inline pair; a coordinate that opens a
            # cell belongs to a recently listed pending name (window of the
            # current or previous row), so shared approach names left over
            # from earlier rows are never stolen.
            prev_was_name = False
            for t in toks:
                if t[0] == "name":
                    nm = t[1].strip().strip("[]")
                    cur["seq"].append(nm)
                    pend.append((nm, ridx))
                    prev_was_name = True
                    continue
                if prev_was_name and pend:
                    name = pend.pop()[0]  # the name printed just before this coord
                elif pend:
                    idx = next(
                        (i for i, (_, rr) in enumerate(pend) if rr >= ridx - 1),
                        len(pend) - 1,
                    )
                    name = pend.pop(idx)[0]
                else:
                    name = None
                if name:
                    cur["used"].append(name)
                cur["lines"].append((name or "", t[1], t[2]))
                prev_was_name = False
    close()

    # Variants that share the route's approach list it without coordinates
    # (a bracketed "[…] same as before" convention) and would otherwise start
    # mid-route. Inherit the leading names/coordinates from the first variant
    # when they match its head exactly, so each variant is drawn as the full
    # route with its own destination.
    if variants:
        ref = variants[0]
        ref_keys = [_name_key(nm) for nm, _, _ in ref["lines"]]
        for v in variants[1:]:
            m = 0
            inherited = []
            for d in v["dropped"]:
                if m < len(ref_keys) and _name_key(d) == ref_keys[m]:
                    inherited.append(ref["lines"][m])
                    m += 1
                else:
                    break
            v["lines"] = inherited + v["lines"]

    for v in variants:
        # Heal impossible latitude signs before grouping.
        lines = _heal_lat_sign(v["lines"])
        # Group consecutive waypoints into "stations" (same name root and
        # within a few miles of each other). The printed table packs several
        # stations per table cell (e.g. "San Francisco Los Angeles"), which a
        # flat serialize would interleave into a zigzag. Grouping re-joins each
        # station's waypoints while keeping genuinely distant repeats (e.g.
        # "Cuba SW" then "Cuba NW") as separate stations.
        stations = []  # list of {"words": set, "pts": [(name,lat,lon)]}
        for name, lat, lon in lines:
            if not name:
                if stations:
                    stations[-1]["pts"].append((name, lat, lon))
                else:
                    stations.append({"words": set(), "pts": [(name, lat, lon)]})
                continue
            words = _name_words(name)
            if not words:
                if stations:
                    stations[-1]["pts"].append((name, lat, lon))
                else:
                    stations.append({"words": set(), "pts": [(name, lat, lon)]})
                continue
            placed = False
            for st in stations:
                if _same_station(words, st["words"]):
                    if min(_nm(lat, lon, la, lo) for _, la, lo in st["pts"]) <= _STATION_GATE_NM:
                        st["pts"].append((name, lat, lon))
                        placed = True
                        break
            if not placed:
                stations.append({"words": words, "pts": [(name, lat, lon)]})

        waypoints = []
        for st in stations:
            for name, lat, lon in st["pts"]:
                name = name or ""
                dest = name.rstrip().endswith("X")
                name = name[:-1].rstrip() if dest else name
                waypoints.append({"name": name, "dest": dest, "lat": lat, "lon": lon})
        route.setdefault("waypointTable", []).append(
            {"id": v["id"] or route["code"], "waypoints": waypoints}
        )


FIELD_LABELS = {
    "BESTTIME": "bestTime",
    "TROPICALSTORMS": "tropicalStorms",
    "CHARTS": "charts",
    "WORLDVOYAGEPLANNER": "voyagePlanner",
    "CRUISINGGUIDES": "cruisingGuides",
    "CRUISINGGUIDE": "cruisingGuides",
    "WAYPOINTS": "waypoints",
}
CODE_TOKEN_RE = re.compile(r"^([A-Z]{2})\d{1,3}$")


DEBUG = os.environ.get("WCR_DEBUG") == "1"


def parse_file(path):
    with open(path, encoding="utf-8") as f:
        p = KoboTables()
        p.feed(f.read())
    toks = refine(p.tokens)
    toc = []
    routes = []
    cur = None
    pending_head = None
    rows = []
    wpt_on = False

    def dbg(*a):
        if DEBUG:
            print("   ", *a)

    def commit():
        nonlocal cur, rows, wpt_on
        if cur is not None:
            if rows:
                parse_waypoints(cur, rows)
            routes.append(cur)
        cur = None
        rows = []
        wpt_on = False

    for kind, val in toks:
        if kind == "text":
            h = find_heading(val)
            if h:
                if cur is not None and cur["code"] is None and cur["fields"]:
                    cur["code"], cur["title"] = h
                    dbg("assign-inplace", h)
                else:
                    pending_head = h
                    dbg("pending", h)
            continue
        cells = [c for c in val]
        first = cells[0] if cells else ""
        if first == "•" and len(cells) >= 3 and CODE_TOKEN_RE.match(cells[1] or ""):
            title_cells = [c for c in cells[2:] if c]
            if len(title_cells) > 1 and re.match(r"^\d{1,4}$", title_cells[-1] or ""):
                title_cells = title_cells[:-1]
            toc.append((cells[1], " ".join(title_cells)))
            continue
        norm = re.sub(r"\s+", "", first).rstrip(":").upper()
        is_label = norm in FIELD_LABELS or norm.startswith("WAYPOINTS")
        if is_label:
            wpt_on = False  # any label ends the waypoint table
            if cur is not None and cur["fields"] and norm == "BESTTIME":
                dbg("commit", cur["code"], cur["title"])
                commit()
            if cur is None:
                cur = {"code": None, "title": None, "fields": {}, "waypointTable": []}
                if pending_head is not None:
                    cur["code"], cur["title"] = pending_head
                    dbg("create", cur["code"], cur["title"])
                    pending_head = None
            key = FIELD_LABELS.get(norm, "waypoints")
            cur["fields"].setdefault(key, []).append(" ".join(x for x in cells[1:] if x))
            if key == "waypoints":
                wpt_on = True
            continue
        if wpt_on and cur is not None:
            rows.append(cells)
            continue
        if cur is not None and cur["fields"] and first == "":
            last = list(cur["fields"])[-1]
            cur["fields"][last].append(" ".join(x for x in cells[1:] if x))
    if cur is not None:
        if rows:
            parse_waypoints(cur, rows)
        routes.append(cur)
    ti = 0
    for r in routes:
        if r["code"] is None and ti < len(toc):
            r["code"], r["title"] = toc[ti]
            ti += 1
    return [r for r in routes if r["code"]]


def main():
    files = sorted(
        f
        for f in os.listdir(EPUB_HTML)
        if re.match(r"^\d+_(AN|AS|AT|IN|IS|IT|ME|MW|PN|PS|PT|RN|RS)\d*_.+\.xhtml$", f)
    )
    all_routes = []
    for f in files:
        routes = parse_file(os.path.join(EPUB_HTML, f))
        print(f"{f:45s} -> {len(routes)} rutas")
        all_routes.extend(routes)
    sanitize_signs(all_routes)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(all_routes, fh, ensure_ascii=False, indent=1)
    n_coords = sum(
        1
        for r in all_routes
        if any(v.get("waypoints") for v in r.get("waypointTable", []))
    )
    n_wps = sum(
        len(v["waypoints"])
        for r in all_routes
        for v in r.get("waypointTable", [])
    )
    print(f"TOTAL: {len(all_routes)} rutas, {n_coords} con waypoints ({n_wps} wps) -> {OUT}")


if __name__ == "__main__":
    main()