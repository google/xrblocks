"""Offline reporting tests; synthetic results and charts stay under the repo.

Run: python3 -m unittest discover -s evals -p 'test_reporting.py'
Chart tests use the existing matplotlib/numpy dependencies when available.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import math
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import summarize_proto as summary
from eval_common import MODE_LABELS, load_model

CHART_DEPENDENCIES = all(importlib.util.find_spec(name) for name in ("matplotlib", "numpy"))
plot = None


def setUpModule():
    global plot
    if CHART_DEPENDENCIES:
        cache = tempfile.TemporaryDirectory(
            prefix=".reporting-cache-", dir=pathlib.Path(__file__).resolve().parent,
        )
        unittest.addModuleCleanup(cache.cleanup)
        environment = mock.patch.dict(os.environ, {"MPLCONFIGDIR": cache.name})
        environment.start()
        unittest.addModuleCleanup(environment.stop)
        import plot as plotting
        plot = plotting


def score(value, *, baseline=False, protocol="published-main-js-v1",
          original="original-a", effective="effective-a"):
    result = {
        "skill": "test-skill", "composite": value, "api_match": value,
        "import_match": value, "forbidden_clean": value, "parse_ok": value,
    }
    if baseline:
        result["run"] = {"baseline": {
            "protocol": protocol, "original_sha256": original,
            "effective_sha256": effective,
        }}
    return result


class ReportingFixture(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(
            prefix=".reporting-test-", dir=pathlib.Path(__file__).resolve().parent,
        )
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)

    def write_model(self, modes, judges=None, model="gemini-2.5-pro"):
        model_dir = self.root / "results" / model
        for mode, results in {**modes, "judge": judges or {}}.items():
            directory = model_dir / mode
            directory.mkdir(parents=True, exist_ok=True)
            for task, result in results.items():
                (directory / f"{task}.json").write_text(json.dumps(result), encoding="utf-8")
        return model_dir

    def render(self, modes, judges=None):
        lines, count = summary.render_model(self.write_model(modes, judges))
        return "\n".join(lines), count


class SummaryTest(ReportingFixture):
    def test_complete_three_arm_results_have_three_independent_comparisons(self):
        modes = {
            "with-skill": {"a": score(0.8), "b": score(1)},
            "without-skill": {"a": score(0.2), "b": score(0)},
            "with-baseline": {"a": score(0.4, baseline=True), "b": score(0.6, baseline=True)},
        }
        rows = summary.pairwise_means(modes)
        self.assertEqual([row["n"] for row in rows], [2, 2, 2])
        self.assertEqual(
            [(row["left_mean"], row["right_mean"]) for row in rows],
            [(0.9, 0.1), (0.9, 0.5), (0.5, 0.1)],
        )
        text, count = self.render(modes)
        self.assertEqual(count, 2)
        self.assertIn("| output-adapted baseline vs without skill | 2 | 0.50 | 0.10 | +0.40 |", text)

    def test_legacy_columns_and_exact_paired_mean(self):
        modes = {
            "with-skill": {"a": score(0), "b": score(1), "left-only": score(1)},
            "without-skill": {"a": score(0.2), "b": score(0.4), "right-only": score(1)},
        }
        text, count = self.render(modes)
        self.assertEqual(count, 4)
        self.assertIn("| task | skill | composite w/ | composite w/o | Δ |", text)
        self.assertIn("| **avg** |  | **0.50** | **0.30** | **+0.20** |", text)
        self.assertIn("paired n=2", text)
        self.assertIn("| a | test-skill | 0.00 | 0.20 | -0.20 |", text)
        self.assertIn("| left-only | test-skill | 1.00 | - | - |", text)
        self.assertNotIn("output-adapted baseline", text)

    def test_partial_baseline_does_not_change_historical_population(self):
        modes = {
            "with-skill": {"a": score(0.2), "b": score(1), "unpaired": score(1)},
            "without-skill": {"a": score(0), "b": score(0.4)},
            "with-baseline": {"a": score(0.1, baseline=True)},
        }
        text, _ = self.render(modes)
        comparisons = summary.pairwise_means(modes)
        self.assertEqual([row["n"] for row in comparisons], [2, 1, 1])
        self.assertAlmostEqual(comparisons[0]["left_mean"], 0.6)
        self.assertAlmostEqual(comparisons[0]["right_mean"], 0.2)
        self.assertEqual(comparisons[1]["left_mean"], 0.2)
        self.assertEqual(comparisons[1]["right_mean"], 0.1)
        self.assertIn("| **avg** |  | **0.60** | **0.20** | **+0.40** | - |", text)
        self.assertIn("| with skill vs output-adapted baseline | 1 | 0.20 | 0.10 | +0.10 |", text)
        self.assertIn("| output-adapted baseline vs without skill | 1 | 0.10 | 0.00 | +0.10 |", text)
        self.assertIn("protocol=published-main-js-v1", text)
        self.assertIn("original_sha256=original-a", text)
        self.assertIn("effective_sha256=effective-a", text)

    def test_finite_filtering_and_missing_judge_cells(self):
        invalid = [None, True, "1", float("nan"), float("inf"), float("-inf")]
        modes = {
            "with-skill": {str(index): score(value) for index, value in enumerate(invalid)},
            "without-skill": {str(index): score(1) for index in range(len(invalid))},
        }
        modes["with-skill"]["zero"] = score(0)
        modes["without-skill"]["zero"] = score(0)
        judges = {"zero-with-skill": {"accomplishes_task": 0}}
        text, _ = self.render(modes, judges)
        self.assertNotIn("nan", text)
        self.assertNotIn("inf", text)
        self.assertIn("| 0 | test-skill | - | 1.00 | - | - | - |", text)
        self.assertIn("| zero | test-skill | 0.00 | 0.00 | +0.00 | 0/-/- | - |", text)
        self.assertIn("paired n=1", text)

    def test_baseline_judge_and_without_only_models_are_discovered(self):
        baseline = self.write_model(
            {"with-baseline": {"new-feature-task": score(0, baseline=True)}},
            {"new-feature-task-with-baseline": {"accomplishes_task": 4, "idiomatic_xrblocks": 3}},
            "baseline-only",
        )
        without = self.write_model({"without-skill": {"other-task": score(0.8)}}, model="without-only")
        with mock.patch.object(summary, "RESULTS", self.root / "results"):
            self.assertEqual(summary.discover_models(), [baseline, without])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(summary.main(), 0)
        text = (self.root / "results" / "_summary.md").read_text()
        self.assertIn("new-feature-task", text)
        self.assertIn("judge output-adapted baseline", text)
        self.assertIn("| new-feature-task | test-skill | - | - | - | - | - | 0.00 | 4/3/- |", text)
        self.assertIn("| other-task | test-skill | - | 0.80 | - |", text)

    def test_mixed_baselines_suppress_only_baseline_headlines(self):
        for different in (
            score(0.4, baseline=True, protocol="other-protocol"),
            score(0.4, baseline=True, original="other-source"),
            score(0.4),
        ):
            with self.subTest(different=different):
                modes = {
                    "with-skill": {"a": score(1), "b": score(0.8)},
                    "without-skill": {"a": score(0), "b": score(0.2)},
                    "with-baseline": {"a": score(0.5, baseline=True), "b": different},
                }
                rows = summary.pairwise_means(modes)
                self.assertAlmostEqual(rows[0]["left_mean"], 0.9)
                self.assertFalse(rows[0]["suppressed"])
                for row in rows[1:]:
                    self.assertEqual(row["n"], 2)
                    self.assertTrue(row["suppressed"])
                    self.assertIsNone(row["left_mean"])
                    self.assertIsNone(row["right_mean"])
                text, _ = self.render(modes)
                self.assertIn("Warning: incompatible baseline identities", text)
                self.assertIn("(suppressed: incompatible baseline identities) | 2 | - | - | - |", text)

    def test_effective_hash_differences_are_not_incompatible(self):
        modes = {
            "with-skill": {"a": score(1), "b": score(0)},
            "with-baseline": {
                "a": score(0.5, baseline=True),
                "b": score(0.3, baseline=True, effective="effective-b"),
            },
        }
        self.assertFalse(summary.incompatible_baselines(modes))
        rows = summary.pairwise_means(modes)
        self.assertEqual(rows[0]["n"], 2)
        self.assertAlmostEqual(rows[0]["right_mean"], 0.4)
        text, _ = self.render(modes)
        self.assertIn("effective_sha256=effective-a", text)
        self.assertIn("effective_sha256=effective-b", text)
        self.assertNotIn("Warning:", text)

    def test_legacy_baseline_provenance_is_readable(self):
        text, _ = self.render({"with-baseline": {"task": score(0)}})
        self.assertIn("legacy/unknown provenance", text)
        self.assertNotIn("Warning:", text)

    def test_disjoint_arms_have_no_manufactured_mean(self):
        modes = {"with-skill": {"a": score(1)}, "without-skill": {"b": score(0)}}
        text, _ = self.render(modes)
        self.assertNotIn("**avg**", text)
        self.assertIn("| with skill vs without skill | 0 | - | - | - |", text)

    def test_malformed_files_are_skipped_without_losing_valid_results(self):
        model = self.write_model({"without-skill": {"good": score(0)}})
        for filename, content in (("bad.json", "{"), ("empty.json", ""), ("array.json", "[]")):
            (model / "without-skill" / filename).write_text(content)
        with self.assertWarns(UserWarning):
            lines, count = summary.render_model(model)
        self.assertEqual(count, 1)
        self.assertIn("good", "\n".join(lines))


@unittest.skipUnless(CHART_DEPENDENCIES, "matplotlib/numpy are not installed; no dependency installs requested")
class ChartTest(ReportingFixture):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(plot, "CHARTS", self.root / "charts")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.figures = []
        save = plot._save_chart

        def capture(fig, filename, by_model):
            self.figures.append(fig)
            return save(fig, filename, by_model)

        patcher = mock.patch.object(plot, "_save_chart", side_effect=capture)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(plot.plt.close, "all")

    def assert_values(self, container, expected):
        values = [bar.get_height() for bar in container]
        self.assertEqual(len(values), len(expected))
        for value, wanted in zip(values, expected):
            if wanted is None:
                self.assertTrue(math.isnan(value), values)
            else:
                self.assertAlmostEqual(value, wanted)

    def test_observed_task_order_preserves_groups_and_new_task_ids(self):
        tasks = ["new-pose-task", "canvas-game", "world-plane-detection", "new-audio-task"]
        self.assertEqual(
            plot.ordered_tasks(tasks),
            ["world-plane-detection", "canvas-game", "new-audio-task", "new-pose-task"],
        )
        self.assertEqual(plot.short_label("new-pose-task"), "new-pose-task")

    def test_all_five_families_render_actual_series_gaps_and_counts(self):
        tasks = ["ui-button-hud", "canvas-game", "new-pose-task"]
        modes = {
            "with-skill": {tasks[0]: score(0), tasks[1]: score(1)},
            "without-skill": {tasks[0]: score(0.5), tasks[2]: score(0.2)},
            "with-baseline": {tasks[0]: score(0.3, baseline=True), tasks[2]: score(0.4, baseline=True)},
        }
        judges = {
            f"{tasks[0]}-with-skill": {"idiomatic_xrblocks": 0},
            f"{tasks[2]}-with-baseline": {"idiomatic_xrblocks": 4},
        }
        model = self.write_model(modes, judges)
        loaded = load_model(model)
        by_model = {model.name: loaded}
        outputs = [
            plot.plot_composite_multi_model(tasks, by_model),
            plot.plot_judge_multi_model(tasks, by_model),
            plot.plot_metric_grid(tasks, loaded[0], model.name),
            plot.plot_prompt_style_breakdown(by_model),
            plot.plot_api_match_breakdown(by_model),
        ]
        self.assertEqual([path.name for path in outputs], [
            "composite_per_task.png", "judge_per_task.png",
            "metrics_grid_gemini-2.5-pro.png", "prompt_style_breakdown.png",
            "api_match_breakdown.png",
        ])
        self.assertTrue(all(path.stat().st_size > 0 for path in outputs))
        composite, judge, grid, styles, api = self.figures
        for fig in self.figures:
            self.assertIn("protocol=published-main-js-v1", "\n".join(text.get_text() for text in fig.texts))
        self.assertEqual([tick.get_text() for tick in composite.axes[0].get_xticklabels()], tasks)
        self.assert_values(composite.axes[0].containers[0], [0, 1, None])
        self.assert_values(composite.axes[0].containers[1], [0.5, None, 0.2])
        self.assert_values(composite.axes[0].containers[2], [0.3, None, 0.4])
        self.assertIn("output-adapted baseline", composite.axes[0].containers[2].get_label())
        self.assert_values(judge.axes[0].containers[0], [0, None, None])
        self.assert_values(judge.axes[0].containers[1], [None, None, None])
        self.assert_values(judge.axes[0].containers[2], [None, None, 4])
        for ax in grid.axes:
            self.assertEqual([container.get_label() for container in ax.containers], list(MODE_LABELS.values()))
            self.assert_values(ax.containers[0], [0, 1, None])
            self.assert_values(ax.containers[2], [0.3, None, 0.4])
            self.assertIn("new-pose-task", [tick.get_text() for tick in ax.get_xticklabels()])
        for fig in (styles, api):
            ax = fig.axes[0]
            self.assertEqual([container.get_label() for container in ax.containers], list(MODE_LABELS.values()))
            labels = "\n".join(tick.get_text() for tick in ax.get_xticklabels())
            self.assertIn("other tasks", labels)
            self.assertIn("paired n=1", labels)
            self.assertIn("unavailable n=0", labels)
            self.assert_values(ax.containers[0], [0, 0, None, None, None, None, None, None, None])
            self.assert_values(ax.containers[2], [None, 0.3, 0.3, None, None, None, None, None, 0.4])

    def test_breakdowns_use_metric_specific_exact_intersections(self):
        modes = {
            "with-skill": {
                "ui-button-hud": score(0), "depth-occlusion": score(1),
                "world-plane-detection": score(1),
            },
            "without-skill": {"ui-button-hud": score(0.2), "depth-occlusion": score(0.4)},
            "with-baseline": {"ui-button-hud": score(0.5, baseline=True)},
        }
        modes["without-skill"]["depth-occlusion"]["api_match"] = float("inf")
        by_model = {"gemini-2.5-pro": (modes, {})}
        composite = plot.breakdown_rows(by_model, "composite")
        api = plot.breakdown_rows(by_model, "api_match")
        self.assertEqual([row["n"] for row in composite], [2, 1, 1])
        self.assertEqual([row["n"] for row in api], [1, 1, 1])
        self.assertEqual(composite[0]["values"]["with-skill"], 0.5)
        self.assertAlmostEqual(composite[0]["values"]["without-skill"], 0.3)
        self.assertEqual(api[0]["values"], {"with-skill": 0, "without-skill": 0.2})
        self.assertEqual(composite[1]["values"]["with-skill"], 0)

    def test_single_arm_charts_do_not_require_skill_or_invent_other_series(self):
        for mode in ("with-baseline", "without-skill"):
            with self.subTest(mode=mode):
                modes = {mode: {"new-only-task": score(0, baseline=mode == "with-baseline")}}
                judges = {f"new-only-task-{mode}": {"idiomatic_xrblocks": 0}}
                by_model = {"single": (modes, judges)}
                plot.plot_composite_multi_model(["new-only-task"], by_model)
                plot.plot_judge_multi_model(["new-only-task"], by_model)
                plot.plot_metric_grid(["new-only-task"], modes, "single")
                plot.plot_prompt_style_breakdown(by_model)
                plot.plot_api_match_breakdown(by_model)
                for fig in self.figures[-5:]:
                    for ax in fig.axes:
                        self.assertEqual(len(ax.containers), 1)
                        self.assert_values(ax.containers[0], [0])
                for fig in self.figures[-2:]:
                    self.assertIn("unpaired n=1", fig.axes[0].get_xticklabels()[0].get_text())

    def test_nonfinite_values_plot_as_gaps_but_zero_remains_zero(self):
        modes = {"without-skill": {
            str(index): score(value) for index, value in enumerate(
                [None, "1", True, float("nan"), float("inf"), 0],
            )
        }}
        plot.plot_composite_multi_model(list(modes["without-skill"]), {"single": (modes, {})})
        self.assert_values(self.figures[-1].axes[0].containers[0], [None, None, None, None, None, 0])

    def test_incompatible_baseline_means_are_gaps_with_visible_warning(self):
        modes = {
            "with-skill": {"ui-button-hud": score(1), "depth-occlusion": score(0)},
            "without-skill": {"ui-button-hud": score(0), "depth-occlusion": score(0.2)},
            "with-baseline": {
                "ui-button-hud": score(0.3, baseline=True),
                "depth-occlusion": score(0.6, baseline=True, original="other-source"),
            },
        }
        by_model = {"mixed": (modes, {})}
        for render in (plot.plot_prompt_style_breakdown, plot.plot_api_match_breakdown):
            render(by_model)
            fig = self.figures[-1]
            self.assertIn("Warning: incompatible baseline identities",
                          "\n".join(text.get_text() for text in fig.texts))
            self.assert_values(fig.axes[0].containers[0], [0.5, None, None])
            self.assert_values(fig.axes[0].containers[2], [None, None, None])
            self.assertIn("suppressed:", fig.axes[0].get_xticklabels()[1].get_text())

    def test_historical_chart_colors_and_filenames(self):
        modes = {
            "with-skill": {"ui-button-hud": score(1)},
            "without-skill": {"ui-button-hud": score(0)},
        }
        by_model = {"gemini-2.5-pro": (modes, {})}
        plot.plot_composite_multi_model(["ui-button-hud"], by_model)
        ax = self.figures[-1].axes[0]
        colors = plot.matplotlib.colors
        self.assertEqual(ax.containers[0][0].get_facecolor(), colors.to_rgba("#0b8043"))
        self.assertEqual(ax.containers[1][0].get_facecolor(), colors.to_rgba("#c5221f"))
        plot.plot_prompt_style_breakdown(by_model)
        ax = self.figures[-1].axes[0]
        self.assertEqual(ax.containers[0][0].get_facecolor(), colors.to_rgba("#34a853"))
        self.assertEqual(ax.containers[1][0].get_facecolor(), colors.to_rgba("#ea4335"))
        self.assertIn("paired n=1", ax.get_xticklabels()[0].get_text())

    def test_main_uses_union_of_all_modes_and_models(self):
        self.write_model({"with-baseline": {"new-baseline-task": score(0, baseline=True)}}, model="baseline")
        self.write_model({"without-skill": {"new-without-task": score(1)}}, model="without")
        with mock.patch.object(plot, "RESULTS", self.root / "results"):
            self.assertEqual(plot.discover_models(), ["baseline", "without"])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(plot.main(), 0)
        ticks = [tick.get_text() for tick in self.figures[0].axes[0].get_xticklabels()]
        self.assertEqual(ticks, ["new-baseline-task", "new-without-task"])
        self.assert_values(self.figures[0].axes[0].containers[0], [0, None])
        self.assert_values(self.figures[0].axes[0].containers[1], [None, 1])


if __name__ == "__main__":
    unittest.main()
