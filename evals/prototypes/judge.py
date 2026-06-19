#!/usr/bin/env python3
"""LLM-as-judge: have a strong model rate the agent's output beyond
binary api-name matching.

We give the judge: the task prompt, the relevant skill description, and
the agent's generated code. We ask three structured ratings.

Output schema:
  {
    "accomplishes_task": 1-5,
    "idiomatic_xrblocks": 1-5,
    "would_merge": "yes" | "no",
    "rationale": "<1-2 sentences>"
  }

Usage:
  python evals/prototypes/judge.py <task_id> <workspace_dir>

Env:
  GEMINI_API_KEY   required
  JUDGE_MODEL      optional, default gemini-2.5-flash (cheap)
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys

from google import genai
from google.genai import types

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "gemini-2.5-pro")


JUDGE_PROMPT = """You are a senior xrblocks reviewer. Rate the candidate \
implementation against the task. The skill content below is the ground \
truth for the xrblocks API. If the code uses identifiers, packages, or \
patterns that do NOT appear in the skill content (e.g. invented elements \
like `xr-scene` or fake packages), score `idiomatic_xrblocks` low and set \
`hallucination_severity` to `major`.

Respond with ONLY a JSON object, no prose, no fences. Schema:

{{
  "accomplishes_task": 1-5,
  "idiomatic_xrblocks": 1-5,
  "hallucination_severity": "none" | "minor" | "major",
  "rationale": "<one sentence>"
}}

Definitions:
- `accomplishes_task`: does the code do what the task asked, regardless of api correctness?
- `idiomatic_xrblocks`: does it use APIs that actually exist in the skill content?
- `hallucination_severity`:
  - "none"  = every imported package, class, method, and event in the code appears in the skill or is a standard library (THREE, web platform, etc).
  - "minor" = one or two questionable identifiers, easy to repair, real intent visible.
  - "major" = invented packages, fake JSX-like elements, or whole APIs the agent made up. The code would not run as-is even with all dependencies installed.

# Task
{task}

# Ground-truth skill content
{skill_full}

# Candidate `main.js`
```javascript
{code}
```
"""


def load_skill_content(skill_name: str) -> str:
    skill_md = REPO_ROOT / "skills" / skill_name / "SKILL.md"
    if not skill_md.exists():
        return "(no skill file)"
    return skill_md.read_text()


def judge(task_id: str, workspace: pathlib.Path) -> dict:
    task_dir = REPO_ROOT / "evals" / "prototypes" / "tasks" / task_id
    spec = json.loads((task_dir / "spec.json").read_text())
    prompt = (task_dir / "prompt.md").read_text()
    code = (workspace / spec["edit_file"]).read_text()
    skill_full = load_skill_content(spec["skill"])

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    full_prompt = JUDGE_PROMPT.format(task=prompt, skill_full=skill_full, code=code)

    resp = client.models.generate_content(
        model=JUDGE_MODEL,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
        ),
    )
    raw = (resp.text or "").strip()
    # Some models still wrap; strip if so.
    raw = re.sub(r"^```(?:json)?\s*\n?|```\s*$", "", raw, flags=re.M).strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        parsed = {"error": f"could not parse judge response: {e}", "raw": raw[:500]}
    parsed["task"] = task_id
    parsed["judge_model"] = JUDGE_MODEL
    return parsed


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: judge.py <task_id> <workspace_dir>", file=sys.stderr)
        return 1
    task_id = argv[0]
    workspace = pathlib.Path(argv[1])
    result = judge(task_id, workspace)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
