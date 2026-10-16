#!/usr/bin/env python3
"""Máscara de tierra empaquetada (ADR-008 §Decisión componente 1, T12.1).

Genera `data/land/land.bits`: rejilla de bits de 0,1° (3 600 × 1 800 bits ≈
810 KB) con origen (-180, -90), filas de sur a norte y 1 = tierra. La usa el
motor de enrutado (`web/src/core/routing/landmask.ts`) para consultar tierra en
O(1) y aplicar el margen costero dilatando celdas; reemplaza el raster de
`tools/landcheck.py` (Natural Earth 110m) por terreno de 10m.

Fuente: Natural Earth 10m `ne_10m_land` (dominio público), descargada con la
misma caché que `tools/build_basemap.py`. Sin dependencias nuevas: biblioteca
estándar + numpy + PIL (estas dos ya las usa `tools/landcheck.py` para su raster).

Empaquetado: byte i contiene las celdas i·8 … i·8+7; la celda c vive en el byte
`c >> 3`, en el bit `7 - (c & 7)` (MSB primero, `numpy.packbits` bitorder="big").
La celda del punto es `fila * 3600 + columna` con fila = floor((lat+90)/0,1) y
columna = floor((lon+180)/0,1).

Uso: python3 tools/build_landmask.py
"""
import io
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_basemap import download, poly_rings, read_shp  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DST = os.path.join(ROOT, "data", "land", "land.bits")
ROUTES = os.path.join(ROOT, "data", "catalog", "v3", "routes.geojson")

SRC = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"
CELL = 0.1
WIDTH = int(round(360.0 / CELL))   # 3600
HEIGHT = int(round(180.0 / CELL))  # 1800


def rings():
    """Anillos (lon, lat) del shapefile de tierra, en el orden del archivo."""
    with zipfile.ZipFile(io.BytesIO(download("ne_10m_land", SRC))) as z:
        base = next(n[:-4] for n in z.namelist() if n.endswith(".shp"))
        shp = z.read(base + ".shp")
    for stype, content in read_shp(shp):
        if stype != 5:
            continue
        for ring in poly_rings(content, None):
            if len(ring) >= 4:
                yield ring


def signed_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        s += x1 * y2 - x2 * y1
    return s


def build_grid():
    """Rasteriza la tierra en una máscara (HEIGHT, WIDTH) de 0/1.

    En los shapefiles de Natural Earth los anillos exteriores van en sentido
    horario (área negativa) y los huecos (p. ej. el mar Caspio) al revés.
    """
    img = Image.new("1", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(img)

    def px(lon, lat):
        # fila 0 = 90°S (sur arriba del array), como pide el formato.
        return ((lon + 180.0) / CELL, (lat + 90.0) / CELL)

    land = holes = 0
    for ring in rings():
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        if max(xs) - min(xs) < 1e-9 and max(ys) - min(ys) < 1e-9:
            continue  # anillo degenerado (p. ej. el artefacto en 0,0)
        if signed_area(ring) < 0:
            draw.polygon([px(*p) for p in ring], fill=1)
            land += 1
        else:
            draw.polygon([px(*p) for p in ring], fill=0)
            holes += 1
    print(f"  {land} anillos de tierra, {holes} huecos")
    return np.asarray(img, dtype=np.uint8)


def write_mask(grid):
    bits = np.packbits(grid.reshape(-1), bitorder="big")
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "wb") as f:
        f.write(bits.tobytes())
    print(f"máscara → {os.path.relpath(DST, ROOT)} ({bits.size // 1024} KB, "
          f"{grid.mean() * 100:.1f} % tierra)")
    return bits


def verify(bits):
    """Concordancia punto a punto con `landcheck.py` en los tramos del catálogo.

    Informa el porcentaje; no corta la build. Las diferencias con la máscara de
    110m están todas a menos de una celda (0,1°) de la costa, donde la base de
    10m es más fina: fuera de esa franja la concordancia es total.
    """
    try:
        from landcheck import Land
    except Exception as exc:  # numpy/PIL ausentes, etc.
        print(f"  verificación omitida: {exc}")
        return
    if not os.path.exists(ROUTES):
        print("  verificación omitida: falta el catálogo")
        return

    def is_land(lat, lon):
        c = int((lon + 180.0) / CELL) % WIDTH
        r = min(HEIGHT - 1, max(0, int((lat + 90.0) / CELL)))
        i = r * WIDTH + c
        return bool((bits[i >> 3] >> (7 - (i & 7))) & 1)

    land = Land()
    step = CELL
    total = agree = 0
    for feat in json.load(open(ROUTES, encoding="utf-8"))["features"]:
        coords = feat["geometry"]["coordinates"]
        for i in range(len(coords) - 1):
            (x1, y1), (x2, y2) = coords[i], coords[i + 1]
            dlon = x2 - x1
            if dlon > 180:
                dlon -= 360
            elif dlon < -180:
                dlon += 360
            dlat = y2 - y1
            m = max(int(abs(dlon) / step), int(abs(dlat) / step), 1)
            for k in range(m + 1):
                lon = x1 + dlon * k / m
                lat = y1 + dlat * k / m
                total += 1
                agree += is_land(lat, lon) == land.is_land(lon, lat)
    print(f"  verificación vs landcheck.py (NE 110m): {agree / total * 100:.2f} % "
          f"de concordancia ({agree}/{total} puntos en los tramos del catálogo)")


def main():
    grid = build_grid()
    bits = write_mask(grid)
    verify(bits)


if __name__ == "__main__":
    main()
