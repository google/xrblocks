#!/usr/bin/env python3
"""Score a prototyping task: did the agent use the expected imports + APIs?

Scoring (simple, transparent):
  - import_match:    fraction of expected_imports the agent's main file references
  - api_match:       fraction of expected_apis the agent's main file uses, ignoring
                     comments so prose cannot satisfy a task
  - forbidden_clean: 1.0 if no forbidden_patterns matched, else 0.0
  - parse_ok:        1.0 if `node --check` parses the edit_file, else 0.0
  - composite:       mean of the above, dropping import_match when the task
                     expects no imports and it would be vacuously 1.0

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


def strip_comments(src: str) -> str:
    """Remove comments, leaving code and string literals intact.

    `expected_apis` are matched as substrings, so without this a task listing a
    word like "thumbs" is satisfied by a comment reading "detect a thumbs up",
    and code calling nothing real still scores on the API dimension.

    String literals are deliberately kept. Gesture names and similar are passed
    as strings in this SDK, so `setGestureEnabled('thumbs-up', true)` is real
    usage rather than prose. Regex literals containing quote characters are not
    handled, which is accepted: the result is only used for substring matching.
    """
    out: list[str] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
        elif c == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (src[i] == "*" and src[i + 1] == "/"):
                i += 1
            i += 2
        elif c in ("'", '"', "`"):
            # Copied through, but scanned so a // or /* inside a string is not
            # mistaken for the start of a comment.
            quote = c
            out.append(c)
            i += 1
            while i < n:
                if src[i] == "\\":
                    out.append(src[i : i + 2])
                    i += 2
                    continue
                out.append(src[i])
                if src[i] == quote:
                    i += 1
                    break
                i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


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
    # Imports are matched against the raw source, since a module specifier
    # such as "@dimforge/rapier3d" only ever appears inside a string.
    code = strip_comments(src)

    expected_imports = spec.get("expected_imports", [])
    expected_apis = spec.get("expected_apis", [])
    forbidden = spec.get("forbidden_patterns", [])

    import_hits = sum(1 for imp in expected_imports if imp in src)
    api_hits = sum(1 for api in expected_apis if api in code)
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
