#!/usr/bin/env python3
"""Build data/catalog/v2 from data/epub/routes_v2.json (8th-edition EPUB).

Outputs the three files the Web app consumes:
  - index.json        {chapters:[...], routes:[{code,title,chapter}]}
  - routes.geojson    one LineString per variant + Point features for ends
  - facts/<CH>.jsonl  RouteDetail lines (months, miles via haversine, names)
"""
import json
import math
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landcheck import Land

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "epub", "routes_v2.json")
DST = os.path.join(ROOT, "data", "catalog", "v2")

# A variant whose track runs over land for more than this (nm, interior run) is
# flagged needsReview: the straight chord reveals a missing waypoint or a bad
# coordinate. Coarse 110m mask -> keep a floor to ignore shoreline noise.
LAND_FLAG_NM = 3.0

MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
EN_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "october": 10, "oct": 10,
    "november": 11, "nov": 11, "december": 12, "dec": 12,
}


def extract_months(text):
    found = []
    for en, n in EN_MONTHS.items():
        if n not in found and re.search(r"(?i)\b" + en + r"\b", text or ""):
            found.append(n)
    found.sort()
    return found


def haversine_nm(lat1, lon1, lat2, lon2):
    r = 3440.065  # earth radius in nautical miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def slug(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


# Erratas de imprenta de la 8.ª edición: coordenada mal impresa en el libro.
# El valor corregido se deduce de la misma boya/topón en otras rutas del
# catálogo (ancla) o del contexto de la propia ruta. Clave: (variant_id, name).
ERRATA = {
    ("AN18", "Graciosa E"): (29.25, -13.51),        # libro: 32°20'S,51°16'W (absurdo)
    ("AN177D", "Falmouth"): (50.133, -5.033),        # libro: 50°08'N,50°02'W (lon 50 por 5)
    ("AN141D", "Banks"): (40.0, -50.0),              # Grand Banks; libro: 56°05'N,6°35'W
    ("AT21A", "Belém"): (-1.45, -48.52),             # Belém (Brasil); libro: 18°25'N,64°31'W
    ("AN32", "Acebuche"): (36.042, -5.45),           # Gibraltar; libro: 36°02'N,27°00'W
    ("AN46B", "Gibraltar"): (36.125, -5.383),        # libro arrastró 33°03'N,16°18'W (Porto Santo)
    ("AN157C", "Christian"): (60.058, -43.137),      # Cabo Christian (Groenlandia); libro: 56°53'N,14°11'W (Rockall S)
    # Columna de tabla multi-destino que arrastró la coordenada de la salida
    # (o de la isla equivocada) al topónimo de destino:
    ("AN64C", "Barbados SW"): (13.075, -59.617),     # libro arrastró 13°28'N,16°34'W (Banjul)
    ("AN64C", "Bridgetown"): (13.092, -59.62),       # idem Banjul
    ("AT21A", "Demerara"): (6.967, -58.05),          # Guyana; libro: 6°58'N,52°34'W
    ("AN134B", "Hoyo"): (36.067, -6.333),            # Tarifa (España); libro copió -25°08' (vecino Azores)
    # Coordenada con hemisferio/signo invertido:
    ("AN164A", "Faroes S"): (61.217, -6.733),        # Feroe al W; libro puso +6°44' (al E)
    ("AN165C", "Scoresby"): (70.358, -22.0),         # Scoresby Sund (Groenlandia); libro: 70°46'N,9°06'W (Jan Mayen)
    # Torres Strait desplazado al mar de Banda (~123°E por 142°E):
    ("IS13C", "Thursday"): (-10.587, 142.22),        # libro: 10°35.2'S,142°13.2'E
    ("IS13C", "Normanby W"): (-10.575, 142.133),     # libro: 10°34.5'S,142°08.0'E
    ("AT21A", "Devil N"): (5.29, -52.58),            # Isla del Diablo (Guayana Fr.); libro: 15°17.5'N (lat 15 por 5)
}
# Nombres que el OCR fundió (dos topones en una celda sin coordenada entre
# ellos); se separan al nombre correcto que sí casa con su coordenada.
RENAME = {
    ("PN63E", "Pilot Shanghai NE Oshima S"): "Oshima S",
}

# Etiqueta humana de la cuenca/región por capítulo del libro.
CHAPTER_REGION = {
    "AN": "Atlántico Norte",
    "AT": "Atlántico Tropical",
    "AS": "Atlántico Sur",
    "PN": "Pacífico Norte",
    "PT": "Pacífico Tropical",
    "PS": "Pacífico Sur",
    "IN": "Índico Norte",
    "IT": "Índico Tropical",
    "IS": "Índico Sur",
    "RN": "Mar Rojo (norte)",
    "RS": "Mar Rojo (sur)",
    "ME": "Mediterráneo Este",
    "MW": "Mediterráneo Oeste",
}


def route_sort_key(code):
    """Orden natural: prefijo alfabético y sufijo numérico (AN2 < AN11 < AN111)."""
    m = re.match(r"^([A-Z]+)(\d+)$", code)
    if m:
        return (m.group(1), int(m.group(2)), "")
    return (code, 0, code)


