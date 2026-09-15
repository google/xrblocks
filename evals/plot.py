#!/usr/bin/env python3
"""Render the five evaluation chart families for all observed arms.

Reads evals/results/<model>/<mode>/ and optional judge results, writing the
historical PNG filenames under evals/charts/. Missing scores are gaps.

Usage:
  python evals/plot.py
"""
from __future__ import annotations

import pathlib
import sys
import textwrap

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from eval_common import (
    MODES, MODE_LABELS, discover_models as _discover_models,
    finite_score, load_model as _load_model,
)
from summarize_proto import baseline_notes, incompatible_baselines, pairwise_means

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"
CHARTS = ROOT / "evals" / "charts"

ENG_TASKS = (
    "ai-describe-camera", "depth-occlusion", "gestures-thumbs-up",
    "hands-pinch-spawn", "modelviewer-gltf", "netblocks-presence",
    "physics-falling-cube", "sound-spatial-audio", "ui-button-hud",
    "world-plane-detection",
)

MODEL_COLORS_WITH = {
    "gemini-2.5-pro": "#0b8043",
    "gemini-2.5-flash": "#1a73e8",
}
MODEL_COLORS_WITHOUT = {
    "gemini-2.5-pro": "#c5221f",
    "gemini-2.5-flash": "#f9ab00",
}
MODE_COLORS = {
    "with-skill": "#34a853",
    "without-skill": "#ea4335",
    "with-baseline": "#9334e6",
}


def short_label(task: str) -> str:
    """Keep historical compact labels, retaining new task IDs in full."""
    if task.startswith("canvas-"):
        return "c:" + task[len("canvas-"):].split("-")[0]
    return task.split("-")[0] if task in ENG_TASKS else task


def task_style(task: str) -> str:
    if task in ENG_TASKS:
        return "engineer-spec"
    return "canvas-faithful" if task.startswith("canvas-") else "other tasks"


def ordered_tasks(tasks: list[str]) -> list[str]:
    """Preserve engineer/canvas grouping and include newer non-canvas tasks."""
    return [
        task for style in ("engineer-spec", "canvas-faithful", "other tasks")
        for task in sorted(set(tasks)) if task_style(task) == style
    ]


def discover_models() -> list[str]:
    return [path.name for path in _discover_models(RESULTS)]


def load_model(model: str) -> tuple[dict, dict]:
    return _load_model(RESULTS / model)


def _annotate_group_boundary(ax, tasks: list[str]) -> None:
    start = 0
    groups = [
        (style, sum(task_style(task) == style for task in tasks))
        for style in ("engineer-spec", "canvas-faithful", "other tasks")
    ]
    groups = [(style, count) for style, count in groups if count]
    if len(groups) < 2:
        return
    for style, count in groups:
        if start:
            ax.axvline(start - 0.5, color="#888", linewidth=1, alpha=0.6, linestyle="--")
        ax.text(start + count / 2 - 0.5, 1.13, style,
                ha="center", fontsize=10, fontweight="bold",
                transform=ax.get_xaxis_transform())
        start += count


def _score_values(tasks: list[str], results: dict, metric: str) -> list[float]:
    return [
        value if (value := finite_score(results.get(task, {}), metric)) is not None else np.nan
        for task in tasks
    ]


