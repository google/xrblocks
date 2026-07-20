---
name: xb-contribute-sdk
description: >-
  Complete-seam contributions to the XR Blocks SDK. Use when changing an
  internal engine component, root `xrblocks` public API, addon public API,
  Options/Core/registry/lifecycle wiring, package or Rollup output, SDK tests,
  samples, generated API inputs, developer documentation, or repository skills.
---

# Contribute to the XR Blocks SDK

Deliver a **complete seam**: source, runtime wiring, public entry, proof, build
output, and developer guidance tell one story.

Invoke [`xb-implement`](../xb-implement/SKILL.md) first and apply its shared
grounding, lifecycle, dependency, and implementation rules. Then return here
for SDK seam tracing, proof, generated output, and developer-surface alignment.
For application code, pair `xb-implement` with
[`xb-build-app`](../xb-build-app/SKILL.md) instead.

## 1. Freeze the worktree and contract

Read [`../../AGENTS.md`](../../AGENTS.md), record `git status --short`, and inspect
the current diff before editing. Treat pre-existing modifications as user-owned.
Read the implementation, adjacent tests, and nearest working sample before
trusting prose.

Write a compact change contract containing:

- observable behavior and compatibility constraints;
- one branch: **internal**, **root-public**, or **addon-public**;
- affected options, runtime owners, lifecycle phases, dependencies, exports,
  build artifacts, tests, examples, and developer surfaces;
- explicit `not applicable` decisions for seam elements the change does not use.

Use this authority order when sources disagree: implementation and public
entries; build/package configuration; tests and executable examples; manual and
repository overview; legacy `xb-*` capability skills. Drift discovered in an
affected surface belongs in the change contract.

This step is complete when every pre-existing worktree change is identified and
the contract accounts for every complete-seam element.

## 2. Select and trace the branch

Use exactly one primary branch:

| Branch           | Select when                                                              | Required public boundary                                                                           |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **internal**     | No consumer should import or configure the change                        | None; prove the existing public behavior that consumes it                                          |
| **root-public**  | Consumers import it from `xrblocks` or configure it through `xb.Options` | Export from `src/xrblocks.ts`; `src/entry.ts` already re-exports that barrel                       |
| **addon-public** | Consumers opt into a separately built addon                              | Export from that addon's intended entry file and verify its emitted `build/addons/...` import path |

Before changing a core subsystem, root export, or addon, read
[`references/seam-map.md`](references/seam-map.md) and trace the applicable
configuration → construction → registration → lifecycle → disposal path. Do not
add a public symbol merely because an internal helper exists.

This step is complete when every producer, prerequisite, registry type,
consumer, lifecycle call, cleanup path, public entry, and emitted path is either
located or marked not applicable.

## 3. Implement the narrow seam

Follow neighboring TypeScript and `.js`-extension conventions. Prefer declared
`static dependencies` resolved through `Core.registry` over a new global. For a
user-facing capability, keep defaults inert, make `enable*()` chainable, encode
permission and feature prerequisites in `Options`, and initialize enabled
runtime objects before dependent scripts.

Update Rollup externals only when a dependency must stay external. Update addon
TypeScript aliases only when repo source imports need an alias. Preserve the
singleton lifecycle and established frame order unless the contract explicitly
changes them. Edit source inputs; regenerate `build/`.

This step is complete when the implementation satisfies the contract through
the production seam and no unrelated file is changed.

## 4. Add colocated proof

Add or adjust `*.test.ts` beside the behavior. Cover each new condition,
disabled/default behavior, failure or unsupported behavior, and cleanup branch
that can regress. Add a boundary-level proof when configuration, dependency
injection, lifecycle order, a public export, or an addon entry is the behavior.
Use the testing addon only when a headless whole-engine interaction is the
smallest faithful proof.

Run the narrowest test first:

```bash
npm test -- path/to/changed.test.ts
```

This step is complete when each contract behavior has a named assertion that
fails without the implementation and passes through its real boundary.

## 5. Align developer surfaces

For public behavior or changed setup, read
[`references/developer-surfaces.md`](references/developer-surfaces.md). Update the
smallest executable sample or template that teaches the supported pattern. Then
align the manual and agent guidance with that code, adding a new manual page or
sample wrapper when no existing page has the right scope. Keep detailed API facts
in source TSDoc/manual pages and task composition in workflow skills. Use legacy
capability skills as source-discovery indexes; correct affected claims against
code rather than copying them.

This step is complete when a developer can discover one working public pattern,
copy its exact imports and configuration, and find no stale affected claim.

## 6. Close the seam

Format only owned files during iteration. Before a PR, isolate user-owned
changes and run the repository gates required by `AGENTS.md`:

```bash
npm run format
npm run lint
npm test
```

Run `npm run build:sdk` for an internal or root-public SDK change. Run the full
`npm run build` for an addon-public change—`build:sdk` excludes addon outputs—as
well as when samples/demos or complete packaging are affected. Run
`npm run build --prefix docs` when manual, TypeDoc inputs, sidebars, or docs
components are affected. Builds use `--failAfterWarnings`; fix warnings at their
source. Compare final `git status` and `git diff` to the opening snapshot and
inspect generated changes before keeping them.

Finish only when all applicable checks pass, root/addon imports resolve from the
expected emitted path, declaration output includes intended public types, every
contract row has proof, developer surfaces match code, and user-owned worktree
changes remain intact.
