#!/usr/bin/env python3
"""Summarize the latest prototyping run: side-by-side with-skill vs
without-skill across every task, plus optional judge column. Walks the
per-model directories under ``evals/results/`` and emits one table per
model.

Layout:
  evals/results/<model>/with-skill/<task>.json
  evals/results/<model>/without-skill/<task>.json
  evals/results/<model>/judge/<task>-<mode>.json  (optional)

Writes evals/results/_summary.md.

Usage:
  python evals/summarize_proto.py
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"


def load_dir(d: pathlib.Path) -> dict:
    out = {}
    if not d.exists():
        return out
    for f in sorted(d.glob("*.json")):
        try:
            out[f.stem] = json.loads(f.read_text())
        except Exception:
            pass
    return out


def discover_models() -> list[pathlib.Path]:
    """Return the per-model result dirs, sorted by name."""
    if not RESULTS.exists():
        return []
    return sorted(
        p
        for p in RESULTS.iterdir()
        if p.is_dir() and (p / "with-skill").exists()
    )


def render_model(model_dir: pathlib.Path) -> tuple[list[str], int]:
    w = load_dir(model_dir / "with-skill")
    wo = load_dir(model_dir / "without-skill")
    judges = load_dir(model_dir / "judge")

    tasks = sorted(set(w) | set(wo))
    if not tasks:
        return [], 0

    lines = [f"## {model_dir.name}", "", f"tasks: {len(tasks)}", ""]
    headers = ["task", "skill", "composite w/", "composite w/o", "Δ"]
    if judges:
        headers += ["judge w/", "judge w/o"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")

    sums = {"with": 0.0, "without": 0.0, "n": 0}
    for t in tasks:
        rw = w.get(t, {})
        rwo = wo.get(t, {})
        skill = rw.get("skill") or rwo.get("skill") or "?"
        cw = rw.get("composite", float("nan"))
        cwo = rwo.get("composite", float("nan"))
        if cw == cw and cwo == cwo:
            sums["with"] += cw
            sums["without"] += cwo
            sums["n"] += 1
            delta = f"{cw - cwo:+.2f}"
        else:
            delta = "?"
        row = [t, skill, f"{cw:.2f}", f"{cwo:.2f}", delta]
        if judges:
            jw = judges.get(f"{t}-with-skill", {})
            jwo = judges.get(f"{t}-without-skill", {})

            def fmt(j: dict) -> str:
                if not j or "accomplishes_task" not in j:
                    return "—"
                halluc = j.get("hallucination_severity", "?")
                return f"{j['accomplishes_task']}/{j['idiomatic_xrblocks']}/{halluc}"

            row += [fmt(jw), fmt(jwo)]
        lines.append("| " + " | ".join(row) + " |")

    if sums["n"] > 0:
        avg_w = sums["with"] / sums["n"]
        avg_wo = sums["without"] / sums["n"]
        avg_d = avg_w - avg_wo
        avg_row = [
            "**avg**",
            "",
            f"**{avg_w:.2f}**",
            f"**{avg_wo:.2f}**",
            f"**{avg_d:+.2f}**",
        ]
        if judges:
            avg_row += ["", ""]
        lines.append("| " + " | ".join(avg_row) + " |")

    lines.append("")
    return lines, len(tasks)


def main() -> int:
    models = discover_models()
    if not models:
        print(
            "no results found under evals/results/<model>/with-skill/",
            file=sys.stderr,
        )
        return 1

    lines = ["# Eval Summary", ""]
    total = 0
    for m in models:
        section, n = render_model(m)
        if n:
            lines.extend(section)
            total += n

    if total == 0:
        print("no results found", file=sys.stderr)
        return 1

    out_md = "\n".join(lines)
    (RESULTS / "_summary.md").write_text(out_md + "\n")
    print(out_md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
