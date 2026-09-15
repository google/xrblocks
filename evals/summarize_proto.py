#!/usr/bin/env python3
"""Summarize prototyping results for all observed evaluation arms, plus
optional judge columns. Walks the
per-model directories under ``evals/results/`` and emits one table per
model.

Layout:
  evals/results/<model>/with-skill/<task>.json
  evals/results/<model>/without-skill/<task>.json
  evals/results/<model>/with-baseline/<task>.json  (opt-in output-adapted baseline)
  evals/results/<model>/judge/<task>-<mode>.json  (optional)

Writes evals/results/_summary.md.

Usage:
  python evals/summarize_proto.py
"""
from __future__ import annotations

import pathlib
import sys

from eval_common import (
    MODE_LABELS, baseline_identity, discover_models as _discover_models,
    finite_score, load_model, paired_scores,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"


def discover_models() -> list[pathlib.Path]:
    """Return the per-model result dirs, sorted by name."""
    return _discover_models(RESULTS)


def incompatible_baselines(modes: dict) -> bool:
    return len({
        baseline_identity(result)
        for result in modes.get("with-baseline", {}).values()
    }) > 1


def baseline_notes(modes: dict) -> list[str]:
    """Describe provenance without treating effective output hashes as identities."""
    baseline = modes.get("with-baseline", {})
    if not baseline:
        return []
    counts = {}
    for result in baseline.values():
        run = result.get("run")
        metadata = run.get("baseline") if isinstance(run, dict) else None
        metadata = metadata if isinstance(metadata, dict) else {}
        fields = [
            f"{key}={metadata[key]}" for key in (
                "protocol", "original_sha256", "effective_sha256", "source_url",
            ) if metadata.get(key)
        ]
        if baseline_identity(result) is None:
            fields.insert(0, "legacy/unknown provenance")
        text = "; ".join(fields)
        counts[text] = counts.get(text, 0) + 1
    notes = [
        f"Output-adapted baseline provenance (n={n}): {text}"
        for text, n in sorted(counts.items())
    ]
    if incompatible_baselines(modes):
        notes.append(
            "Warning: incompatible baseline identities (protocol/original source hash, "
            "including unknown provenance); baseline headline means are suppressed."
        )
    return notes


def pairwise_means(modes: dict, metric: str = "composite", tasks=None) -> list[dict]:
    """Keep each comparison's finite-score population independent of other arms."""
    rows = []
    for left, right in (
        ("with-skill", "without-skill"),
        ("with-skill", "with-baseline"),
        ("with-baseline", "without-skill"),
    ):
        if left not in modes or right not in modes:
            continue
        pairs = paired_scores(modes[left], modes[right], metric)
        if tasks is not None:
            pairs = [pair for pair in pairs if pair[0] in tasks]
        suppressed = "with-baseline" in (left, right) and incompatible_baselines(modes)
        n = len(pairs)
        rows.append({
            "left": left, "right": right, "n": n, "suppressed": suppressed,
            "left_mean": sum(a for _, a, _ in pairs) / n if n and not suppressed else None,
            "right_mean": sum(b for _, _, b in pairs) / n if n and not suppressed else None,
        })
    return rows


def _format_score(value: float | None) -> str:
    return "-" if value is None else f"{value:.2f}"


def _format_judge(judge: dict) -> str:
    scores = [finite_score(judge, key) for key in ("accomplishes_task", "idiomatic_xrblocks")]
    if all(value is None for value in scores):
        return "-"
    values = ["-" if value is None else f"{value:g}" for value in scores]
    severity = judge.get("hallucination_severity")
    return "/".join(values + ["-" if severity is None else str(severity)])


def render_model(model_dir: pathlib.Path) -> tuple[list[str], int]:
    modes, judges = load_model(model_dir)
    w = modes.get("with-skill", {})
    wo = modes.get("without-skill", {})
    baseline = modes.get("with-baseline", {})
    tasks = sorted({task for results in modes.values() for task in results})
    if not tasks:
        return [], 0

    lines = [f"## {model_dir.name}", "", f"tasks: {len(tasks)}", ""]
    lines.extend(baseline_notes(modes))
    if baseline:
        lines.append("")
    headers = ["task", "skill", "composite w/", "composite w/o", "Δ"]
    if judges:
        headers += ["judge w/", "judge w/o"]
    if baseline:
        headers += ["composite output-adapted baseline"]
        if judges:
            headers += ["judge output-adapted baseline"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")

    for t in tasks:
        rw = w.get(t, {})
        rwo = wo.get(t, {})
        skill = rw.get("skill") or rwo.get("skill") or baseline.get(t, {}).get("skill") or "?"
        cw = finite_score(rw)
        cwo = finite_score(rwo)
        if cw is not None and cwo is not None:
            delta = f"{cw - cwo:+.2f}"
        else:
            delta = "-"
        row = [t, skill, _format_score(cw), _format_score(cwo), delta]
        if judges:
            row += [
                _format_judge(judges.get(f"{t}-{mode}", {}))
                for mode in ("with-skill", "without-skill")
            ]
        if baseline:
            row.append(_format_score(finite_score(baseline.get(t, {}))))
            if judges:
                row.append(_format_judge(judges.get(f"{t}-with-baseline", {})))
        lines.append("| " + " | ".join(row) + " |")

    comparisons = pairwise_means(modes)
    historical = next((row for row in comparisons if
                       (row["left"], row["right"]) == ("with-skill", "without-skill")), None)
    if historical and historical["n"]:
        avg_w = historical["left_mean"]
        avg_wo = historical["right_mean"]
        avg_d = avg_w - avg_wo
        avg_row = [
            "**avg**",
            "",
            f"**{avg_w:.2f}**",
            f"**{avg_wo:.2f}**",
            f"**{avg_d:+.2f}**",
        ]
        avg_row += ["-"] * (len(headers) - len(avg_row))
        lines.append("| " + " | ".join(avg_row) + " |")
        lines += ["", f"Historical skill-vs-nothing average: paired n={historical['n']}."]

    if comparisons:
        lines += [
            "", "Pairwise composite means (each row uses its own finite-score intersection):", "",
            "| comparison | n | left mean | right mean | Δ |",
            "|---|---|---|---|---|",
        ]
        for comparison in comparisons:
            a, b = comparison["left_mean"], comparison["right_mean"]
            delta = "-" if a is None or b is None else f"{a - b:+.2f}"
            label = f"{MODE_LABELS[comparison['left']]} vs {MODE_LABELS[comparison['right']]}"
            if comparison["suppressed"]:
                label += " (suppressed: incompatible baseline identities)"
            lines.append(
                f"| {label} | {comparison['n']} | {_format_score(a)} | {_format_score(b)} | {delta} |"
            )
    lines.append("")
    return lines, len(tasks)


def main() -> int:
    models = discover_models()
    if not models:
        print(
            "no results found under evals/results/<model>/<supported-mode>/",
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
