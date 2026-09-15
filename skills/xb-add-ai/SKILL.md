---
name: xb-add-ai
description: Add AI behavior to an XR Blocks application. Use when implementing Gemini or OpenAI queries, Gemini Live voice or vision, generated images, scene-grounded responses, or model-requested tools with an observable XR outcome.
---

# Add AI behavior

Build complete **AI behavior**: intentional input, provider, validated response,
observable result, and owned cleanup.

## 1. Write the AI contract

Name the input, provider branch, response modality, application consumer, data
sent off-device, user disclosure, concurrency rule, and visible waiting,
unavailable, empty, disconnected, and error states. Treat prompts, microphone,
camera, screenshots, and scene context as separate disclosures.

Complete this step when success changes scene, UI, speech, or an asset and each
disclosed input is necessary for that result.

## 2. Prove the provider path

Read [`../../docs/docs/manual/AI.mdx`](../../docs/docs/manual/AI.mdx) and
[`references/current-api.md`](references/current-api.md). Verify planned symbols
in [`../../src/xrblocks.ts`](../../src/xrblocks.ts),
[`../../src/ai/AI.ts`](../../src/ai/AI.ts), and the selected provider. For Live,
tools, camera, or context grounding, also read
[`references/live-tools-grounding.md`](references/live-tools-grounding.md).

Use [`../../templates/06_ai_query/`](../../templates/06_ai_query/) for bounded
queries and
[`../../templates/07_ai_live_assistant/`](../../templates/07_ai_live_assistant/)
for the common Live loop.

Complete this step when every symbol is public and the selected provider
supports every required operation and modality.

## 3. Select one primary branch

- Use `xb.ai.query({prompt})` for a bounded provider-neutral text request.
- Use Gemini multipart input when a bounded request needs an image or typed
  parts.
- Use Gemini Live for an ongoing audio or video conversation.
- Use `xb.ai.generate()` when the image result becomes an actual app asset.
- Use a narrow `xb.Tool` when the model requests a validated application
  action.

Complete this step when latency, modality, provider support, data disclosure,
and resource ownership match the contract.

## 4. Implement the complete behavior

Configure and enable the selected provider before initialization. Check
availability at use time, catch provider failures, and prevent unintended
concurrent starts. Accept missing text, `null`, rejected requests,
interruption, and disconnection as normal observable states.

For Live, register callbacks before connecting, make readiness depend on
`onopen`, use provider-typed nested realtime inputs, and route remote close,
local stop, error, and disposal through one idempotent cleanup owner. Stop the
Live session, microphone, playback, frame timers, and app-owned tracks.

Validate tool arguments again at execution and resolve targets through an
allowlist or current scene context. Keep consequential actions behind
application authorization or confirmation.

Complete this step when one intentional input reaches its consumer, duplicate
starts are controlled, every failure is visible, and every acquired resource
has one cleanup owner.

## 5. Prove and hand off provider behavior

Build or type-check the app and run startup smoke that does not require a long
conversation. Check configuration, availability guards, request and response
types, visible states, tool validation, disclosures, and cleanup. Use existing
safe prototype credentials only for one narrow connectivity check.

Give the user the trigger, required credentials and permissions, data sent
off-device, waiting/success/error states, and recovery steps. For Live, include
open, interruption, remote close, local stop, and restart. For tools, include
valid, invalid, unknown, denied, and failed outcomes.

Finish when the user can evaluate real provider behavior without discovering
setup, disclosure, expected states, or cleanup from source.
