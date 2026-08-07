# Current AI provider surface

Read this reference for every AI branch, then verify exact types in the current
source and installed provider declarations.

## Provider setup

```js
const options = new xb.Options();
options.enableAI();
options.ai.model = 'gemini';
```

`enableAI()` enables Gemini. To use OpenAI, set `options.ai.model = 'openai'`
and `options.ai.openai.enabled = true`. Configure provider options before
`xb.init(options)` and guard use with `xb.ai.isAvailable()`.

| Operation           | Gemini | OpenAI wrapper |
| ------------------- | ------ | -------------- |
| `{prompt}` query    | yes    | yes            |
| multipart query     | yes    | no             |
| Live audio or video | yes    | no             |
| image generation    | yes    | no             |
| Live native tools   | yes    | no             |

## Query and generation

The portable query is:

```js
const response = await xb.ai.query({prompt: 'Describe this scene briefly.'});
const text =
  response && typeof response === 'object' ? response.text : response;
```

Gemini can accept current typed multipart input. Treat `null`, missing text,
and tool-only responses as normal branches. `generate(prompt, 'image')` returns
a data URL on success, not an object with a URL property.

## Live

Register callbacks before `startLiveSession()`. Use direct current
`LiveConnectConfig` fields such as `responseModalities`, `speechConfig`,
`systemInstruction`, `tools`, and `realtimeInputConfig`.

Realtime media is nested:

```js
xb.ai.sendRealtimeInput({
  audio: {data: base64Pcm, mimeType: 'audio/pcm;rate=48000'},
});

xb.ai.sendRealtimeInput({
  video: {data: base64Jpeg, mimeType: 'image/jpeg'},
});
```

Guard Live with `xb.ai.isLiveAvailable()`. Treat availability as a truthy
provider capability, not necessarily the literal boolean `true`.

## Credentials

Prototype credentials can come from provider options, the generic or
provider-specific URL parameter, the optional current-page prompt, or
`keys.json`. These routes expose a long-lived key to browser code and are for
local prototypes only. Production applications use a server-controlled proxy
or short-lived provider credentials.
