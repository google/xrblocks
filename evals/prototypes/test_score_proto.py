#!/usr/bin/env python3
"""Tests for the prototype scorer.

Stdlib unittest so this needs nothing installed:

  python -m unittest discover -s evals/prototypes -p 'test_*.py'
"""
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from score_proto import strip_comments  # noqa: E402


class StripCommentsTest(unittest.TestCase):
    def test_drops_line_comments(self):
        code = strip_comments("// detect a thumbs up\nxb.init();")
        self.assertNotIn("thumbs", code)
        self.assertIn("xb.init()", code)

    def test_drops_block_comments(self):
        code = strip_comments("/* thumbs up here */\nxb.init();")
        self.assertNotIn("thumbs", code)
        self.assertIn("xb.init()", code)

    def test_keeps_string_literals(self):
        # Gesture names are passed as strings, so this is API usage, not prose.
        src = "options.gestures.setGestureEnabled('thumbs-up', true);"
        self.assertIn("thumbs-up", strip_comments(src))

    def test_keeps_template_literals(self):
        src = "log(`saw ${xb.core.gestureRecognition}`);"
        self.assertIn("xb.core.gestureRecognition", strip_comments(src))

    def test_comment_markers_inside_a_string_are_not_comments(self):
        src = "const url = 'http://example.com';\nxb.init();"
        code = strip_comments(src)
        self.assertIn("xb.init()", code)
        self.assertIn("example.com", code)

    def test_handles_escaped_quotes(self):
        src = "const s = 'it\\'s here'; // thumbs\nxb.init();"
        code = strip_comments(src)
        self.assertNotIn("thumbs", code)
        self.assertIn("xb.init()", code)

    def test_leaves_ordinary_code_alone(self):
        src = "const o = new xb.Options();\no.enableGestures();"
        self.assertEqual(strip_comments(src), src)


class ScoringRegressionTest(unittest.TestCase):
    """The behaviour this scorer exists to get right.

    An expectation like "thumbs" used to be satisfied by a comment, so code
    calling nothing real still scored on the API dimension.
    """

    EXPECTED = ["enableGestures", "xb.core.gestureRecognition", "thumbs-up"]

    HALLUCINATED = (
        "// Detect a thumbs up gesture.\n"
        "const d = xb.createGestureDetector({gesture: 'thumbs up'});\n"
    )
    GENUINE = (
        "const o = new xb.Options();\n"
        "o.enableGestures();\n"
        "o.gestures.setGestureEnabled('thumbs-up', true);\n"
        "xb.core.gestureRecognition.addEventListener('gesturestart', () => {});\n"
    )

    def hits(self, src: str) -> int:
        code = strip_comments(src)
        return sum(1 for api in self.EXPECTED if api in code)

    def test_invented_code_scores_nothing(self):
        self.assertEqual(self.hits(self.HALLUCINATED), 0)

    def test_genuine_code_scores_everything(self):
        # Including the gesture name, which only ever appears as a string.
        self.assertEqual(self.hits(self.GENUINE), 3)


if __name__ == "__main__":
    unittest.main()
