"""Parser de ventanas de meses del EPUB (T0.2).

Convierte las frases de `bestTime` y `tropicalStorms` (texto libre del libro) en
una estructura de meses utilizable por la UI, sin dependencias externas.

    Window = {en, es, months, zones}

- `en`:  la frase original, tal cual.
- `es`:  traducción determinista al español rioplatense (voseo no aplica acá).
- `months`: lista ordenada y sin repetir de meses (1 = enero .. 12 = diciembre).
- `zones`:  tramos con etiqueta geográfica entre paréntesis, si los hay:
            `[{ "label": "Índico Sur", "months": [11, 12, 1, 2, 3, 4, 5] }]`.

Una frase no reconocida devuelve `months=[]` y `es=""`, conservando `en`; el build
NO debe fallar por una frase nueva.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

MONTH_ES = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}

MOD_ES = {"early": "principios de", "mid": "mediados de", "late": "finales de"}
MODS = tuple(MOD_ES)

# Etiquetas de zona conocidas (paréntesis del libro) -> español.
ZONE_ES = {
    "south indian ocean": "Índico Sur",
    "north indian ocean": "Índico Norte",
    "western north pacific": "Pacífico Norte Occidental",
    "eastern north pacific": "Pacífico Norte Oriental",
    "north pacific": "Pacífico Norte",
    "south pacific": "Pacífico Sur",
    "bay of bengal": "Bahía de Bengala",
    "arabian sea": "Mar Arábigo",
    "micronesia": "Micronesia",
    "hawaii": "Hawái",
    "palau": "Palaos",
    "japan": "Japón",
    "azores": "Azores",
}


@dataclass
class Window:
    en: str
    es: str
    months: List[int] = field(default_factory=list)
    zones: List[dict] = field(default_factory=list)


def _split_top(text: str) -> List[str]:
    """Parte por comas de primer nivel (respeta paréntesis)."""
    parts: List[str] = []
    depth = 0
    cur = ""
    for ch in text:
        if ch == "(":
            depth += 1
            cur += ch
        elif ch == ")":
            depth = max(0, depth - 1)
            cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def _side(side: str):
    """Devuelve (modificador, mes) de un lado de rango ('Late May' -> ('late', 5))."""
    toks = re.sub(r"[^a-z ]", " ", side.lower()).split()
    mod: Optional[str] = next((t for t in toks if t in MODS), None)
    month: Optional[int] = next((MONTHS[t] for t in toks if t in MONTHS), None)
    return mod, month


def _side_es(mod: Optional[str], month: int) -> str:
    name = MONTH_ES[month]
    return f"{MOD_ES[mod]} {name}" if mod else name


def _span_months(start: int, end: int) -> List[int]:
    if end >= start:
        return list(range(start, end + 1))
    return list(range(start, 13)) + list(range(1, end + 1))


def _parse_span(core: str) -> Optional[dict]:
    """Interpreta un tramo sin paréntesis. None si no se reconoce."""
    low = core.lower().strip()
    if not low:
        return None
    if "all year" in low:
        return {"kind": "all_year", "months": list(range(1, 13))}
    if low == "none":
        return {"kind": "none", "months": []}

    if " to " in low:
        left, right = low.split(" to ", 1)
        mod_a, m_a = _side(left)
        mod_b, m_b = _side(right)
        if m_a is None or m_b is None:
            return None
        return {
            "kind": "range",
            "a": (mod_a, m_a),
            "b": (mod_b, m_b),
            "months": _span_months(m_a, m_b),
        }

    mod_a, m_a = _side(low)
    if m_a is None:
        return None
    return {"kind": "single", "a": (mod_a, m_a), "months": [m_a]}


def _span_es(span: dict) -> str:
    if span["kind"] == "all_year":
        return "todo el año"
    if span["kind"] == "none":
        return "sin temporada"
    a = _side_es(*span["a"])
    if span["kind"] == "range":
        return f"{a} a {_side_es(*span['b'])}"
    return a


def _zone_es(label: str) -> str:
    return ZONE_ES.get(label.lower().strip(), label.strip())


def parse_window(text: str) -> Window:
    """Parsea una frase de ventana de meses. Nunca lanza por frase desconocida."""
    en = (text or "").strip()
    segments = _split_top(en)
    zones: List[dict] = []
    spans: List[dict] = []
    recognized = bool(segments)

    for seg in segments:
        m = re.search(r"\(([^)]*)\)\s*$", seg)
        label = None
        if m:
            label = m.group(1).strip()
            core = seg[: m.start()].strip()
        else:
            core = seg.strip()

        span = _parse_span(core)
        if span is None:
            recognized = False
            span = {"kind": "unknown", "months": [], "core": core}
        else:
            span["core"] = core
        span["label"] = label
        spans.append(span)

        if label is not None:
            zones.append({"label": _zone_es(label), "months": list(span["months"])})

    months: List[int] = []
    for s in spans:
        for m in s["months"]:
            if m not in months:
                months.append(m)

    if not recognized:
        return Window(en=en, es="", months=months, zones=zones)

    parts = []
    for s in spans:
        piece = _span_es(s)
        if s["label"] is not None:
            piece += f" ({_zone_es(s['label'])})"
        parts.append(piece)

    return Window(en=en, es=", ".join(parts), months=months, zones=zones)


if __name__ == "__main__":  # pragma: no cover
    import json
    import sys

    for arg in sys.argv[1:]:
        print(json.dumps(vars(parse_window(arg)), ensure_ascii=False))
