#!/usr/bin/env bash
# Run every task in the selected modes, optionally with the judge.
# Default spending is unchanged: with-skill and without-skill only.
#
# Usage:
#   ./evals/run_all.sh             # run agent + scorer for every task × 2 modes
#   ./evals/run_all.sh --judge     # also run the llm-judge on each output
#   ./evals/run_all.sh --modes with-skill,with-baseline,without-skill \
#     --baseline-file /path/to/prompts.txt
#
# Env:
#   GEMINI_API_KEY  required
#   TASKS           optional, space-separated task ids to limit the run
#                   (default: every task with a spec.json)

set -euo pipefail

WITH_JUDGE=0
MODES="with-skill,without-skill"
BASELINE_FILE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --judge) WITH_JUDGE=1; shift ;;
    --modes|--baseline-file)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "error: $1 requires a value" >&2
        exit 1
      fi
      if [ "$1" = "--modes" ]; then MODES="$2"; else BASELINE_FILE="$2"; fi
      shift 2
      ;;
    --help|-h)
      echo "usage: run_all.sh [--judge] [--modes with-skill,without-skill,with-baseline] [--baseline-file PATH]"
      echo "default modes: with-skill,without-skill; baseline requires the pinned local prompt"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVALS="$REPO_ROOT/evals"
MODEL="${GEMINI_MODEL:-gemini-2.5-pro}"

# Validate the whole selection before spending on even the first legacy arm.
configuration=$(python3 - "$EVALS" "$MODES" "$BASELINE_FILE" "$MODEL" <<'PY'
import pathlib
import sys
sys.path.insert(0, sys.argv[1])
from eval_common import model_slug, parse_modes
sys.path.insert(0, str(pathlib.Path(sys.argv[1]) / "prototypes" / "runners"))
from baseline_prompt import load_baseline
try:
    modes = parse_modes(sys.argv[2])
    if ("with-baseline" in modes) != bool(sys.argv[3]):
        raise ValueError("--baseline-file is required only when with-baseline is selected")
    if "with-baseline" in modes:
        load_baseline(pathlib.Path(sys.argv[3]))
    print(model_slug(sys.argv[4]), " ".join(modes))
except (OSError, ValueError) as error:
    sys.exit(f"error: {error}")
PY
)
read -r model_slug mode_list <<< "$configuration"

if [ -n "${TASKS:-}" ]; then
  TASK_LIST="$TASKS"
else
  TASK_LIST=$(python3 - "$EVALS/prototypes/tasks" <<'PY'
import pathlib
import sys
print(" ".join(path.parent.name for path in sorted(pathlib.Path(sys.argv[1]).glob("*/spec.json"))))
PY
)
fi

python3 - "$EVALS" "$TASK_LIST" "$mode_list" <<'PY'
import json
import pathlib
import sys
sys.path.insert(0, sys.argv[1])
from eval_common import validate_task_id
try:
    tasks = sys.argv[2].split()
    if not tasks or len(tasks) != len(set(tasks)):
        raise ValueError("select at least one task, without duplicates")
    for task in tasks:
        validate_task_id(task)
        spec = json.loads((pathlib.Path(sys.argv[1]) / "prototypes" / "tasks" / task / "spec.json").read_text())
        if "with-baseline" in sys.argv[3].split() and spec.get("edit_file") != "main.js":
            raise ValueError(f"published-main-js-v1 supports only main.js: {task}")
except (OSError, ValueError) as error:
    sys.exit(f"error: {error}")
PY

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "error: GEMINI_API_KEY not set" >&2
  exit 1
fi

echo "tasks: $TASK_LIST"
echo "modes: $mode_list"
echo "judge: $([ "$WITH_JUDGE" = 1 ] && echo on || echo off)"
echo

for task in $TASK_LIST; do
  for mode in $mode_list; do
    echo "============================================================"
    echo "$task / $mode"
    echo "============================================================"
    runner_args=("$task" "$mode")
    if [ "$mode" = "with-baseline" ]; then
      runner_args+=(--baseline-file "$BASELINE_FILE")
    fi
    python3 "$EVALS/prototypes/runners/run_gem_api.py" "${runner_args[@]}" 2>&1 | tail -3 || {
      echo "  ! $task / $mode failed"
      continue
    }
    if [ "$WITH_JUDGE" = 1 ]; then
      workspace=$(python3 - "$EVALS" "$MODEL" "$task" "$mode" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from eval_common import workspace_path
print(workspace_path(sys.argv[2], sys.argv[3], sys.argv[4]))
PY
)
      judge_dir="$EVALS/results/${model_slug}/judge"
      mkdir -p "$judge_dir"
      python3 "$EVALS/prototypes/judge.py" "$task" "$workspace" \
        > "$judge_dir/${task}-${mode}.json"
      composite_judge=$(python3 - "$judge_dir/${task}-${mode}.json" <<'PY'
import json
import pathlib
import sys
r = json.loads(pathlib.Path(sys.argv[1]).read_text())
print(f"judge: accomplishes={r.get('accomplishes_task','?')} idiomatic={r.get('idiomatic_xrblocks','?')} halluc={r.get('hallucination_severity','?')}")
PY
)
      echo "  $composite_judge"
    fi
  done
done

echo
echo "============================================================"
echo "summary"
echo "============================================================"
python3 "$EVALS/summarize_proto.py"
