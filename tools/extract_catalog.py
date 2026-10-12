#!/usr/bin/env python3
"""Extrae el catálogo base de *World Cruising Routes* (2ª ed.) desde el PDF.

Produce dos artefactos en `data/catalog/v1/`:

- `text/pages.jsonl`  — texto por página PDF. **Solo índice interno de búsqueda**;
  no se distribuye en la app (ver `docs/02-content.md`).
- `routes.jsonl`      — una entrada por ruta del *Index of Routes*: código, título
  y páginas impresas del libro. Son **hechos**, no expresión.

Uso:
    python tools/extract_catalog.py [--pdf RUTA] [--out data/catalog/v1]
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from pathlib import Path

# Prefijos de código de ruta que existen en el libro (hechos de la edición).
VALID_PREFIXES = (
    "AN", "AS", "AT",
    "PN", "PS", "PT",
    "IS", "IT", "IN",
    "RN", "RS",
    "M",
)

_TWO_LETTER_PREFIXES = {p for p in VALID_PREFIXES if len(p) == 2}

# Correcciones de OCR sobre el token del código, aplicadas por posición.
_PREFIX_FIXES = {"1": "I", "!": "I", "0": "O", "5": "S", "l": "I", "|": "I"}
_SUFFIX_FIXES = {"l": "1", "I": "1", "O": "0", "o": "0", "L": "1", "!": "1", "Q": "0"}

_ATTRIBUTION = "World Cruising Routes, 2ª ed. (Adlard Coles Nautical, 1995), Jimmy Cornell"


def find_pdf(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.exists():
            sys.exit(f"No existe el PDF: {path}")
        return path
    candidates = sorted(glob.glob("*.pdf"))
    if not candidates:
        sys.exit("No hay ningún .pdf en la raíz del proyecto.")
    return Path(candidates[0])


def extract_pages(pdf: Path) -> list[str]:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # páginas corruptas o sin texto (escaneadas sin OCR)
            pages.append("")
    return pages


def write_pages(pages: list[str], out_dir: Path) -> None:
    text_dir = out_dir / "text"
    text_dir.mkdir(parents=True, exist_ok=True)
    with (text_dir / "pages.jsonl").open("w", encoding="utf-8") as fh:
        for number, text in enumerate(pages, start=1):
            if not text.strip():
                continue
            fh.write(json.dumps({"pdfPage": number, "text": text}, ensure_ascii=False) + "\n")


def normalize_code(raw: str) -> tuple[str | None, bool]:
    """Devuelve (código normalizado, fue_corregido) o (None, ...) si no es un código."""
    token = re.sub(r"[^A-Za-z0-9]", "", raw.upper())
    if not token:
        return None, False

    # El prefijo son 1-2 letras; el resto, dígitos. El OCR confunde la primera letra
    # con un dígito ("1S22" → IS22), así que se corrige el encabezado antes de medirlo.
    head = "".join(_PREFIX_FIXES.get(ch, ch) for ch in token[:2])
    prefix_len = 2 if head in _TWO_LETTER_PREFIXES else 1
    prefix = head[:prefix_len]
    suffix = token[prefix_len:]
    suffix = "".join(_SUFFIX_FIXES.get(ch, ch) for ch in suffix)

    if not suffix.isdigit():
        return None, False
    if prefix not in VALID_PREFIXES:
        return None, False

    code = prefix + suffix
    return code, code != token


def index_entry_pattern() -> re.Pattern[str]:
    # Entrada: código + título (una o dos líneas) + páginas impresas ("121-122" | "118" | "435-436")
    return re.compile(
        r"(?m)^[·! ]*([0-9!A-Za-z]{2,6})[ \t]+([^\n]{4,70}?)\s*\n?\s*"
        r"([A-Z][^\n]{0,50}?)\s*\n?\s*"
        r"(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*$"
    )


def parse_routes(pages: list[str]) -> list[dict]:
    """Lee el *Index of Routes* (al final del libro) y devuelve una entrada por ruta."""
    hits = [
        i
        for i, text in enumerate(pages)
        if re.match(r"\s*INDEX\s+OF\s+R\s?OUTES", text.strip(), re.I)
    ]
    if not hits:
        raise SystemExit("No se localizó el 'Index of Routes' en el PDF.")

    start, end = min(hits), max(hits)
    blob = "\n".join(pages[start : end + 1])

    # El OCR parte algunos códigos en dos ("ANll 2" → AN112): reunir el fragmento
    # cuando la primera parte parece un código corto y la segunda son 1-2 dígitos.
    blob = re.sub(r"\b([A-Z]{1,2}[0-9lI!O]{1,2})[ \t]+(\d{1,2})(?=\s)", r"\1\2", blob)

    seen: set[str] = set()
    routes: list[dict] = []
    for match in index_entry_pattern().finditer(blob):
        raw_code, title_a, title_b, pages_raw = match.groups()
        code, corrected = normalize_code(raw_code)
        if code is None:
            continue

        title = re.sub(r"\s+", " ", f"{title_a} {title_b}").strip(" .·")
        printed = [int(p) for p in re.findall(r"\d{1,3}", pages_raw)]
        if not title or code in seen:
            continue
        seen.add(code)

        routes.append(
            {
                "code": code,
                "codeRaw": raw_code.strip(),
                "title": title,
                "printedPages": printed,
                "pdfIndexPages": [start + 1, end + 1],
                "attribution": _ATTRIBUTION,
                "needsReview": corrected,
            }
        )

    routes.sort(key=lambda r: r["code"])
    return routes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", help="ruta al PDF (por defecto, el primero de la raíz)")
    parser.add_argument("--out", default="data/catalog/v1", help="directorio de salida")
    args = parser.parse_args()

    pdf = find_pdf(args.pdf)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Leyendo {pdf.name} ...")
    pages = extract_pages(pdf)
    print(f"  {len(pages)} páginas, {sum(len(p) for p in pages):,} caracteres")

    write_pages(pages, out_dir)
    print(f"  texto interno → {out_dir / 'text' / 'pages.jsonl'}")

    routes = parse_routes(pages)
    with (out_dir / "routes.jsonl").open("w", encoding="utf-8") as fh:
        for route in routes:
            fh.write(json.dumps(route, ensure_ascii=False) + "\n")
    flagged = sum(1 for r in routes if r["needsReview"])
    print(f"  rutas → {out_dir / 'routes.jsonl'} ({len(routes)} rutas, {flagged} para revisar)")


if __name__ == "__main__":
    main()
