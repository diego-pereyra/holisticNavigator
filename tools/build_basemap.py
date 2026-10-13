#!/usr/bin/env python3
"""Mapa base empaquetado (ADR-005).

Copia la costa Natural Earth 110m y genera la retícula de 10° (meridianos y
paralelos como LineString, con etiqueta tipo 20°N / 060°W). Son el piso del mapa:
idéntico con y sin red, sin teselas online.

Uso: python3 tools/build_basemap.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC_LAND = os.path.join(ROOT, "data", "land", "ne_110m_land.geojson")
DST_DIR = os.path.join(ROOT, "web", "public", "basemap")


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


def main():
    os.makedirs(DST_DIR, exist_ok=True)

    with open(SRC_LAND, encoding="utf-8") as f:
        land = json.load(f)
    with open(os.path.join(DST_DIR, "land.geojson"), "w", encoding="utf-8") as f:
        json.dump(land, f, ensure_ascii=False, separators=(",", ":"))

    grat = graticule()
    with open(os.path.join(DST_DIR, "graticule.geojson"), "w", encoding="utf-8") as f:
        json.dump(grat, f, ensure_ascii=False, separators=(",", ":"))

    land_kb = os.path.getsize(os.path.join(DST_DIR, "land.geojson")) // 1024
    grat_kb = os.path.getsize(os.path.join(DST_DIR, "graticule.geojson")) // 1024
    print(f"basemap → {DST_DIR} (land {land_kb} KB, graticule {grat_kb} KB, "
          f"{len(grat['features'])} líneas)")


if __name__ == "__main__":
    main()
