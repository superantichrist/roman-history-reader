#!/usr/bin/env python3
"""Normalize Vinext's prefixed assets for this GitHub project page."""

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIENT_ROOT = ROOT / "dist" / "client"
PREFIXED_ASSETS = CLIENT_ROOT / "roman-history-reader" / "_next"
PUBLIC_ASSETS = CLIENT_ROOT / "_next"


def main():
    index_path = CLIENT_ROOT / "index.html"
    if not index_path.is_file():
        raise FileNotFoundError("Static export is missing dist/client/index.html")
    html = index_path.read_text(encoding="utf-8")
    if "/roman-history-reader/_next/" not in html:
        raise ValueError("Static export does not contain the GitHub Pages asset prefix")
    if not PREFIXED_ASSETS.is_dir():
        raise FileNotFoundError("Vinext did not emit the expected prefixed assets")

    for source in PREFIXED_ASSETS.rglob("*"):
        target = PUBLIC_ASSETS / source.relative_to(PREFIXED_ASSETS)
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(source), str(target))
    (CLIENT_ROOT / ".nojekyll").touch()

    required = [
        CLIENT_ROOT / "data" / "manifest.json",
        CLIENT_ROOT / "data" / "books" / "livy" / "01.json",
        CLIENT_ROOT / "data" / "books" / "periochae" / "11.json",
        CLIENT_ROOT / "data" / "books" / "polybius" / "01.json",
        CLIENT_ROOT / "og.png",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing public artifacts: {}".format(", ".join(missing)))
    print("GitHub Pages artifact prepared at {}".format(CLIENT_ROOT))


if __name__ == "__main__":
    main()
