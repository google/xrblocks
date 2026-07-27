---
name: xb-automate-app
description: >-
  Automation bridge for a running XR Blocks app. Use when exposing readiness,
  state observations, browser-driver access, embodied controls, or narrow
  remote-control tools to an external JavaScript, Python, CLI, or agent process.
---

# Make an XR Blocks app automatable

Add a **control plane**: a bounded way for an external process to know the app
is ready, observe useful state, and request supported actions. This skill owns
the bridge and one connection smoke check. App correctness and experiential
acceptance remain with `xb-build-app` and the user test handoff.

## 1. Write the bridge contract

Record:

1. the controller: browser driver, JavaScript, Python, CLI, or agent process;
2. the readiness signal it will await;
3. the smallest commands it must issue;
4. the smallest observations it must read;
5. the local security and cleanup boundary.

Prefer named domain operations such as `resetGame` or `getScore` over exposing
arbitrary execution. Use stable object names or context roles for spatial
targets; treat `ctx_*` ids as values scoped to one live page.

This step is complete when every required command has one observable response
and the controller can identify readiness without sleeping.

## 2. Choose one bridge

- **Browser bridge:** use when an in-page browser driver can operate through
  DOM input, `window.xb`, screenshots, or app-owned globals. Read
  [`references/browser.md`](references/browser.md).
- **Remote-control bridge:** use when a separate process needs WebSocket tools,
  simulator locomotion, hands, screenshots, or app-specific commands. Read
  [`references/remote-control.md`](references/remote-control.md).

Choose the browser bridge for ordinary page automation. Add the remote-control
addon when the controller needs an explicit language-neutral protocol or
embodied simulator controls.

This step is complete when one bridge supplies the contract without a second
control layer.

## 3. Expose readiness, actions, and observations

Use `new xb.Options().enableAutomationMode()` or `?xrAutomation=1` when the
external run benefits from simulator autostart, hands, camera, context, and
hidden human-facing simulator panels. Add `?debug=1` only when the browser
driver needs the public SDK as `window.xb` and initialization as
`window.xbReady`.

Expose a separate app-owned readiness signal when domain setup continues after
`xb.init()`. For remote control, register narrow JSON-serializable tools and
validate every argument at the application boundary. Pair each mutating command
with a state observation that lets the controller see its result.

This step is complete when the bridge can await SDK and domain readiness, list
its supported operations, and serialize every response.

## 4. Smoke the control plane

Start the app and any owned relay, then perform one bounded bridge smoke:

1. connect and await readiness;
2. call `ping()` or another read-only health operation;
3. read one baseline observation and validate its shape;
4. close the client, page, media, context polling, and owned relay resources.

Check transport errors and every remote response's `ok` field. This smoke proves
that the control plane is usable and closes at the bridge boundary.

This step is complete when one external process can connect, inspect the
documented surface, and disconnect without races or leaked bridge resources.

## 5. Hand off the automation surface

Return:

- the app and relay launch commands;
- URL flags, WebSocket endpoint, and `sessionId` where applicable;
- readiness handshake;
- supported commands, observations, target formats, and response shape;
- the completed connection smoke;
- local-only security constraints and cleanup ownership.

Finish when another process can use the documented control plane without
reading the app implementation. Hand the working bridge to whichever workflow
or user will drive it.

## Source checks

Verify public behavior in
[`../../src/debug/DebugGlobals.ts`](../../src/debug/DebugGlobals.ts),
[`../../src/core/Options.ts`](../../src/core/Options.ts), and
[`../../src/addons/remote-control/index.ts`](../../src/addons/remote-control/index.ts).
Use [`../../samples/remote_control/`](../../samples/remote_control/) as the live
relay smoke pattern.
