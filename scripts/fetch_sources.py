#!/usr/bin/env python3
"""Fetch pinned Perseus source files and record byte-for-byte checksums."""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "sources" / "raw"
LATIN_COMMIT = "0416bbecc6e882611eda7b71ca4e5d5edbe1c627"
GREEK_COMMIT = "7b8a2c9636bd90c7684c00624a392d3058ae9d22"


def latin_url(path: str) -> str:
    return (
        "https://raw.githubusercontent.com/PerseusDL/canonical-latinLit/"
        f"{LATIN_COMMIT}/{path}"
    )


def greek_url(path: str) -> str:
    return (
        "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/"
        f"{GREEK_COMMIT}/{path}"
    )


SOURCES: list[dict[str, str]] = [
    {
        "id": "livy-01-40",
        "filename": "livy-01-40.xml",
        "url": latin_url(
            "data/phi0914/phi001/phi0914.phi001.perseus-lat2.xml"
        ),
        "urn": "urn:cts:latinLit:phi0914.phi001.perseus-lat2",
        "edition": "Weissenborn–Mueller, Teubner, 1884–1911",
    },
    *[
        {
            "id": f"livy-{book:02d}",
            "filename": f"livy-{book:02d}.xml",
            "url": latin_url(
                f"data/phi0914/phi001{book}/"
                f"phi0914.phi001{book}.perseus-lat1.xml"
            ),
            "urn": f"urn:cts:latinLit:phi0914.phi001{book}.perseus-lat1",
            "edition": "Weissenborn, Ab urbe condita, 1876–1888",
        }
        for book in range(41, 46)
    ],
    *[
        {
            "id": f"periocha-{book:02d}",
            "filename": f"periocha-{book:02d}.xml",
            "url": latin_url(
                f"data/phi0914/phi001{book}s/"
                f"phi0914.phi001{book}s.perseus-lat2.xml"
            ),
            "urn": f"urn:cts:latinLit:phi0914.phi001{book}s.perseus-lat2",
            "edition": "Livy, Loeb vol. IV, Foster, 1926 (Latin text)",
        }
        for book in range(11, 21)
    ],
    {
        "id": "livy-periochae-46-142",
        "filename": "livy-periochae-46-142.xml",
        "url": latin_url(
            "data/phi0914/phi001fr/phi0914.phi001fr.perseus-lat1.xml"
        ),
        "urn": "urn:cts:latinLit:phi0914.phi001fr.perseus-lat1",
        "edition": "Weissenborn–Mueller, Teubner, 1911",
    },
    {
        "id": "polybius-histories",
        "filename": "polybius-histories.xml",
        "url": greek_url(
            "data/tlg0543/tlg001/tlg0543.tlg001.perseus-grc2.xml"
        ),
        "urn": "urn:cts:greekLit:tlg0543.tlg001.perseus-grc2",
        "edition": "Büttner-Wobst, Teubner, 1893–1905",
    },
]


def download(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "roman-history-reader source fetcher/1.0"},
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except Exception as error:  # pragma: no cover - network retry
            last_error = error
            time.sleep(2 ** attempt)
    assert last_error is not None
    raise last_error


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    records = []
    for source in SOURCES:
        payload = download(source["url"])
        target = RAW / source["filename"]
        target.write_bytes(payload)
        records.append(
            {
                **source,
                "localFile": str(target.relative_to(ROOT)).replace("\\", "/"),
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
        print(f"{source['id']}: {len(payload):,} bytes")

    manifest = {
        "schemaVersion": 1,
        "repositories": {
            "canonicalLatinLit": {
                "url": "https://github.com/PerseusDL/canonical-latinLit",
                "commit": LATIN_COMMIT,
            },
            "canonicalGreekLit": {
                "url": "https://github.com/PerseusDL/canonical-greekLit",
                "commit": GREEK_COMMIT,
            },
        },
        "license": "Perseus Digital Library source data; see upstream repository licenses",
        "sources": records,
    }
    path = ROOT / "sources" / "manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Recorded {len(records)} pinned sources in {path}")


if __name__ == "__main__":
    main()
