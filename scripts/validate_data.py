#!/usr/bin/env python3
"""Verify source hashes, corpus integrity and published JSON without writing files."""

import json

from build_data import BOOKS_OUTPUT, ROOT, SEARCH_OUTPUT, build_artifacts, read_json


def main():
    artifacts, stats = build_artifacts()
    errors = []
    for path, expected in artifacts.items():
        if not path.is_file() or read_json(path) != expected:
            errors.append(str(path.relative_to(ROOT)))
    actual = set(BOOKS_OUTPUT.rglob("*.json")) | set(SEARCH_OUTPUT.rglob("*.json"))
    errors.extend(str(path.relative_to(ROOT)) for path in sorted(actual - artifacts.keys()))
    if errors:
        raise ValueError("Published data is missing, stale or inconsistent. Run npm run build:data:\n" + "\n".join(errors))
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
