"""Validate a local published prompt and adapt only its output contract.

No network or provider dependencies. The CLI is also the sweep preflight:
  python3 evals/prototypes/runners/baseline_prompt.py /path/to/prompts.txt
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
from dataclasses import dataclass

PROTOCOL = "published-main-js-v1"
SOURCE_REVISION = "13dc481788bc5ce30d958882d26a9f1eab5e1287"
DEPLOYED_REVISION = "9d07c265088b9dbe4067c1acd0c9184452d90f0a"
SOURCE_URL = f"https://raw.githubusercontent.com/xrblocks/xrblocks.github.io/{DEPLOYED_REVISION}/prompts.txt"
ORIGINAL_SHA256 = "0fa7a73d7ee1fefff7bdaabc4ec4bf7e4e8f6c22e0f53e7189550bfa683373a3"
EXAMPLES_HEADING = "# Reference Examples"

OUTPUT_ADAPTATIONS = (
    (
        "You are authoring single-file WebXR experiences.",
        "You are authoring the main.js JavaScript module for a provided WebXR template.",
    ),
    ("1. **Architecture (Single File):**", "1. **Architecture (Application Module):**"),
    (
        "Output a SINGLE `index.html` file.",
        "Output only the complete contents of `main.js` inside a single ```javascript fenced block. "
        "Do not emit HTML, script tags, an importmap, or prose.",
    ),
    ('inside `<script type="module">`.', "in the JavaScript module."),
    (
        "CSS link tag must use:",
        "The host HTML template, not the generated module, owns the CSS link tag:",
    ),
    (
        'Use the specific versions below in `<script type="importmap">`.',
        "The following dependency versions belong in the host HTML template's "
        '`<script type="importmap">`, not in the generated module.',
    ),
    ("5. **Planning:**", "5. **Response Format:**"),
    (
        "   - Before generating code, briefly outline the `xb.Script` class structure, "
        "member variables, and the `init()` vs `update()` logic flow.",
        "   - Return only the complete `main.js` JavaScript module in the requested fenced block. "
        "Do not include a plan, outline, explanation, or other prose.",
    ),
)


@dataclass(frozen=True)
class BaselinePrompt:
    original: bytes
    system_prompt: str
    provenance: dict


def adapt_output_contract(original: str, edit_file: str = "main.js") -> tuple[str, list[dict]]:
    if edit_file != "main.js":
        raise ValueError(f"{PROTOCOL} supports only main.js, got {edit_file!r}")
    if original.count(EXAMPLES_HEADING) != 1:
        raise ValueError("unsupported baseline: expected one '# Reference Examples' heading")
    prefix, examples = original.split(EXAMPLES_HEADING, 1)
    changes = []
    for before, after in OUTPUT_ADAPTATIONS:
        if prefix.count(before) != 1:
            raise ValueError(f"unsupported baseline structure: expected exactly one {before!r}")
        prefix = prefix.replace(before, after, 1)
        changes.append({"before": before, "after": after})
    return prefix + EXAMPLES_HEADING + examples, changes


def load_baseline(path: pathlib.Path, edit_file: str = "main.js") -> BaselinePrompt:
    path = pathlib.Path(path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"baseline file does not exist: {path}")
    if not path.is_file():
        raise ValueError(f"baseline input is not a file: {path}")
    original = path.read_bytes()
    try:
        text = original.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"baseline must be UTF-8 text: {path}") from error
    if not text.strip():
        raise ValueError(f"baseline file is empty: {path}")
    digest = hashlib.sha256(original).hexdigest()
    if digest != ORIGINAL_SHA256:
        raise ValueError(
            f"unsupported baseline SHA-256 {digest}; expected {ORIGINAL_SHA256}. "
            f"Use an unchanged local copy of {SOURCE_URL}"
        )
    system_prompt, changes = adapt_output_contract(text, edit_file)
    return BaselinePrompt(
        original=original,
        system_prompt=system_prompt,
        provenance={
            "protocol": PROTOCOL,
            "source_url": SOURCE_URL,
            "source_revision": SOURCE_REVISION,
            "source_path": "build/prompts.txt",
            "deployed_revision": DEPLOYED_REVISION,
            "input_path": str(path),
            "original_bytes": len(original),
            "original_sha256": digest,
            "effective_sha256": hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
            "adaptations": changes,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline_file", type=pathlib.Path)
    args = parser.parse_args()
    try:
        baseline = load_baseline(args.baseline_file)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(baseline.provenance, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
