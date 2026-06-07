# lipsync

Audio-driven avatar mouths for [xrblocks](https://github.com/google/xrblocks).

`lipsync` turns any avatar with a head pivot into a face that visibly mouths along to a `MediaStream`. The mouth, eyes, and an occasional blink are drawn to a small canvas decal sitting flush with the front of the head. The mouth shape is driven each frame from heuristic vowel formants. No model download, no ML runtime.

The reason this addon exists is the pairing with [`netblocks`](../netblocks/README.md): every remote peer's voice `MediaStream` drives their own avatar's mouth, so a shared room stops being silent spheres and becomes faces that visibly speak.

A standalone web demo of the same idea (single user, lower-fidelity DSP) lives at <https://salmanmkc.github.io/audio-avatar-lipsync/>.

## Quick start

Single-user mic into any `Object3D` head:

```ts
import * as xb from 'xrblocks';
import {LipsyncMouth} from 'xrblocks/addons/lipsync/index.js';

const face = new xb.StylizedFace({showEyes: false});
headPivot.add(face);
const driver = new LipsyncMouth(myMicStream, {target: face});
headPivot.add(driver);
```

That's it. Once `driver` is in the scene graph, the xrblocks scripts manager calls `init()` once and `update(time)` every frame on it (and on the face itself, so the eyes keep blinking). `dispose()` runs on the next sync after either is removed from the scene. The driver does NOT dispose the `target` face. The caller owns it.

`StylizedFace` is an xrblocks core primitive (`xb.StylizedFace`): a flat canvas decal anchored to the host head's local `-Z` (face direction). It defaults to a 10 cm radius head; pass `headRadius` if your avatar's head is bigger or smaller.

## Netblocks integration

Netblocks's `RemoteUserAvatar` already attaches a `face` (a `StylizedFace`) to every remote peer out of the box, so you don't have to create one yourself. Just point `LipsyncMouth` at it. Track drivers per peer so mic mute / unmute / leave doesn't leak.

```ts
import * as THREE from 'three';
import {LipsyncMouth} from 'xrblocks/addons/lipsync/index.js';

private drivers = new Map<string, LipsyncMouth>();
private sharedCtx = THREE.AudioContext.getContext();

private detachDriver(peerId: string) {
  const prior = this.drivers.get(peerId);
  if (prior) {
    prior.dispose();
    prior.removeFromParent();
    this.drivers.delete(peerId);
  }
}

protected override onSession(session) {
  session.voice.onTrack((peerId, stream) => {
    const user = session.users.get(peerId);
    if (!user) return;
    this.detachDriver(peerId);
    const driver = new LipsyncMouth(stream, {
      target: user.avatar.face,
      audioContext: this.sharedCtx,
    });
    user.avatar.add(driver);
    this.drivers.set(peerId, driver);
  });
  session.voice.onTrackRemoved((peerId) => this.detachDriver(peerId));
  session.addEventListener('user-leave', (e) => {
    this.detachDriver(e.detail.user.peerId);
  });
}
```

`session.voice.onTrack` is additive, so this runs alongside (not instead of) netblocks' own `SpatialVoice.attach`, and peers both see mouths and hear each other.

See [`samples/netblocks/`](samples/netblocks/) for a working multi-peer demo.

## Lifecycle and ownership

The caller owns the `MediaStream`. `LipsyncMouth.dispose()` disconnects its audio nodes but never stops tracks. If you got the stream from `getUserMedia`, stop the tracks yourself when you're done with them.

The caller also owns the `AudioContext` when one is passed in. Always pass `audioContext` to reuse a shared context for any scene with more than one mouth, because browsers cap contexts at around 6 per page. If you omit the option, `LipsyncMouth` creates its own context and closes it on dispose. A caller-supplied context is never closed by the addon.

The caller also owns the `target` face. `LipsyncMouth.dispose()` resets the target to its rest pose (so a speaker who stops mid-vowel never leaves their avatar's mouth frozen open) but never disposes the face itself.

Instances are one-shot. After dispose, construct a new `LipsyncMouth`. Do not re-add the disposed instance to the scene.

## Samples

`samples/puppet/` is a single-user puppet head you can talk to. Opens in seconds, no server.

`samples/netblocks/` is the multiplayer demo. Open it in two browser tabs or two devices in the same room to see each peer's voice drive their own avatar's mouth.

## How the mouth is computed

Each frame, an `AnalyserNode` gives us byte frequency and time-domain buffers. `computeAudioFeatures` extracts RMS, voicing, F1, F2, and a few band energies from those. `FormantVisemeMapper` maps F1/F2 to six viseme weights (`jawOpen`, `aa`, `oo`, `oh`, `ee`, `consonant`) with frame-rate-independent smoothing (`1 - exp(-dt / tau)`) so 60, 72, 90, and 120 Hz refresh rates all look identical. `LipsyncMouth` writes the weights to its `target` (typically `xb.StylizedFace`), which re-rasterises a 256×256 canvas (one dark mouth ellipse and two optional eye dots) and uploads it as a `CanvasTexture` on a small plane sitting flush with the head sphere.

The pipeline is split into pure modules (`MfccExtractor`, `FormantVisemeMapper`, `computeAudioFeatures`) so the heuristic mapper can be replaced later by a small ML viseme mapper consuming the same `AudioFeatures` plus MFCC vector, without touching the addon's public surface. The face primitive (`xb.StylizedFace`) lives in xrblocks core so any consumer can drive it, not just lipsync.

## Caveats

Vowel detection from F1/F2 is heuristic. It covers the dominant shapes well enough that you can tell when someone is talking, but it won't beat a proper phoneme model on accuracy. The `MfccExtractor` is exported so a model-based mapper can slot in.

High-pitched voices (children, soprano singers) push formants up and can reduce vowel separation. Speaker-relative normalisation would help here and would be a sensible follow-up.

Microphone access requires HTTPS in modern browsers. Use `localhost` or a real cert for cross-device testing.

Browsers can drop a `MediaStreamAudioSourceNode` unless the same stream is also being pumped by an `HTMLMediaElement`. `LipsyncMouth` creates a muted off-DOM `<audio>` primer per stream to keep WebAudio alive. This is the same workaround `SpatialVoice` uses.

## Public surface

The main export is `LipsyncMouth`. It's an `xb.Script` you construct with a `MediaStream` and a `target` (anything with `setVisemes(VisemeWeights)`, typically `xb.StylizedFace` or `user.avatar.face` on a netblocks avatar). Constructor options: `target` (required), `audioContext`, `fftSize`, `silenceThreshold`, `silenceHoldMs`. The driver never disposes the target. The caller owns it.

The face primitive `StylizedFace` lives in xrblocks core (`import {StylizedFace} from 'xrblocks'`); construct one yourself for standalone use, or read it off `RemoteUserAvatar.face` for multiplayer. It takes `headRadius`, `textureSize`, and `showEyes`.

The lower-level pieces (`FormantVisemeMapper`, `MfccExtractor`, `computeAudioFeatures`) and the types (`VisemeWeights`, `VisemeTarget`, `FormantVisemeMapperOptions`, `MfccExtractorOptions`, `AudioFeatures`, `AudioFeatureInputs`) are exported as well, so a future ML mapper can plug into the same pipeline. `LipMetrics` and `StylizedFaceOptions` come from xrblocks core alongside `StylizedFace`.
