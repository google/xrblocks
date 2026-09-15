"""Provider-free mode, path, and result conventions for the evaluation scripts."""
from __future__ import annotations

import json
import math
import pathlib
import re
import tempfile
import warnings

DEFAULT_MODES = ("with-skill", "without-skill")
MODES = (*DEFAULT_MODES, "with-baseline")
MODE_LABELS = {
    "with-skill": "with skill",
    "without-skill": "without skill",
    "with-baseline": "output-adapted baseline",
}


def validate_mode(mode: str) -> None:
    if mode not in MODES:
        raise ValueError(f"unsupported mode {mode!r}; choose from {', '.join(MODES)}")


def parse_modes(value: str) -> tuple[str, ...]:
    modes = tuple(value.split(","))
    for mode in modes:
        validate_mode(mode)
    if len(set(modes)) != len(modes):
        raise ValueError("duplicate modes are not allowed")
    return modes


def validate_task_id(task_id: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", task_id):
        raise ValueError(f"invalid task_id: {task_id!r}")


def model_slug(model: str) -> str:
    slug = model.replace("/", "-").replace("\\", "-")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", slug):
        raise ValueError(f"invalid model: {model!r}")
    return slug


def workspace_path(model: str, task_id: str, mode: str) -> pathlib.Path:
    validate_task_id(task_id)
    validate_mode(mode)
    return pathlib.Path(tempfile.gettempdir()) / f"xrblocks-gem-{model_slug(model)}-{task_id}-{mode}"


def result_path(results: pathlib.Path, model: str, task_id: str, mode: str) -> pathlib.Path:
    validate_task_id(task_id)
    validate_mode(mode)
    return results / model_slug(model) / mode / f"{task_id}.json"


def discover_models(results: pathlib.Path) -> list[pathlib.Path]:
    if not results.exists():
        return []
    return sorted(
        path for path in results.iterdir()
        if path.is_dir() and any((path / mode).is_dir() for mode in MODES)
    )


def _load_dir(directory: pathlib.Path) -> dict[str, dict]:
    results = {}
    for path in sorted(directory.glob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            warnings.warn(f"ignoring unreadable result {path}: {error}", stacklevel=2)
            continue
        if not isinstance(value, dict):
            warnings.warn(f"ignoring non-object result {path}", stacklevel=2)
            continue
        results[path.stem] = value
    return results


def load_model(model_dir: pathlib.Path) -> tuple[dict[str, dict[str, dict]], dict[str, dict]]:
    modes = {}
    for mode in MODES:
        results = _load_dir(model_dir / mode)
        if results:
            modes[mode] = results
    return modes, _load_dir(model_dir / "judge")


def finite_score(result: dict, metric: str = "composite") -> float | None:
    value = result.get(metric)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def paired_scores(left: dict, right: dict, metric: str = "composite") -> list[tuple[str, float, float]]:
    pairs = []
    for task in sorted(left.keys() & right.keys()):
        a = finite_score(left[task], metric)
        b = finite_score(right[task], metric)
        if a is not None and b is not None:
            pairs.append((task, a, b))
    return pairs


def baseline_identity(result: dict) -> tuple[str, str] | None:
    run = result.get("run")
    baseline = run.get("baseline") if isinstance(run, dict) else None
    if not isinstance(baseline, dict):
        return None
    protocol = baseline.get("protocol")
    digest = baseline.get("original_sha256")
    if not isinstance(protocol, str) or not protocol or not isinstance(digest, str) or not digest:
        return None
    return protocol, digest
