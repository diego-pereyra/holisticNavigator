#!/usr/bin/env python3
"""Extract a short, attributed quote per route from the EPUB source.

The book is rendered as tables, so the descriptive prose of a route lives in
the *text* token that ends with the next route's heading (the prose precedes
the heading). See tools/extract_epub.py for the parser.

We keep only a bounded quote (one or two sentences, <= 240 chars): the app
shows a citation, never the full passage. Translations are merged from every
tools/quotes_es/*.json file when present (one file per chapter/batch).

Output: data/catalog/v2/quotes.json
    { "<CODE>": {"en": "...", "es": "...", "chapter": "AN"} }
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract_epub as ex  # noqa: E402

EPUB_HTML = "/tmp/opencode/epub/epub_x/OEBPS/html/*.xhtml"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "data", "catalog", "v2", "index.json")
OUT = os.path.join(ROOT, "data", "catalog", "v2", "quotes.json")
ES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quotes_es")


def load_es():
    es = {}
    for path in sorted(glob.glob(os.path.join(ES_DIR, "*.json"))):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for code, text in data.items():
            if text:
                es[code] = text
    return es

SOURCE = "Jimmy Cornell & Doina Cornell — World Cruising Routes (8th ed.)"
MAX_LEN = 240


def chapter_prose(path):
    parser = ex.KoboTables()
    parser.feed(open(path, encoding="utf-8").read())
    seq = ex.refine(parser.tokens)
    prose, order, last = {}, [], None
    for kind, val in seq:
        if kind != "text":
            continue
        head = ex.split_heading(val)
        if head:
            code, _title, start = head
            lead = val[:start].strip()
            if last and lead:
                prose.setdefault(last, []).append(lead)
            last = code
            if code not in order:
                order.append(code)
        elif last and val.strip():
            prose.setdefault(last, []).append(val.strip())
    return {c: " ".join(prose.get(c, [])).strip() for c in order}


def bounded_quote(text):
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[^A-Z\"“']+", "", text)
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for s in sentences:
        if out and len(out) + 1 + len(s) > MAX_LEN:
            break
        out = f"{out} {s}".strip()
        if len(out) >= MAX_LEN:
            break
    if len(out) < 40:
        return ""
    if len(out) > MAX_LEN + 60:
        out = out[: MAX_LEN + 60].rsplit(" ", 1)[0] + "…"
    return out


def main():
    all_prose = {}
    for path in sorted(glob.glob(EPUB_HTML)):
        all_prose.update(chapter_prose(path))

    catalog = json.load(open(CATALOG, encoding="utf-8"))
    es = load_es()

    out = {}
    missing = []
    for route in catalog["routes"]:
        code = route["code"]
        quote = bounded_quote(all_prose.get(code, ""))
        if not quote:
            missing.append(code)
            continue
        entry = {"en": quote, "chapter": route["chapter"], "source": SOURCE}
        if es.get(code):
            entry["es"] = es[code]
        out[code] = entry

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)

    have_es = sum(1 for e in out.values() if e.get("es"))
    print(f"quotes: {len(out)}/{len(catalog['routes'])}  with ES: {have_es}")
    if missing:
        print(f"missing ({len(missing)}):", missing[:40])


if __name__ == "__main__":
    main()
