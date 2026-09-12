#!/usr/bin/env python3
"""Delete only the superseded hash-key objects from the v2 R2 manifest.

The v3 catalog uses explicit UUID keys. This utility has a deliberately strict
allow-list: it can delete only keys present in the old v2 manifest and matching
the legacy ``references/{sha256}.{variant}.ext`` shape. It never enumerates or
recursively deletes the bucket.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


LEGACY_KEY = re.compile(
    r"^references/[a-f0-9]{64}\.(?:original|display|thumbnail)\.(?:avif|gif|jpg|jpeg|png|webp)$",
    re.IGNORECASE,
)
DEFAULT_WORKER_URL = "https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev"
USER_AGENT = "dudnic-moldoveneasca-r2-cleanup/1.0"


def load_env_file(path: Path) -> None:
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


def delete_key(worker_url: str, token: str, key: str) -> str:
    url = f"{worker_url.rstrip('/')}/api/images/" + "/".join(quote(part, safe="") for part in key.split("/"))
    request = Request(
        url,
        method="DELETE",
        headers={"Authorization": f"Bearer {token}", "User-Agent": USER_AGENT},
    )
    try:
        with urlopen(request, timeout=120) as response:
            if response.status not in (200, 204):
                raise RuntimeError(f"HTTP {response.status}")
        return "deleted"
    except HTTPError as error:
        if error.code == 404:
            return "already_absent"
        detail = error.read(512).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"nu s-a putut accesa Worker-ul: {error.reason}") from error


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default="mcp/.env")
    parser.add_argument("--manifest", default=".tmp-tools/image-migration-20260912-v2.json")
    parser.add_argument("--worker-url", default=None)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--yes", action="store_true", help="Confirmă ștergerea exactă a cheilor din manifest.")
    args = parser.parse_args()
    if not args.yes:
        raise SystemExit("Operația este distructivă; reia cu --yes după verificarea manifestului.")
    if args.workers < 1 or args.workers > 16:
        raise SystemExit("--workers trebuie să fie între 1 și 16.")

    env_path = Path(args.env_file)
    load_env_file(env_path)
    token = os.environ.get("MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN", "").strip() or session_access_token(env_path)
    worker_url = (args.worker_url or os.environ.get("MOLDOVENEASCA_IMAGE_API_URL") or DEFAULT_WORKER_URL).strip()
    if not token:
        raise SystemExit("Lipsește tokenul de sesiune Supabase din mcp/.env.")

    payload = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if payload.get("version") != 2:
        raise SystemExit("Manifestul de curățat trebuie să fie v2.")
    keys = {
        str(item[field])
        for item in payload.get("items", [])
        if isinstance(item, dict)
        for field in ("original_key", "display_key", "thumbnail_key")
        if item.get(field)
    }
    invalid = sorted(key for key in keys if not LEGACY_KEY.fullmatch(key))
    if invalid:
        raise SystemExit(f"Manifestul conține {len(invalid)} chei care nu respectă allow-list-ul legacy.")
    if not keys:
        raise SystemExit("Manifestul nu conține chei legacy de șters.")

    print(f"Chei legacy exacte aprobate pentru ștergere: {len(keys)}")
    results: dict[str, str] = {}
    errors: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(delete_key, worker_url, token, key): key for key in sorted(keys)}
        for index, future in enumerate(as_completed(futures), start=1):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as error:  # noqa: BLE001 - raportăm exact cheia eșuată
                errors.append((key, str(error)))
                print(f"EȘEC {key}: {error}", file=sys.stderr)
            if index % 100 == 0 or index == len(futures):
                print(f"{index}/{len(futures)} procesate")

    deleted = sum(status == "deleted" for status in results.values())
    absent = sum(status == "already_absent" for status in results.values())
    print(f"Curățare terminată: {deleted} șterse, {absent} deja absente, {len(errors)} erori.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
