#!/usr/bin/env python3
"""Descarga las balizas, boyas y luces (`seamark:*`) de Overpass por zona (E10.3).

El query del rango completo de una zona es demasiado pesado para la instancia
pública de Overpass (devuelve 502/504 seguido): se parte el bbox en teselas y,
si una falla, se subdivide en cuatro. Todas las teselas usan el mismo filtro de
`seamark:type` que pide la tarea.

Uso:
  fetch_seamarks.py <W> <S> <E> <N>   ->  imprime un FeatureCollection por stdout
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = "https://overpass-api.de/api/interpreter"
TYPES = (
    "buoy_lateral|buoy_cardinal|buoy_safe_water|buoy_special|"
    "buoy_isolated_danger|beacon_lateral|beacon_cardinal|beacon_special|"
    "light_major|light_minor|lighthouse|harbour|mooring"
)
TILE = 4.0        # lado inicial de las teselas (grados)
MIN_TILE = 1.0    # no se subdivide por debajo de esto
RETRIES = 3
MAX_QUERIES = 600


def query(w: float, s: float, e: float, n: float) -> dict:
    ql = (
        '[out:json][timeout:180];node["seamark:type"~"^('
        + TYPES
        + ')$"](%s,%s,%s,%s);out body;' % (s, w, n, e)
    )
    body = urllib.parse.urlencode({"data": ql}).encode()
    last: str = "sin respuesta"
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body, headers={"User-Agent": "holisticNavigator/1.0"}
            )
            with urllib.request.urlopen(req, timeout=200) as resp:
                return json.loads(resp.read().decode())
        except (urllib.error.URLError, OSError, ValueError) as err:
            last = str(err)
            print("  intento %d: %s" % (attempt + 1, last), file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("Overpass no respondió: %s" % last)


def tiles(w: float, s: float, e: float, n: float) -> list:
    out = []
    x = w
    while x < e:
        y = s
        while y < n:
            out.append((x, y, min(x + TILE, e), min(y + TILE, n)))
            y += TILE
        x += TILE
    return out


def fetch(w: float, s: float, e: float, n: float) -> dict:
    found: dict = {}
    pending = tiles(w, s, e, n)
    queries = 0
    while pending:
        tw, ts, te, tn = pending.pop()
        queries += 1
        if queries > MAX_QUERIES:
            raise RuntimeError("demasiadas consultas a Overpass")
        try:
            doc = query(tw, ts, te, tn)
        except RuntimeError as err:
            if (te - tw) > MIN_TILE and (tn - ts) > MIN_TILE:
                mw = (tw + te) / 2
                ms = (ts + tn) / 2
                pending.extend([
                    (tw, ts, mw, ms), (mw, ts, te, ms),
                    (tw, ms, mw, tn), (mw, ms, te, tn),
                ])
                print("  subdivido %.1f,%.1f,%.1f,%.1f" % (tw, ts, te, tn), file=sys.stderr)
                continue
            raise
        for el in doc.get("elements", []):
            found[el["id"]] = el
    return found


def convert(elems: dict) -> dict:
    features = []
    for el in elems.values():
        tags = el.get("tags", {})
        kind = tags.get("seamark:type")
        if not kind or "lat" not in el or "lon" not in el:
            continue
        props = {"type": kind}
        if tags.get("name"):
            props["name"] = tags["name"]
        for suffix in ("colour", "shape"):
            val = tags.get("seamark:%s:%s" % (kind, suffix))
            if not val:
                for k, v in tags.items():
                    if k.startswith("seamark:light:"):
                        continue
                    if k.startswith("seamark:") and k.endswith(":" + suffix):
                        val = v
                        break
            if val:
                props[suffix] = val
        char = tags.get("seamark:light:character")
        if char:
            light = char
            if tags.get("seamark:light:colour"):
                light += " " + tags["seamark:light:colour"]
            if tags.get("seamark:light:period"):
                light += " " + tags["seamark:light:period"] + "s"
            props["light"] = light
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    w, s, e, n = (float(x) for x in sys.argv[1:5])
    fc = convert(fetch(w, s, e, n))
    json.dump(fc, sys.stdout, ensure_ascii=False)
    print("\n%d balizas" % len(fc["features"]), file=sys.stderr)


if __name__ == "__main__":
    main()
