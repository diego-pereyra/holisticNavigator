#!/usr/bin/env python3
"""Extrae hechos de texto por ruta del catálogo.

Lee el índice de texto (`data/catalog/v1/text/pages.jsonl`) y la lista de rutas
(`data/catalog/v1/routes.jsonl`), localiza la sección de cada ruta en el cuerpo del
libro y extrae solo hechos: códigos de waypoint, meses mencionados y distancias.

Salida: `data/catalog/v1/route_facts.jsonl`

Uso:
    python tools/extract_facts.py [--catalog data/catalog/v1]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from extract_catalog import VALID_PREFIXES, normalize_code

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_NUMBER = {name.lower(): i + 1 for i, name in enumerate(MONTHS)}
MONTH_RE = re.compile(r"\b(" + "|".join(MONTHS) + r")\b", re.I)

MILES_RE = re.compile(r"\b(\d{1,4}(?:,\d{3})?)\s?(?:miles|nm|nautical miles)\b", re.I)
WP_RE = re.compile(r"\bWP\s+([A-Z]{1,2}[0-9lI!O]{1,3}[A-Z]?)\b")
HEADER_RE = re.compile(r"^[ \t]*([A-Za-z0-9!|]{1,2}[0-9lI!O]{1,3})[ \t]+([A-Z][^\n]{4,70})[ \t]*$")
PAGE_NUMBER_RE = re.compile(r"^[ \t]*\d{1,3}(?:\s*[-–]\s*\d{1,3})?[ \t]*$")
INDEX_RE = re.compile(r"^\s*INDEX\s+OF\s+R\s?OUTES", re.I)
WP_TOKEN_RE = re.compile(r"^([A-Z]{1,2})([0-9LIO!]+)([A-Z]?)$")
WP_CHARMAP = str.maketrans({"l": "1", "I": "1", "O": "0", "!": "1", "L": "1"})


def normalize_wp(raw: str) -> str | None:
    """Código de waypoint tolerante al OCR: 'ANl'→AN1, 'ANll'→AN11, 'ANlO8'→AN108."""
    token = re.sub(r"[^A-Za-z0-9]", "", raw.upper())
    match = WP_TOKEN_RE.match(token)
    if not match:
        return None
    number = match.group(2).translate(WP_CHARMAP)
    if not number.isdigit():
        return None
    return f"{match.group(1)}{number}{match.group(3)}"


def code_regex(code: str) -> re.Pattern[str]:
    """RegExp tolerante al OCR para un código concreto (1↔l↔I↔!, 0↔O)."""
    out = []
    for ch in code:
        if ch == "1":
            out.append("[1lI!]")
        elif ch == "0":
            out.append("[0O]")
        elif ch == "I":
            out.append("[I1l!]")
        elif ch in "SO":
            out.append(f"[{ch}0]")
        else:
            out.append(re.escape(ch))
    return re.compile(r"\b" + "".join(out) + r"[A-Z]?\b")


def load_pages(text_path: Path) -> dict[int, str]:
    pages: dict[int, str] = {}
    for line in text_path.open(encoding="utf-8"):
        row = json.loads(line)
        pages[row["pdfPage"]] = row["text"]
    return pages


def load_codes(routes_path: Path) -> list[str]:
    codes = []
    for line in routes_path.open(encoding="utf-8"):
        codes.append(json.loads(line)["code"])
    return codes


def section_starts(pages: dict[int, str], valid: set[str]) -> list[tuple[int, str]]:
    """Devuelve [(pdfPage, code)] de encabezados de ruta en el cuerpo.

    Las páginas de listado de capítulo (mini-índice) juntan muchas rutas: se detectan
    como páginas con >= 4 encabezados candidatos y no se usan como inicio de sección.
    """
    by_page: dict[int, list[tuple[int, str]]] = {}
    for page_number in sorted(pages):
        if page_number < 20:  # portada, contenidos, índices previos
            continue
        lines = pages[page_number].split("\n")
        for offset, line in enumerate(lines):
            match = HEADER_RE.match(line)
            if not match:
                continue
            code = normalize_code(match.group(1))[0]
            if code and code in valid:
                by_page.setdefault(page_number, []).append((offset, code))

    starts: list[tuple[int, str]] = []
    seen: set[str] = set()
    for page_number in sorted(by_page):
        entries = by_page[page_number]
        is_listing = len(entries) >= 4
        lines = pages[page_number].split("\n")
        for offset, code in entries:
            following = next((l.strip() for l in lines[offset + 1 :] if l.strip()), "")
            follows_prose = (
                len(following) >= 15
                and bool(re.search(r"[a-z]", following))
                and not HEADER_RE.match(following)
                and not PAGE_NUMBER_RE.match(following)
            )
            if is_listing and not follows_prose:
                continue  # línea de un listado de capítulo
            if code in seen:
                continue
            seen.add(code)
            starts.append((page_number, code))
    return starts


def build_flow(pages: dict[int, str]) -> list[tuple[int, str]]:
    flow: list[tuple[int, str]] = []
    for page_number in sorted(pages):
        for line in pages[page_number].split("\n"):
            flow.append((page_number, line))
    return flow


def facts_for(code: str, body: str, page_from: int, page_to: int) -> dict:
    months = sorted({MONTH_NUMBER[m.lower()] for m in MONTH_RE.findall(body)})
    miles = sorted({int(m.replace(",", "")) for m in MILES_RE.findall(body)})
    own = code_regex(code)
    candidates = {m.group(0) for m in own.finditer(body)}
    candidates |= {f"WP {m.group(1)}".removeprefix("WP ") for m in WP_RE.finditer(body)}
    waypoints = set()
    for raw in candidates:
        normalized = normalize_wp(raw)
        if normalized and normalized != code:
            waypoints.add(normalized)
    return {
        "code": code,
        "monthsMentioned": months,
        "waypointCodes": sorted(waypoints),
        "miles": miles,
        "sourcePdfPages": [page_from, page_to],
        "charCount": len(body),
        "needsReview": len(body) < 300 or len(body) > 15000,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", default="data/catalog/v1")
    args = parser.parse_args()

    out_dir = Path(args.catalog)
    pages = load_pages(out_dir / "text" / "pages.jsonl")
    index_start = next((n for n in sorted(pages) if INDEX_RE.match(pages[n].strip())), None)
    if index_start is not None:
        pages = {n: t for n, t in pages.items() if n < index_start}
    codes = load_codes(out_dir / "routes.jsonl")
    valid = set(codes)

    starts = section_starts(pages, valid)
    order = [code for _page, code in starts]
    flow = build_flow(pages)
    print(f"secciones localizadas: {len(starts)} de {len(codes)} rutas")

    positions: list[tuple[int, str]] = []
    for page_number, code in starts:
        for i, (p, line) in enumerate(flow):
            if p == page_number:
                match = HEADER_RE.match(line)
                if match:
                    normalized, _ = normalize_code(match.group(1))
                    if normalized == code:
                        positions.append((i, code))
                        break
    positions.sort()

    records = []
    for i, (pos, code) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(flow)
        chunk = flow[pos:end]
        body = "\n".join(line for _p, line in chunk)
        records.append(facts_for(code, body, chunk[0][0], chunk[-1][0]))

    out_path = out_dir / "route_facts.jsonl"
    with out_path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    con_meses = sum(1 for r in records if r["monthsMentioned"])
    con_wps = sum(1 for r in records if r["waypointCodes"])
    print(f"  hechos → {out_path} ({len(records)} rutas; {con_meses} con meses, {con_wps} con waypoints)")
    print(f"  orden parcial de códigos: {order[:6]}")


if __name__ == "__main__":
    main()
