---
name: xb-agenthands
description: >-
  Give an AI agent expressive, spatially grounded hands in an XR Blocks app with the
  agenthands addon. A minimal embodiment (a glowing orb plus translucent hands, no face)
  gestures in sync with the agent's spoken reply and physically points at real detected
  objects. Use when you want a conversational agent to feel present: to gesture as it
  talks (wave, beat, iconic size, count, thumbs up/down, victory, and more) and to point
  at things in the room rather than only speak. Covers `AgentHands`/`AgentHand`,
  `AgentHead` (the orb), `parseAgentGestures` + `buildGestureSteps` (inline gesture markup
  to a timed step list), `AgentSpeechConductor` (sync the steps to TTS word boundaries),
  `AgentGestureAnimator` (drive the hands), and `AgentWorld` (object detection grounded to
  3D points against the depth mesh, with optional local-storage persistence). Ports the
  AgentHands paper (Liu et al., CHI 2026) to three.js / WebXR, and runs in the desktop
  simulator without a headset. Full reference at src/addons/agenthands/ and the
  demos/agent_hands/ demo.
---

# xb-agenthands: hands and an orb that gesture and point as an agent speaks

The agent's reply carries inline gesture markup (for example `That one [point:the lamp] over there [beat] is yours`). `parseAgentGestures` strips the markup and returns the clean text plus the gestures, `buildGestureSteps` turns those into a timed, executable step list (grounding each point target to a world position), `AgentSpeechConductor` plays that list in sync with the spoken words, and `AgentGestureAnimator` turns each step into hand movement on an `AgentHands` pair. `AgentWorld` supplies the object positions the point gestures aim at. `AgentHead` is the agent's presence: a glowing orb that breathes while idle, pulses while speaking, and gazes at what it points at.

> **Full reference**: [`../../src/addons/agenthands/README.md`](../../src/addons/agenthands/README.md) and the [`agent_hands`](../../demos/agent_hands/) demo.

## When to use

Use this when you want an agent to gesture and point, not just talk. It pairs naturally with [`xb-ai`](../xb-ai/SKILL.md) (Gemini reply with inline markup), [`xb-sound`](../xb-sound/SKILL.md) (speech recognizer and synthesizer), [`xb-world`](../xb-world/SKILL.md) (object detection), and [`xb-depth`](../xb-depth/SKILL.md) (the depth mesh that grounds points). For plain hand tracking of the user's own hands use [`xb-hands`](../xb-hands/SKILL.md); this addon is about the agent's hands, not the user's.

The gesture range is a smaller, flat subset of the paper's compositional taxonomy, timing comes from TTS word boundaries rather than a per-word energy model, and grounding is a single depth-mesh point per object rather than a region-level oriented box. See the demo README for the full list of what it can and cannot do.

## Quick start

Give the agent hands, then speak a reply with inline markup:

```ts
import * as xb from 'xrblocks';
import {
  AgentGestureAnimator,
  AgentHands,
  AgentSpeechConductor,
  AgentWorld,
  buildGestureSteps,
  parseAgentGestures,
} from 'xrblocks/addons/agenthands/index.js';

class MyAgent extends xb.Script {
  async init() {
    this.hands = new AgentHands();
    await this.hands.load();
    // We drive hands.update() ourselves each frame.
    this.hands.isXRScript = false;
    xb.core.scene.add(this.hands);

    this.animator = new AgentGestureAnimator(this.hands);
    this.world = new AgentWorld({
      getDetector: () => xb.core.world?.objects,
      getCamera: () => xb.core.camera,
      getDepthMesh: () => xb.core.depth?.depthMesh,
    });
    this.conductor = new AgentSpeechConductor({
      synthesizer: xb.core.sound?.speechSynthesizer,
      onStep: (step) => this.animator.fireStep(step),
      onRest: () => this.animator.rest(),
    });

    await this.world.scan();
  }

  // Call this with the agent's reply (containing inline markup).
  speak(reply) {
    const {text, gestures} = parseAgentGestures(reply);
    const duration = Math.max(1.2, text.length * 0.06);
    const steps = buildGestureSteps(text, gestures, duration, (label) =>
      this.world.pointFor(label)
    );
    this.conductor.speak(text, steps, duration);
  }

  update() {
    const dt = xb.getDeltaTime?.() ?? 0.016;
    this.conductor.tick(dt);
    this.animator.reaim();
    this.hands.update();
  }
}

xb.add(new MyAgent());
xb.init(new xb.Options().enableAI().enableUI());
```

## Gesture markup

Tell the model, via a meta-instruction, to embed markup inline just before the word it emphasizes. `parseAgentGestures` understands:

- `[gesture:NAME]` for a static pose: `thumbs_up`, `thumbs_down`, `fist`, `victory`, `rock`, `open`, `point`.
- `[wave]`, `[beat]`, `[size:small|big]`, `[count:N]` for motions.
- `[point:LABEL]` to point at a detected object, where LABEL matches something `AgentWorld` found.

`GESTURE_POSE_MAP` and `GESTURE_MOTION_MAP` list the accepted names and their aliases.

## The pipeline

- **`AgentWorld`**: `scan()` runs detection and grounds each object to a 3D point against the depth mesh; `findObject(label)` and `pointFor(label)` resolve a markup target; `maybeAutoScan()` re-scans in the background when the camera moves (call it each frame). Pass `storageKey` to persist grounded objects to local storage across reloads.
- **`AgentGestures`**: `parseAgentGestures(reply)` returns `{text, gestures}`; `buildGestureSteps(text, gestures, duration, resolvePoint?)` returns the timed `GestureStep[]`.
- **`AgentSpeechConductor`**: `speak(text, steps, duration)` speaks and plays the timeline; `tick(dt)` advances it each frame; `playTimeline(entries)` plays a bare timeline for a scripted (no-key) preview. `speaking` is true while talking.
- **`AgentGestureAnimator`**: `fireStep(step)` plays one step (pose, motion, or point); `reaim()` keeps a pointing finger locked on its target each frame; `rest()` relaxes the hands. `pointing`, `target`, and `activeHand` expose the current pointing state for a pointer visualization or the orb's gaze.
- **`AgentHead`**: add `head.root` to the scene, then each frame call `head.lookAt(animator.pointing ? animator.target : null)`, `head.setSpeaking(conductor.speaking ? 1 : 0)`, and `head.update(dt)`.
