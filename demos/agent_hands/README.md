# Agent Hands

A free-standing pair of agent hands and a glowing orb that gesture while the agent talks and point at real things in the room. Without a Gemini key the demo plays a short scripted monologue of hand poses so you can see the hands move; add `?key=...` and you get the full loop: you talk, Gemini replies with inline gesture markup, the reply is spoken, and the hands gesture in sync with the spoken words while pointing at detected objects.

This demo ports the idea from AgentHands (Liu et al., CHI 2026, [paper](https://www.duruofei.com/papers/Liu_AgentHands-GeneratingInteractiveHandsGesturesForSpatiallyGroundedAgentConversationsInXR_CHI2026.pdf)) to the open web on three.js and WebXR. The paper's insight is that an agent feels more present when it can gesture and physically point at things in your space rather than only talk at you. It drives the gestures from a language model through inline markup, grounds them to real objects, and keeps the embodiment deliberately minimal, a calm orb as the locus of attention plus translucent hands and no face, so it does not tip into the uncanny.

## Running

Serve the repo root and open `/demos/agent_hands/`. The demo runs in the desktop simulator and on Android XR. Use the **talk** and **scan** buttons on the spatial panel, or the on-screen controls. Add `?key=YOUR_GEMINI_KEY` to the URL for the interactive loop; without a key it plays the scripted demo.

## How it is put together

The demo itself is scene glue (lighting, the head-anchored rig, the pointer visualization, the spatial control panel, and the microphone wiring) on top of four modules in [`src/addons/agenthands/`](../../src/addons/agenthands/):

- **World understanding** (`AgentWorld`): runs object detection, grounds each detection to a 3D point against the depth mesh, caches the result (persisted to local storage), and re-scans in the background as you move.
- **Response parser** (`buildGestureSteps` in `AgentGestures`): turns the reply's inline markup into an ordered, timed list of gesture steps, with each point target resolved to a world position.
- **TTS timestamp matcher** (`AgentSpeechConductor`): plays the gesture timeline and tightens it to the spoken words using the synthesizer's word boundaries.
- **Gesture animator** (`AgentGestureAnimator`): turns each step into hand movement (poses, motions, and pointing) and tracks which hand is pointing, for the pointer visualization and the orb's gaze.

## Gesture markup

The agent embeds markup inline in its reply, just before the word it emphasizes:

- `[gesture:NAME]` for a static pose, where NAME is `thumbs_up`, `thumbs_down`, `fist`, `victory`, `rock`, or `open`.
- `[wave]`, `[beat]`, `[size:small|big]`, and `[count:N]` for motions.
- `[point:LABEL]` to point at a detected object, where LABEL is one of the objects the last scan found.

## What it can and cannot do right now

The demo can hold a spoken conversation in which the agent's hands gesture in time with its words and point at real objects it has detected in the room. It runs in the desktop simulator without a headset, and the same code path runs on Android XR. The embodiment follows the paper: a glowing orb as the locus of attention plus translucent hands and no face, which keeps a task-focused agent from tipping into the uncanny valley.

It is deliberately a smaller system than the paper, and it differs in a few ways worth being upfront about.

Gesture range. The paper distils a compositional taxonomy of hand gestures across six dimensions (handedness, deictic, iconic, emblematic and regulatory, beat, and affective) and can, for instance, run a beat with one hand while the other mimes holding and draining a pot. This demo ships a smaller, flat set: the static poses (thumbs up and down, fist, victory, rock, open, point) and the motions (wave, beat, size, count) listed above. There is no two-handed compositional iconic gesture, no affective visual effect (the paper pairs a negation gesture with a risk aura), no in-situ measurement gesture, and no interactive gesture such as a high-five with the user.

Timing. The paper aligns each gesture to the onset and span of its trigger word, which matters because users notice when a deictic lands even a beat late. This demo instead schedules gestures on an estimated timeline and tightens them to the spoken words using the speech synthesizer's word boundaries, which report a word's onset but not its span. When the chosen voice emits no boundaries, and many remote voices do not, it falls back to the estimated timeline alone.

Grounding. The paper builds an object registry by having the user look at each object and confirm it ("register this"), casting an eye-gaze ray into a scene-understanding module that returns a semantic label and an estimated 3D bounding box per object. Its own limitation section notes this pre-scan constrains the agent to relatively static scenes. This demo takes a different trade-off: it detects the whole room in a single pass and keeps re-grounding in the background as you move, so it is not tied to a one-time scan, but the grounding is coarser (a single depth-mesh point per object rather than a region-level oriented box) and there is no per-object gaze confirmation step.

Movement. In the paper the agent relocates through the space to reach a target, moving toward the object it is discussing and taking freeform paths (for example passing through a table on the way). This demo keeps the hands and orb anchored in front of you and points from there; they follow you as you walk but do not travel out to the object.

User gaze. The paper reads where the user is looking, both to register objects and as conversational input. This demo does not read user gaze at all: the orb gazes at whatever the agent is pointing at, but nothing is driven by where you look.

Maturity. Most of the tuning happened in the desktop simulator, so the in-headset path is wired but less exercised. The scripted no-key mode is a lightweight preview that plays a few static poses so you can see the hands move without a Gemini key; the full gesture range only runs in the interactive loop.
