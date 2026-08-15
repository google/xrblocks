# XR Blocks Agent-Guidance Evaluation Harness

A reproducible benchmark for XR Blocks task skills and their canonical
references when a model generates an app without repository access.

## What it tests

Each task is a short "build an X with XR Blocks" prompt. It maps to one task
skill and zero or more canonical manual or addon references. For example,
`netblocks-presence` uses the general `xb-build-app` workflow plus the
netblocks README; netblocks is not a separate skill.

We run the task twice through the Gemini API: once with the app contract, task
skill, and listed references in the system prompt, and once with an empty
system prompt. The agent has no file-system access. Both outputs use the same
scoring specification. The difference measures the complete guidance package,
not an alternate API manual hidden in a skill.

This mirrors a prompt-injection deployment. It does not test installation or
discovery in a specific agent host. The portable task skills and this adapter
reuse the same workflow text, but each host can have a different delivery
mechanism.

## Quick start

```bash
# One-time setup. Use a venv if you don't want the deps on your system Python.
pip install -r evals/requirements.txt

export GEMINI_API_KEY=...

# Run every task × {with-skill, without-skill}, then summarize.
./evals/run_all.sh

# Same plus an llm-judge column.
./evals/run_all.sh --judge

# Pick a different model.
GEMINI_MODEL=gemini-2.5-flash ./evals/run_all.sh

# Only a subset.
TASKS="netblocks-presence ui-button-hud" ./evals/run_all.sh
```

Results land under `evals/results/<model>/`:

- `<model>/with-skill/<task>.json` — score for the with-skill run
- `<model>/without-skill/<task>.json` — score for the without-skill run
- `<model>/judge/<task>-<mode>.json` — judge output (if `--judge`)
- `_summary.md` — side-by-side table written by `summarize_proto.py`

## Scoring

`score_proto.py` produces a binary 0–1 score per dimension:

| metric            | meaning                                             |
| ----------------- | --------------------------------------------------- |
| `import_match`    | fraction of `expected_imports` the agent referenced |
| `api_match`       | fraction of `expected_apis` the agent called        |
| `forbidden_clean` | 1 if no `forbidden_patterns` matched, else 0        |
| `parse_ok`        | 1 if `node --check` parses the file                 |
| `composite`       | mean of the four above                              |

For finer-grained signal:

- `judge.py` — `gemini-2.5-pro` rates the output against `CONTEXT.md`, the
  public barrel, the task skill, and the listed canonical references. The
  public source and manuals are API authority; the skill is workflow guidance.
  It returns task and API-lifecycle ratings plus hallucination severity.
- `smoke.py` — Playwright + headless Chromium loads the generated
  workspace and captures uncaught errors / failed requests. Catches hallucinated import URLs that parse-only checking misses.
- `ablate.py` — drops one skill section at a time, scores each variant.
  Useful for finding which parts of a `SKILL.md` carry the weight.

## Adding a task

Two files per task:

```
evals/prototypes/tasks/<id>/prompt.md   # the user-facing instructions
evals/prototypes/tasks/<id>/spec.json   # the scoring spec
```

`spec.json` schema:

```json
{
  "skill": "xb-<task>", // one retained task workflow
  "reference_files": ["docs/docs/manual/<Area>.mdx"], // API facts for this task
  "template": "templates/00_basic", // which template to start from
  "edit_file": "main.js", // which file the agent should edit
  "expected_imports": ["..."], // substrings that should appear in the import lines
  "expected_apis": ["..."], // substrings that should appear anywhere in the code
  "forbidden_patterns": ["..."] // regex patterns that should NOT appear
}
```

Use `reference_files` for canonical manuals or addon READMEs. Do not create a
capability skill only to feed an evaluation. Keep prompts clear about intent
and let the skill define the procedure.

## Files

```
evals/
├── README.md                   this file
├── requirements.txt            python deps for the runners + judge + plot
├── run_all.sh                  orchestrator: every task × 2 modes
├── summarize_proto.py          rolls results into a markdown table
├── plot.py                     matplotlib charts from results
├── prototypes/
│   ├── score_proto.py          binary scorer
│   ├── judge.py                llm-as-judge (gemini-2.5-pro)
│   ├── smoke.py                playwright + headless chromium
│   ├── ablate.py               drop one section at a time
│   ├── runners/
│   │   └── run_gem_api.py      agent runner (Gemini API)
│   └── tasks/
│       └── <task_id>/
│           ├── prompt.md
│           └── spec.json
├── charts/                     local matplotlib output (gitignored,
│                               published to xrblocks/evals instead)
└── results/                    per-model results (gitignored, regenerable)
```

## What this is not

- Not a runtime correctness check. `parse_ok` and `smoke.py` only
  catch some failure modes; a "passing" output may still be wrong.
- Not a model comparison. Defaults to `gemini-2.5-pro` but `GEMINI_MODEL`
  switches models for a sweep (e.g. `gemini-2.5-flash`). Results are
  namespaced per model under `evals/results/<model>/`.
- Not stable across runs. Even with `temperature=0.2`, gemini varies.
  For real signal repeat each cell 3-5 times and report the median.

## What it IS for

- Validating that a task workflow plus canonical references improves the apps
  users want to build.
- Catching regressions when a skill is edited: re-run the relevant
  tasks, diff the scores.
- Surfacing stale API names, wrong templates, and invalid addon import paths in
  the agent guidance package.
