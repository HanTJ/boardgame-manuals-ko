#!/usr/bin/env python3
"""Small dependency-free validator for the static manual archive."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_GAME_MARKERS = (
    "비공식",
    "출처",
    "게임 목표",
    "게임 종료",
)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()
        self.has_lang_ko = False
        self.has_viewport = False
        self.has_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "html" and data.get("lang") == "ko":
            self.has_lang_ko = True
        if tag == "meta" and data.get("name") == "viewport":
            self.has_viewport = True
        if tag == "title":
            self.has_title = True
        if data.get("id"):
            self.ids.add(data["id"] or "")
        for key in ("href", "src"):
            if data.get(key):
                self.links.append(data[key] or "")


def target_path(html: Path, link: str) -> tuple[Path, str]:
    parsed = urlparse(link)
    raw_path = unquote(parsed.path)
    target = html.parent / raw_path
    if not raw_path:
        target = html
    if raw_path.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target.resolve(), unquote(parsed.fragment)


def main() -> int:
    errors: list[str] = []
    html_files = sorted(ROOT.rglob("*.html"))
    if not html_files:
        errors.append("No HTML files found")

    parsed: dict[Path, LinkParser] = {}
    for html in html_files:
        text = html.read_text(encoding="utf-8")
        parser = LinkParser()
        parser.feed(text)
        parsed[html.resolve()] = parser
        if not parser.has_lang_ko:
            errors.append(f"{html.relative_to(ROOT)}: missing lang=ko")
        if not parser.has_viewport:
            errors.append(f"{html.relative_to(ROOT)}: missing viewport meta")
        if not parser.has_title:
            errors.append(f"{html.relative_to(ROOT)}: missing title")
        if html.parent.parent.name == "games":
            for marker in REQUIRED_GAME_MARKERS:
                if marker not in text:
                    errors.append(f"{html.relative_to(ROOT)}: missing required marker {marker!r}")

    for html, parser in parsed.items():
        for link in parser.links:
            if link.startswith(("http://", "https://", "mailto:", "tel:", "javascript:")):
                continue
            target, fragment = target_path(html, link)
            try:
                target.relative_to(ROOT)
            except ValueError:
                errors.append(f"{html.relative_to(ROOT)}: link escapes root: {link}")
                continue
            if not target.exists():
                errors.append(f"{html.relative_to(ROOT)}: broken link: {link}")
                continue
            if fragment and target.suffix == ".html":
                target_parser = parsed.get(target)
                if target_parser is None:
                    target_parser = LinkParser()
                    target_parser.feed(target.read_text(encoding="utf-8"))
                if fragment not in target_parser.ids:
                    errors.append(f"{html.relative_to(ROOT)}: missing fragment #{fragment}")

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Validated {len(html_files)} HTML files; internal links and required metadata are OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