def _save_chart(fig, filename: str, by_model: dict) -> pathlib.Path:
    notes = [
        f"{model}: {note}" for model, (modes, _) in by_model.items()
        for note in baseline_notes(modes)
    ]
    if notes:
        text = "\n".join(textwrap.fill(note, 155) for note in notes)
        width, height = fig.get_size_inches()
        footer_height = 0.13 * len(text.splitlines()) + 0.2
        fig.set_size_inches(width, height + footer_height)
        fig.text(0.01, 0.01, text, fontsize=6, va="bottom")
        fig.tight_layout(rect=(0, footer_height / (height + footer_height), 1, 1))
    else:
        fig.tight_layout()
    CHARTS.mkdir(parents=True, exist_ok=True)
    out = CHARTS / filename
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def _plot_per_task(tasks: list[str], by_model: dict, judge: bool = False) -> pathlib.Path:
    tasks = ordered_tasks(tasks)
    series = [
        (model, mode, modes[mode], judges)
        for model, (modes, judges) in by_model.items() for mode in MODES if mode in modes
    ]
    x = np.arange(len(tasks))
    group_width = 0.85
    bar_width = group_width / max(1, len(series))
    fig, ax = plt.subplots(figsize=(14, 5.5))
    for index, (model, mode, results, judges) in enumerate(series):
        if judge:
            results = {task: judges.get(f"{task}-{mode}", {}) for task in tasks}
        values = _score_values(tasks, results, "idiomatic_xrblocks" if judge else "composite")
        offset = index * bar_width - group_width / 2 + bar_width / 2
        color = MODE_COLORS[mode]
        if mode == "with-skill":
            color = MODEL_COLORS_WITH.get(model, "#666")
        elif mode == "without-skill":
            color = MODEL_COLORS_WITHOUT.get(model, "#aaa")
        label = {"with-skill": "w/", "without-skill": "w/o"}.get(mode, MODE_LABELS[mode])
        ax.bar(x + offset, values, bar_width, label=f"{model} {label}", color=color)

    ax.set_xticks(x)
    ax.set_xticklabels(tasks, rotation=35, ha="right", fontsize=9)
    ax.set_ylim(0, 5.5 if judge else 1.05)
    ax.set_ylabel("judge `idiomatic_xrblocks` (1-5, judged by gemini-2.5-pro)"
                  if judge else "composite score (0-1)")
    baseline = any(mode == "with-baseline" for _, mode, _, _ in series)
    comparison = "observed evaluation arms" if baseline else "with vs without skill"
    ax.set_title(
        f"{'llm judge: idiomatic xrblocks usage' if judge else 'composite score per task'}, "
        f"{comparison}, across models", pad=40,
    )
    if series:
        ax.legend(fontsize=8, ncol=2, loc="upper left", bbox_to_anchor=(1.005, 1.0))
    ax.grid(axis="y", alpha=0.3)
    _annotate_group_boundary(ax, tasks)
    return _save_chart(fig, "judge_per_task.png" if judge else "composite_per_task.png", by_model)


def plot_composite_multi_model(tasks: list[str], by_model: dict) -> pathlib.Path:
    return _plot_per_task(tasks, by_model)


def plot_judge_multi_model(tasks: list[str], by_model: dict) -> pathlib.Path | None:
    if not any(judges for _, judges in by_model.values()):
        return None
    return _plot_per_task(tasks, by_model, judge=True)


def plot_metric_grid(tasks: list[str], modes: dict, model: str) -> pathlib.Path:
    tasks = ordered_tasks(tasks)
    metrics = ["import_match", "api_match", "forbidden_clean", "parse_ok"]
    present = [mode for mode in MODES if mode in modes]
    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    for ax, metric in zip(axes.flat, metrics):
        x = np.arange(len(tasks))
        width = 0.76 / max(1, len(present))
        for index, mode in enumerate(present):
            offset = (index - (len(present) - 1) / 2) * width
            ax.bar(x + offset, _score_values(tasks, modes[mode], metric), width,
                   label=MODE_LABELS[mode], color=MODE_COLORS[mode])
        ax.set_title(metric)
        ax.set_xticks(x)
        ax.set_xticklabels([short_label(task) for task in tasks],
                           rotation=35, ha="right", fontsize=7)
        ax.set_ylim(0, 1.05)
        ax.grid(axis="y", alpha=0.3)
        _annotate_group_boundary(ax, tasks)
    if present:
        axes[0, 0].legend()
    fig.suptitle(f"per-metric breakdown ({model})", y=0.995, fontsize=13)
    return _save_chart(fig, f"metrics_grid_{model}.png", {model: (modes, {})})


