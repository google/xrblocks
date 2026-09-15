"""Offline tests for the published baseline's output-only adaptation."""
from __future__ import annotations

import hashlib
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "runners"))

import baseline_prompt


def fixture_prompt() -> str:
    prefix = "\n".join(before for before, _ in baseline_prompt.OUTPUT_ADAPTATIONS)
    return prefix + "\n# Unchanged API guidance\nxb.init();\n\n# Reference Examples\n```html\n<html>golden example</html>\n```\n"


class BaselinePromptTest(unittest.TestCase):
    def test_changes_only_explicit_header_fragments(self):
        original = fixture_prompt()
        effective, changes = baseline_prompt.adapt_output_contract(original)
        expected = original
        for before, after in baseline_prompt.OUTPUT_ADAPTATIONS:
            expected = expected.replace(before, after, 1)
        self.assertEqual(effective, expected)
        self.assertEqual(len(changes), len(baseline_prompt.OUTPUT_ADAPTATIONS))
        self.assertEqual(
            effective.split("# Reference Examples", 1)[1],
            original.split("# Reference Examples", 1)[1],
        )
        self.assertIn("# Unchanged API guidance\nxb.init();", effective)
        self.assertNotIn("Output a SINGLE", effective)
        self.assertNotIn("Before generating code", effective)
        self.assertIn("Do not emit HTML", effective)

    def test_same_fragment_in_example_is_not_adapted(self):
        original = fixture_prompt() + baseline_prompt.OUTPUT_ADAPTATIONS[0][0]
        effective, _ = baseline_prompt.adapt_output_contract(original)
        self.assertTrue(effective.endswith(baseline_prompt.OUTPUT_ADAPTATIONS[0][0]))

    def test_missing_duplicate_or_unsupported_structure_fails(self):
        original = fixture_prompt()
        fragment = baseline_prompt.OUTPUT_ADAPTATIONS[0][0]
        for value in (
            original.replace(fragment, "", 1),
            fragment + "\n" + original,
            original.replace("# Reference Examples", "# Examples"),
            original + "\n# Reference Examples\n",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                baseline_prompt.adapt_output_contract(value)
        with self.assertRaisesRegex(ValueError, "main.js"):
            baseline_prompt.adapt_output_contract(original, "index.html")

    def test_pinned_metadata(self):
        self.assertEqual(baseline_prompt.ORIGINAL_SHA256, "0fa7a73d7ee1fefff7bdaabc4ec4bf7e4e8f6c22e0f53e7189550bfa683373a3")
        self.assertIn("9d07c265088b9dbe4067c1acd0c9184452d90f0a/prompts.txt", baseline_prompt.SOURCE_URL)
        self.assertEqual(baseline_prompt.PROTOCOL, "published-main-js-v1")

    def test_loader_preserves_bytes_and_records_exact_hashes(self):
        raw = fixture_prompt().encode("utf-8")
        digest = hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "baseline.txt"
            path.write_bytes(raw)
            with mock.patch.object(baseline_prompt, "ORIGINAL_SHA256", digest):
                loaded = baseline_prompt.load_baseline(path)
        self.assertEqual(loaded.original, raw)
        self.assertEqual(loaded.provenance["original_sha256"], digest)
        self.assertEqual(loaded.provenance["original_bytes"], len(raw))
        self.assertEqual(loaded.provenance["protocol"], baseline_prompt.PROTOCOL)
        self.assertEqual(loaded.provenance["source_url"], baseline_prompt.SOURCE_URL)
        self.assertEqual(
            loaded.provenance["effective_sha256"],
            hashlib.sha256(loaded.system_prompt.encode("utf-8")).hexdigest(),
        )
        self.assertEqual(loaded.provenance["adaptations"][0]["before"], baseline_prompt.OUTPUT_ADAPTATIONS[0][0])

    def test_invalid_file_inputs_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "baseline.txt"
            for raw, message in (
                (b"", "empty"),
                (b" \r\n\t", "empty"),
                (b"\xff", "UTF-8"),
                (b"<!doctype html><html>Download prompts</html>", "SHA-256"),
                (fixture_prompt().encode(), "SHA-256"),
            ):
                with self.subTest(raw=raw):
                    path.write_bytes(raw)
                    with self.assertRaisesRegex(ValueError, message):
                        baseline_prompt.load_baseline(path)
            with self.assertRaises(FileNotFoundError):
                baseline_prompt.load_baseline(path.parent / "missing")
            with self.assertRaises(ValueError):
                baseline_prompt.load_baseline(path.parent)


if __name__ == "__main__":
    unittest.main()
