"""Runner tests with synthetic workspaces and a stubbed provider."""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "runners"))

import run_gem_api as runner
from baseline_prompt import BaselinePrompt
import eval_common


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = pathlib.Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.evals = self.root / "evals"
        self.task_dir = self.evals / "prototypes" / "tasks" / "test-task"
        self.task_dir.mkdir(parents=True)
        self.spec = {"skill": "xb-test", "reference_files": ["reference.md"], "template": "template", "edit_file": "main.js"}
        (self.task_dir / "spec.json").write_text(json.dumps(self.spec))
        (self.task_dir / "prompt.md").write_text("Build the same test app.")
        (self.root / "template").mkdir()
        (self.root / "template" / "index.html").write_text("common-template")
        (self.root / "CONTEXT.md").write_text("CONTRACT-SENTINEL")
        (self.root / "reference.md").write_text("REFERENCE-SENTINEL")
        skill = self.root / "skills" / "xb-test"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text("SKILL-SENTINEL")
        self.workspaces = self.root / "temporary workspaces"
        self.workspaces.mkdir()
        for name, value in (("REPO_ROOT", self.root), ("EVALS", self.evals), ("TASKS", self.task_dir.parent), ("MODEL", "models/test-model")):
            self.stack.enter_context(mock.patch.object(runner, name, value))
        self.stack.enter_context(mock.patch.object(eval_common.tempfile, "gettempdir", return_value=str(self.workspaces)))
        self.stack.enter_context(mock.patch.dict(runner.os.environ, {"GEMINI_API_KEY": "offline-test-key"}, clear=True))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.client = mock.Mock()
        self.client.models.generate_content.return_value = types.SimpleNamespace(
            text="```javascript\nxb.init();\n```",
            usage_metadata=types.SimpleNamespace(prompt_token_count=12),
        )
        self.client_constructor = mock.Mock(return_value=self.client)
        google = types.ModuleType("google")
        genai = types.ModuleType("google.genai")
        config_types = types.ModuleType("google.genai.types")
        config_types.GenerateContentConfig = types.SimpleNamespace
        genai.Client = self.client_constructor
        genai.types = config_types
        google.genai = genai
        self.stack.enter_context(mock.patch.dict(sys.modules, {"google": google, "google.genai": genai, "google.genai.types": config_types}))
        self.scorer = self.stack.enter_context(mock.patch.object(
            runner.subprocess, "run",
            return_value=types.SimpleNamespace(stdout=json.dumps({"task": "test-task", "skill": "xb-test", "composite": 0.5})),
        ))
        self.original = b"published baseline original"
        self.effective = "output-adapted baseline only\n"
        self.provenance = {
            "protocol": "fixture-v1",
            "original_sha256": hashlib.sha256(self.original).hexdigest(),
            "effective_sha256": hashlib.sha256(self.effective.encode()).hexdigest(),
        }

    def stub_baseline(self):
        return self.stack.enter_context(mock.patch.object(
            runner, "load_baseline",
            return_value=BaselinePrompt(self.original, self.effective, self.provenance),
        ))

    def test_all_arms_share_task_config_template_and_scoring(self):
        loader = self.stub_baseline()
        outputs = {}
        for mode in eval_common.MODES:
            args = {"baseline_file": pathlib.Path("fixture.txt")} if mode == "with-baseline" else {}
            outputs[mode] = runner.run_task("test-task", mode, **args)
        calls = self.client.models.generate_content.call_args_list
        self.assertEqual(len(calls), 3)
        self.assertEqual(len({call.kwargs["contents"] for call in calls}), 1)
        for call in calls:
            self.assertEqual(call.kwargs["model"], "models/test-model")
            self.assertEqual(call.kwargs["config"].temperature, 0.2)
        skill_prompt = calls[0].kwargs["config"].system_instruction
        for sentinel in ("CONTRACT-SENTINEL", "REFERENCE-SENTINEL", "SKILL-SENTINEL"):
            self.assertIn(sentinel, skill_prompt)
        self.assertIsNone(calls[1].kwargs["config"].system_instruction)
        self.assertEqual(calls[2].kwargs["config"].system_instruction, self.effective)
        loader.assert_called_once_with(pathlib.Path("fixture.txt"), "main.js")
        self.assertEqual(self.scorer.call_count, 3)
        for call in self.scorer.call_args_list:
            command = call.args[0]
            self.assertEqual(command[:3], [
                sys.executable, str(self.evals / "prototypes" / "score_proto.py"), str(self.task_dir.resolve()),
            ])
        self.assertEqual(len({result["run"]["workspace"] for result in outputs.values()}), 3)
        for mode, result in outputs.items():
            workspace = pathlib.Path(result["run"]["workspace"])
            self.assertEqual((workspace / "index.html").read_text(), "common-template")
            self.assertEqual((workspace / "main.js").read_text(), "xb.init();\n")
            result_file = self.evals / "results" / "models-test-model" / mode / "test-task.json"
            self.assertEqual(json.loads(result_file.read_text()), result)
            self.assertEqual(result["composite"], 0.5)

    def test_logs_original_effective_and_result_provenance(self):
        self.stub_baseline()
        result = runner.run_task("test-task", "with-baseline", baseline_file=pathlib.Path("fixture.txt"))
        meta = pathlib.Path(result["run"]["metadata_dir"])
        self.assertEqual((meta / "baseline_original.txt").read_bytes(), self.original)
        effective = (meta / "system_prompt.md").read_bytes()
        self.assertEqual(effective, self.effective.encode())
        self.assertEqual(hashlib.sha256(effective).hexdigest(), result["run"]["system_prompt_sha256"])
        self.assertEqual(result["run"]["baseline"], self.provenance)
        self.assertEqual(json.loads((meta / "run.json").read_text()), result["run"])

    def test_empty_arm_log_is_actually_empty(self):
        result = runner.run_task("test-task", "without-skill")
        self.assertNotIn("baseline", result["run"])
        self.assertEqual((pathlib.Path(result["run"]["metadata_dir"]) / "system_prompt.md").read_bytes(), b"")

    def test_baseline_does_not_read_skill_or_reference_files(self):
        (self.root / "CONTEXT.md").unlink()
        (self.root / "reference.md").unlink()
        (self.root / "skills" / "xb-test" / "SKILL.md").unlink()
        self.stub_baseline()
        runner.run_task("test-task", "with-baseline", baseline_file=pathlib.Path("fixture.txt"))
        self.client.models.generate_content.assert_called_once()

    def test_invalid_modes_and_inputs_do_not_mutate_workspaces(self):
        marker = self.workspaces / "keep.txt"
        marker.write_text("unchanged")
        cases = [
            ("invalid", {}),
            ("with-baseline", {}),
            ("with-skill", {"baseline_file": pathlib.Path("fixture")}),
            ("without-skill", {"baseline_file": pathlib.Path("fixture")}),
            ("with-baseline", {"baseline_file": self.root / "missing.txt"}),
        ]
        for mode, args in cases:
            with self.subTest(mode=mode), self.assertRaises((ValueError, FileNotFoundError)):
                runner.run_task("test-task", mode, **args)
        self.assertEqual(list(self.workspaces.iterdir()), [marker])
        self.assertEqual(marker.read_text(), "unchanged")
        self.client_constructor.assert_not_called()
        self.scorer.assert_not_called()

    def test_bad_baseline_preserves_previous_workspace(self):
        workspace = eval_common.workspace_path(runner.MODEL, "test-task", "with-baseline")
        workspace.mkdir()
        marker = workspace / "main.js"
        marker.write_text("previous output")
        baseline = self.root / "wrong.txt"
        baseline.write_text("not the published baseline")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            runner.run_task("test-task", "with-baseline", baseline_file=baseline)
        self.assertEqual(marker.read_text(), "previous output")
        self.client_constructor.assert_not_called()

    def test_unsafe_output_fails_before_provider(self):
        self.spec["edit_file"] = "../escape.js"
        (self.task_dir / "spec.json").write_text(json.dumps(self.spec))
        with self.assertRaisesRegex(ValueError, "escapes"):
            runner.run_task("test-task", "without-skill")
        self.client_constructor.assert_not_called()

    def test_cli_help_and_invalid_mode_need_no_credentials(self):
        with mock.patch.dict(runner.os.environ, {}, clear=True):
            for args, code in ((["--help"], 0), (["test-task", "invalid"], 2)):
                with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as error:
                        runner.main(args)
                    self.assertEqual(error.exception.code, code)
        self.client_constructor.assert_not_called()

    def test_cli_baseline_argument_dispatch(self):
        with mock.patch.object(runner, "run_task") as run:
            self.assertEqual(runner.main(["test-task", "with-baseline", "--baseline-file", "local.txt"]), 0)
        run.assert_called_once_with("test-task", "with-baseline", baseline_file=pathlib.Path("local.txt"))


class EntryPointTest(unittest.TestCase):
    def test_module_entry_point_help_without_provider_import(self):
        root = pathlib.Path(__file__).resolve().parents[2]
        environment = {key: value for key, value in os.environ.items() if key not in ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
        result = subprocess.run(
            [sys.executable, "-m", "evals.prototypes.runners.run_gem_api", "--help"],
            cwd=root, env=environment, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("with-baseline", result.stdout)


if __name__ == "__main__":
    unittest.main()
