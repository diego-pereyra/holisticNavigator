#!/usr/bin/env python3
"""Genera geometría aproximada de rutas (líneas de círculo máximo entre extremos).

No hay coordenadas en el texto del PDF (están en los mapas), así que se geocodifican
los extremos de los títulos con un gazetteer propio. Es una aproximación provisional:
se reemplazará por los waypoints reales del libro.

Entrada : data/catalog/v1/routes.jsonl
Salida  : data/catalog/v1/routes.geojson
"""
import json
import math
import re
from collections import Counter

ROOT = __file__.rsplit("/tools/", 1)[0]
IN = f"{ROOT}/data/catalog/v1/routes.jsonl"
OUT = f"{ROOT}/data/catalog/v1/routes.geojson"

# (lat, lon) — centroides aproximados de puertos/regiones/islas usados en los títulos.
GAZ = {
    # Caribe / Atlántico norte
    "lesser antilles": (14.8, -61.2), "greater antilles": (19.5, -76.0),
    "eastern caribbean": (13.8, -60.9), "virgin islands": (18.34, -64.9),
    "bahamas": (24.5, -76.5), "bermuda": (32.3, -64.8), "turks and caicos": (21.8, -71.8),
    "hispaniola": (19.0, -72.0), "jamaica": (18.0, -77.0), "abc islands": (12.2, -68.9),
    "venezuela": (10.2, -64.6), "colombia": (10.4, -75.5), "guyanas": (5.9, -55.2),
    "panama": (9.0, -79.5), "central america": (12.0, -86.0), "florida": (26.0, -80.1),
    "gulf of mexico": (25.0, -90.0), "mexico": (20.6, -105.3), "usa": (34.0, -77.0),
    "north america": (37.0, -73.0), "canada": (44.6, -63.6), "new england": (42.5, -70.5),
    "nova scotia": (44.6, -63.6), "newfoundland": (47.5, -52.7),
    "british columbia": (48.4, -123.4), "pacific northwest": (47.6, -122.3),
    "california": (34.0, -119.0), "alaska": (58.0, -150.0), "rhode island": (41.5, -71.4),
    # Atlántico este / Europa / África
    "azores": (38.0, -27.0), "madeira": (32.75, -17.0), "canary islands": (28.3, -15.7),
    "cape verde islands": (16.0, -24.0), "gibraltar": (36.14, -5.35),
    "portugal": (38.7, -9.1), "atlantic morocco": (33.6, -7.6), "west africa": (14.7, -17.4),
    "northern europe": (54.0, 4.0), "europe": (45.0, 10.0), "ireland": (53.3, -6.2),
    "english channel": (50.0, -1.5), "bay of biscay": (45.5, -4.0),
    "mediterranean": (38.0, 15.0), "french riviera": (43.5, 7.0), "balearics": (39.5, 2.8),
    "malta": (35.9, 14.4), "sicily": (37.5, 14.0), "messina strait": (38.2, 15.6),
    "greece": (37.0, 24.0), "crete": (35.3, 24.5), "rhodes": (36.4, 28.2),
    "cyprus": (35.0, 33.0), "israel": (32.0, 34.8), "port said": (31.26, 32.30),
    "suez": (29.97, 32.55), "red sea": (20.0, 38.0), "bab el mandeb": (12.6, 43.4),
    "port sudan": (19.6, 37.2),
    # Atlántico sur / África austral
    "south africa": (-34.0, 18.4), "cape town": (-33.92, 18.42), "durban": (-29.87, 31.05),
    "east africa": (-6.8, 39.3), "madagascar": (-18.0, 49.5), "comoros": (-11.6, 43.3),
    "mauritius": (-20.2, 57.5), "seychelles": (-4.6, 55.5), "st helena": (-15.95, -5.72),
    "ascension": (-7.95, -14.36), "tristan da cunha": (-37.1, -12.3),
    "falkland islands": (-51.7, -59.0), "south georgia": (-54.3, -36.5),
    "south america": (-12.0, -77.0), "brazil": (-12.0, -38.5), "northern brazil": (-3.7, -38.5),
    "uruguay": (-34.9, -56.2), "argentina": (-34.6, -58.4), "chile": (-33.0, -71.6),
    "peru": (-12.0, -77.0), "ecuador": (-2.2, -80.9), "galapagos": (-0.95, -90.0),
    "magellan strait": (-53.5, -70.5), "cape horn": (-55.98, -67.27),
    # Índico
    "india": (15.0, 73.8), "sri lanka": (6.9, 79.9), "maldives": (3.2, 73.2),
    "chagos": (-6.0, 71.5), "oman": (23.6, 58.5), "singapore": (1.29, 103.85),
    "western malaysia": (3.0, 101.4), "thailand": (7.9, 98.3), "maldives 1": (3.2, 73.2),
    # Pacífico / Oceanía / Asia oriental
    "new zealand": (-41.0, 174.0), "fiji": (-17.8, 178.0), "tonga": (-21.2, -175.2),
    "samoa": (-13.8, -172.1), "cook islands": (-21.2, -159.8), "society islands": (-17.5, -149.5),
    "tahiti": (-17.65, -149.4), "marquesas": (-9.0, -139.5), "tuvalu": (-8.5, 179.2),
    "kiribati": (1.3, 172.98), "line islands": (2.0, -157.4), "tuamotus": (-15.5, -145.5),
    "gambier islands": (-23.1, -134.9), "pitcairn": (-25.07, -130.1), "easter island": (-27.1, -109.35),
    "new caledonia": (-21.3, 165.5), "vanuatu": (-15.4, 167.0), "solomon islands": (-9.0, 160.0),
    "papua new guinea": (-6.0, 147.0), "new guinea": (-5.5, 145.0), "torres strait": (-10.0, 142.0),
    "australia": (-25.0, 135.0), "queensland": (-20.0, 148.0), "new south wales": (-33.9, 151.2),
    "western australia": (-32.0, 115.8), "darwin": (-12.46, 130.84),
    "christmas island": (-10.5, 105.6), "cocos keeling": (-12.1, 96.9),
    "indonesia": (-6.0, 115.0), "bali": (-8.4, 115.2), "philippines": (12.0, 122.0),
    "palau": (7.5, 134.5), "guam": (13.44, 144.79), "micronesia": (7.4, 151.8),
    "marshall islands": (7.1, 171.4), "japan": (34.0, 138.0), "hong kong": (22.3, 114.2),
    "hawaii": (20.5, -157.0),
}

