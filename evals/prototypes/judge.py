#!/usr/bin/env python3
"""LLM-as-judge: have a strong model rate the agent's output beyond
binary api-name matching.

We give the judge the task prompt, public API authority, the task workflow,
the task's manual or addon references, and the generated code.

Output schema:
  {
    "accomplishes_task": 1-5,
    "idiomatic_xrblocks": 1-5,
    "hallucination_severity": "none" | "minor" | "major",
    "rationale": "<one sentence>"
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


JUDGE_PROMPT = """You are a senior XR Blocks reviewer. Rate the candidate \
implementation against the task. Use the public barrel and canonical \
documentation below as the API authority. Use the task skill as workflow \
guidance, not as a complete API catalog. An identifier does not have to \
appear in the skill to be valid. Invented packages, elements such as \
`xr-scene`, or APIs that conflict with the supplied authority are \
hallucinations.

Respond with ONLY a JSON object, no prose, no fences. Schema:

{{
  "accomplishes_task": 1-5,
  "idiomatic_xrblocks": 1-5,
  "hallucination_severity": "none" | "minor" | "major",
  "rationale": "<one sentence>"
}}

Definitions:
- `accomplishes_task`: does the code do what the task asked, regardless of api correctness?
- `idiomatic_xrblocks`: does it follow the supplied XR Blocks API and lifecycle?
- `hallucination_severity`:
  - "none"  = the code is consistent with the supplied API authority and standard libraries.
  - "minor" = one or two questionable identifiers, easy to repair, real intent visible.
  - "major" = invented packages, fake JSX-like elements, or whole APIs the agent made up. The code would not run as-is even with all dependencies installed.

# Task
{task}

# XR Blocks authority and task guidance
{authority}

# Candidate `main.js`
```javascript
{code}
```
"""


def load_authority(spec: dict) -> str:
    parts = [
        "# CONTEXT.md\n\n" + (REPO_ROOT / "CONTEXT.md").read_text(),
        "# Public exports: src/xrblocks.ts\n\n" + (REPO_ROOT / "src" / "xrblocks.ts").read_text(),
    ]
    skill_name = spec["skill"]
    skill_md = REPO_ROOT / "skills" / skill_name / "SKILL.md"
    if not skill_md.is_file():
        raise FileNotFoundError(f"task skill does not exist: {skill_md}")
    parts.append(f"# Task skill: {skill_name}\n\n{skill_md.read_text()}")

    for reference_file in spec.get("reference_files", []):
        reference_path = (REPO_ROOT / reference_file).resolve()
        try:
            reference_path.relative_to(REPO_ROOT.resolve())
        except ValueError as e:
            raise ValueError(f"reference file escapes the repository: {reference_file!r}") from e
        if not reference_path.is_file():
            raise FileNotFoundError(f"task reference does not exist: {reference_path}")
        parts.append(f"# Reference: {reference_file}\n\n{reference_path.read_text()}")
    return "\n\n---\n\n".join(parts)


def judge(task_id: str, workspace: pathlib.Path) -> dict:
    task_dir = REPO_ROOT / "evals" / "prototypes" / "tasks" / task_id
    spec = json.loads((task_dir / "spec.json").read_text())
    prompt = (task_dir / "prompt.md").read_text()
    code = (workspace / spec["edit_file"]).read_text()
    authority = load_authority(spec)

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    full_prompt = JUDGE_PROMPT.format(task=prompt, authority=authority, code=code)

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
