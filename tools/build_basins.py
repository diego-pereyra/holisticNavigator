#!/usr/bin/env python3
"""Cuencas oceánicas v3 (T0.5).

Genera data/catalog/v3/basins.json: para cada una de las 13 regiones, una lista
de cajas [minLon, minLat, maxLon, maxLat] (nunca polígonos libres; el Pacífico se
parte en dos cajas en el antimeridiano), la cuenca NHC y el RSMC responsable.
Las tablas de ciclones por región de Recommendations.kt migran aquí como
stormMonths de respaldo.

Uso: python3 tools/build_basins.py
"""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FACTS = os.path.join(ROOT, "data", "catalog", "v3", "facts")
OUT = os.path.join(ROOT, "data", "catalog", "v3", "basins.json")

ATL_N = [6, 7, 8, 9, 10, 11]
PAC_N = [5, 6, 7, 8, 9, 10, 11]
S_HALF = [11, 12, 1, 2, 3, 4]
IND_N = [4, 5, 10, 11, 12]

REGIONS = {
    "Atlántico Norte": {
        "boxes": [[-100, 8, 30, 82]],
        "nhcBasins": "AT", "rsmc": "NHC Miami", "stormMonths": ATL_N,
    },
    "Atlántico Tropical": {
        "boxes": [[-85, -45, 30, 45]],
        "nhcBasins": "AT", "rsmc": "NHC Miami", "stormMonths": ATL_N,
    },
    "Atlántico Sur": {
        "boxes": [[-80, -70, 30, 5]],
        "nhcBasins": "", "rsmc": "", "stormMonths": [],
    },
    "Pacífico Norte": {
        "boxes": [[100, 0, 180, 70], [-180, 0, -70, 70]],
        "nhcBasins": "EP,CP", "rsmc": "JTWC / JMA", "stormMonths": PAC_N,
    },
    "Pacífico Tropical": {
        "boxes": [[120, -45, 180, 60], [-180, -45, -60, 60]],
        "nhcBasins": "EP,CP", "rsmc": "JTWC / JMA", "stormMonths": PAC_N,
    },
    "Pacífico Sur": {
        "boxes": [[120, -60, 180, 5], [-180, -60, -60, 5]],
        "nhcBasins": "", "rsmc": "RSMC Nadi (Fiji)", "stormMonths": S_HALF,
    },
    "Índico Norte": {
        "boxes": [[25, 0, 110, 35]],
        "nhcBasins": "", "rsmc": "IMD New Delhi", "stormMonths": IND_N,
    },
    "Índico Tropical": {
        "boxes": [[25, -45, 140, 25]],
        "nhcBasins": "", "rsmc": "BoM Australia", "stormMonths": [],
    },
    "Índico Sur": {
        "boxes": [[10, -65, 150, 5]],
        "nhcBasins": "", "rsmc": "Météo-France La Réunion", "stormMonths": S_HALF,
    },
    "Mar Rojo (norte)": {
        "boxes": [[30, 20, 55, 32]],
        "nhcBasins": "", "rsmc": "", "stormMonths": [],
    },
    "Mar Rojo (sur)": {
        "boxes": [[25, 10, 60, 32]],
        "nhcBasins": "", "rsmc": "", "stormMonths": [],
    },
    "Mediterráneo Este": {
        "boxes": [[-10, 28, 45, 48]],
        "nhcBasins": "", "rsmc": "", "stormMonths": [],
    },
    "Mediterráneo Oeste": {
        "boxes": [[-10, 28, 45, 48]],
        "nhcBasins": "", "rsmc": "", "stormMonths": [],
    },
}


def in_boxes(lon, lat, boxes):
    return any(b[0] <= lon <= b[2] and b[1] <= lat <= b[3] for b in boxes)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = {"schema": 1, "regions": REGIONS}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    total = ok = 0
    exceptions = []
    for name in sorted(os.listdir(FACTS)):
        if not name.endswith(".jsonl"):
            continue
        for line in open(os.path.join(FACTS, name), encoding="utf-8"):
            fact = json.loads(line)
            region = fact["region"]
            boxes = REGIONS[region]["boxes"]
            for v in fact["variants"]:
                w = v["waypoints"][0]
                total += 1
                if any(b[0] <= w["lon"] <= b[2] and b[1] <= w["lat"] <= b[3] for b in boxes):
                    ok += 1
                else:
                    exceptions.append((fact["code"], v["id"], region,
                                       round(w["lon"], 1), round(w["lat"], 1)))
    pct = 100.0 * ok / total if total else 0.0
    print(f"basins.json: {len(REGIONS)} regiones | {OUT}")
    print(f"primer waypoint dentro de su región: {ok}/{total} ({pct:.1f}%)")
    if exceptions:
        print(f"excepciones ({len(exceptions)}):")
        for e in exceptions[:20]:
            print("  ", e)
    else:
        print("excepciones: ninguna")


if __name__ == "__main__":
    main()
