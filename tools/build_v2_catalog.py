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
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landcheck import Land
from optimize_coast import Coast
from windows import parse_window

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "epub", "routes_v2.json")
DST = os.path.join(ROOT, "data", "catalog", "v2")
DST3 = os.path.join(ROOT, "data", "catalog", "v3")
ATTRIBUTION = "World Cruising Routes, 8.ª ed. — Jimmy & Doina Cornell"
QUOTES = os.path.join(DST, "quotes.json")
TIPS_DIR = os.path.join(ROOT, "tools")
TIPS_CHAPTERS = os.path.join(TIPS_DIR, "tips_chapters_es.json")
TIPS_ROUTES_DIR = os.path.join(TIPS_DIR, "tips_routes_es")


def load_route_tips():
    tips = {}
    if os.path.isdir(TIPS_ROUTES_DIR):
        for name in sorted(os.listdir(TIPS_ROUTES_DIR)):
            if not name.endswith(".json"):
                continue
            with open(os.path.join(TIPS_ROUTES_DIR, name), encoding="utf-8") as fh:
                for code, text in json.load(fh).items():
                    if text:
                        tips[code] = text
    return tips

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


def unwrap_lons(coords):
    """Make consecutive longitudes continuous (each step <=180 deg apart).

    GeoJSON/MapLibre interpolate longitude linearly, so a leg that crosses the
    antimeridian (e.g. Raoul -177.9 -> Cape Brett 174.3) would otherwise be
    drawn the long way around the globe. Unwrapping keeps the track short.
    """
    if not coords:
        return coords
    out = [coords[0]]
    for lon, lat in coords[1:]:
        prev = out[-1][0]
        d = lon - prev
        while d > 180.0:
            lon -= 360.0
            d -= 360.0
        while d < -180.0:
            lon += 360.0
            d += 360.0
        out.append((lon, lat))
    return out


# Cache of the (slow) coastal optimizer, keyed by input coordinates, so a
# re-run resumes: already-processed variants are recomputed from the cache.
COAST_CACHE = os.environ.get("COAST_CACHE", "/tmp/opencode/coast_cache.json")


