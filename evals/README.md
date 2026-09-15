# XR Blocks Agent-Guidance Evaluation Harness

A reproducible benchmark for XR Blocks task skills, their canonical references, and an optional output-adapted published baseline when a model generates an app without repository access.

## What it tests

Each task is a short "build an X with XR Blocks" prompt. It maps to one task
skill and zero or more canonical manual or addon references. For example,
`netblocks-presence` uses the general `xb-build-app` workflow plus the
netblocks README; netblocks is not a separate skill.

By default, we run the task twice through the Gemini API: once with the app contract, task skill, and listed references in the system prompt (`with-skill`), and once with an empty system prompt (`without-skill`). An explicit `with-baseline` arm uses the published XR Blocks prompt with only its output instructions adapted to this harness. It receives no appended app contract, task skills, or canonical references.

All arms share the same user task, JavaScript-only response contract, template, generation settings, extraction, and scoring specification. The model has no file-system access. The comparisons measure guidance packages, not installation or discovery in an agent host.

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

# Only one of the existing arms.
./evals/run_all.sh --modes without-skill
```

The default remains two arms; upgrading the harness does not add baseline API calls. Tasks are discovered from `evals/prototypes/tasks/*/spec.json`, not a fixed task count. `--modes` takes a comma-separated, ordered subset without duplicates. `--judge` judges only the selected modes.

## Published baseline (explicit opt-in)

The [published prompts landing page](https://xrblocks.github.io/prompts/) links to `prompts.txt`. Use that prompt content, not the landing page's HTML. The supported snapshot is pinned to website deployment `9d07c265088b9dbe4067c1acd0c9184452d90f0a`, from source change `13dc481788bc5ce30d958882d26a9f1eab5e1287` (`build/prompts.txt` in `xrblocks/xrblocks.github.io`). Its original SHA-256 is `0fa7a73d7ee1fefff7bdaabc4ec4bf7e4e8f6c22e0f53e7189550bfa683373a3` (122657 bytes).

Download an unchanged local copy once, separately from running the evaluation. Choose a location outside the repository and keep the file for reproducing the run:

```bash
BASELINE_FILE=/absolute/path/to/published-prompts.txt
curl --fail --location \
  https://raw.githubusercontent.com/xrblocks/xrblocks.github.io/9d07c265088b9dbe4067c1acd0c9184452d90f0a/prompts.txt \
  --output "$BASELINE_FILE"

# Local validation only: no API key or provider calls.
python3 evals/prototypes/runners/baseline_prompt.py "$BASELINE_FILE"

# The following commands call the Gemini API.
python3 evals/prototypes/runners/run_gem_api.py ui-button-hud with-baseline \
  --baseline-file "$BASELINE_FILE"

./evals/run_all.sh --modes with-skill,with-baseline,without-skill \
  --baseline-file "$BASELINE_FILE"
```

`--baseline-file` is required when selecting baseline mode and rejected when baseline is not selected. The sweep validates the selection, snapshot, and supported task output contract before generating any arm. Each baseline task also revalidates the snapshot. Missing, empty, non-UTF-8, or changed files fail clearly. The runner never fetches a mutable website. A different snapshot needs a deliberate update to the pinned declaration and adapter, not merely a different local filename.

### Output-adapted protocol

The original prompt requests an `index.html` file and planning prose, which conflicts with the harness's `main.js`-only/no-prose response contract. Protocol `published-main-js-v1` changes only the top-level output instructions:

- Describe the output as the JavaScript module for the provided template, rather than a single HTML file.
- Request only `main.js` in one JavaScript fenced block, without HTML, script tags, an importmap, or prose.
- Put application classes in the module instead of an inline script wrapper.
- Identify the CSS tag and importmap as host-template responsibilities, retaining their original URLs and dependency versions.
- Replace the planning-prose requirement with the same code-only response requirement.

The exact, once-only substitutions are declared in `prototypes/runners/baseline_prompt.py`. Only the prefix before `# Reference Examples` is eligible. All other text, including API guidance, lifecycle rules, coordinates, and the complete golden examples, remains unchanged. The adapter fails on unsupported structure or a task editing anything other than `main.js`. It does not correct stale APIs, alter example code, or append task-selected skills/manuals.

This arm measures an **output-adapted published baseline**, not raw published-prompt behavior. The full HTML examples remain in the guidance, and the original dependency versions are not upgraded to match newer tasks. Those are properties of this pinned control, not evidence that the baseline and current guidance are equivalent.

## Results and provenance

Results land under `evals/results/`:

- `<model>/with-skill/<task>.json`: score for the with-skill run.
- `<model>/without-skill/<task>.json`: score for the without-skill run.
- `<model>/with-baseline/<task>.json`: score for the output-adapted baseline run.
- `<model>/judge/<task>-<mode>.json`: judge output, if `--judge` is selected.
- `_summary.md`: side-by-side tables written by `summarize_proto.py`.

Model names are normalized consistently for result and workspace paths. Generated workspaces use Python's temporary directory, including a configured `TMPDIR`; the judge resolves the same workspace as the runner.

Scores retain their top-level metric fields. New results add `run` metadata with mode, model, temperature, actual workspace/metadata paths, and effective-system-prompt SHA-256. Baseline results also include the source URL/revisions, input path, original byte count, original/effective hashes, protocol identifier, and exact before/after substitutions under `run.baseline`.

Each workspace has a sibling `-meta` directory containing the exact effective `system_prompt.md`, shared `user_msg.md`, raw response, usage, and `run.json`. Baseline runs additionally preserve the unchanged original bytes in `baseline_original.txt`. The no-guidance arm logs an actually empty system-prompt file. A rerun of the same model/task/mode replaces that cell and workspace; preserve copies separately when comparing multiple repetitions or protocol revisions.

Summaries and charts still read historic results without `run` metadata. Missing arms or scores appear as gaps, not zero. Pairwise comparisons use only tasks with finite scores in both arms and show their denominator; introducing a partial baseline arm does not change the original skill-versus-nothing paired mean. Baseline identities are reported, and incompatible baseline sources/protocols are not pooled into a headline mean.

`python3 evals/plot.py` renders the existing chart families for available arms and actual result tasks. Adding this arm or rendering synthetic fixtures is not a new real-model sweep and does not demonstrate measured improvement.

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
├── run_all.sh                  selected modes; defaults to the original 2
├── eval_common.py              shared modes, paths, and paired result data
├── summarize_proto.py          rolls results into a markdown table
├── plot.py                     matplotlib charts from results
├── prototypes/
│   ├── score_proto.py          binary scorer
│   ├── judge.py                llm-as-judge (gemini-2.5-pro)
│   ├── smoke.py                playwright + headless chromium
│   ├── ablate.py               drop one section at a time
│   ├── runners/
│   │   ├── baseline_prompt.py  pinned snapshot and output-only adapter
│   │   └── run_gem_api.py      system-prompt runner (Gemini API)
│   └── tasks/
│       └── <task_id>/
│           ├── prompt.md
│           └── spec.json
├── charts/                     local matplotlib output (gitignored,
│                               published to xrblocks/evals instead)
└── results/                    per-model results (gitignored, regenerable)
```

## Offline tests

The tests use stdlib `unittest`, synthetic files, and stubbed provider/runner/judge calls. They need no credentials and never fetch the baseline or run a paid sweep. Reporting tests use the matplotlib/numpy dependencies already listed in `requirements.txt` and write charts only in temporary fixture directories.

```bash
env -u GEMINI_API_KEY -u GOOGLE_API_KEY python3 -m unittest discover \
  -s evals/prototypes -p 'test_*.py'
env -u GEMINI_API_KEY -u GOOGLE_API_KEY python3 -m unittest discover \
  -s evals -p 'test_*.py'
bash -n evals/run_all.sh
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
