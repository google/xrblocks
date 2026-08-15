---
name: xb-debug-app
description: Debug and repair XR Blocks applications. Use when an app fails to build or run, produces incorrect UI, interaction, sensing, or rendering behavior, differs between simulator and device, leaks resources, or contains obsolete SDK patterns.
---

# Debug an XR Blocks app

Follow one **red → cause → green** thread. Preserve the failing observation
until one proved cause explains it, then make that same observation pass.

## 1. Freeze the failure contract

Record the exact entry, launch command and URL, target form factor, expected
result, observed result, first known failure, and whether the user requested a
diagnosis or a repair. Snapshot the existing worktree and treat unrelated
changes as user-owned.

Choose one observable check for the failure: a build error, rejected import,
uncaught exception, missing first frame, wrong event field, incorrect state,
resource that survives teardown, or simulator/device mismatch.

Complete this step when one exact check is reproducibly **red** and the allowed
mutation scope is explicit.

## 2. Capture the first causal signal

Run the narrowest command or interaction that reaches the failure. Record the
earliest relevant error, state transition, or incorrect value. Separate that
signal from later cascade errors. For intermittent behavior, reduce the trigger
to a repeatable input sequence before changing code.

Inspect configuration and source without editing. Confirm the resolved
`xrblocks` package version, application entry, dependency graph, form factor,
permissions, and optional feature state that the failing path actually uses.

Complete this step when the red check has a stable trigger and one captured
signal close to its producer.

## 3. Prove one cause at a current boundary

Read [`references/diagnostic-branches.md`](references/diagnostic-branches.md),
then load only the branch that matches the captured signal. Verify every
suspect public symbol against the installed declaration or package export. In
the XR Blocks repository, use `src/xrblocks.ts` or the addon's deliberate public
entry as import authority. Compare the nearest current manual and executable
template or sample.

Trace the failing value through its producer, owner, consumer, lifecycle call,
and cleanup path. State one falsifiable hypothesis: “X causes Y because Z.” Use
a read-only probe or the smallest temporary assertion to distinguish it from
the strongest alternative.

A successful docs build, source file, ignored generated file, or old example
does not prove that an application import is public and current.

Complete this step when one cause explains the red check, its competing
hypothesis has contrary evidence, and the supported replacement boundary is
identified.

## 4. Repair the current seam

For diagnosis-only requests, report the proved cause and stop before mutation.
For repair requests, change the smallest current owner that removes the cause.
Preserve the application's delivery model and replace obsolete patterns
directly with the current interface. Keep one engine lifecycle, dependency
graph, interaction resolver, UI tree, and state owner.

Add or adjust the smallest proof that fails without the repair. Release any new
listener, timer, media track, network session, GPU object, or asynchronous
operation through one idempotent cleanup owner.

Complete this step when the original red check is **green** because of the
repair, not because the failing path was bypassed or its error hidden.

## 5. Widen proof and hand off

Re-run the exact green check, then the smallest relevant build or type check,
startup path, primary interaction, and teardown path. Check simulator and real
device behavior separately when their sensors, permissions, cameras, depth, or
input fidelity differ. Verify root-package and addon imports again after the
build succeeds.

Return the original symptom, proved cause, changed owner, red and green
evidence, exact reproduction steps, completed checks, and remaining
device-only or service-dependent checks.

Finish when every modified boundary has direct evidence and the user can
repeat the repaired behavior without inferring setup or expected state from
source.
