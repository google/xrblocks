#!/usr/bin/env python3
"""Canvas-style eval runner: hit the Gemini API with an agent guidance package
in the system prompt and no file-system access for the model.

Mirrors a Canvas deployment which:
  - receives selected guidance (or no guidance) in its system prompt
  - has NO filesystem visibility into the xrblocks repo
  - asks the model to produce a complete main.js from scratch

Usage:
  python evals/prototypes/runners/run_gem_api.py <task_id> <mode>
  python evals/prototypes/runners/run_gem_api.py <task_id> with-baseline --baseline-file /path/to/prompts.txt

Env:
  GEMINI_API_KEY  required
  GEMINI_MODEL    optional, default gemini-2.5-pro
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
EVALS = REPO_ROOT / "evals"
TASKS = EVALS / "prototypes" / "tasks"

sys.path.insert(0, str(EVALS))
from eval_common import MODES, result_path, validate_mode, validate_task_id, workspace_path
if __package__:
    from .baseline_prompt import load_baseline
else:
    from baseline_prompt import load_baseline

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")


def build_system_prompt(skill_name: str, reference_files: list[str]) -> str:
    """Build the agent guidance supplied to the Canvas-style model.

    A task skill supplies the workflow. CONTEXT.md and the task's explicit
    manual or addon references supply SDK facts. This keeps skills small and
    avoids treating a second SDK overview as an API authority.
    """
    parts: list[str] = [f"# XR Blocks app contract\n\n{(REPO_ROOT / 'CONTEXT.md').read_text()}"]

    skill_md = REPO_ROOT / "skills" / skill_name / "SKILL.md"
    if not skill_md.is_file():
        raise FileNotFoundError(f"task skill does not exist: {skill_md}")
    parts.append(f"# Task skill: {skill_name}\n\n{skill_md.read_text()}")

    for reference_file in reference_files:
        reference_path = _safe_join(REPO_ROOT, reference_file, "spec.reference_files")
        if not reference_path.is_file():
            raise FileNotFoundError(f"task reference does not exist: {reference_path}")
        parts.append(f"# Reference: {reference_file}\n\n{reference_path.read_text()}")

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


def run_task(task_id: str, mode: str, *, baseline_file: pathlib.Path | None = None) -> dict:
    validate_mode(mode)
    validate_task_id(task_id)
    if (mode == "with-baseline") != (baseline_file is not None):
        raise ValueError("--baseline-file is required only for with-baseline")
    task_dir = _safe_join(TASKS, task_id, "task_id")
    spec = json.loads((task_dir / "spec.json").read_text())
    skill_name = spec["skill"]
    reference_files = spec.get("reference_files", [])
    template_rel = spec["template"]
    edit_file = spec["edit_file"]

    template_dir = _safe_join(REPO_ROOT, template_rel, "spec.template")

    workspace = workspace_path(MODEL, task_id, mode)
    _safe_join(workspace, edit_file, "spec.edit_file")

    # Build prompt.
    task_body = (task_dir / "prompt.md").read_text()
    user_msg = (
        f"You are helping me build an xrblocks app. Return only the complete "
        f"contents of `{edit_file}` inside a single ```javascript fenced "
        f"block. No prose, no explanation, just the code.\n\n"
        f"TASK:\n{task_body}"
    )

    system_prompt = ""
    baseline = None
    if mode == "with-skill":
        system_prompt = build_system_prompt(skill_name, reference_files)
    elif mode == "with-baseline":
        baseline = load_baseline(baseline_file, edit_file)
        system_prompt = baseline.system_prompt

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set")

    from google import genai
    from google.genai import types

    # Validate guidance before replacing an earlier run's workspace.
    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)
    # On Windows rmtree can empty the directory but fail to remove the
    # directory itself, if anything is briefly holding a handle on it, so
    # allow copying into what is left.
    shutil.copytree(template_dir, workspace, dirs_exist_ok=True)
    target = _safe_join(workspace, edit_file, "spec.edit_file")

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

    # Write the agent's output into the workspace.
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(code)

    # Log raw + code + usage.
    log_dir = workspace.parent / f"{workspace.name}-meta"
    log_dir.mkdir(exist_ok=True)
    (log_dir / "system_prompt.md").write_bytes(system_prompt.encode("utf-8"))
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
    run = {
        "mode": mode,
        "model": MODEL,
        "workspace": str(workspace),
        "metadata_dir": str(log_dir),
        "temperature": 0.2,
        "system_prompt_sha256": hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
    }
    if baseline is not None:
        (log_dir / "baseline_original.txt").write_bytes(baseline.original)
        run["baseline"] = baseline.provenance
    (log_dir / "run.json").write_text(json.dumps(run, indent=2), encoding="utf-8")

    # Score using the existing scorer.
    scorer = EVALS / "prototypes" / "score_proto.py"
    output_path = result_path(EVALS / "results", MODEL, task_id, mode)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    score_proc = subprocess.run(
        [sys.executable, str(scorer), str(task_dir), str(workspace)],
        capture_output=True,
        text=True,
        check=True,
    )
    result = json.loads(score_proc.stdout)
    result["run"] = run
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    print(f"[{task_id}/{mode}] workspace: {workspace}")
    print(f"[{task_id}/{mode}] response: {len(raw)} chars, code: {len(code)} chars")
    print(f"[{task_id}/{mode}] tokens: {usage_dict}")
    print(score_proc.stdout)
    return result


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task_id")
    parser.add_argument("mode", choices=MODES)
    parser.add_argument(
        "--baseline-file", type=pathlib.Path,
        help="local, unchanged copy of the supported published prompts.txt (with-baseline only)",
    )
    args = parser.parse_args(argv)
    try:
        run_task(args.task_id, args.mode, baseline_file=args.baseline_file)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
