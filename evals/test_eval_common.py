"""Offline tests for result layout and paired evaluation data."""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import warnings
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import eval_common


class EvalCommonTest(unittest.TestCase):
    def test_default_modes_stay_two_arm(self):
        self.assertEqual(eval_common.DEFAULT_MODES, ("with-skill", "without-skill"))
        self.assertIn("with-baseline", eval_common.MODES)
        self.assertEqual(
            eval_common.parse_modes("without-skill,with-baseline"),
            ("without-skill", "with-baseline"),
        )
        for modes in ("", "unknown", "with-skill,", "with-skill,with-skill"):
            with self.subTest(modes=modes), self.assertRaises(ValueError):
                eval_common.parse_modes(modes)

    def test_paths_share_temp_root_and_model_slug(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            with mock.patch.object(eval_common.tempfile, "gettempdir", return_value=directory):
                workspace = eval_common.workspace_path("models/gemini-test", "task", "with-baseline")
            self.assertEqual(workspace, root / "xrblocks-gem-models-gemini-test-task-with-baseline")
            self.assertEqual(
                eval_common.result_path(root, "models/gemini-test", "task", "with-baseline"),
                root / "models-gemini-test" / "with-baseline" / "task.json",
            )
        for invalid in ("../task", "", "task/sub", r"task\sub"):
            with self.subTest(task=invalid), self.assertRaises(ValueError):
                eval_common.workspace_path("model", invalid, "with-skill")
        with self.assertRaises(ValueError):
            eval_common.workspace_path("model", "task", "unknown")

    def test_finite_scores_do_not_invent_zeros(self):
        for value in (None, "1", True, float("nan"), float("inf")):
            with self.subTest(value=value):
                self.assertIsNone(eval_common.finite_score({"composite": value}))
        self.assertEqual(eval_common.finite_score({"composite": 0}), 0)
        left = {"a": {"composite": 1}, "b": {"composite": 0.9}, "c": {"composite": float("nan")}}
        right = {"a": {"composite": 0}, "c": {"composite": 1}, "d": {"composite": 1}}
        self.assertEqual(eval_common.paired_scores(left, right), [("a", 1.0, 0.0)])

    def test_any_arm_discovery_and_legacy_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for model, mode in (("baseline-model", "with-baseline"), ("old-model", "without-skill")):
                result = eval_common.result_path(root, model, "task", mode)
                result.parent.mkdir(parents=True)
                result.write_text(json.dumps({"composite": 0.5}), encoding="utf-8")
            (root / "unrelated").mkdir()
            self.assertEqual([p.name for p in eval_common.discover_models(root)], ["baseline-model", "old-model"])
            modes, judges = eval_common.load_model(root / "old-model")
            self.assertEqual(modes, {"without-skill": {"task": {"composite": 0.5}}})
            self.assertEqual(judges, {})
            self.assertIsNone(eval_common.baseline_identity(modes["without-skill"]["task"]))
            (root / "old-model" / "without-skill" / "invalid.json").write_text("broken")
            with warnings.catch_warnings(record=True) as caught:
                eval_common.load_model(root / "old-model")
            self.assertEqual(len(caught), 1)

    def test_baseline_identity_uses_original_not_effective_hash(self):
        result = {"run": {"baseline": {"protocol": "v1", "original_sha256": "a", "effective_sha256": "b"}}}
        self.assertEqual(eval_common.baseline_identity(result), ("v1", "a"))


if __name__ == "__main__":
    unittest.main()
