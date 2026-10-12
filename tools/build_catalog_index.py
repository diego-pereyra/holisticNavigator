#!/usr/bin/env python3
"""Genera el formato de catálogo "manifest + payloads por capítulo".

- index.json        : lista compacta {code, title, chapter} para búsqueda (carga inicial pequeña)
- facts/<CH>.jsonl  : ficha completa por capítulo (código, páginas, atribución, hechos)
                      se descarga solo cuando el usuario selecciona una ruta de ese capítulo.
- routes.geojson    : geometría del mapa (se mantiene, la necesita el mapa completo).

Entradas : data/catalog/v1/routes.jsonl, route_facts.jsonl
Salidas  : data/catalog/v1/index.json, data/catalog/v1/facts/*.jsonl
"""
import json
import os
import re

ROOT = __file__.rsplit("/tools/", 1)[0]
V1 = f"{ROOT}/data/catalog/v1"
FACTS_DIR = f"{V1}/facts"

CHAPTER_RE = re.compile(r"[A-Z]+")
FACT_KEYS = ("monthsMentioned", "waypointCodes", "miles", "sourcePdfPages", "charCount")


def main():
    routes = [json.loads(l) for l in open(f"{V1}/routes.jsonl") if l.strip()]
    facts = {f["code"]: f for f in
             (json.loads(l) for l in open(f"{V1}/route_facts.jsonl") if l.strip())}

    os.makedirs(FACTS_DIR, exist_ok=True)
    seen = set()
    by_chapter = {}
    index_routes = []
    for r in routes:
        code, title = r["code"], r["title"]
        ch = (CHAPTER_RE.match(code).group() if CHAPTER_RE.match(code) else "??")
        index_routes.append({"code": code, "title": title, "chapter": ch})
        f = facts.get(code)
        rec = {"code": code, "title": title, "chapter": ch}
        for k in ("printedPages", "attribution", "needsReview"):
            if r.get(k) is not None:
                rec[k] = r[k]
        if f:
            for k in FACT_KEYS:
                if f.get(k) is not None:
                    rec[k] = f[k]
            if f.get("needsReview"):
                rec["needsReview"] = True
        by_chapter.setdefault(ch, []).append(rec)
        assert code not in seen, f"código duplicado {code}"
        seen.add(code)

    # payload por capítulo (archivo vacío si no hay hechos: siempre existe → 200 OK)
    for ch, recs in sorted(by_chapter.items()):
        path = f"{FACTS_DIR}/{ch}.jsonl"
        with open(path, "w") as fh:
            for rec in recs:
                fh.write(json.dumps(rec, separators=(",", ":")) + "\n")

    index = {"chapters": sorted(by_chapter), "routes": index_routes}
    with open(f"{V1}/index.json", "w") as fh:
        json.dump(index, fh, separators=(",", ":"))
    # no dejar archivos de capítulos que ya no existen
    for old in os.listdir(FACTS_DIR):
        ch = old[:-6]
        if not old.endswith(".jsonl") or ch not in by_chapter:
            os.remove(os.path.join(FACTS_DIR, old))

    total = sum(1 for r in index_routes if "monthsMentioned" in facts.get(r["code"], {}) and r["code"] in facts)
    print(f"index.json: {len(index_routes)} rutas, {len(by_chapter)} capítulos")
    for ch, recs in sorted(by_chapter.items()):
        print(f"  facts/{ch}.jsonl: {len(recs)} ({os.path.getsize(f'{FACTS_DIR}/{ch}.jsonl')} B)")
    print(f"con hechos: {total}/{len(index_routes)}")


if __name__ == "__main__":
    main()