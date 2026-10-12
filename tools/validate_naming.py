#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Valida coherencia nombre <-> coordenada en todo el catalogo.

Un mismo toponimo aparece en muchas rutas normalmente con coordenadas
concentradas en UN lugar. Si una aparicion cae lejos del resto (> umbral) y el
nombre no tiene un cluster grande propio, es candidato a nombre mal asignado,
coordenada mal parseada o errata del libro.

Uso:  python3 tools/validate_naming.py
Salida: lista de flags con rutas/variantes y distancia al cluster dominante.
"""
import json
import math
import os
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "epub", "routes_v2.json")

_STOP = {
    "san", "santa", "santo", "la", "el", "del", "de", "las", "los",
    "isla", "isle", "pt", "cabo", "cap", "cape", "rocks", "rock",
    "cove", "bay", "reach", "pass", "sound", "north", "south", "east", "west",
    "islands", "island", "point", "head", "mount", "mt", "river", "rio",
    "channel", "passage", "strait", "reef", "reefs", "harbour", "harbor",
    "port", "puerto", "punta", "ponta", "grand", "grande", "one", "des",
    "du", "fort", "new", "york", "vila", "group", "grande",
}
_CARD = {
    "N", "S", "E", "W", "NE", "NW", "SE", "SW", "NNW", "NNE", "SSW", "SSE",
    "WNW", "ENE", "WSW", "ESE",
}


def _tokens(name):
    words = name.strip().rstrip("*.").split()
    while words and words[-1].upper() in _CARD:
        words = words[:-1]
    out = []
    for w in words:
        w = w.strip(".,'\"").lower()
        if w.endswith("s") and len(w) > 4 and w[-3:-1] == "'":
            w = w[:-2]
        if len(w) >= 3 and w not in _STOP:
            out.append(w)
    return out


def _nm(a, b):
    la1, lo1 = a
    la2, lo2 = b
    dlon = (lo2 - lo1 + 180) % 360 - 180  # dateline-aware
    return math.hypot(
        dlon * 60 * math.cos(math.radians((la1 + la2) / 2)),
        (la2 - la1) * 60,
    )


CLUSTER_NM = 300.0
FAR_NM = 350.0


def main():
    data = json.load(open(SRC))
    occ = {}  # word -> list of (w, route, variant)
    variant_lists = {}  # (code, variant) -> [waypoints]
    for r in data:
        code = r["code"]
        for vt in r.get("waypointTable") or []:
            vid = vt["id"]
            vlist = vt.get("waypoints") or []
            variant_lists[(code, vid)] = vlist
            for w in vlist:
                if not w["name"]:
                    continue
                for tok in _tokens(w["name"]):
                    occ.setdefault(tok, []).append((w, code, vid))

    flags = []
    for word, items in sorted(occ.items()):
        if len(items) < 3:
            continue
        clusters = []  # {"cx","cy","pts":[],"count"}
        for it in items:
            lat, lon = it[0]["lat"], it[0]["lon"]
            best = None
            bd = 1e18
            for c in clusters:
                d = _nm((lat, lon), (c["cx"], c["cy"]))
                if d < bd:
                    bd, best = d, c
            if best is not None and bd <= CLUSTER_NM:
                best["pts"].append(it)
                n = len(best["pts"])
                best["cx"] = (best["cx"] * (n - 1) + lat) / n
                best["cy"] = (best["cy"] * (n - 1) + lon) / n
            else:
                clusters.append({"cx": lat, "cy": lon, "pts": [it]})
        big = [c for c in clusters if len(c["pts"]) >= 3]
        if not big:
            continue
        main_cl = max(big, key=lambda c: len(c["pts"]))
        for c in clusters:
            if len(c["pts"]) >= 3:
                continue
            for w, code, vid in c["pts"]:
                d = _nm((w["lat"], w["lon"]), (main_cl["cx"], main_cl["cy"]))
                if d < FAR_NM:
                    continue
                # A legit homonym (e.g. London UK among London-on-Kiritimati)
                # sits consistently inside its own route corridor. If both
                # neighbouring waypoints of THIS variant are close, the
                # placement is coherent and the flag is a false positive.
                vlist = variant_lists.get((code, vid), [])
                try:
                    idx = vlist.index(w)
                except ValueError:
                    continue
                if idx > 0:
                    p = vlist[idx - 1]
                    if _nm((w["lat"], w["lon"]), (p["lat"], p["lon"])) < 800.0:
                        continue
                if idx < len(vlist) - 1:
                    q = vlist[idx + 1]
                    if _nm((w["lat"], w["lon"]), (q["lat"], q["lon"])) < 800.0:
                        continue
                rep = main_cl["pts"][0]
                flags.append(
                    (
                        d,
                        word,
                        w["name"],
                        round(w["lat"], 3),
                        round(w["lon"], 3),
                        f"{code}/{vid}",
                        f"cluster({len(main_cl['pts'])}): {rep[0]['name']} {round(rep[0]['lat'],2)} {round(rep[0]['lon'],2)}",
                    )
                )

    flags.sort(reverse=True)
    print(f"flags: {len(flags)}")
    for d, word, name, lat, lon, where, rep in flags:
        print(f"  {d:6.0f}nm  [{word}] {name} ({lat}, {lon})  {where}  ~ vs {rep}")


if __name__ == "__main__":
    main()