"""Test de aceptación T0.5: cuencas (basins.json).

El primer waypoint de >= 95 % de las variantes debe caer dentro de una caja de
su propia región. Las excepciones se imprimen.
"""
import glob
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BASINS = os.path.join(ROOT, "data", "catalog", "v3", "basins.json")
FACTS = os.path.join(ROOT, "data", "catalog", "v3", "facts")


def _inside(lon, lat, boxes):
    return any(lo <= lon <= hi and lo2 <= lat <= hi2
               for lo, lo2, hi, hi2 in boxes)


def test_first_waypoint_in_own_region():
    with open(BASINS, encoding="utf-8") as f:
        regions = json.load(f)["regions"]

    total = ok = 0
    exceptions = []
    for path in sorted(glob.glob(os.path.join(FACTS, "*.jsonl"))):
        for line in open(path, encoding="utf-8"):
            fact = json.loads(line)
            boxes = regions[fact["region"]]["boxes"]
            for v in fact["variants"]:
                w = v["waypoints"][0]
                total += 1
                if _inside(w["lon"], w["lat"], boxes):
                    ok += 1
                else:
                    exceptions.append((fact["code"], v["id"], fact["region"],
                                       round(w["lon"], 1), round(w["lat"], 1)))

    pct = 100.0 * ok / total if total else 0.0
    print(f"\nT0.5 primer waypoint en su región: {ok}/{total} ({pct:.1f}%)")
    for e in exceptions:
        print("  excepción:", e)

    assert total > 0
    assert pct >= 95.0, f"solo {pct:.1f}% dentro de su región"


def test_all_13_regions_present():
    with open(BASINS, encoding="utf-8") as f:
        regions = json.load(f)["regions"]
    assert len(regions) == 13
    for name, r in regions.items():
        assert r["boxes"], f"{name} sin cajas"
        assert all(len(b) == 4 for b in r["boxes"])
