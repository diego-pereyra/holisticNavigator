#!/usr/bin/env python3
"""Mapa base empaquetado (ADR-005, W4.3).

Genera el piso del mapa, idéntico con y sin red, sin teselas online:
  - countries.geojson  Natural Earth 110m `admin_0_countries` (coords a 2
    decimales; props `name` y `mapcolor7` para el relleno por país).
  - cities.geojson     Natural Earth 110m `populated_places_simple`
    (props `name` y `pop_max`).
  - graticule.geojson  retícula de 10° (meridianos y paralelos) con `label`.

Las fuentes son de dominio público. Se descargan de naciscdn.org y se convierten
acá mismo con la biblioteca estándar (lector mínimo de shapefile/dBase, sin
dependencias nuevas). La descarga se cachea en el directorio temporal del sistema
para no repetirla en cada build.

Uso: python3 tools/build_basemap.py
"""
import io
import json
import os
import struct
import tempfile
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DST_DIR = os.path.join(ROOT, "web", "public", "basemap")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "hn-naturalearth")

NE = "https://naciscdn.org/naturalearth/110m/cultural/"
DATASETS = {
    "ne_110m_admin_0_countries": {
        "url": NE + "ne_110m_admin_0_countries.zip",
        "out": "countries.geojson",
        "shape": "polygon",
        "props": {"name": "NAME", "mapcolor7": "MAPCOLOR7"},
    },
    "ne_110m_populated_places_simple": {
        "url": NE + "ne_110m_populated_places_simple.zip",
        "out": "cities.geojson",
        "shape": "point",
        "props": {"name": "name", "pop_max": "pop_max"},
    },
}


# --------------------------------------------------------------- descarga

def download(name, url):
    """Bytes del zip, cacheado en el directorio temporal del sistema."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, os.path.basename(url))
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    print(f"  descargando {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "holistic-navigator/basemap"})
    with urllib.request.urlopen(req, timeout=90) as res:
        blob = res.read()
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(blob)
    os.replace(tmp, path)
    return blob


# --------------------------------------------------------------- shapefile

def read_dbf(blob):
    """Registros (dicts de str) de un .dbf dBase III."""
    num_rec = struct.unpack("<I", blob[4:8])[0]
    header_len = struct.unpack("<H", blob[8:10])[0]
    rec_len = struct.unpack("<H", blob[10:12])[0]
    nfields = (header_len - 33) // 32
    fields = []
    for i in range(nfields):
        fd = blob[32 + i * 32:64 + i * 32]
        fields.append((fd[:11].split(b"\x00")[0].decode("latin1"), fd[16]))
    rows = []
    base = header_len
    for r in range(num_rec):
        raw = blob[base + r * rec_len:base + (r + 1) * rec_len]
        if len(raw) < rec_len or raw[:1] == b"*":
            continue
        off = 1
        row = {}
        for name, flen in fields:
            # Los campos de texto del .dbf vienen rellenos con \x00 (no solo
            # espacios), por eso además de strip() hay que sacarlos.
            row[name] = raw[off:off + flen].decode("utf-8", "replace").replace("\x00", "").strip()
            off += flen
        rows.append(row)
    return rows


def read_shp(blob):
    """Itera (tipo_de_shape, contenido) de un .shp."""
    off = 100
    while off + 8 <= len(blob):
        _num, clen = struct.unpack(">ii", blob[off:off + 8])
        content = blob[off + 8:off + 8 + clen * 2]
        if len(content) < 4:
            break
        yield struct.unpack("<i", content[:4])[0], content
        off += 8 + clen * 2


def poly_rings(content):
    numparts, numpoints = struct.unpack("<ii", content[36:44])
    parts = struct.unpack("<%di" % numparts, content[44:44 + 4 * numparts])
    off = 44 + 4 * numparts
    pts = struct.unpack("<%dd" % (numpoints * 2), content[off:off + 16 * numpoints])
    coords = [(round(pts[2 * i], 2), round(pts[2 * i + 1], 2)) for i in range(numpoints)]
    rings = []
    for pi in range(numparts):
        start = parts[pi]
        end = parts[pi + 1] if pi + 1 < numparts else numpoints
        rings.append(coords[start:end])
    return rings


def coerce(value, key):
    if key in ("mapcolor7", "pop_max"):
        try:
            return int(float(value))
        except ValueError:
            return 0
    return value


def convert(zip_blob, spec):
    with zipfile.ZipFile(io.BytesIO(zip_blob)) as z:
        base = next((n[:-4] for n in z.namelist() if n.endswith(".shp")), None)
        if base is None:
            raise RuntimeError("el zip no contiene un .shp")
        shp = z.read(base + ".shp")
        dbf = z.read(base + ".dbf")

    rows = read_dbf(dbf)
    features = []
    idx = 0
    for stype, content in read_shp(shp):
        row = rows[idx] if idx < len(rows) else {}
        idx += 1
        props = {out: coerce(row.get(src, ""), out) for out, src in spec["props"].items()}
        if spec["shape"] == "point":
            if stype != 1:
                continue
            x, y = struct.unpack("<dd", content[4:20])
            geom = {"type": "Point", "coordinates": [round(x, 2), round(y, 2)]}
        else:
            if stype != 5:
                continue
            rings = poly_rings(content)
            if not rings:
                continue
            geom = ({"type": "Polygon", "coordinates": rings} if len(rings) == 1
                    else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]})
        features.append({"type": "Feature", "properties": props, "geometry": geom})
    return {"type": "FeatureCollection", "features": features}


# --------------------------------------------------------------- retícula

def lon_label(lon):
    if lon == 0:
        return "0°"
    return f"{abs(lon):03d}°{'E' if lon > 0 else 'W'}"


def lat_label(lat):
    if lat == 0:
        return "0°"
    return f"{abs(lat)}°{'N' if lat > 0 else 'S'}"


def graticule():
    features = []
    for lon in range(-180, 181, 10):
        features.append({
            "type": "Feature",
            "properties": {"kind": "meridian", "label": lon_label(lon)},
            "geometry": {"type": "LineString", "coordinates": [[lon, -85], [lon, 85]]},
        })
    for lat in range(-80, 81, 10):
        features.append({
            "type": "Feature",
            "properties": {"kind": "parallel", "label": lat_label(lat)},
            "geometry": {"type": "LineString", "coordinates": [[-180, lat], [180, lat]]},
        })
    return {"type": "FeatureCollection", "features": features}


def write_compact(dst, obj):
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    os.makedirs(DST_DIR, exist_ok=True)

    # W4.3: la costa suelta (land.geojson) la reemplazan los países.
    stale = os.path.join(DST_DIR, "land.geojson")
    if os.path.exists(stale):
        os.remove(stale)

    sizes = []
    for name, spec in DATASETS.items():
        geo = convert(download(name, spec["url"]), spec)
        out = os.path.join(DST_DIR, spec["out"])
        write_compact(out, geo)
        sizes.append((spec["out"], os.path.getsize(out), len(geo["features"])))

    grat = graticule()
    write_compact(os.path.join(DST_DIR, "graticule.geojson"), grat)

    parts = ", ".join(f"{n} {kb // 1024} KB ({nf} feats)" for n, kb, nf in sizes)
    print(f"basemap → {DST_DIR} ({parts}; graticule {len(grat['features'])} líneas)")


if __name__ == "__main__":
    main()
