---
name: xb-lipsync
description: >-
  Add audio-driven avatar mouths to an XR Blocks app with the lipsync addon — heuristic
  vowel-formant viseme mapping that turns any `MediaStream` (mic or remote peer's voice)
  into mouth shapes on a `StylizedFace` decal attached to an avatar's head. Zero ML
  runtime, no model download. Use when you want shared rooms to stop being silent
  spheres and become faces that visibly speak, or to lip-sync a TTS playback to an NPC.
  Covers `LipsyncMouth`, `xb.StylizedFace`, the `target`/`audioContext`/`fftSize` constructor
  options, and the `session.voice.onTrack` netblocks pairing. Lower-level pieces
  (`FormantVisemeMapper`, `MfccExtractor`, `computeAudioFeatures`) and types
  (`VisemeWeights`, `VisemeTarget`) are exported for swapping in a model-based mapper.
  Full reference at src/addons/lipsync/.
---

# xb-lipsync: audio-driven mouths

A `LipsyncMouth` is an `xb.Script` that pulls audio from a `MediaStream`, runs an FFT + formant analyser every frame, and writes viseme weights to a `target` (anything with `setVisemes(VisemeWeights)`, typically `xb.StylizedFace` or `user.avatar.face` on a netblocks avatar). The face primitive (`xb.StylizedFace`) is a 256×256 canvas decal anchored to the head sphere's local `-Z` so the mouth always points forward.

> **Full reference**: [`../../src/addons/lipsync/SKILL.md`](../../src/addons/lipsync/SKILL.md) and [`../../src/addons/lipsync/README.md`](../../src/addons/lipsync/README.md).

## When to use

Pair with [`xb-netblocks`](../xb-netblocks/SKILL.md) so every remote peer's voice stream drives their own mouth. Single-user setups work too (TTS playback, mic-test puppet, NPC dialogue). For full ML-grade phoneme accuracy plug a model into the same pipeline via the exported `FormantVisemeMapper` / `MfccExtractor` surface.

## Quick start

Single user, mic into a standalone head:

```ts
import * as xb from 'xrblocks';
import {LipsyncMouth} from 'xrblocks/addons/lipsync/index.js';

class MyApp extends xb.Script {
  async init() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const face = new xb.StylizedFace({showEyes: false});
    headPivot.add(face);
    const driver = new LipsyncMouth(stream, {target: face});
    headPivot.add(driver);
  }
}
xb.add(new MyApp());
xb.init();
```

The scripts manager calls `init()` once and `update(time)` every frame on `driver` and `face`. `dispose()` runs after removal from the scene. The driver does NOT dispose the target face. The caller owns it.

## Netblocks integration

`RemoteUserAvatar` already attaches a `StylizedFace` to every remote peer, so just point `LipsyncMouth` at it. Pass a shared `AudioContext` because browsers cap contexts at around six per page. Track drivers per peer so mic mute / unmute / leave doesn't leak.

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

`session.voice.onTrack` is additive, so this runs alongside (not instead of) netblocks' own `SpatialVoice.attach`. Peers both see mouths and hear each other.

## Lifecycle

- Caller owns the `MediaStream`. `dispose()` disconnects audio nodes but never stops tracks.
- Caller owns the `AudioContext` when passed in. If omitted, `LipsyncMouth` creates and closes its own.
- Caller owns the `target` face. `dispose()` resets the target to its rest pose but never disposes it.
- Instances are one-shot. After dispose, construct a new `LipsyncMouth`.
