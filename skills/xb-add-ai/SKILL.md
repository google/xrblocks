---
name: xb-add-ai
description: >-
  Implement AI behavior in an XR Blocks app. Use when adding a Gemini or OpenAI
  query, Gemini Live voice or vision, generated images, scene grounding, or
  model-requested tools that produce an observable XR outcome.
---

# Add AI behavior

Build complete **AI behavior**: intentional input → provider → validated
response → observable app outcome. Use [`../xb-build-app/SKILL.md`](../xb-build-app/SKILL.md)
first when the app shell or primary interaction is missing.

## 1. Write the AI contract

Name the input, provider branch, response modality, intended consumer, data sent
off-device, and user-visible waiting/unavailable/error states. Treat camera,
microphone, screenshots, prompts, and scene context as separate disclosures.

Complete this step when success changes the scene, UI, speech, or an asset—and
each disclosed input is necessary for that change.

## 2. Ground the implementation

Read [`../../src/xrblocks.ts`](../../src/xrblocks.ts), then the relevant AI
implementation and a working app:

- query or generation: [`../../src/ai/AI.ts`](../../src/ai/AI.ts),
  [`../../src/ai/Gemini.ts`](../../src/ai/Gemini.ts), and
  [`../../templates/6_ai`](../../templates/6_ai);
- Live, voice, vision, or tools:
  [`../../src/addons/ai/GeminiManager.ts`](../../src/addons/ai/GeminiManager.ts)
  and [`../../templates/7_ai_live`](../../templates/7_ai_live);
- scene grounding: [`../../docs/docs/manual/Context.mdx`](../../docs/docs/manual/Context.mdx)
  and [`../../src/context`](../../src/context).

For exact current signatures and provider limits, read
[`references/current-api.md`](references/current-api.md). For a Live, tool, or
grounded branch, also read
[`references/live-tools-grounding.md`](references/live-tools-grounding.md).
Prefer source and installed provider types when prose or an older skill differs.

Complete this step when every planned symbol is public and the selected provider
supports every required operation.

## 3. Select one primary branch

- **Bounded query:** use `await xb.ai.query({prompt})` for either provider; use
  Gemini multipart input for images or structured parts.
- **Live conversation:** use Gemini Live for ongoing audio/video exchange; favor
  the `GeminiManager` addon when its capture, audio, tool, and cleanup ownership
  matches the app.
- **Generation:** use Gemini `generate()` when the returned data URL becomes an
  actual texture, image, or other app asset.
- **Grounded action:** observe only the required scene/context data, expose a
  narrow `xb.Tool`, validate its arguments again at execution, and return a
  structured success or failure result.

The branch is selected when its latency, modality, provider support, and resource
ownership match the AI contract. Treat `src/agent` as work in progress; start
from `xb.ai`, `xb.Tool`, and the Live addon unless the app specifically needs an
existing exported agent.

## 4. Implement the complete behavior

Before `xb.init(options)`, call `options.enableAI()` and configure
`options.ai.model` plus the matching provider options. At interaction time,
guard queries with `xb.ai.isAvailable()` and Live startup with
`xb.ai.isLiveAvailable()`. Lock or disable repeated triggers while a request is
in flight. Accept `null`, empty text, rejected requests, and disconnection as
normal observable states.

For Live, register callbacks before connecting, resolve readiness from `onopen`,
send nested typed realtime inputs, stop playback on interruption, and make
`onerror`/`onclose` converge on the same idempotent cleanup. Stop the Live
session, microphone capture, audio playback, camera/frame timers, and app-owned
media tracks from the app's stop/dispose path.

Prototype credentials may come from provider options, `?key=`, provider-specific
URL parameters, or `keys.json`. Production browser code uses a server-controlled
proxy; Gemini Live clients use short-lived credentials such as ephemeral tokens.
Long-lived provider keys never ship in app code, URLs, static assets, logs, or
commits.

Complete this step when one intentional input reaches its intended consumer,
concurrent starts are controlled, and every acquired resource has one cleanup
owner.

## 5. Prepare the AI handoff

Run code-level checks and startup smoke available without requiring a user-style
conversation. Confirm provider configuration, availability guards, request and
response types, UI states, tool validation, disclosure text, and cleanup paths
are implemented. When safe prototype credentials are already available, a
single non-interactive provider request may confirm connectivity.

Give the user the exact trigger, required credentials and permissions, data
sent off-device, expected waiting/success/error states, and recovery steps. For
Live, include open, interruption, remote close, local stop, and restart checks.
For tools, include valid, invalid, unknown, and failed tool outcomes.

Finish when the AI implementation is complete and the user can evaluate its
real provider behavior without discovering setup, disclosures, expected states,
or cleanup behavior from source.
