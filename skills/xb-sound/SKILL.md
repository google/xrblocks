---
name: xb-sound
description: >-
  Play and capture audio in an XR Blocks app via `xb.sound` — spatial (positional)
  audio anchored to scene objects, master volume control, microphone recording and
  playback, plus speech recognition and synthesis. Use to add sound effects,
  3D-positioned audio, voice recording, or text-to-speech / speech-to-text. Covers
  `xb.core.sound` (`startRecording`/`stopRecording`/`playRecordedAudio`,
  `getAudioListener`, `setMasterVolume`) and the exported `SpeechRecognizer` /
  `SpeechSynthesizer` / `SoundSynthesizer` classes. See samples/sound.
---

# xb-sound: spatial audio & speech

`xb.sound` (a.k.a. `xb.core.sound`) manages audio. See `samples/sound`, `demos/sound_detector`,
and [`src/sound/`](../../src/sound) (which has its own README).

## Spatial (positional) audio

Attach a `THREE.PositionalAudio` to any object so it pans/attenuates with the listener:

```js
const listener = xb.core.sound.getAudioListener();
const audio = new THREE.PositionalAudio(listener);
audio.setBuffer(audioBuffer); // a decoded AudioBuffer
audio.setRefDistance(0.5);
audio.setVolume(1.0);
ball.add(audio); // parented to the object → 3D positioned
audio.play();
```

## Microphone recording & playback

```js
await xb.core.sound.startRecording();
// …later…
const pcm = xb.core.sound.stopRecording(); // ArrayBuffer of Int16 PCM
const rate = xb.core.sound.getRecordingSampleRate();
await xb.core.sound.playRecordedAudio(pcm, rate);
xb.core.sound.setMasterVolume(0.8); // 0..1
```

## Speech recognition & synthesis

The SDK exports `xb.SpeechRecognizer` and `xb.SpeechSynthesizer` (plus `xb.SoundSynthesizer`
and `xb.BackgroundMusic`). Use them for speech-to-text and text-to-speech; see
[`src/sound/SpeechRecognizer.ts`](../../src/sound/SpeechRecognizer.ts) and
[`src/sound/SpeechSynthesizer.ts`](../../src/sound/SpeechSynthesizer.ts) for their APIs.

## Notes

- Microphone access prompts for permission; set `options.permissions.microphone = true` (or
  use a feature that requests it) before relying on recording.
- Recorded data is Int16 PCM; convert to a `THREE` `AudioBuffer` for positional playback
  (see the conversion in [`samples/sound/main.js`](../../samples/sound/main.js)).
- Call `xb.core.sound.disableAudio()` to tear down capture when done.
