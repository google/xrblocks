---
name: xb-contribute-sdk
description: Complete an XR Blocks SDK change across implementation, runtime wiring, public exports, proof, build output, examples, and canonical documentation. Use when editing the XR Blocks repository rather than an application that consumes it.
---

# Contribute to the XR Blocks SDK

Deliver a **complete seam**: every affected layer tells the same current story.

## 1. Freeze the worktree and change contract

Read [`../../AGENTS.md`](../../AGENTS.md), record the current status and diff,
and treat existing changes as user-owned. Inspect the implementation, adjacent
tests, public entry, and nearest executable example.

Classify the change as `internal`, `root-public`, or `addon-public`. List the
affected configuration, runtime owner, lifecycle, cleanup, exports,
declarations, build output, tests, examples, and manual owner. Mark unused seam
elements `not applicable`.

Complete this step when the opening worktree is accounted for and every seam
element has an owner or an explicit `not applicable` decision.

## 2. Trace the production seam

Read [`references/seam-map.md`](references/seam-map.md) for the selected branch.
Trace configuration to construction, registry resolution, lifecycle calls,
disposal, public entry, and emitted path. Treat
[`../../src/xrblocks.ts`](../../src/xrblocks.ts) and addon public entries as
import authority. Do not expose an internal helper only because it exists.

Complete this step when every producer, prerequisite, consumer, lifecycle call,
cleanup path, public entry, and emitted path is located.

## 3. Implement the narrow seam

Follow adjacent TypeScript and module-extension conventions. Use declared
dependencies and the registry for runtime services. Keep optional feature
defaults inert, configure permissions before XR startup, and initialize owners
before dependents. Edit source inputs and regenerate build output; do not edit
`build/` by hand.

Complete this step when the production path satisfies the change contract and
the diff contains no unrelated edits.

## 4. Add proof through the real boundary

Add or adjust the smallest colocated test that fails without the change. Cover
new conditions, disabled or unsupported behavior, failure behavior, cleanup,
and boundary wiring when they can regress. Run the narrow test before wider
checks.

Complete this step when every behavior in the contract has a named assertion
through its real public or runtime boundary.

## 5. Align the one teaching owner

Read [`references/developer-surfaces.md`](references/developer-surfaces.md).
Update the smallest executable sample or template when developers need a
copyable pattern. Update the one manual page that owns the concept. Update a
task skill only when the change alters that skill's process or branch choice.
Do not create a skill for a new capability alone.

Complete this step when a developer can discover one working public pattern
and no affected authoritative surface teaches the previous behavior.

## 6. Close the seam

Run the repository checks required by `AGENTS.md` in proportion to the change.
Use `npm run build:sdk` for core SDK output and the full build when addon output
or complete packaging is affected. Build the docs when manuals, TypeDoc inputs,
sidebars, or docs components change. Inspect generated changes and compare the
final worktree to the opening snapshot.

Finish when all applicable checks pass, intended imports and declarations
resolve from emitted paths, every contract row has proof, documentation matches
the public implementation, and user-owned changes remain intact.
