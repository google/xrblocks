# GEMINI.md

When working in this repository, follow all guidelines in [AGENTS.md](AGENTS.md).

Pick the doc that matches what you are doing:

- **Contributing to the SDK** (editing `src/`): [AGENTS.md](AGENTS.md) is the source of
  truth for build, test, architecture, and conventions.
- **Building an XR app with the SDK**: read [CONTEXT.md](CONTEXT.md) for the rules of
  engagement, then use the focused skills in [`skills/`](skills/) (e.g. `xb-core`,
  `xb-ui`, `xb-hands`, `xb-depth`, `xb-ai`).
- **In-tree SDK overview**: [`src/SKILL.md`](src/SKILL.md).

> The single most important rule: **only call APIs that exist.** Verify against
> [`src/xrblocks.ts`](src/xrblocks.ts) (the full public surface) or copy a working
> pattern from `samples/`, `templates/`, or `demos/` before generating code.
