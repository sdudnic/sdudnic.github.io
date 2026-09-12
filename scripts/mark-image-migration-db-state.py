#!/usr/bin/env python3
"""Mark only fully verified image rows as committed in the v3 manifest.

The SQL migration is intentionally executed through Supabase MCP in batches.
This helper updates the local resumability manifest after those batches have
been verified; it never connects to Supabase and never changes catalog data.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


STAGES = ("original_verified", "display_verified", "thumbnail_verified")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest",
        nargs="?",
        default=".tmp-tools/image-migration-20260912-v3.json",
        help="Manifestul v3 actualizat după verificarea loturilor SQL.",
    )
    args = parser.parse_args()
    path = Path(args.manifest)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != 3:
        raise SystemExit("Manifestul trebuie să fie versiunea 3.")

    updated = 0
    for item in payload.get("items", []):
        if not isinstance(item, dict) or not all(item.get(stage) for stage in STAGES):
            continue
        if not item.get("db_updated") or not item.get("base64_removed"):
            item["db_updated"] = True
            item["base64_removed"] = True
            updated += 1

    payload["items"] = sorted(payload.get("items", []), key=lambda item: item.get("id", ""))
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Marcaj DB actualizat pentru {updated} referinte verificate in {path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
