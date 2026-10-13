import json
import pathlib
import sys
from typing import List

TOOLS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from windows import parse_window  # noqa: E402

ROUTES = TOOLS.parent / "data" / "epub" / "routes_v2.json"


def _phrases(field: str) -> List[str]:
    data = json.loads(pathlib.Path(ROUTES).read_text(encoding="utf-8"))
    out = set()
    for r in data:
        for x in r.get("fields", {}).get(field, []):
            if isinstance(x, str) and x.strip():
                out.add(x.strip())
    return sorted(out)


def test_corpus_covers_the_epub():
    assert len(_phrases("bestTime")) >= 92
    assert len(_phrases("tropicalStorms")) >= 37


def test_all_epub_phrases_recognized():
    phrases = set(_phrases("bestTime")) | set(_phrases("tropicalStorms"))
    unrecognized = [p for p in sorted(phrases) if parse_window(p).es == ""]
    assert not unrecognized, f"frases sin reconocer ({len(unrecognized)}): {unrecognized}"


def test_corpus_months_are_wellformed():
    phrases = set(_phrases("bestTime")) | set(_phrases("tropicalStorms"))
    for phrase in sorted(phrases):
        w = parse_window(phrase)
        assert w.es != ""
        if w.es == "sin temporada":
            assert w.months == [], phrase
            continue
        assert w.months, phrase
        assert all(1 <= m <= 12 for m in w.months), phrase
        assert len(w.months) == len(set(w.months)), phrase


def test_range_within_year():
    assert parse_window("June to October").months == [6, 7, 8, 9, 10]


def test_range_crossing_year():
    assert parse_window("December to April").months == [12, 1, 2, 3, 4]


def test_single_month():
    assert parse_window("April").months == [4]


def test_comma_list():
    assert parse_window("June, October").months == [6, 10]


def test_list_with_range():
    assert parse_window("June, September to October").months == [6, 9, 10]


def test_modifiers_do_not_change_months():
    w = parse_window("Late May to mid-August")
    assert w.months == [5, 6, 7, 8]
    assert w.es == "finales de mayo a mediados de agosto"


def test_two_ranges():
    assert parse_window("May to July, September to December").months == [
        5, 6, 7, 9, 10, 11, 12
    ]


def test_all_year():
    w = parse_window("All year")
    assert w.months == list(range(1, 13))
    assert w.es == "todo el año"


def test_none():
    w = parse_window("None")
    assert w.months == []
    assert w.es == "sin temporada"


def test_zone_parenthetical():
    w = parse_window(
        "November to May (South Indian Ocean), April to July, "
        "September to December (North Indian Ocean)"
    )
    assert sorted(w.months) == [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]
    labels = {z["label"]: z["months"] for z in w.zones}
    assert labels["Índico Sur"] == [11, 12, 1, 2, 3, 4, 5]
    assert labels["Índico Norte"] == [9, 10, 11, 12]
    assert "Índico Sur" in w.es and "Índico Norte" in w.es


def test_unrecognized_keeps_en_but_empty_es():
    w = parse_window("Sometime later")
    assert w.months == []
    assert w.es == ""
    assert w.en == "Sometime later"


def test_empty_string():
    w = parse_window("")
    assert w.months == []
    assert w.es == ""


def test_cross_year_single_pair_and_modifier():
    assert parse_window("December to January").months == [12, 1]
    assert parse_window("Early December").months == [12]
    assert parse_window("Mid-November to April").months == [11, 12, 1, 2, 3, 4]


def test_tricky_space_in_month():
    w = parse_window("Mid-October to mid- December")
    assert w.months == [10, 11, 12]