def breakdown_rows(by_model: dict, metric: str) -> list[dict]:
    """Separate paired populations; lone arms are explicitly unpaired."""
    rows = []
    for model, (modes, _) in by_model.items():
        observed = {task for results in modes.values() for task in results}
        for style in ("engineer-spec", "canvas-faithful", "other tasks"):
            tasks = {task for task in observed if task_style(task) == style}
            if not tasks:
                continue
            comparisons = pairwise_means(modes, metric, tasks)
            for comparison in comparisons:
                left, right = comparison["left"], comparison["right"]
                values = {left: comparison["left_mean"], right: comparison["right_mean"]}
                rows.append({
                    "model": model, "style": style, "values": values,
                    "comparison": f"{MODE_LABELS[left]} vs {MODE_LABELS[right]}",
                    "n": comparison["n"],
                    "status": "suppressed: incompatible baseline identities" if comparison["suppressed"]
                    else ("paired" if comparison["n"] else "unavailable"),
                    "delta": values[left] - values[right] if values[left] is not None else None,
                })
            if not comparisons:
                for mode, results in modes.items():
                    scores = [
                        score for task in tasks
                        if (score := finite_score(results.get(task, {}), metric)) is not None
                    ]
                    suppressed = mode == "with-baseline" and incompatible_baselines(modes)
                    rows.append({
                        "model": model, "style": style, "comparison": MODE_LABELS[mode],
                        "n": len(scores), "delta": None,
                        "status": "suppressed: incompatible baseline identities" if suppressed else "unpaired",
                        "values": {mode: sum(scores) / len(scores) if scores and not suppressed else None},
                    })
    return rows


def _plot_breakdown(by_model: dict, metric: str) -> pathlib.Path | None:
    rows = breakdown_rows(by_model, metric)
    if not rows:
        return None
    present = [mode for mode in MODES if any(mode in modes for modes, _ in by_model.values())]
    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(rows))
    width = 0.76 / len(present)
    for index, mode in enumerate(present):
        offset = (index - (len(present) - 1) / 2) * width
        values = [
            value if (value := row["values"].get(mode)) is not None else np.nan
            for row in rows
        ]
        ax.bar(x + offset, values, width, label=MODE_LABELS[mode], color=MODE_COLORS[mode])
        for position, value in zip(x + offset, values):
            if np.isfinite(value):
                ax.text(position, value + 0.01, f"{value:.2f}", ha="center", fontsize=9)
    labels = []
    for index, row in enumerate(rows):
        label = f"{row['model'].replace('gemini-2.5-', '')}\n{row['style']}"
        if "with-baseline" in present:
            label += "\n" + textwrap.fill(row["comparison"], 28)
        label += f"\n{row['status']} n={row['n']}"
        labels.append(label)
        if row["delta"] is not None:
            top = max(value for value in row["values"].values() if value is not None)
            ax.annotate(f"Δ {row['delta']:+.2f}", xy=(index, top + 0.06),
                        ha="center", fontsize=10, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=10)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("mean api_match (fraction of expected APIs called)"
                  if metric == "api_match" else "mean composite score")
    ax.set_title("api_match: did the agent call the APIs the skill defines?"
                 if metric == "api_match" else "skill effect by model and prompt style", pad=20)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0))
    ax.grid(axis="y", alpha=0.3)
    filename = "api_match_breakdown.png" if metric == "api_match" else "prompt_style_breakdown.png"
    return _save_chart(fig, filename, by_model)


def plot_api_match_breakdown(by_model: dict) -> pathlib.Path | None:
    return _plot_breakdown(by_model, "api_match")


def plot_prompt_style_breakdown(by_model: dict) -> pathlib.Path | None:
    return _plot_breakdown(by_model, "composite")


def main() -> int:
    models = discover_models()
    by_model = {model: load_model(model) for model in models}
    by_model = {model: data for model, data in by_model.items() if data[0]}
    if not by_model:
        print("no model results found under evals/results/", file=sys.stderr)
        return 1
    tasks = sorted({
        task for modes, _ in by_model.values() for results in modes.values() for task in results
    })
    outputs = [
        plot_composite_multi_model(tasks, by_model),
        plot_judge_multi_model(tasks, by_model),
        *(plot_metric_grid(tasks, modes, model) for model, (modes, _) in by_model.items()),
        plot_prompt_style_breakdown(by_model),
        plot_api_match_breakdown(by_model),
    ]
    for output in outputs:
        if output:
            print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
