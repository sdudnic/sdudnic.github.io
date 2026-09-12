#!/usr/bin/env python3
"""Copy legacy Base64 reference images to the R2 Worker.

This utility deliberately does not write to Supabase. It reads the legacy
``image_url`` values and uploads three resumable R2 variants:

* ``original`` keeps the decoded source bytes for archival verification;
* ``display`` is half the original dimensions, capped at 3000 px;
* ``thumbnail`` is capped at 400 px for compact list/preload use.

The manifest is later consumed by an MCP SQL migration which updates the
catalog only after every object has been uploaded and verified.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


IMAGE_MAX_BYTES = 2_500_000
IMAGE_MAX_ORIGINAL_BYTES = 4_000_000
IMAGE_MAX_DISPLAY_BYTES = 2_500_000
IMAGE_MAX_THUMBNAIL_BYTES = 300_000
IMAGE_MAX_DATA_URL_CHARS = 2_100_000
IMAGE_MAX_EDGE = 3_000
THUMBNAIL_MAX_EDGE = 400
TARGET_SCALE = 0.5
QUALITY_STEPS = (88, 84, 80, 76, 72, 68)
THUMBNAIL_QUALITY_STEPS = (82, 76, 70, 64)
SCALE_STEPS = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.3)
DATA_URL_RE = re.compile(
    r"^data:(image/(?:avif|gif|jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$",
    re.IGNORECASE,
)
DEFAULT_WORKER_URL = "https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev"
USER_AGENT = "dudnic-moldoveneasca-image-migration/1.0"


def load_env_file(path: Path) -> None:
    """Load only missing variables, without ever printing their values."""

    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if name and name not in os.environ:
            os.environ[name] = value


def session_access_token(env_path: Path) -> str:
    """Read the local auth session when .env intentionally leaves the token blank."""

    configured = Path(os.environ.get("MOLDOVENEASCA_AUTH_SESSION_FILE", ".moldoveneasca-session.json"))
    candidates = [configured]
    if not configured.is_absolute():
        candidates.append(env_path.parent / configured)
    for path in candidates:
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if isinstance(token, str) and token.strip():
            return token.strip()
    return ""


def json_request(url: str, *, headers: dict[str, str], method: str = "GET", body: bytes | None = None) -> Any:
    request = Request(url, method=method, headers={"User-Agent": USER_AGENT, **headers}, data=body)
    try:
        with urlopen(request, timeout=180) as response:
            payload = response.read()
    except HTTPError as error:
        detail = error.read(512).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} pentru {url}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Nu s-a putut accesa {url}: {error.reason}") from error
    try:
        return json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Răspuns JSON invalid de la {url}.") from error


def fetch_legacy_rows(supabase_url: str, anon_key: str, access_token: str) -> list[dict[str, Any]]:
    """Fetch IDs with a small query, then fetch each large image separately.

    Asking PostgREST to filter and return 241 MB of text in one response can
    hit the statement timeout. The ID-only query stays small; the per-row
    requests also make the operation resumable at the network layer.
    """

    params = urlencode(
        {
            "select": "id",
            # A regex/LIKE predicate on the large text column can hit the
            # project's statement timeout. Fetch the small ID list for every
            # non-null image, then filter exact data URLs after the row read.
            "image_url": "not.is.null",
            "order": "id.asc",
            "limit": "1000",
        }
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/language_references?{params}"
    rows = json_request(
        url,
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {access_token}",
        },
    )
    if not isinstance(rows, list):
        raise RuntimeError("Supabase nu a returnat o listă de identificatori.")
    ids = [row.get("id") for row in rows if isinstance(row, dict) and isinstance(row.get("id"), str)]
    headers = {"apikey": anon_key, "Authorization": f"Bearer {access_token}"}

    def fetch_one(reference_id: str) -> dict[str, Any] | None:
        row_params = urlencode({"select": "id,image_url", "id": f"eq.{reference_id}", "limit": "1"})
        row_url = f"{supabase_url.rstrip('/')}/rest/v1/language_references?{row_params}"
        batch = json_request(row_url, headers=headers)
        if not isinstance(batch, list) or not batch:
            raise RuntimeError(f"Referința {reference_id} nu mai este disponibilă.")
        row = batch[0]
        if not isinstance(row, dict) or not row.get("image_url"):
            return None
        if not re.sub(r"\s+", "", str(row["image_url"])).lower().startswith("data:image/"):
            return None
        return row

    with ThreadPoolExecutor(max_workers=8) as pool:
        rows_by_id = list(pool.map(fetch_one, ids))
    return [row for row in rows_by_id if row is not None]


def parse_data_url(value: str) -> tuple[str, bytes]:
    normalized = re.sub(r"\s+", "", str(value or "").strip())
    match = DATA_URL_RE.fullmatch(normalized)
    if not match:
        raise RuntimeError("image_url nu este un data URL imagine acceptat.")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise RuntimeError("image_url conține Base64 invalid.") from error
    return match.group(1).lower(), raw


def encode_half_size(raw: bytes) -> tuple[bytes, int, int, int, int]:
    """Return compact WebP bytes and original/output dimensions."""

    Image.MAX_IMAGE_PIXELS = 40_000_000
    try:
        with Image.open(io.BytesIO(raw)) as source:
            source.load()
            source = ImageOps.exif_transpose(source)
            original_width, original_height = source.size
            longest_edge = max(original_width, original_height, 1)
            base_scale = min(TARGET_SCALE, IMAGE_MAX_EDGE / longest_edge)

            if source.mode in ("RGBA", "LA") or "transparency" in source.info:
                rgba = source.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                source_rgb = background
            else:
                source_rgb = source.convert("RGB")

            last: tuple[bytes, int, int] | None = None
            for scale_factor in SCALE_STEPS:
                width = max(1, round(original_width * base_scale * scale_factor))
                height = max(1, round(original_height * base_scale * scale_factor))
                resized = source_rgb.resize((width, height), Image.Resampling.LANCZOS)
                for quality in QUALITY_STEPS:
                    output = io.BytesIO()
                    resized.save(
                        output,
                        format="WEBP",
                        quality=quality,
                        method=6,
                    )
                    encoded = output.getvalue()
                    last = (encoded, width, height)
                    if len(encoded) <= IMAGE_MAX_DISPLAY_BYTES:
                        return encoded, original_width, original_height, width, height
            if last is None:
                raise RuntimeError("Imaginea nu a putut fi re-encodată.")
            encoded, width, height = last
            raise RuntimeError(
                f"Imaginea rămâne prea mare după compactare ({len(encoded)} bytes, {width}x{height})."
            )
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Imaginea nu a putut fi citită: {error}") from error


def encode_thumbnail(raw: bytes) -> tuple[bytes, int, int]:
    """Return a small WebP thumbnail for compact list/preload use."""

    Image.MAX_IMAGE_PIXELS = 40_000_000
    try:
        with Image.open(io.BytesIO(raw)) as source:
            source.load()
            source = ImageOps.exif_transpose(source)
            original_width, original_height = source.size
            longest_edge = max(original_width, original_height, 1)
            scale = min(1.0, THUMBNAIL_MAX_EDGE / longest_edge)
            width = max(1, round(original_width * scale))
            height = max(1, round(original_height * scale))
            if source.mode in ("RGBA", "LA") or "transparency" in source.info:
                rgba = source.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                source_rgb = background
            else:
                source_rgb = source.convert("RGB")
            resized = source_rgb.resize((width, height), Image.Resampling.LANCZOS)
            for quality in THUMBNAIL_QUALITY_STEPS:
                output = io.BytesIO()
                resized.save(
                    output,
                    format="WEBP",
                    quality=quality,
                    method=6,
                )
                encoded = output.getvalue()
                if len(encoded) <= IMAGE_MAX_THUMBNAIL_BYTES:
                    return encoded, width, height
            raise RuntimeError(
                f"Thumbnail-ul rămâne prea mare ({len(encoded)} bytes, {width}x{height})."
            )
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Thumbnail-ul nu a putut fi creat: {error}") from error


def upload_image(
    worker_url: str,
    token: str,
    encoded: bytes,
    *,
    content_type: str,
    variant: str,
    reference_id: str,
) -> dict[str, Any]:
    url = f"{worker_url.rstrip('/')}/api/images"
    result = json_request(
        url,
        method="POST",
        body=encoded,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "Content-Length": str(len(encoded)),
            "X-Image-Variant": variant,
            "X-Image-Reference-Id": reference_id,
        },
    )
    stored = result.get("data", result) if isinstance(result, dict) else None
    if not isinstance(stored, dict) or not stored.get("url"):
        raise RuntimeError("Worker-ul R2 nu a returnat URL-ul imaginii.")
    return stored


def verify_image_url(url: str, *, expected_sha256: str | None = None) -> None:
    request = Request(url, method="GET", headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=120) as response:
            if response.status != 200:
                raise RuntimeError(f"verificarea URL-ului a returnat HTTP {response.status}")
            content = response.read()
            if expected_sha256:
                actual_sha256 = hashlib.sha256(content).hexdigest()
                if actual_sha256 != expected_sha256:
                    raise RuntimeError(
                        f"hash SHA-256 diferit (așteptat {expected_sha256}, primit {actual_sha256})."
                    )
    except HTTPError as error:
        raise RuntimeError(f"verificarea URL-ului a returnat HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"URL-ul R2 nu a putut fi verificat: {error.reason}") from error


def process_row(
    row: dict[str, Any],
    worker_url: str,
    token: str,
    prior: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Upload and verify one reference, preserving every resumable stage."""

    reference_id = str(row["id"])
    item: dict[str, Any] = {"id": reference_id}
    if isinstance(prior, dict):
        item.update(prior)
    item["id"] = reference_id
    for stage in (
        "original_uploaded",
        "original_verified",
        "display_uploaded",
        "display_verified",
        "thumbnail_uploaded",
        "thumbnail_verified",
        "db_updated",
        "base64_removed",
    ):
        item[stage] = bool(item.get(stage, False))
    item.pop("error", None)

    try:
        media_type, raw = parse_data_url(str(row["image_url"]))
        if len(raw) > IMAGE_MAX_ORIGINAL_BYTES:
            raise RuntimeError(f"Originalul depășește limita de arhivare ({len(raw)} bytes).")
        encoded, original_width, original_height, width, height = encode_half_size(raw)
        thumbnail, thumbnail_width, thumbnail_height = encode_thumbnail(raw)
    except Exception as error:  # noqa: BLE001 - eroarea rămâne în manifest pentru reluare/revizie
        item["error"] = str(error)
        return item

    original_extension = media_type.split("/", 1)[1]
    if original_extension == "jpeg":
        original_extension = "jpg"
    item.update(
        {
            "original_content_type": media_type,
            "original_bytes": len(raw),
            "original_sha256": hashlib.sha256(raw).hexdigest(),
            "original_extension": original_extension,
            "original_width": original_width,
            "original_height": original_height,
            "display_bytes_local": len(encoded),
            "display_sha256": hashlib.sha256(encoded).hexdigest(),
            "width": width,
            "height": height,
            "thumbnail_bytes_local": len(thumbnail),
            "thumbnail_sha256": hashlib.sha256(thumbnail).hexdigest(),
            "thumbnail_width": thumbnail_width,
            "thumbnail_height": thumbnail_height,
        }
    )

    stages = (
        ("original", raw, media_type, "original_url", "original_key", "original_bytes", item["original_sha256"]),
        ("display", encoded, "image/webp", "display_url", "display_key", "display_bytes", item["display_sha256"]),
        ("thumbnail", thumbnail, "image/webp", "thumbnail_url", "thumbnail_key", "thumbnail_bytes", item["thumbnail_sha256"]),
    )
    stage_errors: list[str] = []
    for variant, content, content_type, url_field, key_field, bytes_field, expected_sha256 in stages:
        uploaded_field = f"{variant}_uploaded"
        verified_field = f"{variant}_verified"
        if item.get(verified_field) and item.get(url_field):
            continue
        try:
            stored: dict[str, Any] | None = None
            if item.get(uploaded_field) and item.get(url_field):
                stored = {"url": item[url_field], "key": item.get(key_field), "bytes": item.get(bytes_field)}
            for attempt in (1, 2):
                try:
                    if attempt == 2 or stored is None:
                        stored = upload_image(
                            worker_url,
                            token,
                            content,
                            content_type=content_type,
                            variant=variant,
                            reference_id=reference_id,
                        )
                        item[uploaded_field] = True
                        item[url_field] = stored["url"]
                        item[key_field] = stored.get("key")
                        item[bytes_field] = int(stored.get("bytes") or len(content))
                    verify_image_url(str(stored["url"]), expected_sha256=expected_sha256)
                    item[verified_field] = True
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    # A partial/incorrect object is overwritten at the same
                    # explicit key on the second attempt.
                    item[uploaded_field] = False
                    item[verified_field] = False
            else:  # pragma: no cover - loop either verifies or raises
                raise RuntimeError(f"Varianta {variant} nu a fost verificată.")
        except Exception as error:  # noqa: BLE001 - continuăm cu celelalte variante
            stage_errors.append(f"{variant}: {error}")

    item["url"] = item.get("display_url")
    item["error"] = "; ".join(stage_errors) if stage_errors else None
    if item["error"] is None:
        item.pop("error", None)
    return item


