#!/usr/bin/env python3
"""Render result charts for the eval. Reads from
evals/results/<model>/{with-skill,without-skill,judge}/ for every model dir
present and emits png files under evals/charts/. The charts directory is
gitignored locally; the canonical published copies live at
https://github.com/xrblocks/evals.

Usage:
  python evals/plot.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"
CHARTS = ROOT / "evals" / "charts"

ENG_TASKS = (
    "ai-describe-camera", "depth-occlusion", "gestures-thumbs-up",
    "hands-pinch-spawn", "modelviewer-gltf", "netblocks-presence",
    "physics-falling-cube", "sound-spatial-audio", "ui-button-hud",
    "world-plane-detection",
)


def short_label(task: str) -> str:
    """Compact x-tick label that stays unique."""
    if task.startswith("canvas-"):
        return "c:" + task[len("canvas-"):].split("-")[0]
    return task.split("-")[0]


def ordered_tasks(tasks: list[str]) -> list[str]:
    """Engineer-spec first (alphabetical), then canvas-faithful (alphabetical)."""
    eng = sorted(t for t in tasks if t in ENG_TASKS)
    canvas = sorted(t for t in tasks if t.startswith("canvas-"))
    return eng + canvas


MODEL_COLORS_WITH = {
    "gemini-2.5-pro": "#0b8043",
    "gemini-2.5-flash": "#1a73e8",
}
MODEL_COLORS_WITHOUT = {
    "gemini-2.5-pro": "#c5221f",
    "gemini-2.5-flash": "#f9ab00",
}


def discover_models() -> list[str]:
    if not RESULTS.exists():
        return []
    return sorted(
        d.name for d in RESULTS.iterdir()
        if d.is_dir() and (d / "with-skill").exists()
    )


def load_model(model: str) -> tuple[dict, dict, dict]:
    base = RESULTS / model
    w = {f.stem: json.loads(f.read_text()) for f in sorted((base / "with-skill").glob("*.json"))}
    wo = {f.stem: json.loads(f.read_text()) for f in sorted((base / "without-skill").glob("*.json"))}
    judges = {}
    jdir = base / "judge"
    if jdir.exists():
        for f in jdir.glob("*.json"):
            try:
                text = f.read_text()
                if not text.strip():
                    continue
                judges[f.stem] = json.loads(text)
            except json.JSONDecodeError:
                continue
    return w, wo, judges


def _annotate_group_boundary(ax, tasks: list[str]) -> None:
    """Draw a vertical separator between engineer-spec and canvas-faithful tasks
    and label the two groups above the plot."""
    eng_count = sum(1 for t in tasks if t in ENG_TASKS)
    if 0 < eng_count < len(tasks):
        ax.axvline(eng_count - 0.5, color="#888", linewidth=1, alpha=0.6, linestyle="--")
        ax.text(eng_count / 2 - 0.5, 1.13, "engineer-spec",
                ha="center", fontsize=10, fontweight="bold",
                transform=ax.get_xaxis_transform())
        ax.text(eng_count + (len(tasks) - eng_count) / 2 - 0.5, 1.13,
                "canvas-faithful",
                ha="center", fontsize=10, fontweight="bold",
                transform=ax.get_xaxis_transform())


def plot_composite_multi_model(tasks: list[str], by_model: dict) -> pathlib.Path:
    tasks = ordered_tasks(tasks)
    n_models = len(by_model)
    x = np.arange(len(tasks))
    group_width = 0.85
    bar_width = group_width / (2 * n_models)

    fig, ax = plt.subplots(figsize=(14, 5.5))
    for i, (model, (w, wo, _)) in enumerate(by_model.items()):
        w_vals = [w.get(t, {}).get("composite", 0) for t in tasks]
        wo_vals = [wo.get(t, {}).get("composite", 0) for t in tasks]
        offset_w = (i * 2) * bar_width - group_width / 2 + bar_width / 2
        offset_wo = (i * 2 + 1) * bar_width - group_width / 2 + bar_width / 2
        ax.bar(
            x + offset_w, w_vals, bar_width,
            label=f"{model} w/",
            color=MODEL_COLORS_WITH.get(model, "#666"),
        )
        ax.bar(
            x + offset_wo, wo_vals, bar_width,
            label=f"{model} w/o",
            color=MODEL_COLORS_WITHOUT.get(model, "#aaa"),
        )

    ax.set_xticks(x)
    ax.set_xticklabels(tasks, rotation=35, ha="right", fontsize=9)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("composite score (0-1)")
    ax.set_title("composite score per task, with vs without skill, across models",
                 pad=40)
    ax.legend(fontsize=8, ncol=2, loc="upper left", bbox_to_anchor=(1.005, 1.0))
    ax.grid(axis="y", alpha=0.3)
    _annotate_group_boundary(ax, tasks)
    fig.tight_layout()
    out = CHARTS / "composite_per_task.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def plot_judge_multi_model(tasks: list[str], by_model: dict) -> pathlib.Path | None:
    have_judges = any(j for _, _, j in by_model.values())
    if not have_judges:
        return None

    tasks = ordered_tasks(tasks)
    n_models = len(by_model)
    x = np.arange(len(tasks))
    group_width = 0.85
    bar_width = group_width / (2 * n_models)

    fig, ax = plt.subplots(figsize=(14, 5.5))
    for i, (model, (_, _, judges)) in enumerate(by_model.items()):
        w_idiom = [judges.get(f"{t}-with-skill", {}).get("idiomatic_xrblocks", 0) for t in tasks]
        wo_idiom = [judges.get(f"{t}-without-skill", {}).get("idiomatic_xrblocks", 0) for t in tasks]
        offset_w = (i * 2) * bar_width - group_width / 2 + bar_width / 2
        offset_wo = (i * 2 + 1) * bar_width - group_width / 2 + bar_width / 2
        ax.bar(
            x + offset_w, w_idiom, bar_width,
            label=f"{model} w/",
            color=MODEL_COLORS_WITH.get(model, "#666"),
        )
        ax.bar(
            x + offset_wo, wo_idiom, bar_width,
            label=f"{model} w/o",
            color=MODEL_COLORS_WITHOUT.get(model, "#aaa"),
        )

    ax.set_xticks(x)
    ax.set_xticklabels(tasks, rotation=35, ha="right", fontsize=9)
    ax.set_ylim(0, 5.5)
    ax.set_ylabel("judge `idiomatic_xrblocks` (1-5, judged by gemini-2.5-pro)")
    ax.set_title("llm judge: idiomatic xrblocks usage, with vs without skill, across models",
                 pad=40)
    ax.legend(fontsize=8, ncol=2, loc="upper left", bbox_to_anchor=(1.005, 1.0))
    ax.grid(axis="y", alpha=0.3)
    _annotate_group_boundary(ax, tasks)
    fig.tight_layout()
    out = CHARTS / "judge_per_task.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def plot_metric_grid(tasks: list[str], w: dict, wo: dict, model: str) -> pathlib.Path:
    tasks = ordered_tasks(tasks)
    metrics = ["import_match", "api_match", "forbidden_clean", "parse_ok"]
    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    for ax, m in zip(axes.flat, metrics):
        x = np.arange(len(tasks))
        width = 0.38
        w_vals = [w.get(t, {}).get(m, 0) for t in tasks]
        wo_vals = [wo.get(t, {}).get(m, 0) for t in tasks]
        ax.bar(x - width / 2, w_vals, width, label="with", color="#34a853")
        ax.bar(x + width / 2, wo_vals, width, label="without", color="#ea4335")
        ax.set_title(m)
        ax.set_xticks(x)
        ax.set_xticklabels([short_label(t) for t in tasks],
                           rotation=35, ha="right", fontsize=7)
        ax.set_ylim(0, 1.05)
        ax.grid(axis="y", alpha=0.3)
        _annotate_group_boundary(ax, tasks)
    axes[0, 0].legend()
    fig.suptitle(f"per-metric breakdown ({model})", y=0.995, fontsize=13)
    fig.tight_layout()
    out = CHARTS / f"metrics_grid_{model}.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def main() -> int:
    CHARTS.mkdir(parents=True, exist_ok=True)
    models = discover_models()
    if not models:
        print("no model result dirs found under evals/results/", file=sys.stderr)
        return 1

    by_model = {m: load_model(m) for m in models}

    # Tasks = union across all models.
    tasks = sorted({t for m in models for t in by_model[m][0]})

    out1 = plot_composite_multi_model(tasks, by_model)
    print(f"wrote {out1}")

    out2 = plot_judge_multi_model(tasks, by_model)
    if out2:
        print(f"wrote {out2}")

    for m in models:
        w, wo, _ = by_model[m]
        out3 = plot_metric_grid(tasks, w, wo, m)
        print(f"wrote {out3}")

    out4 = plot_prompt_style_breakdown(by_model)
    if out4:
        print(f"wrote {out4}")

    out5 = plot_api_match_breakdown(by_model)
    if out5:
        print(f"wrote {out5}")

    return 0


def plot_api_match_breakdown(by_model: dict) -> pathlib.Path | None:
    """Headline chart: api_match (the only non-vacuous binary dimension) per
    model and prompt style. This is the most honest single-number summary."""
    rows = []
    for model, (w, wo, _) in by_model.items():
        for label, picker in [
            ("engineer-spec", lambda t: t in ENG_TASKS),
            ("canvas-faithful", lambda t: t.startswith("canvas-")),
        ]:
            tasks = [t for t in w if picker(t)]
            if not tasks:
                continue
            ws = [w[t]["api_match"] for t in tasks if t in w]
            wos = [wo[t]["api_match"] for t in tasks if t in wo]
            n = min(len(ws), len(wos))
            if n == 0:
                continue
            rows.append({
                "model": model, "style": label,
                "with": sum(ws) / n, "without": sum(wos) / n,
                "delta": sum(ws) / n - sum(wos) / n,
                "n": n,
            })
    if not rows:
        return None

    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(rows))
    width = 0.38
    ax.bar(x - width / 2, [r["with"] for r in rows], width,
           label="with skill", color="#34a853")
    ax.bar(x + width / 2, [r["without"] for r in rows], width,
           label="without skill", color="#ea4335")
    ax.set_xticks(x)
    ax.set_xticklabels(
        [f"{r['model'].replace('gemini-2.5-', '')}\n{r['style']}" for r in rows],
        fontsize=10,
    )
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("mean api_match (fraction of expected APIs called)")
    ax.set_title("api_match: did the agent call the APIs the skill defines?",
                 pad=20)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0))
    ax.grid(axis="y", alpha=0.3)
    for i, r in enumerate(rows):
        ax.text(i - width / 2, r["with"] + 0.01, f"{r['with']:.2f}",
                ha="center", fontsize=9)
        ax.text(i + width / 2, r["without"] + 0.01, f"{r['without']:.2f}",
                ha="center", fontsize=9)
        top = max(r["with"], r["without"])
        ax.annotate(f"Δ {r['delta']:+.2f}", xy=(i, top + 0.06),
                    ha="center", fontsize=10, fontweight="bold")
    fig.tight_layout()
    out = CHARTS / "api_match_breakdown.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def plot_prompt_style_breakdown(by_model: dict) -> pathlib.Path | None:
    ENG = {
        "ai-describe-camera", "depth-occlusion", "gestures-thumbs-up",
        "hands-pinch-spawn", "modelviewer-gltf", "netblocks-presence",
        "physics-falling-cube", "sound-spatial-audio", "ui-button-hud",
        "world-plane-detection",
    }
    CANVAS_PREFIX = "canvas-"

    rows = []
    for model, (w, wo, _) in by_model.items():
        for label, picker in [
            ("engineer-spec", lambda t: t in ENG),
            ("canvas-faithful", lambda t: t.startswith(CANVAS_PREFIX)),
        ]:
            tasks = [t for t in w if picker(t)]
            if not tasks:
                continue
            ws = [w[t]["composite"] for t in tasks if t in w]
            wos = [wo[t]["composite"] for t in tasks if t in wo]
            n = min(len(ws), len(wos))
            if n == 0:
                continue
            rows.append({
                "model": model,
                "style": label,
                "with": sum(ws) / n,
                "without": sum(wos) / n,
                "delta": sum(ws) / n - sum(wos) / n,
                "n": n,
            })

    if not rows:
        return None

    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(rows))
    width = 0.38
    bars_w = ax.bar(x - width / 2, [r["with"] for r in rows], width,
                    label="with skill", color="#34a853")
    bars_wo = ax.bar(x + width / 2, [r["without"] for r in rows], width,
                     label="without skill", color="#ea4335")
    ax.set_xticks(x)
    ax.set_xticklabels(
        [f"{r['model'].replace('gemini-2.5-', '')}\n{r['style']}" for r in rows],
        fontsize=10,
    )
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("mean composite score")
    ax.set_title("skill effect by model and prompt style", pad=20)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0))
    ax.grid(axis="y", alpha=0.3)
    for i, r in enumerate(rows):
        ax.text(i - width / 2, r["with"] + 0.01, f"{r['with']:.2f}",
                ha="center", fontsize=9)
        ax.text(i + width / 2, r["without"] + 0.01, f"{r['without']:.2f}",
                ha="center", fontsize=9)
        # Put delta annotation ABOVE the pair of bars (not overlapping xticks).
        top = max(r["with"], r["without"])
        ax.annotate(f"Δ {r['delta']:+.2f}",
                    xy=(i, top + 0.06), ha="center",
                    fontsize=10, fontweight="bold",
                    color="#222")
    fig.tight_layout()
    out = CHARTS / "prompt_style_breakdown.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


if __name__ == "__main__":
    sys.exit(main())