# Centroides por capítulo (fallback cuando no se resuelve ningún extremo).
CHAPTER_DEFAULT = {
    "AN": (18.0, -55.0), "AS": (-20.0, -20.0), "AT": (25.0, -45.0),
    "IN": (-10.0, 70.0), "IS": (-20.0, 55.0), "IT": (-5.0, 80.0),
    "M": (37.0, 15.0), "PN": (25.0, -155.0), "PS": (-15.0, -150.0),
    "PT": (10.0, -160.0), "RN": (20.0, 38.0), "RS": (12.0, 45.0),
}

SPLIT_RE = re.compile(r"\s+and\s+|,|\s+or\s+|/|\s+via\s+|\s+across\s+", re.I)
SIDES_RE = re.compile(r"^\s*(?:from\s+)?(.+?)\s+to\s+(.+?)\s*$", re.I)


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\bthe\b", " ", s)
    return re.sub(r"[^a-z]", "", s)


GAZ_N = {norm(k): v for k, v in GAZ.items()}


def resolve(side: str):
    """Devuelve (lat, lon, nombre) o None."""
    if not side or not side.strip():
        return None
    whole = norm(side)
    if whole in GAZ_N:
        return (*GAZ_N[whole], whole)
    for part in SPLIT_RE.split(side):
        p = norm(part)
        if p in GAZ_N:
            return (*GAZ_N[p], p)
    for k, v in GAZ_N.items():
        if len(k) >= 4 and k in whole:
            return (*v, k)
    return None


def gc_interp(a, b, n=32):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    d = 2 * math.asin(math.sqrt(
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2))
    if d == 0:
        return [[a[1], a[0]], [b[1], b[0]]]
    pts = []
    for i in range(n + 1):
        f = i / n
        A = math.sin((1 - f) * d) / math.sin(d)
        B = math.sin(f * d) / math.sin(d)
        x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
        y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
        z = A * math.sin(lat1) + B * math.sin(lat2)
        pts.append([math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))])
    return pts


def main():
    routes = [json.loads(l) for l in open(IN) if l.strip()]
    feats = []
    stats = Counter()
    unresolved = Counter()
    for r in routes:
        code, title = r["code"], r["title"]
        ch = re.match(r"[A-Z]+", code).group()
        m = SIDES_RE.match(title)
        left, right = (m.group(1), m.group(2)) if m else (title, "")
        fa, fb = resolve(left), resolve(right)
        if fa is None and fb is None:
            # último intento: cualquier lugar del título completo
            fa = resolve(title)
        default = CHAPTER_DEFAULT.get(ch, (0.0, 0.0))
        if fa is None:
            fa = (*default, "capítulo " + ch)
        if fb is None:
            fb = (*default, "capítulo " + ch)
        if fa[:2] == fb[:2]:
            stats["colapsada"] += 1
            continue
        stats["dibujada"] += 1
        if fa[2].startswith("capítulo") or fb[2].startswith("capítulo"):
            stats["con_fallback"] += 1
        if fa[2].startswith("capítulo") and fb[2].startswith("capítulo"):
            unresolved[code] += 1
        coords = gc_interp(fa[:2], fb[:2])
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "code": code, "title": title,
                "from": fa[2], "to": fb[2], "approximate": True,
            },
        })
        for pt, name in ((fa, fa[2]), (fb, fb[2])):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [pt[1], pt[0]]},
                "properties": {"code": code, "name": name},
            })

    fc = {"type": "FeatureCollection", "features": feats}
    with open(OUT, "w") as f:
        json.dump(fc, f, separators=(",", ":"))
    print(f"rutas: {len(routes)} → dibujadas: {stats['dibujada']} "
          f"(con fallback: {stats['con_fallback']}, colapsadas: {stats['colapsada']})")
    print(f"features: {len(feats)}  →  {OUT}")
    if unresolved:
        print("sin resolver ambos extremos:", dict(unresolved))


if __name__ == "__main__":
    main()