def write_manifest(path: Path, items: dict[str, dict[str, Any]], errors: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 3,
        "description": "R2 original/display/thumbnail objects under explicit references/{referenceId}/{variant}.ext keys; every upload and verification stage is resumable; no Supabase rows changed.",
        "items": sorted(items.values(), key=lambda item: item["id"]),
        "errors": sorted(errors, key=lambda item: item["id"]),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default="mcp/.env", help="Fișierul cu variabilele Supabase; valorile nu sunt afișate.")
    parser.add_argument("--output", default=".tmp-tools/image-migration-20260912-v3.json", help="Manifestul resumabil.")
    parser.add_argument("--worker-url", default=None, help="URL-ul Workerului R2; implicit variabila sau Workerul public.")
    parser.add_argument("--workers", type=int, default=4, help="Numărul de încărcări simultane.")
    args = parser.parse_args()

    env_path = Path(args.env_file)
    load_env_file(env_path)
    supabase_url = os.environ.get("MOLDOVENEASCA_SUPABASE_URL", "").strip()
    anon_key = os.environ.get("MOLDOVENEASCA_SUPABASE_ANON_KEY", "").strip()
    access_token = os.environ.get("MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN", "").strip() or session_access_token(env_path)
    worker_url = (args.worker_url or os.environ.get("MOLDOVENEASCA_IMAGE_API_URL") or DEFAULT_WORKER_URL).strip()
    if not supabase_url or not anon_key or not access_token:
        raise SystemExit("Lipsește URL-ul, cheia publică sau tokenul Supabase din mcp/.env.")
    if args.workers < 1 or args.workers > 32:
        raise SystemExit("--workers trebuie să fie între 1 și 32.")

    output_path = Path(args.output)
    existing: dict[str, dict[str, Any]] = {}
    if output_path.exists():
        try:
            previous = json.loads(output_path.read_text(encoding="utf-8"))
            if previous.get("version") == 3:
                existing = {
                    str(item["id"]): item
                    for item in previous.get("items", [])
                    if isinstance(item, dict) and item.get("id")
                }
            else:
                print("Manifestul existent nu este v3; nu îl reutilizez pentru cheile explicite.", file=sys.stderr)
        except (OSError, ValueError, TypeError, KeyError):
            print("Manifestul existent nu a putut fi reluat; îl reconstruiesc.", file=sys.stderr)

    rows = fetch_legacy_rows(supabase_url, anon_key, access_token)
    rows = [
        row for row in rows
        if not all(existing.get(str(row["id"]), {}).get(stage) for stage in (
            "original_verified", "display_verified", "thumbnail_verified"
        ))
    ]
    verified_count = sum(
        1 for item in existing.values()
        if all(item.get(stage) for stage in ("original_verified", "display_verified", "thumbnail_verified"))
    )
    print(f"Referințe Base64 de procesat: {len(rows)}; toate cele trei variante verificate deja: {verified_count}")
    completed = dict(existing)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_row, row, worker_url, access_token, existing.get(str(row["id"]))): str(row["id"])
            for row in rows
        }
        for index, future in enumerate(as_completed(futures), start=1):
            reference_id = futures[future]
            try:
                item = future.result()
                completed[reference_id] = item
                if item.get("error"):
                    print(f"{index}/{len(rows)} PARȚIAL {reference_id}: {item['error']}", file=sys.stderr)
                else:
                    print(f"{index}/{len(rows)} verificat {reference_id} (display {item['width']}x{item['height']}, {item['display_bytes']} bytes; original {item['original_bytes']} bytes)")
            except Exception as error:  # noqa: BLE001 - manifestul păstrează eroarea per referință
                message = str(error)
                completed[reference_id] = {"id": reference_id, "error": message}
                print(f"{index}/{len(rows)} EȘEC {reference_id}: {message}", file=sys.stderr)
            errors = [
                {"id": item["id"], "error": item["error"]}
                for item in completed.values()
                if item.get("error")
            ]
            write_manifest(output_path, completed, errors)

    errors = [
        {"id": item["id"], "error": item["error"]}
        for item in completed.values()
        if item.get("error")
    ]
    if errors:
        print(f"Manifest parțial: {len(completed)} referințe, {len(errors)} cu erori sau variante neverificate.", file=sys.stderr)
        return 1
    print(f"Manifest complet: {len(completed)} referințe cu toate variantele R2 verificate în {output_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit("Migrarea a fost întreruptă; manifestul rămâne resumabil.")