def load_coast_cache():
    if os.path.exists(COAST_CACHE):
        try:
            return json.load(open(COAST_CACHE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_coast_cache(cache):
    try:
        with open(COAST_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f)
    except OSError:
        pass


def optimize_variant(coast, coords, wps, cache=None):
    """Insert synthetic coastal waypoints so the track follows water.

    Returns (coords, wps) with the inserted points woven into the waypoint
    list (empty name, approx=True) so their indices stay aligned with `coords`.
    """
    key = None
    hit = None
    if cache is not None:
        key = ";".join("%.6f,%.6f" % (c[0], c[1]) for c in coords)
        hit = cache.get(key)
    if hit is not None:
        opt = [tuple(p) for p in hit["opt"]]
        inserted = hit["inserted"]
    else:
        opt, inserted, _ = coast.optimize(coords)
        if cache is not None:
            cache[key] = {"opt": opt, "inserted": inserted}
    if not inserted:
        return coords, wps
    ins = set(inserted)
    out = []
    j = 0
    for k, pt in enumerate(opt):
        if k in ins:
            out.append({"name": "", "lat": pt[1], "lon": pt[0], "dest": False, "approx": True, "corrected": True})
        else:
            out.append(wps[j])
            j += 1
    return opt, out


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
    # Cabo Espartel (Marruecos): el libro perdió el signo del meridiano en
    # todas las rutas que salen del Estrecho (-5°58'W quedó como +5°58'E,
    # cayendo en Argelia).
    ("AN32", "Espartel"): (35.8, -5.967),
    ("AN33", "Espartel"): (35.8, -5.967),
    ("AN39", "Espartel"): (35.8, -5.967),
    ("AN46A", "Espartel"): (35.8, -5.967),
    ("AN58", "Espartel"): (35.8, -5.967),
    ("AT29", "Espartel"): (35.8, -5.967),
    ("AN164A", "Faroes S"): (61.217, -6.733),        # Feroe al W; libro puso +6°44' (al E)
    ("AN165C", "Scoresby"): (70.358, -22.0),         # Scoresby Sund (Groenlandia); libro: 70°46'N,9°06'W (Jan Mayen)
    # Torres Strait desplazado al mar de Banda (~123°E por 142°E):
    ("IS13C", "Thursday"): (-10.587, 142.22),        # libro: 10°35.2'S,142°13.2'E
    ("IS13C", "Normanby W"): (-10.575, 142.133),     # libro: 10°34.5'S,142°08.0'E
    ("AT21A", "Devil N"): (5.29, -52.58),            # Isla del Diablo (Guayana Fr.); libro: 15°17.5'N (lat 15 por 5)
    ("AN106B", "Cayman S"): (19.25, -81.35),         # libro arrastró 38°40'N,9°18'W (coordenada de Lisboa)
    # --- Barrido sistemático: coord. copiada del topónimo vecino/salida ---
    # El OCR arrastró a un topónimo la coordenada de otro de la misma tabla
    # (salida o vecino). El valor correcto se ancla al mismo nombre en otra
    # variante de la misma ruta o en otra ruta del catálogo.
    ("AN11B", "Terra"): (47.65, -52.5167),            # Terranova; copió 56°24'N,5°29'W (Oban)
    ("AN11B", "St John’s"): (47.5667, -52.7),         # Terranova; copió 56°05'N,6°35'W (Artach)
    ("AN22B", "Isleta"): (28.15, -15.3833),           # Canarias; copió 37°04'N,8°08'W (Vilamoura)
    ("AN22B", "Las Palmas"): (28.1217, -15.4),
    ("AN24B", "Faial E"): (38.5417, -28.5917),        # Azores; copió 37°04'N,8°09'W (Sagres)
    ("AN24B", "Horta"): (38.535, -28.6167),
    ("AN36B", "Gibraltar"): (36.125, -5.383),         # copió 37°44'N,25°39'W (Ponta Delgada)
    ("AN36B", "Paloma"): (36.0, -5.7083),             # copió 37°41'N,30°50'W (Miguel S)
    ("AN36C", "Gibraltar"): (36.125, -5.383),         # copió 36°56'N,25°09'W (Vila do Porto)
    ("AN36C", "Paloma"): (36.0, -5.7083),             # copió 36°55'N,25°00'W (Maria)
    ("AN37B", "St George’s"): (32.3783, -64.6633),    # Bermuda; copió 32°48'N,17°20'W (Funchal)
    ("AN37C", "St George’s"): (32.3783, -64.6633),
    ("AN55B", "St George’s"): (32.3783, -64.6633),    # Bermuda; copió 28°26'N,17°50'W (La Palma)
    ("AN56B", "Maria S"): (36.9167, -25.1333),        # Azores; copió 28°31'N,16°06'W (Tenerife)
    ("AN56B", "Vila do Porto"): (36.9383, -25.1483),
    ("AN56C", "Maria S"): (36.9167, -25.1333),        # Azores; copió 28°40'N,17°45'W (La Palma)
    ("AN56C", "Vila do Porto"): (36.9383, -25.1483),
    ("AN57B", "Madeira S"): (32.5833, -16.9),         # Madeira; copió 28°31'N,16°06'W (Tenerife)
    ("AN57B", "Funchal"): (32.6417, -16.9),
    ("AN66C", "Estaca"): (27.7833, -17.9),            # El Hierro; copió 16°59'N,23°17'W (Praia)
    ("AN68C", "Noronha NW"): (-3.8167, -32.405),      # Brasil; copió 14°54'N,23°30'W (Praia)
    ("AN68C", "Fernando de Noronha"): (-3.8317, -32.405),
    ("AN87C", "Bermuda E"): (32.3667, -64.6333),      # Bermuda; copió 18°28'N,66°08'W (San Juan)
    ("AN87C", "St George’s"): (32.3783, -64.6633),
    ("AN107B", "Cristobal"): (9.3883, -79.9183),      # Panamá; copió 17°03'N,77°08'W (Jamaica)
    ("AN127B", "Cayman S"): (19.25, -81.35),          # copió 38°40'N,9°18'W (Lisboa)
    ("AN133B", "Channel S"): (38.6, -9.4),            # Portugal; copió Azores
    ("AN133B", "Lisbon"): (38.6733, -9.3067),
    ("AN133C", "Channel S"): (38.6, -9.4),
    ("AN133C", "Lisbon"): (38.6733, -9.3067),
    ("AN137B", "Bermuda E"): (32.3667, -64.6333),     # Bermuda; copió 31°10'N,39°22'W
    ("AN137B", "St George’s"): (32.3783, -64.6633),
    ("AN145B", "Morehead City"): (34.6783, -76.68),   # Carolina del Norte; copió 18°30'N,64°31'W (Tórtola)
    ("AN145B", "Lookout"): (34.5617, -76.7),
    ("AN145C", "Morehead City"): (34.6783, -76.68),   # copió 18°36'N,63°36'W (Anguila)
    ("AN146B", "Man of War"): (26.635, -77.0117),     # Bahamas; copió 34°41'N,76°41'W (Morehead City)
    ("AN146B", "Marsh Harbour"): (26.54, -77.0667),
    ("AN148A", "Cayman S"): (19.25, -81.35),          # copió 38°40'N,9°18'W (Lisboa)
    ("AN148B", "Morehead City"): (34.6783, -76.68),   # copió 22°16'N,72°22'W (Caicos)
    ("AN153D", "Alesund W"): (62.5333, 5.0667),       # Noruega; copió 58°43'N,2°56'W (Orcadas)
    ("AN153D", "Alesund"): (62.525, 5.8333),
    ("AN157B", "Ammassalik"): (65.5833, -37.5833),    # Groenlandia; copió 57°44'N,13°39'W (Rockall)
    ("AT15B", "Noronha NW"): (-3.8167, -32.405),      # Brasil; copió 16°59'N,61°46'W (Antigua)
    ("AT15B", "Fernando de Noronha"): (-3.8317, -32.405),
    ("PN12B", "San Diego"): (32.6867, -117.23),       # California; copió 29°19'N,118°09'W
    ("PN25B", "Kiritimati NW"): (2.1, -157.5333),     # Line Islands; copió 22°53'N,109°54'W (Cabo San Lucas)
    ("PN25B", "Kiritimati W"): (1.975, -157.5),
    ("PN39B", "Hong Kong"): (22.2917, 114.1667),      # copió 20°34'N,121°11'E (Bashi)
    ("PN52B", "Macau"): (22.1667, 113.5917),          # copió 14°42'N,119°38'E (Luzón SW)
    ("PN64B", "Apra"): (13.45, 144.625),              # Guam; copió 18°45'N,122°20'E (Luzón NE)
    ("PN85B", "Mino W"): (33.85, 134.9833),           # Japón; copió 28°05'N,129°23'E (Koniya)
    ("PN87B", "Mino W"): (33.85, 134.9833),
    ("IT12B", "Benoa"): (-8.745, 115.2117),           # Bali; copió 10°22'S,105°36'E (Christmas)
    ("IS15C", "Darwin"): (-12.5, 130.8667),           # Australia; copió 10°23'S,105°42'E (Christmas)
    ("IS15C", "Darwin NW"): (-12.3667, 130.7333),
    ("IS42B", "Victoria"): (-4.625, 55.4583),         # Mahé (Seychelles); copió 10°16'S,56°26'E
    ("IS63B", "Fremantle W"): (-32.02, 115.6167),     # Australia; copió 29°52'S,31°04'E (Durban)
    ("IS63B", "Fremantle"): (-32.055, 115.7333),
    ("MW1", "Port Said"): (31.25, 32.3167),           # Egipto; copió 35°57'N,14°34'E (Malta)
    ("MW1", "Port Said N"): (31.6167, 32.3167),
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


def split_field(values):
    """Aplana una lista del libro en ítems limpios ('BA 4011, US 121' -> 2)."""
    out = []
    for v in values or []:
        if not isinstance(v, str):
            continue
        for part in v.split(","):
            part = part.strip()
            if part:
                out.append(part)
    return out


def build_when(fields):
    """Ventana de meses v3 desde bestTime/tropicalStorms (parser T0.2)."""
    best_txt = ", ".join(x.strip() for x in fields.get("bestTime", []) if x and x.strip())
    storms_txt = ", ".join(x.strip() for x in fields.get("tropicalStorms", []) if x and x.strip())
    bw = parse_window(best_txt) if best_txt else parse_window("")
    sw = parse_window(storms_txt) if storms_txt else parse_window("")
    when = {
        "bestEn": best_txt,
        "bestEs": bw.es,
        "bestMonths": bw.months,
        "stormsEn": storms_txt,
        "stormsEs": sw.es,
        "stormMonths": sw.months,
    }
    zones, seen = [], set()
    for z in bw.zones + sw.zones:
        if z["label"] not in seen:
            seen.add(z["label"])
            zones.append(z)
    if zones:
        when["zones"] = zones
    return when


def main():
    routes = json.load(open(SRC, encoding="utf-8"))
    quotes = json.load(open(QUOTES, encoding="utf-8")) if os.path.exists(QUOTES) else {}
    chapter_tips = json.load(open(TIPS_CHAPTERS, encoding="utf-8")) if os.path.exists(TIPS_CHAPTERS) else {}
    route_tips = load_route_tips()
    chapters = []
    features = []
    facts = {}
    facts3 = {}
    route_ports = {}
    land = Land()
    coast = Coast(land)
    cache = load_coast_cache()
    land_hits = 0
    land_variants = 0
    coastal_variants = 0
    done = 0

    for r in routes:
        done += 1
        t0 = time.time()
        if done % 40 == 0:
            print(f"  … {done}/{len(routes)} rutas ({coastal_variants} con costero, {land_variants} a revisar, cache {len(cache)})", flush=True)
            save_coast_cache(cache)
        ch = re.match(r"^[A-Z]{2}", r["code"]).group(0)
        if ch not in chapters:
            chapters.append(ch)
        tables = r.get("waypointTable") or []

        for t in tables:
            for w in t.get("waypoints") or []:
                key = (t["id"], w["name"])
                if key in ERRATA:
                    w["lat"], w["lon"] = ERRATA[key]
                    w["corrected"] = True
                if key in RENAME:
                    w["name"] = RENAME[key]

        variants = []
        for t in tables:
            wps = t.get("waypoints") or []
            if t["id"] == "AN106C" and wps:
                last = wps[-1]
                if abs(last["lon"] - -79.75) < 0.06 and abs(last["lat"] - 19.5) < 0.06:
                    wps.pop()
            coords = [(w["lon"], w["lat"]) for w in wps]
            if len(coords) >= 2:
                coords, wps = optimize_variant(coast, coords, wps, cache)
                coords = unwrap_lons(coords)
                variants.append((t["id"], wps, coords))

        title = r.get("title") or ""
        route_flagged = False
        v3_variants = []

        for vid, wps, coords in variants:
            first, last = wps[0], wps[-1]
            coastal = any((not w.get("name")) and w.get("approx") for w in wps)
            if coastal:
                coastal_variants += 1
            cross = land.crossing_nm(coords) if land.ok else 0.0
            flagged = cross >= LAND_FLAG_NM
            if flagged:
                land_variants += 1
                route_flagged = True
            dist = sum(
                haversine_nm(c[1], c[0], coords[i + 1][1], coords[i + 1][0])
                for i, c in enumerate(coords[:-1])
            )
            v3_variants.append({
                "id": vid,
                "from": first["name"] or "start",
                "to": last["name"] or "end",
                "nm": int(round(dist)),
                "coastal": coastal,
                "needsReview": flagged,
                "waypoints": [
                    {
                        "name": w["name"] or "",
                        "lat": coords[i][1],
                        "lon": coords[i][0],
                        "dest": bool(w.get("dest")),
                        "corrected": bool(w.get("corrected")),
                    }
                    for i, w in enumerate(wps)
                ],
            })
            features.append({
                "type": "Feature",
                "properties": {
                    "code": r["code"],
                    "variant": vid,
                    "title": title,
                    "wpNames": [w["name"] or "" for w in wps],
                    "wpDests": [bool(w.get("dest")) for w in wps],
                    "wpApprox": [bool(w.get("approx")) for w in wps],
                    "wpCorrected": [bool(w.get("corrected")) for w in wps],
                    "from": first["name"] or "start",
                    "to": last["name"] or "end",
                    "approximate": False,
                    "coastal": coastal,
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
                    "geometry": {"type": "Point", "coordinates": list(coords[i])},
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
        q = quotes.get(r["code"])
        if q and (q.get("en") or q.get("es")):
            fact["quoteEn"] = q.get("en") or ""
            fact["quoteEs"] = q.get("es") or ""
            fact["quoteSource"] = q.get("source") or ""
        if route_tips.get(r["code"]):
            fact["tip"] = route_tips[r["code"]]
        if chapter_tips.get(ch):
            fact["chapterTip"] = chapter_tips[ch]
        facts.setdefault(ch, []).append(fact)
        route_ports[r["code"]] = ports

        fields = r.get("fields", {})
        fact3 = {
            "code": r["code"],
            "title": title,
            "chapter": ch,
            "region": CHAPTER_REGION.get(ch, ch),
            "from": v3_variants[0]["from"] if v3_variants else "",
            "to": v3_variants[0]["to"] if v3_variants else "",
            "when": build_when(fields),
            "charts": split_field(fields.get("charts")),
            "guides": split_field(fields.get("cruisingGuides")),
            "planner": split_field(fields.get("voyagePlanner")),
            "variants": v3_variants,
            "attribution": ATTRIBUTION,
            "needsReview": route_flagged,
            "monthsMentioned": months,
            "waypointCodes": waypoint_codes,
            "ports": ports,
            "miles": miles,
            "variantIds": [t["id"] for t in tables],
        }
        if q and (q.get("en") or q.get("es")):
            fact3["quoteEn"] = q.get("en") or ""
            fact3["quoteEs"] = q.get("es") or ""
            fact3["quoteSource"] = q.get("source") or ""
        if route_tips.get(r["code"]):
            fact3["tip"] = route_tips[r["code"]]
        if chapter_tips.get(ch):
            fact3["chapterTip"] = chapter_tips[ch]
        facts3.setdefault(ch, []).append(fact3)
        route_ports[r["code"]] = ports
        dt = time.time() - t0
        if dt > 3.0:
            print(f"  ! lento {r['code']} ({dt:.1f}s)", flush=True)

    os.makedirs(os.path.join(DST, "facts"), exist_ok=True)
    os.makedirs(os.path.join(DST3, "facts"), exist_ok=True)

    index_obj = {
        "chapters": chapters,
        "routes": sorted(
            ({"code": r["code"], "title": r.get("title") or "",
              "chapter": re.match(r"^[A-Z]{2}", r["code"]).group(0),
              "region": CHAPTER_REGION.get(re.match(r"^[A-Z]{2}", r["code"]).group(0), ""),
              "ports": route_ports.get(r["code"], [])}
             for r in routes),
            key=lambda e: route_sort_key(e["code"]),
        ),
    }
    geojson_obj = {"type": "FeatureCollection", "features": features}

    for d in (DST, DST3):
        with open(os.path.join(d, "index.json"), "w", encoding="utf-8") as f:
            json.dump(index_obj, f, ensure_ascii=False, indent=1)
        with open(os.path.join(d, "routes.geojson"), "w", encoding="utf-8") as f:
            json.dump(geojson_obj, f, ensure_ascii=False)

    for ch, rows in facts.items():
        with open(os.path.join(DST, "facts", f"{ch}.jsonl"), "w", encoding="utf-8") as f:
            for row in sorted(rows, key=lambda x: route_sort_key(x["code"])):
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    for ch, rows in facts3.items():
        with open(os.path.join(DST3, "facts", f"{ch}.jsonl"), "w", encoding="utf-8") as f:
            for row in sorted(rows, key=lambda x: route_sort_key(x["code"])):
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    codes_in_geo = Counter(f["properties"]["code"] for f in features)
    missing = [r["code"] for r in routes if r["code"] not in codes_in_geo]
    print(f"rutas: {len(routes)} | variantes dibujadas: {codes_in_geo.total()}({len(codes_in_geo)} códigos)")
    print(f"geojson: {os.path.getsize(os.path.join(DST,'routes.geojson'))//1024} KB | sin geometría: {missing[:5] or 'ninguna'}")
    if land.ok:
        print(f"optimizador costero: {coastal_variants} variantes con waypoints insertados")
        print(f"needsReview (toques de tierra >= {LAND_FLAG_NM:g}nm): {land_variants} variantes")
    else:
        print("needsReview (tierra): máscara ausente en data/land/ -> sin marcar")
    save_coast_cache(cache)


if __name__ == "__main__":
    main()