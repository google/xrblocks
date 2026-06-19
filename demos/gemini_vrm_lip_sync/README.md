# Gemini VRM Lipsync

A VRM avatar that acts as **Gemini Live's body**: you speak, Gemini replies in
audio, and the avatar's mouth moves in sync with what Gemini says — driven by the
[`lipsync`](../../src/addons/lipsync) add-on.

## How it works

| Stage          | What happens                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Mic → Gemini   | `xb.core.sound.enableAudio()` streams your mic to the live session.                                                                         |
| Gemini → audio | Each live message carries base64 PCM in `message.data`. `AIAudioPlayer` plays it to the speakers **and** exposes it as a `MediaStream`.     |
| audio → mouth  | `LipsyncMouth` analyses that stream and writes visemes to `VRMVisemeTarget`, which drives the VRM's `aa`/`ih`/`ou`/`ee`/`oh` mouth presets. |

The avatar (same model + idle animation as [`demos/vrm-avatar`](../vrm-avatar))
also blinks and idles on its own.

### Files

- `VRMAvatar.js` — VRM load + GLB animation retarget + blink (copied from `demos/vrm-avatar`).
- `AIAudioPlayer.js` — plays Gemini's PCM and taps it as a `MediaStream` for lipsync.
- `VRMVisemeTarget.js` — maps lipsync viseme weights onto VRM mouth expression presets.
- `GeminiVRMLipScript.js` — orchestrates the avatar, the live session, and the lipsync driver.

## Running

This demo needs a Gemini API key. It's read from `keys.json` in this folder
(`{ "gemini": { "apiKey": "…" } }`), or you can pass `?geminiKey=YOUR_KEY` in the URL.

From the repo root:

```bash
npm run build     # build xrblocks + the lipsync addon into build/
npm run serve     # serve at http://127.0.0.1:8080
```

Then open `http://127.0.0.1:8080/demos/gemini-vrm-lip/`, click **🎙️ Talk to
Gemini**, grant microphone access, and talk. The avatar's mouth follows Gemini's
replies. Click **⏹ Stop** to end the session (the mouth resets to rest).

> Microphone capture requires a secure context — use `localhost`/`127.0.0.1` or HTTPS.
