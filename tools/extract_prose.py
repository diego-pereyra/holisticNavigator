#!/usr/bin/env python3
"""Extract the *full* descriptive prose per route from the EPUB source.

This is an internal authoring input for the `tips` layer (docs/02-content.md):
the prose is Cornell's expression and is NEVER shipped in the app bundle or
committed to the repo. Only the tips we redact ourselves are published.

Output: /tmp/opencode/prose.json  {"<CODE>": {"chapter": "AN", "text": "..."}}
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_quotes import chapter_prose  # noqa: E402
import extract_epub as ex  # noqa: E402

EPUB_HTML = "/tmp/opencode/epub/epub_x/OEBPS/html"
OUT = "/tmp/opencode/prose.json"


def main():
    import re

    files = sorted(
        f
        for f in os.listdir(EPUB_HTML)
        if re.match(r"^\d+_(AN|AS|AT|IN|IS|IT|ME|MW|PN|PS|PT|RN|RS)\d*_.+\.xhtml$", f)
    )
    all_prose = {}
    for f in files:
        chapter = re.match(r"^\d+_([A-Z]{2})", f).group(1)
        for code, text in chapter_prose(os.path.join(EPUB_HTML, f)).items():
            if text:
                all_prose[code] = {"chapter": chapter, "text": text}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(all_prose, fh, ensure_ascii=False, indent=1)
    print(f"prose: {len(all_prose)} routes -> {OUT}")


if __name__ == "__main__":
    main()