def main():
    routes = json.load(open(SRC, encoding="utf-8"))
    chapters = []
    features = []
    facts = {}
    route_ports = {}
    land = Land()
    land_hits = 0
    land_variants = 0

    for r in routes:
        ch = re.match(r"^[A-Z]{2}", r["code"]).group(0)
        if ch not in chapters:
            chapters.append(ch)
        tables = r.get("waypointTable") or []

        for t in tables:
            for w in t.get("waypoints") or []:
                key = (t["id"], w["name"])
                if key in ERRATA:
                    w["lat"], w["lon"] = ERRATA[key]
                if key in RENAME:
                    w["name"] = RENAME[key]

        variants = []
        for t in tables:
            wps = t.get("waypoints") or []
            if t["id"] == "AN106C" and wps:
                last = wps[-1]
                if abs(last["lon"] - -79.75) < 0.06 and abs(last["lat"] - 19.5) < 0.06:
                    wps.pop()
            for w in wps:
                if w["lon"] == -9.4 and w["lat"] == 38.6:
                    w["lon"], w["lat"] = -81.35, 19.25
            coords = [(w["lon"], w["lat"]) for w in wps]
            if len(coords) >= 2:
                variants.append((t["id"], wps, coords))

        title = r.get("title") or ""
        route_flagged = False

        for vid, wps, coords in variants:
            first, last = wps[0], wps[-1]
            cross = land.crossing_nm(coords) if land.ok else 0.0
            flagged = cross >= LAND_FLAG_NM
            if flagged:
                land_variants += 1
                route_flagged = True
            features.append({
                "type": "Feature",
                "properties": {
                    "code": r["code"],
                    "variant": vid,
                    "title": title,
                    "wpNames": [w["name"] or "" for w in wps],
                    "wpDests": [bool(w.get("dest")) for w in wps],
                    "wpApprox": [bool(w.get("approx")) for w in wps],
                    "from": first["name"] or "start",
                    "to": last["name"] or "end",
                    "approximate": False,
                    "needsReview": flagged,
                    "landNm": round(cross),
                },
                "geometry": {"type": "LineString", "coordinates": coords},
            })
            ends = [i for i, w in enumerate(wps) if w.get("dest")]
            for i in (ends or [0, len(wps) - 1]):
                w = wps[i]
                features.append({
                    "type": "Feature",
                    "properties": {
                        "code": r["code"],
                        "variant": vid,
                        "name": w["name"],
                        "dest": bool(w.get("dest")),
                    },
                    "geometry": {"type": "Point", "coordinates": [w["lon"], w["lat"]]},
                })

        months = extract_months(" ".join(r.get("fields", {}).get("bestTime", [])))
        names, miles = [], []
        for tid, wps, coords in variants:
            names.append(wps[0]["name"] or "start")
            if len(coords) >= 2:
                dist = sum(
                    haversine_nm(c[1], c[0], coords[i + 1][1], coords[i + 1][0])
                    for i, c in enumerate(coords[:-1])
                )
                miles.append(int(round(dist)))
        waypoint_codes = []
        ports = []
        for tid, wps, coords in variants:
            for w in wps:
                n = slug(w["name"])
                if n and n not in waypoint_codes:
                    waypoint_codes.append(n)
                    if len(waypoint_codes) >= 8:
                        break
        for tid, wps, coords in variants:
            for w in wps:
                nm = (w["name"] or "").strip()
                if nm and nm not in ports:
                    ports.append(nm)
            if len(ports) >= 12:
                break

        fact = {
            "code": r["code"],
            "title": title,
            "chapter": ch,
            "region": CHAPTER_REGION.get(ch, ch),
            "monthsMentioned": months,
            "waypointCodes": waypoint_codes,
            "ports": ports,
            "miles": miles,
            "variantIds": [t["id"] for t in tables],
            "needsReview": route_flagged,
            "attribution": "8.ª edición (EPUB, waypoints GPS)",
        }
        facts.setdefault(ch, []).append(fact)
        route_ports[r["code"]] = ports

    os.makedirs(os.path.join(DST, "facts"), exist_ok=True)

    with open(os.path.join(DST, "index.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"chapters": chapters,
             "routes": sorted(
                 ({"code": r["code"], "title": r.get("title") or "",
                   "chapter": re.match(r"^[A-Z]{2}", r["code"]).group(0),
                   "region": CHAPTER_REGION.get(re.match(r"^[A-Z]{2}", r["code"]).group(0), ""),
                   "ports": route_ports.get(r["code"], [])}
                  for r in routes),
                 key=lambda e: route_sort_key(e["code"]),
             )},
            f, ensure_ascii=False, indent=1,
        )

    with open(os.path.join(DST, "routes.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)

    for ch, rows in facts.items():
        with open(os.path.join(DST, "facts", f"{ch}.jsonl"), "w", encoding="utf-8") as f:
            for row in sorted(rows, key=lambda x: route_sort_key(x["code"])):
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    codes_in_geo = Counter(f["properties"]["code"] for f in features)
    missing = [r["code"] for r in routes if r["code"] not in codes_in_geo]
    print(f"rutas: {len(routes)} | variantes dibujadas: {codes_in_geo.total()}({len(codes_in_geo)} códigos)")
    print(f"geojson: {os.path.getsize(os.path.join(DST,'routes.geojson'))//1024} KB | sin geometría: {missing[:5] or 'ninguna'}")
    if land.ok:
        print(f"needsReview (toques de tierra >= {LAND_FLAG_NM:g}nm): {land_variants} variantes")
    else:
        print("needsReview (tierra): máscara ausente en data/land/ -> sin marcar")


if __name__ == "__main__":
    main()