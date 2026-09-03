#!/usr/bin/env python3
"""Build a static, source-preserving Livy/Polybius reader corpus."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MANIFEST = ROOT / "sources" / "manifest.json"
CHRONOLOGY_FILE = ROOT / "sources" / "chronology.json"
RAW = ROOT / "sources" / "raw"
TRANSLATIONS = ROOT / "translations" / "ko"
OUTPUT = ROOT / "public" / "data"
BOOKS_OUTPUT = OUTPUT / "books"
SEARCH_OUTPUT = OUTPUT / "search"
TEI = "{http://www.tei-c.org/ns/1.0}"

EXPECTED = {"livy": 35, "periochae": 17, "polybius": 39}

TIMELINE = [
    {
        "id": "foundation-293",
        "yearStartBce": 753,
        "yearEndBce": 293,
        "label": "건국 전승–기원전 293년",
        "primary": ["livy:1-10"],
        "description": "리비우스 1–10권의 보존 본문",
    },
    {
        "id": "292-265",
        "yearStartBce": 292,
        "yearEndBce": 265,
        "label": "기원전 292–265년",
        "primary": ["periochae:11-15"],
        "description": "소실된 리비우스 11–15권을 전하는 후대 요약",
    },
    {
        "id": "264-219",
        "yearStartBce": 264,
        "yearEndBce": 219,
        "label": "기원전 264–219년",
        "primary": ["polybius:1-2", "periochae:16-20"],
        "description": "폴리비오스의 병행 서술과 리비우스 소실권 요약",
    },
    {
        "id": "218-167",
        "yearStartBce": 218,
        "yearEndBce": 167,
        "label": "기원전 218–167년",
        "primary": ["livy:21-45", "polybius:3-29"],
        "description": "리비우스 보존 본문을 중심으로 폴리비오스와 병행 독서",
    },
    {
        "id": "166-146",
        "yearStartBce": 166,
        "yearEndBce": 146,
        "label": "기원전 166–146년",
        "primary": ["periochae:46-52", "polybius:30-39"],
        "description": "리비우스 요약과 부분 보존된 폴리비오스",
    },
]

SOURCE_META = {
    "livy": {
        "author": "Titus Livius",
        "authorKo": "티투스 리비우스",
        "workTitle": "Ab urbe condita",
        "workTitleKo": "로마사",
        "language": "la",
        "languageLabel": "라틴어",
    },
    "periochae": {
        "author": "Anonymus epitomator Livii",
        "authorKo": "리비우스 요약자",
        "workTitle": "Periochae librorum Ab urbe condita",
        "workTitleKo": "리비우스 《로마사》 요약",
        "language": "la",
        "languageLabel": "라틴어",
    },
    "polybius": {
        "author": "Polybius",
        "authorKo": "폴리비오스",
        "workTitle": "Ἱστορίαι",
        "workTitleKo": "역사",
        "language": "grc",
        "languageLabel": "고대 그리스어",
    },
}

SKIP_TAGS = {"note", "pb", "fw", "figure", "graphic", "head"}
PREFERRED_CHILDREN = {
    "choice": ("corr", "reg", "expan", "orig", "sic", "abbr"),
    "app": ("lem", "rdg"),
}

CHRONOLOGY = json.loads(CHRONOLOGY_FILE.read_text(encoding="utf-8"))


def chronology_location(value: str) -> tuple[int, int] | None:
    chapter, separator, section = value.partition(".")
    if not separator or not section.isdigit():
        return None
    if chapter == "per":
        return 0, int(section)
    if not chapter.isdigit():
        return None
    return int(chapter), int(section)


def passage_chronology(
    source_id: str, book: int, locations: list[str]
) -> dict[str, Any] | None:
    rules = [
        rule
        for rule in CHRONOLOGY["rules"]
        if rule["sourceId"] == source_id and rule["book"] == book
    ]
    hits = []
    for location in locations:
        current = chronology_location(location)
        if current is None:
            continue
        for rule in rules:
            start = chronology_location(rule["start"])
            end = chronology_location(rule["end"])
            if start is not None and end is not None and start <= current <= end:
                hits.append(rule)
                break
    if not hits:
        return None

    year_start = max(rule["yearStartBce"] for rule in hits)
    year_end = min(rule["yearEndBce"] for rule in hits)
    approximate = any(rule["certainty"] == "approximate" for rule in hits)
    if year_start == year_end:
        label = f"기원전 {year_start}년"
    else:
        label = f"기원전 {year_start}–{year_end}년"
    if approximate:
        label += "경"

    scopes = list(dict.fromkeys(rule["scope"] for rule in hits))
    sources = list(dict.fromkeys(rule["source"] for rule in hits))
    return {
        "label": label,
        "yearStartBce": year_start,
        "yearEndBce": year_end,
        "certainty": (
            "approximate"
            if approximate
            else "exact" if year_start == year_end else "range"
        ),
        "scope": scopes[0] if len(scopes) == 1 else "mixed",
        "basis": "editorial",
        "sourceIds": sources,
    }


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFC", value or "")
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([([{])\s+", r"\1", value)
    value = re.sub(r"\s+([)\]}])", r"\1", value)
    return value


def rendered_text(element: ET.Element) -> str:
    """Return reading text while excluding page furniture and critical notes."""

    def walk(node: ET.Element) -> str:
        name = local_name(node.tag)
        if name in SKIP_TAGS:
            return ""
        if name == "gap":
            return " ⟦…⟧ "
        if name == "space":
            return " "
        if name in PREFERRED_CHILDREN:
            children = list(node)
            for preferred in PREFERRED_CHILDREN[name]:
                selected = next(
                    (child for child in children if local_name(child.tag) == preferred),
                    None,
                )
                if selected is not None:
                    return walk(selected)

        chunks = [node.text or ""]
        for child in node:
            chunks.append(walk(child))
            chunks.append(child.tail or "")
        text = "".join(chunks)
        if name == "hi" and "overline" in str(node.get("rend", "")):
            return "".join(
                f"{character}\u0305" if character.isalnum() else character
                for character in text
            )
        return text

    return normalize(walk(element))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_translations(source_id: str, book: int) -> dict[str, Any]:
    path = TRANSLATIONS / source_id / f"{book:02d}.json"
    if not path.exists():
        return {}
    payload = read_json(path)
    if payload.get("sourceId") != source_id or payload.get("book") != book:
        raise ValueError(f"Translation metadata mismatch: {path}")
    passages = payload.get("passages")
    if not isinstance(passages, dict):
        raise ValueError(f"Translation passages must be an object: {path}")
    return passages


def period_label(source_id: str, book: int) -> str:
    if source_id == "livy":
        if book <= 5:
            return "건국 전승–기원전 390년"
        if book <= 10:
            return "기원전 389–293년"
        if book <= 30:
            return "기원전 218–201년"
        if book <= 40:
            return "기원전 200–179년"
        return "기원전 178–167년"
    if source_id == "periochae":
        if book <= 15:
            return "기원전 292–267년"
        if book <= 20:
            return "기원전 264–219년"
        return "기원전 166–146년"
    if book <= 2:
        return "기원전 264–220년"
    if book <= 5:
        return "기원전 220–216년"
    return "기원전 216–146년 · 부분 보존"


def source_kind(source_id: str, book: int) -> tuple[str, str]:
    if source_id == "periochae":
        return "epitome", "후대 요약"
    if source_id == "polybius" and book == 17:
        return "lost", "본문 소실"
    if source_id == "polybius" and book > 5:
        return "fragment", "부분 보존"
    return "full", "보존 본문"


def make_passage(
    source_id: str,
    book: int,
    chapter: str,
    section_start: str,
    section_end: str,
    section_refs: list[str],
    paragraph: int,
    original: str,
    translations: dict[str, Any],
    chapter_end: str | None = None,
    chapter_refs: list[str] | None = None,
    locations: list[str] | None = None,
) -> dict[str, Any]:
    chapter_end = chapter_end or chapter
    chapter_refs = chapter_refs or [chapter]
    locations = locations or [f"{chapter}.{section}" for section in section_refs]
    section_token = section_start.zfill(3)
    if chapter_end != chapter:
        section_token += f"-to-{chapter_end}-{section_end.zfill(3)}"
    elif section_end != section_start:
        section_token += f"-{section_end.zfill(3)}"
    passage_id = f"{source_id}-{book:02d}-{chapter}-{section_token}"
    translated = translations.get(passage_id, {})
    korean = normalize(str(translated.get("korean", "")))
    chronology = passage_chronology(source_id, book, locations)
    if chapter_end != chapter:
        section_label = f"{chapter}.{section_start}–{chapter_end}.{section_end}"
    else:
        section_label = (
            section_start
            if section_end == section_start
            else f"{section_start}–{section_end}"
        )
    if source_id == "livy":
        ref = (
            f"Liv. {book}.{section_label}"
            if chapter_end != chapter
            else f"Liv. {book}.{chapter}.{section_label}"
        )
    elif source_id == "periochae":
        ref = f"Liv. Per. {book}.{section_label}"
    else:
        ref = (
            f"Polyb. {book}.{section_label}"
            if chapter_end != chapter
            else f"Polyb. {book}.{chapter}.{section_label}"
        )
    passage = {
        "id": passage_id,
        "sourceId": source_id,
        "book": book,
        "chapter": chapter,
        "section": section_start,
        "sectionStart": section_start,
        "sectionEnd": section_end,
        "sectionRefs": section_refs,
        "paragraph": paragraph,
        "ref": ref,
        "original": original,
        "korean": korean,
        "notes": translated.get("notes", []),
        "translationStatus": translated.get(
            "status", "first-pass" if korean else "untranslated"
        ),
        "parallelRefs": translated.get("parallelRefs", []),
    }
    if chapter_end != chapter:
        passage.update(
            {
                "chapterStart": chapter,
                "chapterEnd": chapter_end,
                "chapterRefs": chapter_refs,
                "locations": locations,
            }
        )
    if chronology is not None:
        passage["chronology"] = chronology
    return passage


def closes_sentence(text: str) -> bool:
    closes = bool(re.search(r"[.!?;·][\"'’”»)]?$", text))
    # Perseus occasionally places a section boundary between a Roman
    # praenomen abbreviation and the following nomen (for example
    # ``Sex.</p> ... <p>Furius``).  The full stop belongs to the
    # abbreviation, not to the sentence.
    if re.search(r"\b(?:Cn|Ti|Tib|Sp|Sex|Ser|Ap|Mam|M'|[A-Z])\.$", text):
        return False
    return closes


def group_sections(
    rows: list[tuple[str, str]], target_chars: int = 500
) -> list[list[tuple[str, str]]]:
    """Combine tiny editorial sections into readable, traceable prose blocks."""
    groups: list[list[tuple[str, str]]] = []
    current: list[tuple[str, str]] = []
    current_length = 0
    for section, text in rows:
        current.append((section, text))
        current_length += len(text) + 1
        if current_length >= target_chars and closes_sentence(text):
            groups.append(current)
            current = []
            current_length = 0
    if current:
        groups.append(current)
    return groups


def split_latin_sentences(text: str) -> list[str]:
    marker = "∯"
    text = re.sub(
        r"\b(Cn|Ti|Tib|Sp|Sex|Ser|Ap|Mam)\.",
        rf"\1{marker}",
        text,
        flags=re.I,
    )
    text = re.sub(r"\bM'\.", f"M'{marker}", text, flags=re.I)
    protected = re.sub(r"\b([A-Z])\.", rf"\1{marker}", text)
    abbreviations = (
        "cos|coss|cons|pr|praet|dict|trib|leg|cens|aed|pont|max|"
        "proc|procos|imp|fr|lib|cap|Rom|R"
    )
    protected = re.sub(
        rf"\b({abbreviations})\.", rf"\1{marker}", protected, flags=re.I
    )
    pieces = [
        normalize(piece.replace(marker, "."))
        for piece in re.split(r"(?<=[.!?])\s+", protected)
        if normalize(piece.replace(marker, "."))
    ]
    merged: list[str] = []
    for piece in pieces:
        if merged and len(piece.split()) < 3:
            merged[-1] = normalize(f"{merged[-1]} {piece}")
        else:
            merged.append(piece)
    return merged


def parse_livy_main() -> list[dict[str, Any]]:
    root = ET.parse(RAW / "livy-01-40.xml").getroot()
    books = []
    for book_node in root.iter(TEI + "div"):
        if book_node.get("subtype") != "book":
            continue
        raw_book = str(book_node.get("n", ""))
        if not raw_book.isdigit():
            continue
        book = int(raw_book)
        if book not in (*range(1, 11), *range(21, 46)):
            continue
        translations = load_translations("livy", book)
        passages = []
        for chapter_node in book_node.iter(TEI + "div"):
            if chapter_node.get("subtype") != "chapter":
                continue
            chapter = str(chapter_node.get("n", ""))
            section_rows = []
            for section_node in chapter_node.iter(TEI + "div"):
                if section_node.get("subtype") != "section":
                    continue
                section = str(section_node.get("n", ""))
                original = rendered_text(section_node)
                # Obvious typographical loss in the source transcription;
                # the idiom is ``res aliter longe evenit`` ("things turned
                # out very differently").
                original = original.replace(
                    "res liter longe evenit", "res aliter longe evenit"
                )
                original = original.replace(" | ", " ⟦…⟧ ")
                if not original:
                    continue
                section_rows.append((section, original))
            for group in group_sections(section_rows):
                section_refs = [section for section, _ in group]
                passages.append(
                    make_passage(
                        "livy",
                        book,
                        chapter,
                        section_refs[0],
                        section_refs[-1],
                        section_refs,
                        len(passages) + 1,
                        normalize(" ".join(text for _, text in group)),
                        translations,
                    )
                )
        books.append(build_book("livy", book, passages, translations))
    return books


def parse_periochae() -> list[dict[str, Any]]:
    books = []
    for book in range(11, 21):
        main_root = ET.parse(RAW / f"periocha-{book}.xml").getroot()
        book_node = next(
            node
            for node in main_root.iter(TEI + "div")
            if node.get("type") == "book" and node.get("n") == f"{book}s"
        )
        books.append(parse_periocha_book(book, book_node))

    late_root = ET.parse(RAW / "livy-periochae-46-142.xml").getroot()
    for book in range(46, 53):
        book_node = next(
            node
            for node in late_root.iter(TEI + "div")
            if node.get("type") == "book" and node.get("n") == str(book)
        )
        books.append(parse_periocha_book(book, book_node))
    return books


def parse_periocha_book(book: int, book_node: ET.Element) -> dict[str, Any]:
    translations = load_translations("periochae", book)
    text = " ".join(
        rendered_text(paragraph) for paragraph in book_node.iter(TEI + "p")
    )
    text = re.sub(r"\btune\b", "tunc", text)
    text = re.sub(r"\blaniculum\b", "Ianiculum", text)
    text = text.replace("quererelitur", "quererentur")
    text = text.replace("Pyrrhuis", "Pyrrhus")
    text = re.sub(r"\bhosted\b", "hostem", text)
    text = text.replace("sortis ultimate", "sortis ultimae")
    text = text.replace("pbstea", "postea")
    text = text.replace("Calatinns", "Calatinus")
    text = text.replace("'in urbe", "in urbe")
    text = text.replace("viam Flaminius", "viam Flaminiam")
    text = text.replace("dicit Exercitibus", "dicit. Exercitibus")
    text = text.replace("missis ad cum legatis", "missis ad eum legatis")
    text = text.replace("Carthaginiensibus festiorem", "Carthaginiensibus infestiorem")
    text = text.replace("parturum se iudicio", "pariturum se iudicio")
    text = text.replace("aeris decus", "aeris decem")
    text = text.replace("in relicum funus", "in reliquum funus")
    text = text.replace("exceptaturum se militiae", "excepturum se militiae")
    text = text.replace("in circuitum XXIII passuum", "in circuitum XXIII milia passuum")
    text = text.replace("**", "")
    text = text.replace("*", " ⟦…⟧ ")
    sentences = split_latin_sentences(normalize(text))
    passages = [
        make_passage(
            "periochae",
            book,
            "per",
            str(index),
            str(index),
            [str(index)],
            index,
            sentence,
            translations,
        )
        for index, sentence in enumerate(sentences, start=1)
    ]
    return build_book("periochae", book, passages, translations)


def parse_polybius() -> list[dict[str, Any]]:
    root = ET.parse(RAW / "polybius-histories.xml").getroot()
    books = []
    for book_node in root.iter(TEI + "div"):
        if book_node.get("subtype") != "book":
            continue
        raw_book = str(book_node.get("n", ""))
        if not raw_book.isdigit():
            continue
        book = int(raw_book)
        translations = load_translations("polybius", book)
        chapter_groups: list[list[tuple[str, str, str]]] = []
        for chapter_node in book_node.iter(TEI + "div"):
            if chapter_node.get("subtype") != "chapter":
                continue
            chapter = str(chapter_node.get("n", ""))
            section_rows = []
            for section_node in chapter_node.iter(TEI + "div"):
                if section_node.get("subtype") != "section":
                    continue
                section = str(section_node.get("n", ""))
                original = rendered_text(section_node)
                # The source XML breaks ἐξίκοντο, together with the rest of
                # its clause, across the artificial 1.3/1.4 chapter boundary.
                # Restore the word and keep the complete clause in 1.3.10.
                if book == 1 and chapter == "3" and section == "10":
                    original += "ίκοντο τῆς τῶν ὅλων ἀρχῆς καὶ δυναστείας."
                if book == 1 and chapter == "4" and section == "1":
                    original = re.sub(
                        r"^ίκοντο τῆς τῶν ὅλων ἀρχῆς καὶ δυναστείας\.\s*",
                        "",
                        original,
                    )
                if not original:
                    continue
                section_rows.append((section, original))
            for group in group_sections(section_rows):
                chapter_groups.append(
                    [(chapter, section, text) for section, text in group]
                )

        # Book I's CTS transcription frequently places an editorial chapter
        # boundary in the middle of Polybius' sentence, and occasionally in
        # the middle of a Greek word. Preserve every CTS location but expose
        # one continuous reading passage instead of two dangling fragments.
        # Later books receive the same treatment only after their boundaries
        # have been audited, so an uncertain word join is never guessed.
        merged_groups: list[list[tuple[str, str, str]]] = []
        for group in chapter_groups:
            crosses_chapter = (
                book == 1
                and merged_groups
                and merged_groups[-1][-1][0] != group[0][0]
            )
            if crosses_chapter and not closes_sentence(merged_groups[-1][-1][2]):
                merged_groups[-1].extend(group)
            else:
                merged_groups.append(group)

        word_joins = {
            (1, "8", "5", "9", "1"),
            (1, "20", "16", "21", "1"),
            (1, "22", "11", "23", "1"),
            (1, "25", "9", "26", "1"),
            (1, "27", "13", "28", "1"),
            (1, "36", "12", "37", "1"),
            (1, "44", "7", "45", "1"),
            (1, "49", "12", "50", "1"),
            (1, "56", "11", "57", "1"),
            (1, "60", "10", "61", "1"),
            (1, "66", "12", "67", "1"),
            (1, "70", "9", "71", "1"),
            (1, "71", "8", "72", "1"),
            (1, "73", "7", "74", "1"),
            (1, "79", "14", "80", "1"),
        }
        passages = []
        for group in merged_groups:
            original = group[0][2]
            for previous, current in zip(group, group[1:]):
                key = (book, previous[0], previous[1], current[0], current[1])
                separator = "" if key in word_joins else " "
                original += separator + current[2]
            chapter_refs = list(dict.fromkeys(chapter for chapter, _, _ in group))
            section_refs = [section for _, section, _ in group]
            locations = [f"{chapter}.{section}" for chapter, section, _ in group]
            passages.append(
                make_passage(
                    "polybius",
                    book,
                    group[0][0],
                    group[0][1],
                    group[-1][1],
                    section_refs,
                    len(passages) + 1,
                    normalize(original),
                    translations,
                    chapter_end=group[-1][0],
                    chapter_refs=chapter_refs,
                    locations=locations,
                )
            )
        books.append(build_book("polybius", book, passages, translations))
    return books


def build_book(
    source_id: str,
    book: int,
    passages: list[dict[str, Any]],
    translations: dict[str, Any],
) -> dict[str, Any]:
    known_ids = {passage["id"] for passage in passages}
    unknown = sorted(set(translations) - known_ids)
    if unknown:
        raise ValueError(
            f"Unknown translation IDs for {source_id} {book}: {', '.join(unknown)}"
        )
    kind, preservation = source_kind(source_id, book)
    meta = SOURCE_META[source_id]
    chapters = []
    seen = set()
    for passage in passages:
        for chapter in passage.get("chapterRefs", [passage["chapter"]]):
            if chapter not in seen:
                seen.add(chapter)
                chapters.append(chapter)
    return {
        **meta,
        "sourceId": source_id,
        "book": book,
        "bookLabel": f"제{book}권",
        "sourceKind": kind,
        "preservationLabel": preservation,
        "periodLabel": period_label(source_id, book),
        "chapterCount": len(chapters),
        "passageCount": len(passages),
        "translationCount": sum(bool(passage["korean"]) for passage in passages),
        "chapters": chapters,
        "passages": passages,
    }


def validate_sources(source_manifest: dict[str, Any]) -> None:
    for source in source_manifest["sources"]:
        path = ROOT / source["localFile"]
        if not path.is_file():
            raise FileNotFoundError(path)
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != source["sha256"]:
            raise ValueError(f"Source hash mismatch: {source['id']}")


def validate_chronology() -> None:
    errors = []
    grouped: dict[tuple[str, int], list[tuple[tuple[int, int], tuple[int, int]]]] = {}
    for rule in CHRONOLOGY["rules"]:
        start = chronology_location(rule["start"])
        end = chronology_location(rule["end"])
        key = (rule["sourceId"], rule["book"])
        if start is None or end is None or start > end:
            errors.append(f"Bad chronology location: {key} {rule['start']}–{rule['end']}")
            continue
        if rule["yearStartBce"] < rule["yearEndBce"]:
            errors.append(f"Reversed BCE range: {key} {rule['start']}–{rule['end']}")
        if rule["source"] not in CHRONOLOGY["sources"]:
            errors.append(f"Unknown chronology source: {rule['source']}")
        for existing_start, existing_end in grouped.setdefault(key, []):
            if max(start, existing_start) <= min(end, existing_end):
                errors.append(f"Overlapping chronology rules: {key} {rule['start']}")
        grouped[key].append((start, end))
    if errors:
        raise ValueError("\n".join(errors))


def validate_corpus(corpus: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    errors = []
    ids = set()
    for source_id, expected_books in EXPECTED.items():
        books = corpus[source_id]
        if len(books) != expected_books:
            errors.append(
                f"{source_id}: expected {expected_books} books, found {len(books)}"
            )
        for book in books:
            if not book["passages"] and not (
                source_id == "polybius" and book["book"] == 17
            ):
                errors.append(f"Empty volume: {source_id} {book['book']}")
            for passage in book["passages"]:
                if passage["id"] in ids:
                    errors.append(f"Duplicate passage ID: {passage['id']}")
                ids.add(passage["id"])
                if not passage["original"]:
                    errors.append(f"Empty original: {passage['id']}")
                if passage["translationStatus"] not in {
                    "untranslated",
                    "first-pass",
                    "reviewed",
                }:
                    errors.append(f"Bad translation status: {passage['id']}")
                for note in passage["notes"]:
                    if not isinstance(note, dict) or not note.get("text"):
                        errors.append(f"Malformed note: {passage['id']}")
    if errors:
        raise ValueError("\n".join(errors))

    books = sum(len(rows) for rows in corpus.values())
    passages = sum(
        book["passageCount"] for rows in corpus.values() for book in rows
    )
    translated = sum(
        book["translationCount"] for rows in corpus.values() for book in rows
    )
    words = sum(
        len(passage["original"].split())
        for rows in corpus.values()
        for book in rows
        for passage in book["passages"]
    )
    return {
        "collections": len(corpus),
        "books": books,
        "passages": passages,
        "originalWords": words,
        "translatedPassages": translated,
    }


def main() -> None:
    source_manifest = read_json(SOURCE_MANIFEST)
    validate_sources(source_manifest)
    validate_chronology()
    corpus = {
        "livy": parse_livy_main(),
        "periochae": parse_periochae(),
        "polybius": parse_polybius(),
    }
    stats = validate_corpus(corpus)

    if BOOKS_OUTPUT.exists():
        shutil.rmtree(BOOKS_OUTPUT)
    if SEARCH_OUTPUT.exists():
        shutil.rmtree(SEARCH_OUTPUT)
    BOOKS_OUTPUT.mkdir(parents=True)
    SEARCH_OUTPUT.mkdir(parents=True)

    collections = []
    for source_id, books in corpus.items():
        volumes = []
        search_rows = []
        for book in books:
            relative = f"data/books/{source_id}/{book['book']:02d}.json"
            write_json(OUTPUT / relative[len("data/"):], book)
            volume = {
                key: book[key]
                for key in (
                    "sourceId",
                    "book",
                    "bookLabel",
                    "sourceKind",
                    "preservationLabel",
                    "periodLabel",
                    "chapterCount",
                    "passageCount",
                    "translationCount",
                )
            }
            volume["path"] = relative
            volumes.append(volume)
            search_rows.extend(
                {
                    "id": passage["id"],
                    "book": book["book"],
                    "ref": passage["ref"],
                    "chapter": passage["chapter"],
                    "section": passage["section"],
                    "sectionEnd": passage["sectionEnd"],
                    "original": passage["original"],
                    "korean": passage["korean"],
                }
                for passage in book["passages"]
            )
        write_json(SEARCH_OUTPUT / f"{source_id}.json", search_rows)
        collections.append(
            {
                **SOURCE_META[source_id],
                "id": source_id,
                "bookCount": len(books),
                "passageCount": sum(book["passageCount"] for book in books),
                "translationCount": sum(
                    book["translationCount"] for book in books
                ),
                "searchPath": f"data/search/{source_id}.json",
                "volumes": volumes,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "title": "로마사 원전 읽기",
        "subtitle": "리비우스 · 페리오카이 · 폴리비오스",
        "stats": stats,
        "timeline": TIMELINE,
        "chronology": {
            "method": CHRONOLOGY["method"],
            "sources": CHRONOLOGY["sources"],
        },
        "collections": collections,
        "sources": source_manifest,
    }
    write_json(OUTPUT / "manifest.json", manifest)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"build_data.py: {error}", file=sys.stderr)
        raise
