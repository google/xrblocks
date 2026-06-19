#!/usr/bin/env python3
"""Score a prototyping task: did the agent use the expected imports + APIs?

Scoring (simple, transparent):
  - import_match:    fraction of expected_imports the agent's main file references
  - api_match:       fraction of expected_apis the agent's main file references
  - forbidden_clean: 1.0 if no forbidden_patterns matched, else 0.0
  - parse_ok:        1.0 if `node --check` parses the edit_file, else 0.0
  - composite:       0.25 * each of the four above

Output: JSON line to stdout.

Usage:
  python evals/prototypes/score_proto.py <task_dir> <workspace_dir>
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: score_proto.py <task_dir> <workspace_dir>", file=sys.stderr)
        return 1

    task_dir = pathlib.Path(argv[0])
    workspace = pathlib.Path(argv[1])
    spec = json.loads((task_dir / "spec.json").read_text())

    edit_path = workspace / spec["edit_file"]
    if not edit_path.exists():
        print(json.dumps({"task": task_dir.name, "error": f"missing {edit_path}"}))
        return 0

    src = edit_path.read_text()

    expected_imports = spec.get("expected_imports", [])
    expected_apis = spec.get("expected_apis", [])
    forbidden = spec.get("forbidden_patterns", [])

    import_hits = sum(1 for imp in expected_imports if imp in src)
    api_hits = sum(1 for api in expected_apis if api in src)
    forbidden_hits = [pat for pat in forbidden if re.search(pat, src)]

    def frac(num: int, denom: int) -> float:
        if denom == 0:
            return 1.0
        return round(num / denom, 3)

    import_match = frac(import_hits, len(expected_imports))
    api_match = frac(api_hits, len(expected_apis))
    forbidden_clean = 1.0 if not forbidden_hits else 0.0

    parse_ok = 0.0
    try:
        subprocess.run(
            ["node", "--check", str(edit_path)],
            check=True,
            capture_output=True,
        )
        parse_ok = 1.0
    except subprocess.CalledProcessError as e:
        parse_err = e.stderr.decode("utf-8", errors="ignore").strip().splitlines()
    except FileNotFoundError:
        parse_err = ["node CLI not available"]
    else:
        parse_err = []

    # Composite is the mean of the dimensions that actually had something to
    # test. `import_match` is vacuously 1.0 when expected_imports is empty, so
    # we drop it from the mean in that case to avoid inflating the score.
    dims = [api_match, parse_ok, forbidden_clean]
    if expected_imports:
        dims.append(import_match)
    composite = round(sum(dims) / len(dims), 3)

    result = {
        "task": task_dir.name,
        "skill": spec["skill"],
        "import_match": import_match,
        "api_match": api_match,
        "forbidden_clean": forbidden_clean,
        "parse_ok": parse_ok,
        "composite": composite,
        "import_hits": import_hits,
        "import_total": len(expected_imports),
        "api_hits": api_hits,
        "api_total": len(expected_apis),
        "forbidden_violations": forbidden_hits,
        "parse_errors": parse_err if parse_ok == 0 else [],
        "src_bytes": len(src),
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
