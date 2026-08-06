# Current AI API

Use this reference while implementing any AI branch. It reflects the public
facade in `src/ai/AI.ts`, the provider implementations, and the installed
`@google/genai` 2.7.0 types. Recheck those sources after dependency or SDK
changes.

## Setup and availability

```js
const options = new xb.Options();
options.enableAI(); // enables AI and Gemini
options.ai.model = 'gemini'; // or 'openai'

// Configure before xb.init(options):
options.ai.gemini.apiKey = localPrototypeKey;
// options.ai.openai.enabled = true;
// options.ai.openai.apiKey = localPrototypeKey;

xb.add(new App());
xb.init(options);
```

`enableAI()` enables Gemini, not OpenAI. For OpenAI, select `openai` and enable
`options.ai.openai.enabled` explicitly. Check `xb.ai.isAvailable()` at use time.
This reports wrapper initialization, not credential validity or network health;
still catch each request.

## Provider matrix

| Operation                    | Gemini | OpenAI wrapper |
| ---------------------------- | ------ | -------------- |
| `{prompt}` query             | yes    | yes            |
| Gemini typed/multipart query | yes    | no             |
| Live audio/video             | yes    | no             |
| `generate(..., 'image')`     | yes    | no             |
| Live native tools            | yes    | no             |

The exported agent framework is marked work in progress and currently assumes
Gemini in its reasoning loop. Do not treat it as a provider-neutral abstraction.

## Query

Public signature:

```ts
query(
  input: GeminiQueryInput | {prompt: string},
  tools?: never[]
): Promise<GeminiResponse | string | null>
```

Portable query:

```js
const response = await xb.ai.query({prompt: 'Describe this scene briefly.'});
const text = response && typeof response === 'object' ? response.text : null;
```

Gemini multipart query:

```js
const response = await xb.ai.query({
  type: 'multiPart',
  parts: [
    {inlineData: {data: base64Png, mimeType: 'image/png'}},
    {text: 'Name the objects relevant to the task.'},
  ],
});
```

Gemini also implements `type: 'text'`, `'base64'`, and `'uri'`; verify their
fields in `src/ai/Gemini.ts` before use. Although `GeminiQueryInput` currently
contains a `'live'` variant, use the dedicated Live methods below—the query
switch does not implement that variant.

`GeminiResponse` contains either `text?: string | null` or the first
`toolCall?: {name, args}`. Treat missing text and a `null` response as expected
failure states.

## Live

Exact facade signatures:

```ts
startLiveSession(
  config?: LiveConnectConfig,
  model?: string
): Promise<Session>
setLiveCallbacks(callbacks: LiveCallbacks): Promise<void>
sendRealtimeInput(input: LiveSendRealtimeInputParameters): void | false
sendToolResponse(response: LiveSendToolResponseParameters): void
getLiveSessionStatus(): {
  isActive: boolean;
  hasSession: boolean;
  isAvailable: boolean | typeof Modality | undefined;
}
isLiveAvailable(): false | typeof Modality | undefined
stopLiveSession(): Promise<void>
```

The availability methods are intended as truthy guards. Their generated types
also expose the current implementation detail that Live availability may return
the loaded `Modality` enum object rather than literal `true`.

Register callbacks before `startLiveSession()`. Passing a second `model`
overrides `options.ai.gemini.liveModel` for that connection.

Use direct `LiveConnectConfig` fields:

```js
await xb.ai.startLiveSession({
  responseModalities: ['AUDIO'],
  speechConfig: {
    voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}},
  },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
});
```

The installed types also accept `generationConfig`, but the provider runtime
marks it deprecated. Prefer direct fields such as `responseModalities`,
`speechConfig`, `systemInstruction`, `tools`, and `realtimeInputConfig`.

Realtime input is synchronous and the media blob is nested:

```js
xb.ai.sendRealtimeInput({
  audio: {data: base64Pcm, mimeType: 'audio/pcm;rate=48000'},
});

xb.ai.sendRealtimeInput({
  video: {data: base64Image, mimeType: 'image/jpeg'},
});
```

The flattened `{data, mimeType}` shape is not a
`LiveSendRealtimeInputParameters`. `media`, `text`, `audioStreamEnd`, explicit
activity signals, and the nested `audio`/`video` fields are the provider-typed
alternatives.

## Image generation

```ts
generate(
  prompt: string | string[],
  type?: 'image',
  systemInstruction?: string,
  model?: undefined
): Promise<string | undefined>
```

For Gemini, the successful result is a `data:image/png;base64,...` string—not an
object with a `url` field. Validate it before loading it as an app asset.

## Credentials

The facade resolves prototype keys in this order: provider options, generic
`?key=`, provider-specific URL parameter, `geminiKey64`, then `keys.json`.
Encoding a key is not protection. All of these routes expose a long-lived key to
the browser and are local-prototype conveniences only.
