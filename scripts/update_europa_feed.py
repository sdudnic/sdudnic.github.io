"""Refresh the multilingual Europa news snapshot from public RSS search feeds.

The site is hosted as static files, so this script runs in GitHub Actions once a
day. It deliberately keeps the last valid snapshot when one of the language
feeds is unavailable or returns too few relevant items.
"""

from __future__ import annotations

import email.utils
import difflib
import html
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_data" / "europa_auto.yml"
USER_AGENT = "dudnic.com Europa feed updater/1.0 (+https://dudnic.com)"
MIN_ITEMS = 10
MAX_ITEMS = 20
MAX_AGE = timedelta(days=365)
FETCH_TIMEOUT = 15

LOCALE_SETTINGS = {
    "mo": {"hl": "ro-MD", "gl": "MD", "ceid": "MD:ro", "queries": [
        "Moldova UE integrare",
        "Moldova aderare Uniunea Europeană",
        "Moldova integrare europeană",
    ]},
    "en": {"hl": "en-US", "gl": "US", "ceid": "US:en", "queries": [
        "Moldova EU integration",
        "Moldova EU accession",
        "Moldova European Union reforms",
    ]},
    "fr": {"hl": "fr-FR", "gl": "FR", "ceid": "FR:fr", "queries": [
        "Moldova intégration Union européenne",
        "Moldavie adhésion UE",
        "Moldova réformes européennes",
    ]},
    "ru": {"hl": "ru-RU", "gl": "MD", "ceid": "MD:ru", "queries": [
        "Молдова интеграция ЕС",
        "Молдова вступление в Евросоюз",
        "Молдова европейские реформы",
    ]},
}

MOLDOVA_TERMS = (
    "moldova",
    "moldavie",
    "молдов",
)
EU_TERMS = (
    "eu",
    "european union",
    "union européenne",
    "union europeenne",
    "uniunea europeană",
    "uniunea europeana",
    "uniunea europeană",
    "aderare",
    "adhésion",
    "adhesion",
    "accession",
    "integrare",
    "integration",
    "intégration",
    "интеграц",
    "вступлен",
    "евросоюз",
    "европейск",
)

FALLBACK_SUMMARY = {
    "mo": "Notă externă despre Moldova și apropierea de Uniunea Europeană.",
    "en": "External note about Moldova and its approach to the European Union.",
    "fr": "Note externe sur la Moldova et son rapprochement avec l’Union européenne.",
    "ru": "Внешняя заметка о Молдове и её сближении с Европейским союзом.",
}


def google_news_url(query: str, settings: dict[str, object]) -> str:
    params = {
        "q": query,
        "hl": settings["hl"],
        "gl": settings["gl"],
        "ceid": settings["ceid"],
    }
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(params)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
        return response.read()


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def child_text(element: ET.Element, name: str) -> str:
    child = element.find(name)
    return clean_text("" if child is None else "".join(child.itertext()))


def parse_date(value: str) -> datetime:
    if value:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            pass
    return datetime.now(timezone.utc)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9а-яё]+", " ", value).strip()


def relevant(title: str, summary: str) -> bool:
    haystack = normalize(f"{title} {summary}")
    return any(term in haystack for term in MOLDOVA_TERMS) and any(
        term in haystack for term in EU_TERMS
    )


def too_similar(candidate: str, previous: list[str]) -> bool:
    return any(
        difflib.SequenceMatcher(None, candidate, existing).ratio() >= 0.86
        for existing in previous
    )


def source_name(item: ET.Element, link: str) -> str:
    source = item.find("source")
    if source is not None and clean_text("".join(source.itertext())):
        return clean_text("".join(source.itertext()))
    host = urllib.parse.urlparse(link).netloc
    return host.removeprefix("www.") or "Sursă externă"


def collect(locale: str) -> list[dict[str, str]]:
    settings = LOCALE_SETTINGS[locale]
    now = datetime.now(timezone.utc)
    entries: list[dict[str, str | datetime]] = []
    seen: set[str] = set()
    seen_titles: list[str] = []

    feed_urls = [google_news_url(query, settings) for query in settings["queries"]]
    roots: list[tuple[str, ET.Element]] = []
    with ThreadPoolExecutor(max_workers=len(feed_urls)) as executor:
        pending = {executor.submit(fetch, feed_url): feed_url for feed_url in feed_urls}
        for future in as_completed(pending):
            feed_url = pending[future]
            try:
                roots.append((feed_url, ET.fromstring(future.result())))
            except (OSError, ET.ParseError) as error:
                print(f"[{locale}] feed unavailable: {feed_url} ({error})", file=sys.stderr)

    for _, root in roots:
        for item in root.findall("./channel/item"):
            title = child_text(item, "title")
            summary = child_text(item, "description")
            source = source_name(item, child_text(item, "link"))
            published = parse_date(child_text(item, "pubDate"))
            raw_link = child_text(item, "link")
            if not title or not raw_link or published < now - MAX_AGE:
                continue
            if not relevant(title, summary):
                continue

            source_suffix = f" - {source}"
            if title.endswith(source_suffix):
                title = title[: -len(source_suffix)].rstrip()
            if summary.endswith(source_suffix):
                summary = summary[: -len(source_suffix)].rstrip()
            key = normalize(title)
            if not key or key in seen or too_similar(key, seen_titles):
                continue
            seen.add(key)
            seen_titles.append(key)

            entries.append({
                "date": published.strftime("%Y-%m-%d"),
                "sort_date": published,
                "source": source,
                "url": raw_link,
                "title": title,
                "summary": (summary[:360].rstrip() + "…") if len(summary) > 360 else (summary or FALLBACK_SUMMARY[locale]),
            })

    entries.sort(key=lambda entry: entry["sort_date"], reverse=True)
    return [
        {key: value for key, value in entry.items() if key != "sort_date"}
        for entry in entries[:MAX_ITEMS]
    ]


def yaml_string(value: str) -> str:
    value = str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return f'"{value}"'


def write_snapshot(feeds: dict[str, list[dict[str, str]]]) -> None:
    lines = [
        "# Generated by scripts/update_europa_feed.py; do not edit by hand.",
        f"updated_at: {yaml_string(datetime.now(timezone.utc).isoformat())}",
    ]
    for locale in ("mo", "en", "fr", "ru"):
        lines.append(f"{locale}:")
        for item in feeds[locale]:
            lines.append(f"  - date: {yaml_string(item['date'])}")
            lines.append(f"    source: {yaml_string(item['source'])}")
            lines.append(f"    url: {yaml_string(item['url'])}")
            lines.append(f"    title: {yaml_string(item['title'])}")
            lines.append(f"    summary: {yaml_string(item['summary'])}")
        lines.append("")
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    feeds: dict[str, list[dict[str, str]]] = {}
    for locale in ("mo", "en", "fr", "ru"):
        feeds[locale] = collect(locale)
        print(f"[{locale}] collected {len(feeds[locale])} relevant notes")
        if len(feeds[locale]) < MIN_ITEMS:
            print(
                f"[{locale}] fewer than {MIN_ITEMS} notes; keeping the last valid snapshot",
                file=sys.stderr,
            )
            return 0

    write_snapshot(feeds)
    print(f"Wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
