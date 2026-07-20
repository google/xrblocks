---
name: xb-implement
description: >-
  Shared implementation foundation for XR Blocks application and SDK work.
  Use whenever writing, changing, or repairing XR Blocks code, alongside
  xb-build-app for applications or xb-contribute-sdk for SDK contributions, to
  ground APIs in source, preserve the engine lifecycle, manage dependencies,
  handle unavailable states, and avoid common generated-code failures.
---

# Implement XR Blocks correctly

Apply this foundation before the outcome-specific workflow. This skill owns the
rules every implementation must satisfy; it does not replace `xb-build-app`, an
`xb-add-*` workflow, or `xb-contribute-sdk`.

## 1. Ground the implementation

Read [`../../AGENTS.md`](../../AGENTS.md) for repository work and
[`../../CONTEXT.md`](../../CONTEXT.md) for app-facing rules. Inspect the current
files, nearest working template/sample/demo, and relevant manual page before
designing the change.

Use this authority order:

1. implementation and public entry files;
2. build and package configuration;
3. tests and executable examples;
4. the manual and repository guidance;
5. older capability notes.

For app imports, require a symbol to exist in `src/xrblocks.ts` or the addon's
public entry. For SDK work, trace internal producers and consumers, then verify
every developer-facing claim at the same public boundary. Never bridge missing
information with a plausible invented API.

Read
[`references/runtime-and-api-guardrails.md`](references/runtime-and-api-guardrails.md)
before editing runtime, lifecycle, options, imports, or public behavior.

This step is complete when every planned symbol, configuration switch,
dependency, and lifecycle hook has an authoritative source.

## 2. Preserve ownership and lifecycle

Keep the singleton engine responsible for rendering, camera/session ownership,
subsystem updates, and script scheduling. Put application behavior in
`xb.Script`; put SDK behavior under its established Core, registry, subsystem,
or addon owner. Prefer declared dependencies over new globals.

Pair setup with cleanup. Account for asynchronous initialization, per-frame or
physics work, XR and simulator session transitions, event listeners, GPU
resources, media streams, timers, and external clients. Configure permissions
and optional capabilities before the lifecycle phase that consumes them.

This step is complete when construction, initialization, use, interruption,
and disposal each have one clear owner.

## 3. Keep dependencies coherent

Use one aligned `three` instance. Resolve browser bare specifiers through an
explicit import map and bundler dependencies through the package graph. Treat
core and addon public entries as separate contracts, and include every external
peer used by the selected path.

Do not deep-import an internal source file merely because it contains the
needed class. In SDK work, edit source inputs and build configuration; never
hand-edit generated `build/` output.

This step is complete when every import resolves through one intentional
dependency graph and each consumer-facing import is public.

## 4. Implement complete behavior

Finish the requested path rather than leaving placeholders in its success,
empty, unavailable, denied, interrupted, error, or cleanup states. Keep code at
the highest-level existing API that expresses the behavior. Make state changes
observable and keep handlers thin enough that ownership remains legible.

For app work, return to `xb-build-app` or the selected `xb-add-*` workflow for
experience composition and user handoff. For SDK work, return to
`xb-contribute-sdk` for seam tracing, proof, generated output, and developer
surface alignment.

This step is complete when the specialized workflow can validate a fully wired
implementation rather than compensate for missing runtime behavior.
