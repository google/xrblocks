---
name: lipsync
description: >-
  Add audio-driven avatar mouths to an XR Blocks app with the lipsync addon — heuristic
  vowel-formant viseme mapping that turns any `MediaStream` (mic or remote peer's voice)
  into mouth shapes on a `StylizedFace` canvas decal attached to an avatar's head. No ML
  runtime, no model download. Use when authoring or debugging avatar mouths in
  single-user demos or in multiplayer scenes paired with `xb-netblocks` (every remote
  peer's voice stream drives their own face). Public surface: `LipsyncMouth` (the
  driver), `xb.StylizedFace` (the decal, in xrblocks core), `session.voice.onTrack`
  for the netblocks hook, plus the lower-level `FormantVisemeMapper`,
  `MfccExtractor`, `computeAudioFeatures` and types (`VisemeWeights`, `VisemeTarget`,
  `AudioFeatures`) for plugging in a model-based mapper later. For the DSP pipeline,
  caveats, and samples read this folder's README.md.
---

# lipsync — audio-driven mouths for XR Blocks

`lipsync` turns any avatar with a head pivot into a face that visibly mouths along to a `MediaStream`. Mental model: **a per-frame FFT + formant analyser writes viseme weights into a `target`; the `target` (typically `xb.StylizedFace`) re-rasterises a small canvas decal anchored to the head sphere's local `-Z`.** No model download, no ML runtime.

> Full reference (DSP pipeline, samples, caveats, public surface): [`README.md`](./README.md). Samples: [`samples/`](./samples/).

## When to use

Pair with [`netblocks`](../netblocks/SKILL.md) so every remote peer's voice stream drives their own avatar's mouth, turning shared rooms from silent spheres into faces that visibly speak. Standalone use is fine too: a TTS playback, an NPC, or a single-user puppet head. The face primitive (`xb.StylizedFace`) is in xrblocks core, so any consumer can drive it via `setVisemes(VisemeWeights)`, not just lipsync.

For ML-grade phoneme accuracy, the lower-level pieces (`FormantVisemeMapper`, `MfccExtractor`, `computeAudioFeatures`) and types are exported so a model-based mapper can slot in without touching the addon's public surface.

## Mental model

1. `MediaStream` → WebAudio `AnalyserNode` → byte frequency + time-domain buffers each frame.
2. `computeAudioFeatures` extracts RMS, voicing, F1, F2, and a few band energies.
3. `FormantVisemeMapper` maps F1/F2 to six viseme weights (`jawOpen`, `aa`, `oo`, `oh`, `ee`, `consonant`) with frame-rate-independent smoothing (`1 - exp(-dt / tau)`).
4. `LipsyncMouth` writes the weights to its `target` via `setVisemes(...)`.
5. `xb.StylizedFace` re-rasterises a 256×256 canvas (one dark mouth ellipse, optional eyes) and uploads it as a `CanvasTexture` on a small plane.

## Public surface

| Symbol                                                                                                                              | Where                                                   | Purpose                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LipsyncMouth`                                                                                                                      | `xrblocks/addons/lipsync/index.js`                      | The driver `xb.Script`. Constructor: `(stream: MediaStream, {target, audioContext?, fftSize?, silenceThreshold?, silenceHoldMs?})`. |
| `xb.StylizedFace`                                                                                                                   | xrblocks core (`import {StylizedFace} from 'xrblocks'`) | The face decal. Options: `headRadius`, `textureSize`, `showEyes`.                                                                   |
| `RemoteUserAvatar.face`                                                                                                             | xrblocks/addons/netblocks                               | Already a `StylizedFace`, ready for `LipsyncMouth` to drive.                                                                        |
| `FormantVisemeMapper`, `MfccExtractor`, `computeAudioFeatures`                                                                      | `xrblocks/addons/lipsync/index.js`                      | Pure modules a future ML mapper can plug into.                                                                                      |
| Types: `VisemeWeights`, `VisemeTarget`, `FormantVisemeMapperOptions`, `MfccExtractorOptions`, `AudioFeatures`, `AudioFeatureInputs` | `xrblocks/addons/lipsync/index.js`                      | Shared shapes for custom drivers.                                                                                                   |

## Lifecycle and ownership

- The caller owns the `MediaStream`. `LipsyncMouth.dispose()` disconnects audio nodes but never stops tracks. If you got the stream from `getUserMedia`, stop the tracks yourself when done.
- The caller owns the `AudioContext` when passed in. Always pass `audioContext` to reuse a shared context for any scene with more than one mouth (browsers cap contexts at around six per page). If omitted, `LipsyncMouth` creates its own and closes it on dispose.
- The caller owns the `target` face. `dispose()` resets it to rest pose so a speaker who stops mid-vowel never leaves their avatar's mouth frozen open, but never disposes the face itself.
- Instances are one-shot. After dispose, construct a new `LipsyncMouth`.

## Browser quirks worth knowing

- Microphone access requires HTTPS in modern browsers. Use `localhost` or a real cert for cross-device testing.
- Browsers can drop a `MediaStreamAudioSourceNode` unless the same stream is also being pumped by an `HTMLMediaElement`. `LipsyncMouth` creates a muted off-DOM `<audio>` primer per stream to keep WebAudio alive. Same workaround `SpatialVoice` uses.
- High-pitched voices (children, sopranos) push formants up and reduce vowel separation. Speaker-relative normalisation would help and is a sensible follow-up.
