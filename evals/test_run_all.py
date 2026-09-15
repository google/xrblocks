"""Exercise the real shell orchestrator with offline runner/judge fixtures."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

EVALS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(EVALS / "prototypes" / "runners"))
import baseline_prompt


FAKE_RUNNER = """\
import json
import os
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from eval_common import workspace_path
from baseline_prompt import load_baseline
task, mode = sys.argv[1:3]
if mode == "with-baseline":
    assert sys.argv[3] == "--baseline-file"
    load_baseline(pathlib.Path(sys.argv[4]))
else:
    assert len(sys.argv) == 3
workspace = workspace_path(os.environ["GEMINI_MODEL"], task, mode)
with open(os.environ["CALL_LOG"], "a") as log:
    log.write(json.dumps({"kind": "generate", "task": task, "mode": mode, "workspace": str(workspace)}) + "\\n")
if mode == os.environ.get("FAIL_MODE"):
    sys.exit("synthetic generation failure")
workspace.mkdir(parents=True, exist_ok=True)
(workspace / "main.js").write_text(task + "/" + mode)
print("{}")
"""

FAKE_JUDGE = """\
import json
import os
import pathlib
import sys
task, workspace = sys.argv[1], pathlib.Path(sys.argv[2])
code = (workspace / "main.js").read_text()
assert code.startswith(task + "/")
with open(os.environ["CALL_LOG"], "a") as log:
    log.write(json.dumps({"kind": "judge", "task": task, "mode": code.split("/")[1], "workspace": str(workspace)}) + "\\n")
print(json.dumps({"accomplishes_task": 3, "idiomatic_xrblocks": 4, "hallucination_severity": "none"}))
"""


class SweepTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        self.evals = self.root / "evals"
        runners = self.evals / "prototypes" / "runners"
        runners.mkdir(parents=True)
        shutil.copyfile(EVALS / "run_all.sh", self.evals / "run_all.sh")
        shutil.copyfile(EVALS / "eval_common.py", self.evals / "eval_common.py")
        original = "\n".join(before for before, _ in baseline_prompt.OUTPUT_ADAPTATIONS)
        original += "\n# Reference Examples\nOffline synthetic example\n"
        self.baseline = self.root / "published prompts.txt"
        self.baseline.write_bytes(original.encode())
        digest = hashlib.sha256(self.baseline.read_bytes()).hexdigest()
        baseline_source = (EVALS / "prototypes" / "runners" / "baseline_prompt.py").read_text()
        (runners / "baseline_prompt.py").write_text(baseline_source.replace(baseline_prompt.ORIGINAL_SHA256, digest))
        (runners / "run_gem_api.py").write_text(FAKE_RUNNER)
        (self.evals / "prototypes" / "judge.py").write_text(FAKE_JUDGE)
        (self.evals / "summarize_proto.py").write_text("print('offline summary')\n")
        for task in ("task-one", "new-non-canvas-task"):
            directory = self.evals / "prototypes" / "tasks" / task
            directory.mkdir(parents=True)
            (directory / "spec.json").write_text(json.dumps({"edit_file": "main.js"}))
        (self.evals / "prototypes" / "tasks" / "not-a-task").mkdir()
        self.temp_root = self.root / "custom temp root"
        self.temp_root.mkdir()
        self.log = self.root / "calls.jsonl"
        self.env = {
            "PATH": str(pathlib.Path(sys.executable).parent) + os.pathsep + os.defpath,
            "HOME": str(self.root),
            "TMPDIR": str(self.temp_root),
            "GEMINI_API_KEY": "offline-fixture-key",
            "GEMINI_MODEL": "models/offline-model",
            "TASKS": "task-one",
            "CALL_LOG": str(self.log),
        }

    def run_sweep(self, *args):
        return subprocess.run(
            ["bash", str(self.evals / "run_all.sh"), *args],
            env=self.env, cwd=self.root, capture_output=True, text=True, timeout=30,
        )

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_defaults_still_generate_only_two_arms(self):
        result = self.run_sweep()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["mode"] for call in self.calls()], ["with-skill", "without-skill"])

    def test_explicit_three_arms_and_judge_use_matching_paths(self):
        result = self.run_sweep(
            "--modes", "with-skill,with-baseline,without-skill",
            "--baseline-file", str(self.baseline), "--judge",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 6)
        for generate, judge in zip(calls[::2], calls[1::2]):
            self.assertEqual(generate["workspace"], judge["workspace"])
            self.assertEqual(generate["mode"], judge["mode"])
            self.assertEqual(pathlib.Path(generate["workspace"]).parent, self.temp_root)
            self.assertIn("models-offline-model", generate["workspace"])
        judge_dir = self.evals / "results" / "models-offline-model" / "judge"
        self.assertEqual(len(list(judge_dir.glob("*.json"))), 3)
        self.assertTrue((judge_dir / "task-one-with-baseline.json").is_file())

    def test_subset_and_task_discovery(self):
        del self.env["TASKS"]
        result = self.run_sweep("--modes", "without-skill")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["task"] for call in self.calls()], ["new-non-canvas-task", "task-one"])
        self.assertTrue(all(call["mode"] == "without-skill" for call in self.calls()))

    def test_invalid_selections_fail_without_calls_or_credentials(self):
        del self.env["GEMINI_API_KEY"]
        cases = [
            ("--modes", ""),
            ("--modes", "unknown"),
            ("--modes", "with-skill,with-skill"),
            ("--modes", "with-skill,"),
            ("--modes", "with-baseline"),
            ("--baseline-file", str(self.baseline)),
            ("--modes",),
            ("--baseline-file",),
            ("--unexpected",),
        ]
        for args in cases:
            with self.subTest(args=args):
                result = self.run_sweep(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])
                self.assertNotIn("GEMINI_API_KEY not set", result.stderr)

    def test_bad_baseline_fails_before_first_legacy_arm(self):
        self.baseline.write_text("changed after selection")
        result = self.run_sweep(
            "--modes", "with-skill,with-baseline",
            "--baseline-file", str(self.baseline),
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_unsupported_baseline_task_contract_fails_before_first_arm(self):
        spec = self.evals / "prototypes" / "tasks" / "task-one" / "spec.json"
        spec.write_text(json.dumps({"edit_file": "index.html"}))
        result = self.run_sweep(
            "--modes", "with-skill,with-baseline", "--baseline-file", str(self.baseline),
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("supports only main.js", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_failed_generation_is_not_judged(self):
        self.env["FAIL_MODE"] = "with-skill"
        result = self.run_sweep("--judge")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            [(call["kind"], call["mode"]) for call in self.calls()],
            [("generate", "with-skill"), ("generate", "without-skill"), ("judge", "without-skill")],
        )

    def test_invalid_tasks_fail_before_generation(self):
        for tasks in ("../escape", "missing-task", "task-one task-one"):
            with self.subTest(tasks=tasks):
                self.env["TASKS"] = tasks
                result = self.run_sweep()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_help_needs_no_credentials(self):
        del self.env["GEMINI_API_KEY"]
        result = self.run_sweep("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("default modes: with-skill,without-skill", result.stdout)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
