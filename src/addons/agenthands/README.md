# agenthands

Hands and an orb that gesture and point as an agent speaks, for [xrblocks](https://github.com/google/xrblocks).

This addon holds the reusable pieces behind the [`agent_hands`](../../../demos/agent_hands/) demo, ported from AgentHands (Liu et al., CHI 2026). An agent feels more present when it can gesture and physically point at things in your space rather than only talk. This drives that from a language model's inline gesture markup, grounds the point targets to real objects, and keeps the embodiment minimal: a calm orb plus translucent hands, no face.

## Modules

- **`AgentHands` / `AgentHand`**: a posable pair of hands (and the single-hand rig underneath) that animate toward poses, play motions (beat, wave, size, count), and aim a finger at a world point.
- **`AgentHead`**: the agent's presence, a semi-transparent orb that breathes while idle, pulses while speaking, and gazes at what it points at.
- **`AgentGestures`**: parses inline gesture markup (`parseAgentGestures`) and turns it into a timed, executable list of steps (`buildGestureSteps`).
- **`AgentGestureAnimator`**: drives an `AgentHands` from those steps and tracks which hand is pointing.
- **`AgentSpeechConductor`**: plays the gesture timeline in sync with spoken text, using the speech synthesizer's word boundaries.
- **`AgentWorld`**: object detection grounded to 3D points against the depth mesh, cached and optionally persisted to local storage, with background re-scanning as the user moves.

## Quick start

```ts
import * as xb from 'xrblocks';
import {
  AgentGestureAnimator,
  AgentHands,
  AgentSpeechConductor,
  buildGestureSteps,
  parseAgentGestures,
} from 'xrblocks/addons/agenthands/index.js';

const hands = new AgentHands();
await hands.load();
xb.core.scene.add(hands);

const animator = new AgentGestureAnimator(hands);
const conductor = new AgentSpeechConductor({
  synthesizer: xb.core.sound?.speechSynthesizer,
  onStep: (step) => animator.fireStep(step),
  onRest: () => animator.rest(),
});

// From an agent reply containing inline markup:
const {text, gestures} = parseAgentGestures(reply);
const duration = Math.max(1.2, text.length * 0.06);
const steps = buildGestureSteps(text, gestures, duration);
conductor.speak(text, steps, duration);

// Each frame:
conductor.tick(dt);
animator.reaim();
hands.update();
```

See the [`agent_hands`](../../../demos/agent_hands/) demo for the full loop, including pointing grounded to real objects through `AgentWorld`.
