---
name: xb-ai
description: >-
  Integrate generative AI into an XR Blocks app via `xb.ai` — text and multimodal
  (image) queries to Gemini or OpenAI, real-time Gemini Live audio/video sessions,
  and image generation. Use to answer questions, describe what the camera sees,
  drive conversational agents, or generate content from an XR scene. Covers
  `enableAI()`, `xb.ai.isAvailable()`, `xb.ai.query()`, `startLiveSession()`,
  `generate()`, and local API-key handling (`?key=` / `keys.json`). Always guard
  calls with `isAvailable()`; never ship keys in production client code.
---

# xb-ai: Gemini / OpenAI integration

`xb.ai` (a.k.a. `xb.core.ai`) wraps Gemini (default) and OpenAI. See `templates/6_ai`,
`templates/7_ai_live`, and `demos/xrpoet`.

## Setup & keys

```js
const options = new xb.Options();
options.enableAI();
xb.init(options);
```

For **local prototyping**, supply a key via the `?key=YOUR_KEY` URL parameter or a `keys.json`
(`{"gemini": {"apiKey": "…"}}`) served next to the app.

> [!IMPORTANT]
> The `?key=`/`keys.json` paths are for prototyping ONLY. In production, proxy AI calls through
> a server you control — never embed a key in client code.

## Text & multimodal queries

```js
class Ask extends xb.Script {
  async ask() {
    if (!xb.ai.isAvailable()) return; // always guard
    const res = await xb.ai.query({prompt: 'Write a haiku about dust.'});
    console.log(res.text); // response text

    // Multimodal: text + image parts
    const res2 = await xb.ai.query({
      type: 'multiPart',
      parts: [
        {inlineData: {data: base64Png, mimeType: 'image/png'}},
        {text: 'What do you see?'},
      ],
    });
    console.log(res2.text);
  }
}
```

## Gemini Live (real-time audio/video)

```js
await xb.ai.setLiveCallbacks({
  /* onmessage, onopen, … */
});
const session = await xb.ai.startLiveSession(/* LiveConnectConfig */ {});
xb.ai.sendRealtimeInput({
  /* audio/video chunk */
});
// xb.ai.getLiveSessionStatus(); xb.ai.stopLiveSession();
```

Capture the scene to feed the model with `xb.core.screenshotSynthesizer` /
`xb.core.deviceCamera` (passthrough; enable via `options.enableCamera()`).

## Image generation

```js
const result = await xb.ai.generate('a low-poly desert fox', 'image');
```

## Notes

- Choose the model via `options.ai` (`model: 'gemini' | 'openai'`, per-model options in
  [`src/ai/AIOptions.ts`](../../src/ai/AIOptions.ts)).
- `xb.ai.isLiveAvailable()` gates Live; not all models/keys support it.
- AI data leaves the device for Gemini/OpenAI servers — follow their privacy terms.
