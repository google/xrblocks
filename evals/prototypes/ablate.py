#!/usr/bin/env python3
"""Ablation runner: drop one section of a skill at a time, see which
section's removal hurts the score most. The load-bearing sections are
the ones whose removal causes the biggest drop.

For each variant we run a task once via the Gemini API with a modified
system prompt where one section is replaced by `(section removed)`.

Usage:
  python evals/prototypes/ablate.py <task_id>
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

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")


def split_sections(skill_md: pathlib.Path) -> list[tuple[str, str]]:
    """Return [(label, text), ...] for the frontmatter + each `## ` section."""
    text = skill_md.read_text()
    chunks: list[tuple[str, str]] = []

    # Frontmatter: between leading --- and closing ---
    m = re.match(r"^---\n(.*?)\n---\n?", text, flags=re.DOTALL)
    if m:
        chunks.append(("frontmatter", m.group(0)))
        body = text[m.end():]
    else:
        body = text

    # Split body by `## ` headers.
    parts = re.split(r"(?m)^(?=## )", body)
    for p in parts:
        p_stripped = p.strip()
        if not p_stripped:
            continue
        # Label = the heading text.
        header_match = re.match(r"^## (.+)$", p_stripped, flags=re.M)
        label = header_match.group(1).strip() if header_match else p_stripped[:30]
        chunks.append((label, p))
    return chunks


def build_prompt(sections: list[tuple[str, str]], ablate_idx: int | None) -> str:
    parts = []
    for i, (label, text) in enumerate(sections):
        if i == ablate_idx:
            parts.append(f"(section `{label}` removed for ablation)\n")
        else:
            parts.append(text)
    # Also include src/SKILL.md if it exists (we always do this in the runner).
    top = REPO_ROOT / "src" / "SKILL.md"
    if top.exists():
        parts.append("\n\n---\n\n# src/SKILL.md\n\n" + top.read_text())
    return "".join(parts)


def run_variant(
    client: genai.Client,
    task_id: str,
    sections: list[tuple[str, str]],
    ablate_idx: int | None,
) -> dict:
    task_dir = REPO_ROOT / "evals" / "prototypes" / "tasks" / task_id
    spec = json.loads((task_dir / "spec.json").read_text())
    template_rel = spec["template"]
    edit_file = spec["edit_file"]

    label = "baseline" if ablate_idx is None else f"no-{sections[ablate_idx][0]}"
    safe_label = re.sub(r"[^a-zA-Z0-9._-]+", "-", label).strip("-")
    workspace = pathlib.Path(f"/tmp/xrblocks-ablate-{task_id}-{safe_label}")
    if workspace.exists():
        subprocess.run(["rm", "-rf", str(workspace)], check=False)
    subprocess.run(["cp", "-r", str(REPO_ROOT / template_rel), str(workspace)], check=True)

    system_prompt = build_prompt(sections, ablate_idx)
    user_msg = (
        f"You are helping me build an xrblocks app. Return only the complete "
        f"contents of `{edit_file}` inside a single ```javascript fenced "
        f"block. No prose, no explanation, just the code.\n\n"
        f"TASK:\n{(task_dir / 'prompt.md').read_text()}"
    )

    resp = client.models.generate_content(
        model=MODEL,
        contents=user_msg,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
        ),
    )
    raw = resp.text or ""
    blocks = re.findall(
        r"```(?:javascript|js|jsx|typescript|ts)?\s*\n(.*?)```",
        raw,
        flags=re.DOTALL,
    )
    code = max(blocks, key=len) if blocks else raw
    (workspace / edit_file).write_text(code)

    scorer = REPO_ROOT / "evals" / "prototypes" / "score_proto.py"
    score = subprocess.run(
        ["python3", str(scorer), str(task_dir), str(workspace)],
        capture_output=True,
        text=True,
        check=True,
    )
    result = json.loads(score.stdout)
    result["variant"] = label
    usage = getattr(resp, "usage_metadata", None)
    result["prompt_tokens"] = getattr(usage, "prompt_token_count", None)
    return result


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: ablate.py <task_id>", file=sys.stderr)
        return 1
    task_id = argv[0]
    task_dir = REPO_ROOT / "evals" / "prototypes" / "tasks" / task_id
    spec = json.loads((task_dir / "spec.json").read_text())
    skill_md = REPO_ROOT / "skills" / spec["skill"] / "SKILL.md"
    sections = split_sections(skill_md)

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    results: list[dict] = []
    # Baseline first (no ablation).
    print(f"=== baseline ({len(sections)} sections in skill) ===", file=sys.stderr)
    r = run_variant(client, task_id, sections, None)
    print(f"  composite={r['composite']}  tokens={r['prompt_tokens']}", file=sys.stderr)
    results.append(r)

    for i, (label, _) in enumerate(sections):
        print(f"=== ablate: {label} ===", file=sys.stderr)
        r = run_variant(client, task_id, sections, i)
        print(f"  composite={r['composite']}  tokens={r['prompt_tokens']}", file=sys.stderr)
        results.append(r)

    out_dir = REPO_ROOT / "evals" / "results" / "ablations"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{task_id}.json"
    out_file.write_text(json.dumps(results, indent=2))

    baseline = results[0]["composite"]
    print(f"\n# Ablation results: {task_id}")
    print(f"baseline composite: {baseline}\n")
    print(f"| variant | composite | delta vs baseline |")
    print(f"|---------|----------:|------------------:|")
    for r in results[1:]:
        delta = r["composite"] - baseline
        print(f"| {r['variant']} | {r['composite']} | {delta:+.2f} |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
