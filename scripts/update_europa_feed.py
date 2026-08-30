"""Refresh the Moldovan-language and English Europa news snapshot from public RSS search feeds.

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
# A smaller safety floor lets the feed publish a short, genuinely distinct
# list instead of keeping an older snapshot full of repeated stories.
MIN_ITEMS = 5
MAX_ITEMS = 20
# Keep only titles that are at least 75% different from titles already
# selected for the same language. This prevents the feed from repeating the
# same event from several news outlets with slightly different wording.
MIN_TITLE_DIFFERENCE = 0.75
MAX_TITLE_SIMILARITY = 1 - MIN_TITLE_DIFFERENCE
MAX_AGE = timedelta(days=365)
FETCH_TIMEOUT = 15

# These words identify the common feed context rather than the event itself.
# Removing them before comparing titles avoids treating every Moldova–EU
# headline as the same story merely because it mentions the feed topic.
TITLE_CONTEXT_TERMS = {
    "a", "al", "ale", "an", "and", "are", "as", "au", "avec", "ce", "cu",
    "de", "des", "despre", "din", "do", "du", "e", "en", "et", "eu", "europe",
    "european", "europeana", "europene", "for", "from", "in", "la", "le", "les",
    "moldav", "moldava", "moldavie", "moldova", "moldovei", "moldovean",
    "moldovenesc", "of", "on", "pe", "pour", "republica", "republicii", "s",
    "sa", "si", "the", "to", "ue", "un", "une", "uniunea", "union", "with",
    "și", "şi", "iar", "întru", "ес", "европа", "европейский", "евросоюз",
    "молдова", "молдов",
}

# Normalize inflected forms before comparing titles. This catches the same
# event when one outlet writes “clusterul” and another writes “cluster”, or
# “deschise” and “deschiderea”.
TITLE_TERM_ALIASES = {
    "deschis": "deschide",
    "deschise": "deschide",
    "deschiderea": "deschide",
    "deschiderii": "deschide",
    "opened": "open",
    "opens": "open",
    "opening": "open",
    "ouvre": "ouvrir",
    "ouvert": "ouvrir",
    "ouverte": "ouvrir",
    "открыла": "открыть",
    "открыл": "открыть",
    "открыли": "открыть",
    "открыт": "открыть",
    "открывает": "открыть",
    "negocieri": "negociere",
    "negocierile": "negociere",
    "negocierilor": "negociere",
    "negotiations": "negotiation",
    "negociations": "negociation",
    "переговоры": "переговор",
    "переговоров": "переговор",
    "clusterul": "cluster",
    "clusterului": "cluster",
    "clustere": "cluster",
    "кластеру": "кластер",
    "кластером": "кластер",
    "кластера": "кластер",
    "capitole": "capitol",
    "capitolelor": "capitol",
    "capitolele": "capitol",
    "chapters": "chapter",
    "primul": "prim",
    "primului": "prim",
    "first": "first",
    "первый": "перв",
    "externe": "extern",
    "external": "extern",
    "exterieures": "exterieur",
    "exterieure": "exterieur",
    "внешние": "внеш",
    "внешней": "внеш",
    "внешних": "внеш",
    "внешнюю": "внеш",
    "aderarii": "aderare",
    "accession": "accession",
    "adhesion": "adhesion",
    "вступление": "вступ",
    "вступления": "вступ",
}

LOCALE_SETTINGS = {
    "mo": {"hl": "ro-MD", "gl": "MD", "ceid": "MD:ro", "queries": [
        "Moldova UE semnat",
        "Moldova UE intrat în vigoare",
        "Moldova UE deschide negocieri",
        "Moldova UE plată finanțare",
        "Moldova a aderat program UE",
    ]},
    "en": {"hl": "en-US", "gl": "US", "ceid": "US:en", "queries": [
        "Moldova EU signed",
        "Moldova EU entered into force",
        "Moldova EU opened negotiations",
        "Moldova EU disbursed funding",
        "Moldova joined EU programme",
    ]},
}

MOLDOVA_TERMS = (
    "moldova",
    "moldov",
    "moldavie",
    "moldav",
    "молдов",
)
EU_TERMS = (
    "eu",
    "ue",
    "ес",
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

# These names cover the requested broadcasters and common variants of the
# same public-broadcasting brands. They are filtered by source, not by an
# article's subject, so a factual note from another outlet can still pass.
EXCLUDED_SOURCE_TERMS = (
    "tvr moldova",
    "tvrmoldova",
    "tvr info",
    "tvrinfo",
    "moldova 1",
    "moldova1",
    "pro tv",
    "protv",
    "radio moldova",
)

# The feed must not reproduce statements or promotion centered on political
# figures. Sandu is listed separately because the requirement explicitly
# excludes references to the president; the other terms remove headline-level
# political promotion and empty official messaging.
EXCLUDED_PERSON_TERMS = (
    "maia",
    "sandu",
    "presedinta moldovei",
    "president of moldova",
    "presidente de moldova",
    "president de moldavie",
    "президент молдовы",
    "grosu",
    "tofan",
    "tomac",
    "recean",
    "kos",
)

POLITICAL_HEADLINE_TERMS = (
    "presedint",
    "president",
    "presidente",
    "prim ministr",
    "prime minister",
    "ministr",
    "minister",
    "ambasador",
    "ambassador",
    "deputat",
    "deputy",
    "премьер",
    "министр",
    "посол",
    "депутат",
)

# These cues identify plans, forecasts, declarations and requests rather than
# results already completed. They are checked in both title and description.
INTENT_TERMS = (
    "isi propune",
    "isi propun",
    "intentioneaza",
    "intentie",
    "va semna",
    "vor semna",
    "va fi",
    "va",
    "vor",
    "ar putea",
    "ar urma",
    "urmeaza sa",
    "spera",
    "promite",
    "declara",
    "declaratie",
    "declaratii",
    "declaratia",
    "declarative",
    "discurs",
    "interviu",
    "spune",
    "spun",
    "a spus",
    "a declarat",
    "anunta",
    "anunt",
    "obiectiv",
    "prioritati",
    "vrea",
    "vor sa",
    "plans to",
    "plan to",
    "aims to",
    "intends to",
    "will sign",
    "will open",
    "will join",
    "will",
    "to be signed",
    "is expected",
    "hopes",
    "promises",
    "says",
    "said",
    "statement",
    "speech",
    "interview",
    "objective",
    "priorities",
    "agenda",
    "bid",
    "backs",
    "pave the way",
    "towards membership",
    "launches call",
    "association programme",
    "proposes",
    "proposed",
    "wants",
    "could",
    "would",
    "should",
    "calls for",
    "urges",
    "demands",
    "appeals",
    "souhaite",
    "souhaitent",
    "prevoit",
    "espere",
    "promet",
    "declaration",
    "declarations",
    "declaration",
    "announces",
    "announced",
    "welcomes",
    "welcomed",
    "discours",
    "entretien",
    "objectif",
    "priorites",
    "pourrait",
    "devrait",
    "va signer",
    "va ouvrir",
    "doit",
    "sera",
    "va etre",
    "propose",
    "proposent",
    "veut",
    "envisage",
    "appelle",
    "demande",
    "annonce",
    "salue",
    "saluent",
    "reprise",
    "deschide calea",
    "relua",
    "reluarea",
    "намерен",
    "намерена",
    "планирует",
    "собирается",
    "будет",
    "будут",
    "надеется",
    "обещает",
    "заявил",
    "заявила",
    "заявление",
    "деклараци",
    "декларация",
    "декларации",
    "декларацию",
    "объявил",
    "объявила",
    "объявление",
    "поддержал",
    "программа ассоциации",
    "программу ассоциации",
    "вступают в силу со",
    "начнут",
    "начнет",
    "выступление",
    "интервью",
    "цель",
    "приоритет",
    "может получить",
    "может",
    "должен",
    "предлагает",
    "хочет",
    "призывает",
    "требует",
    "обращается",
)

QUESTION_TERMS = (
    "why",
    "what",
    "how",
    "pourquoi",
    "comment",
    "quel",
    "quelle",
    "quelles",
    "почему",
    "зачем",
    "как",
    "что означает",
    "ce que",
    "ce qui",
)

# At least one of these terms must occur in the title. A concrete action in
# the title is the primary guard against turning the page into a stream of
# intentions, opinions or promises.
FACT_TERMS = (
    "semnat",
    "semneaza",
    "semnarea",
    "intrat in vigoare",
    "intra in vigoare",
    "intrat",
    "vigoare",
    "deschide",
    "deschis",
    "lansat",
    "lansata",
    "adoptat",
    "aprobat",
    "ratificat",
    "deblocat",
    "deblocheaza",
    "debloque",
    "plata",
    "platit",
    "acordat",
    "primit",
    "implementat",
    "finalizat",
    "incheiat",
    "operational",
    "aderat",
    "adera",
    "devine",
    "prelungeste",
    "prelungit",
    "extinde",
    "extins",
    "aplicat",
    "livrat",
    "transferat",
    "convenit",
    "semne",
    "signe",
    "signes",
    "signer",
    "entre en vigueur",
    "entree en vigueur",
    "entree",
    "vigueur",
    "ouvre",
    "ouvert",
    "entame",
    "franchit",
    "franchissent",
    "devient",
    "adhere",
    "lance",
    "lancee",
    "adopte",
    "approuve",
    "ratifie",
    "verse",
    "versement",
    "recu",
    "rejoint",
    "etendu",
    "etendus",
    "applique",
    "fonctionne",
    "livre",
    "transfere",
    "mis en oeuvre",
    "acheve",
    "conclu",
    "operationnel",
    "prolonge",
    "prelungeste",
    "prelungit",
    "extended",
    "extends",
    "signed",
    "signs",
    "entered into force",
    "enters into force",
    "entered",
    "opened",
    "opens",
    "launched",
    "launches",
    "adopted",
    "approved",
    "ratified",
    "disbursed",
    "paid",
    "received",
    "awarded",
    "implemented",
    "completed",
    "finalized",
    "concluded",
    "operational",
    "joined",
    "unlocked",
    "enters",
    "becomes",
    "adheres",
    "accedes",
    "extended",
    "effective",
    "took effect",
    "подписан",
    "подписала",
    "подписали",
    "подписана",
    "подписание",
    "вступил в силу",
    "вступили в силу",
    "вступило в силу",
    "открыты",
    "открыла",
    "открыл",
    "открыли",
    "начали",
    "начала",
    "начат",
    "запущен",
    "принят",
    "одобрен",
    "ратифицирован",
    "выплачен",
    "выплатила",
    "выплатил",
    "выплатили",
    "получил",
    "получила",
    "получили",
    "присоединилась",
    "подключилась",
    "перешла",
    "реализован",
    "завершен",
    "завершила",
    "заключен",
    "введен в действие",
    "заработал",
    "действует",
    "действуют",
    "вошла",
    "вошел",
    "разблокировала",
    "разблокировал",
    "утвердил",
    "утвержден",
    "применяется",
    "вступают в силу",
    "стала",
    "продлил",
    "продлевает",
    "продлен",
)

FALLBACK_SUMMARY = {
    "mo": "Notă externă despre Moldova și apropierea de Uniunea Europeană.",
    "en": "External note about Moldova and its approach to the European Union.",
}

CURATED_FACTS = [
    {
        "date": "2026-07-14",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/enlargement-eu-and-moldova-start-negotiations-external-relations-policies-2026-07-14_en",
        "mo_title": "Moldova deschide negocierile pentru clusterul Relații externe",
        "mo_summary": "UE și Moldova au deschis negocierile pentru clusterul 6, care acoperă comerțul, relațiile externe, securitatea și apărarea.",
        "en_title": "Moldova opens negotiations on the External relations cluster",
        "en_summary": "The EU and Moldova opened negotiations on Cluster 6, covering trade, external relations, security and defence.",
    },
    {
        "date": "2026-06-22",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/eu-moldova-summit-brussels-marks-new-milestone-path-eu-membership-2026-06-22_en",
        "mo_title": "Moldova a deblocat aproximativ 504 milioane de euro din Planul de creștere al UE",
        "mo_summary": "Comisia Europeană consemnează deblocarea a aproximativ 504 milioane de euro din facilitatea UE pentru Moldova.",
        "en_title": "Moldova has unlocked approximately €504 million under the EU Growth Plan",
        "en_summary": "The European Commission records that Moldova has unlocked approximately €504 million under the EU facility.",
    },
    {
        "date": "2026-06-15",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/enlargement-eu-and-moldova-reach-milestone-accession-talks-opening-first-negotiation-cluster-2026-06-15_en",
        "mo_title": "Moldova deschide primul cluster de negocieri, Fundamente",
        "mo_summary": "UE și Moldova au deschis primul cluster al negocierilor de aderare, dedicat fundamentelor procesului.",
        "en_title": "Moldova opens the first accession negotiation cluster, Fundamentals",
        "en_summary": "The EU and Moldova opened the first accession negotiation cluster, covering the fundamentals of the process.",
    },
    {
        "date": "2026-04-21",
        "source": "Consiliul UE",
        "url": "https://www.consilium.europa.eu/en/press/press-releases/2026/04/21/republic-of-moldova-eu-restrictive-measures-extended-until-april-2027/",
        "mo_title": "UE a prelungit măsurile restrictive pentru Moldova până în aprilie 2027",
        "mo_summary": "Consiliul UE a prelungit până la 29 aprilie 2027 măsurile restrictive împotriva acțiunilor de destabilizare a Moldovei.",
        "en_title": "The EU extended restrictive measures concerning Moldova until April 2027",
        "en_summary": "The Council of the EU extended restrictive measures concerning destabilising actions against Moldova until 29 April 2027.",
    },
    {
        "date": "2026-03-17",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/commission-delivers-additional-eu189-million-under-reform-and-growth-facility-moldova-2026-03-17_en",
        "mo_title": "Comisia Europeană a plătit încă 189 de milioane de euro Moldovei",
        "mo_summary": "Comisia Europeană a efectuat o plată suplimentară de 189 de milioane de euro după evaluarea rezultatelor de reformă.",
        "en_title": "The European Commission paid another €189 million to Moldova",
        "en_summary": "The European Commission made an additional €189 million payment after assessing completed reform results.",
    },
    {
        "date": "2026-01-05",
        "source": "Comisia Europeană — Digital Strategy",
        "url": "https://digital-strategy.ec.europa.eu/en/news/roaming-now-fully-operational-moldova",
        "mo_title": "Regimul Roam Like at Home este pe deplin operațional în Moldova",
        "mo_summary": "De la 1 ianuarie 2026, regimul european de roaming la tarife interne se aplică între Moldova și statele UE.",
        "en_title": "Roam Like at Home is fully operational in Moldova",
        "en_summary": "From 1 January 2026, the EU roaming regime at domestic prices applies between Moldova and EU member states.",
    },
    {
        "date": "2026-01-05",
        "source": "Comisia Europeană — Culture and Creativity",
        "url": "https://culture.ec.europa.eu/fr/news/moldova-officially-joins-creative-europe?etrans=ro",
        "mo_title": "Moldova a aderat oficial la programul Europa Creativă",
        "mo_summary": "Din 1 ianuarie 2026, organizațiile culturale din Moldova participă la programul UE în condiții egale cu partenerii europeni.",
        "en_title": "Moldova officially joined the Creative Europe programme",
        "en_summary": "From 1 January 2026, Moldovan cultural organisations participate in the EU programme on equal terms with European partners.",
    },
    {
        "date": "2025-11-04",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/2025-enlargement-package-shows-progress-towards-eu-membership-key-enlargement-partners-2025-11-04_en",
        "mo_title": "Moldova a finalizat screeningul pentru procesul de aderare la UE",
        "mo_summary": "Comisia Europeană a consemnat finalizarea screeningului pentru Republica Moldova.",
        "en_title": "Moldova completed the screening process for EU accession",
        "en_summary": "The European Commission recorded that Moldova completed the screening process for accession.",
    },
    {
        "date": "2025-10-01",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/countries/moldova_en",
        "mo_title": "Acordul comercial UE–Moldova revizuit a intrat în vigoare",
        "mo_summary": "Zona de liber schimb aprofundată și cuprinzătoare revizuită a intrat în vigoare în octombrie 2025.",
        "en_title": "The revised EU–Moldova trade agreement entered into force",
        "en_summary": "The revised Deep and Comprehensive Free Trade Area entered into force in October 2025.",
    },
    {
        "date": "2025-10-16",
        "source": "Comisia Europeană — Enlargement",
        "url": "https://enlargement.ec.europa.eu/news/commission-welcomes-albania-moldova-montenegro-and-north-macedonia-first-enlargement-partners-join-sepa-schemes-2025-10-16_en",
        "mo_title": "Moldova a intrat oficial în sistemele de plăți SEPA",
        "mo_summary": "Comisia Europeană consemnează intrarea oficială a Moldovei în sistemele de plăți SEPA.",
        "en_title": "Moldova officially joined the SEPA payment schemes",
        "en_summary": "The European Commission records Moldova’s official entry into the SEPA payment schemes.",
    },
]


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


def contains_any(value: str, terms: tuple[str, ...]) -> bool:
    return any(
        re.search(rf"(?<!\w){re.escape(normalize(term))}(?!\w)", value)
        for term in terms
    )


def title_terms(value: str) -> set[str]:
    return {
        TITLE_TERM_ALIASES.get(token, token)
        for token in normalize(value).split()
        if len(token) >= 3 and token not in TITLE_CONTEXT_TERMS
    }


def relevant(title: str, summary: str) -> bool:
    haystack = normalize(f"{title} {summary}")
    # Use stems here because Romanian, French and Russian headlines inflect
    # both “Moldova” and “European Union” in many different ways.
    has_moldova = any(term in haystack for term in MOLDOVA_TERMS)
    has_eu_acronym = contains_any(haystack, ("eu", "ue", "ес"))
    has_eu_name = any(term in haystack for term in EU_TERMS if term not in ("eu", "ue", "ес"))
    return has_moldova and (has_eu_acronym or has_eu_name)


def source_is_excluded(source: str) -> bool:
    return contains_any(normalize(source), EXCLUDED_SOURCE_TERMS)


def is_political_headline(value: str) -> bool:
    if any(term in value for term in POLITICAL_HEADLINE_TERMS):
        return True
    return any(
        term in value
        for term in (
            "premierul",
            "premier ministre",
            "prime minister",
            "премьер",
        )
    )


def is_completed_fact(title: str, summary: str, source: str) -> bool:
    normalized_title = normalize(title)
    normalized_summary = normalize(summary)
    combined = f"{normalized_title} {normalized_summary}"

    if source_is_excluded(source):
        return False
    if contains_any(combined, EXCLUDED_PERSON_TERMS):
        return False
    if is_political_headline(normalized_title):
        return False
    if contains_any(combined, INTENT_TERMS):
        return False
    if contains_any(normalized_title, QUESTION_TERMS) or "?" in title:
        return False
    if re.search(r":\s*[\"'„”“‘«»]", title):
        return False
    if any(mark in title for mark in ('"', "„", "”", "“", "‘", "«", "»")):
        return False
    return contains_any(normalized_title, FACT_TERMS)


def too_similar(candidate: str, previous: list[str]) -> bool:
    candidate_terms = title_terms(candidate)
    for existing in previous:
        existing_terms = title_terms(existing)
        if candidate_terms and existing_terms:
            shared = len(candidate_terms & existing_terms)
            shorter = min(len(candidate_terms), len(existing_terms))
            if shared / shorter > MAX_TITLE_SIMILARITY:
                return True
            continue
        if difflib.SequenceMatcher(None, candidate, existing).ratio() > MAX_TITLE_SIMILARITY:
            return True
    return False


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
            if not relevant(title, summary) or not is_completed_fact(title, summary, source):
                continue
            key = normalize(title)
            # Keep all exact-title candidates here. Fuzzy title filtering is
            # intentionally applied only after sorting, when we choose the
            # final cross-source list for publication.
            if not key or key in seen:
                continue
            seen.add(key)

            entries.append({
                "date": published.strftime("%Y-%m-%d"),
                "sort_date": published,
                "source": source,
                "url": raw_link,
                "title": title,
                "summary": (summary[:360].rstrip() + "…") if len(summary) > 360 else (summary or FALLBACK_SUMMARY[locale]),
            })

    for fact in CURATED_FACTS:
        title = fact[f"{locale}_title"]
        summary = fact[f"{locale}_summary"]
        source = fact["source"]
        if not is_completed_fact(title, summary, source):
            continue
        entries.append({
            "date": fact["date"],
            "sort_date": datetime.fromisoformat(fact["date"]).replace(tzinfo=timezone.utc),
            "source": source,
            "url": fact["url"],
            "title": title,
            "summary": summary,
        })

    entries.sort(key=lambda entry: entry["sort_date"], reverse=True)
    selected: list[dict[str, str]] = []
    selected_titles: list[str] = []
    seen_urls: set[str] = set()
    for entry in entries:
        title = str(entry["title"])
        url = str(entry["url"])
        key = normalize(title)
        if not key or url in seen_urls or too_similar(key, selected_titles):
            continue
        seen_urls.add(url)
        selected_titles.append(key)
        selected.append({
            key: str(value)
            for key, value in entry.items()
            if key != "sort_date"
        })
        if len(selected) >= MAX_ITEMS:
            break
    return selected


def yaml_string(value: str) -> str:
    value = str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return f'"{value}"'


def write_snapshot(feeds: dict[str, list[dict[str, str]]]) -> None:
    lines = [
        "# Generated by scripts/update_europa_feed.py; do not edit by hand.",
        f"updated_at: {yaml_string(datetime.now(timezone.utc).isoformat())}",
    ]
    for locale in ("mo", "en"):
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
    for locale in ("mo", "en"):
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
