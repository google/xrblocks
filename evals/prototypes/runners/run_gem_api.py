#!/usr/bin/env python3
"""Gem-faithful eval runner: hit the Gemini API directly with skill content
in the system prompt, no filesystem access for the model.

Mirrors the production Canvas Gem ("XR Blocks for Gemini Canvas") which:
  - has skill content baked into its system prompt
  - has NO filesystem visibility into the xrblocks repo
  - asks the model to produce a complete main.js from scratch

Usage:
  python evals/prototypes/runners/run_gem_api.py <task_id> {with-skill|without-skill}

Env:
  GEMINI_API_KEY  required
  GEMINI_MODEL    optional, default gemini-2.5-pro
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

from google import genai
from google.genai import types

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
EVALS = REPO_ROOT / "evals"
TASKS = EVALS / "prototypes" / "tasks"

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")


def build_system_prompt(skill_name: str) -> str:
    """Concatenate the specific xb-* skill's content for the system prompt.

    Mirrors how the Canvas Gem embeds skill content. We use only the skill
    that's relevant to the task to avoid context bloat. To compare against
    the full Gem behavior, you could load all xb-* skills here.
    """
    parts: list[str] = []

    skill_md = REPO_ROOT / "skills" / skill_name / "SKILL.md"
    if skill_md.exists():
        parts.append(f"# {skill_name}\n\n{skill_md.read_text()}")

    # Always include the top-level SDK overview if it exists.
    top_skill = REPO_ROOT / "src" / "SKILL.md"
    if top_skill.exists():
        parts.append(f"# src/SKILL.md\n\n{top_skill.read_text()}")

    return "\n\n---\n\n".join(parts)


def extract_js(response_text: str) -> str:
    """Pull the largest ```javascript / ```js code block out of the response.

    Falls back to the raw text if no fenced block is present.
    """
    blocks = re.findall(
        r"```(?:javascript|js|jsx|typescript|ts)?\s*\n(.*?)```",
        response_text,
        flags=re.DOTALL,
    )
    if blocks:
        return max(blocks, key=len)
    return response_text


def _safe_join(base: pathlib.Path, rel: str, label: str) -> pathlib.Path:
    """Resolve ``rel`` against ``base`` and reject any traversal outside it.

    Specs ship in the repo, but they're still data files the runner should
    treat defensively: a stray ``../../etc/passwd`` in ``template`` would
    otherwise let the runner copy or write outside ``REPO_ROOT``.
    """
    candidate = (base / rel).resolve()
    base_resolved = base.resolve()
    try:
        candidate.relative_to(base_resolved)
    except ValueError as e:
        raise ValueError(f"{label} {rel!r} escapes {base_resolved}") from e
    return candidate


def run_task(task_id: str, mode: str) -> dict:
    if "/" in task_id or task_id.startswith(".."):
        raise ValueError(f"invalid task_id: {task_id!r}")
    task_dir = _safe_join(TASKS, task_id, "task_id")
    spec = json.loads((task_dir / "spec.json").read_text())
    skill_name = spec["skill"]
    template_rel = spec["template"]
    edit_file = spec["edit_file"]

    template_dir = _safe_join(REPO_ROOT, template_rel, "spec.template")

    # Workspace: clean copy of the template. Namespaced by model so two
    # sweeps can co-exist without overwriting each other's files (which the
    # judge needs to re-read).
    model_slug = MODEL.replace("/", "-")
    workspace = pathlib.Path(f"/tmp/xrblocks-gem-{model_slug}-{task_id}-{mode}")
    if workspace.exists():
        subprocess.run(["rm", "-rf", str(workspace)], check=False)
    subprocess.run(["cp", "-r", str(template_dir), str(workspace)], check=True)

    # Build prompt.
    task_body = (task_dir / "prompt.md").read_text()
    user_msg = (
        f"You are helping me build an xrblocks app. Return only the complete "
        f"contents of `{edit_file}` inside a single ```javascript fenced "
        f"block. No prose, no explanation, just the code.\n\n"
        f"TASK:\n{task_body}"
    )

    system_prompt = ""
    if mode == "with-skill":
        system_prompt = build_system_prompt(skill_name)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set")

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        system_instruction=system_prompt if system_prompt else None,
        temperature=0.2,
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=user_msg,
        config=config,
    )

    raw = resp.text or ""
    code = extract_js(raw)

    # Write the agent's output into the workspace. Guard against an
    # edit_file that points outside the workspace via traversal.
    target = _safe_join(workspace, edit_file, "spec.edit_file")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(code)

    # Log raw + code + usage.
    log_dir = workspace.parent / f"{workspace.name}-meta"
    log_dir.mkdir(exist_ok=True)
    (log_dir / "system_prompt.md").write_text(system_prompt or "(empty)")
    (log_dir / "user_msg.md").write_text(user_msg)
    (log_dir / "raw_response.md").write_text(raw)
    usage = getattr(resp, "usage_metadata", None)
    usage_dict = {}
    if usage:
        for k in ("prompt_token_count", "candidates_token_count", "total_token_count"):
            v = getattr(usage, k, None)
            if v is not None:
                usage_dict[k] = v
    (log_dir / "usage.json").write_text(json.dumps(usage_dict, indent=2))

    # Score using the existing scorer.
    scorer = EVALS / "prototypes" / "score_proto.py"
    result_dir = EVALS / "results" / model_slug / mode
    result_dir.mkdir(parents=True, exist_ok=True)
    result_path = result_dir / f"{task_id}.json"

    score_proc = subprocess.run(
        ["python3", str(scorer), str(task_dir), str(workspace)],
        capture_output=True,
        text=True,
        check=True,
    )
    result_path.write_text(score_proc.stdout)

    print(f"[{task_id}/{mode}] workspace: {workspace}")
    print(f"[{task_id}/{mode}] response: {len(raw)} chars, code: {len(code)} chars")
    print(f"[{task_id}/{mode}] tokens: {usage_dict}")
    print(score_proc.stdout)
    return json.loads(score_proc.stdout)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: run_gem_api.py <task_id> {with-skill|without-skill}", file=sys.stderr)
        return 1
    task_id, mode = argv
    if mode not in ("with-skill", "without-skill"):
        print(f"mode must be with-skill or without-skill, got: {mode}", file=sys.stderr)
        return 1
    run_task(task_id, mode)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
