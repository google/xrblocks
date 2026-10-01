# Read Aloud

Hold a book, sheet or screen in front of you and click **Read** on the
spatial card. The headset camera takes a photo, the printed text is extracted
(and translated to English when the page is in another language, see below),
and [Matcha-TTS](https://huggingface.co/litert-community/Matcha-TTS) speaks
it. **Stop** cancels playback. The card shows the last photo, the extracted
text and the pipeline status.

The models run on a **laptop tethered to the headset**: `server/server.py`
hosts Matcha-TTS on [LiteRT](https://ai.google.dev/edge/litert) (CPU, XNNPACK)
and, optionally, a local vision model through [Ollama](https://ollama.com) for
the text extraction. Text extraction defaults to Gemini. Everything the page
needs from the laptop travels over one forwarded localhost port; the headset
itself runs no model. (An earlier version ran Matcha-TTS in the headset
browser through LiteRT.js; the mobile CPU could not keep up with the decoder.)

Port of the Text → Speech web demo in
[google-ai-edge/litert-samples](https://github.com/google-ai-edge/litert-samples/tree/main/samples/web_demos):
`server/matcha_tts.py` is that demo's host pipeline in Python, on the same
`.tflite` files.

## Setup

### 1. Laptop server

```sh
cd demos/read_aloud/server
python3 -m venv .venv && source .venv/bin/activate   # Python 3.10+
pip install -r requirements.txt                       # ai-edge-litert, numpy
python server.py
```

The first start downloads about 92 MB of model files from Hugging Face into
`~/.cache/xrblocks/read_aloud/` (override with `--model-dir`). It then prints
something like:

```
Read Aloud server on http://127.0.0.1:8790  (tts: 8 threads, warm-up 250 ms; ollama gemma4:26b-uc at http://127.0.0.1:11434: available)
```

Options: `--port`, `--threads`, `--steps` (decoder Euler steps, 4 by default,
10 is the model's own), `--host 0.0.0.0` for LAN access, `--ollama-url`,
`--ollama-model`.

### 2. Gemini key (default text extraction)

Create `keys.json` in this directory (gitignored):

```json
{"gemini": {"apiKey": "YOUR_KEY"}}
```

In the docs site the key comes from the iframe's `?key=` parameter.

### 3. Page

Serve the repo (`npm run dev` from the repo root). On a headset, forward both
ports over USB and open the page through `localhost`, which keeps the camera
and the server request on one secure origin:

```sh
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8790 tcp:8790
```

Then open `http://localhost:8080/demos/read_aloud/` and allow camera access.
The status line reports `Ready · Matcha-TTS on the laptop (matcha-tts/litert ·
8 threads · 4 steps)` once the server answered. If the server is unreachable
the demo says so and falls back to the browser's own voice
(`xb.core.sound.speechSynthesizer`).

## Translation

Pages in other languages are read out in English. The text-extraction prompt
(`ocr.js`, shared by both backends) asks the model for one JSON object with
the transcription, the language it is in, and an English translation, so
reading and translating cost a single model call. When the page was not
English:

- the card shows `[French → English]` above the translated text,
- the status line reads `Translated from French · Speaking 1/3 …`,
- Matcha speaks the translation.

English pages pass through unchanged, with no label. The target language is
fixed to English because Matcha's voice is English-only (`TARGET_LANGUAGE`
in `ocr.js`). Both Gemini and the Ollama models tested (`gemma4:26b-uc`)
handle the transcribe-and-translate step in one go; a model that answers
with plain text instead of JSON is still read, just without translation.

## Local text extraction with Ollama

Install Ollama and pull a model with the _vision_ capability; the default is
`gemma4:26b-uc` (`ollama pull gemma4:26b-uc`), and `--ollama-model <name>`
picks another. Check with `ollama show <name>` that "vision" is listed under
Capabilities: the MLX builds (`gemma4:26b-mlx`, for example) are text-only and
reject images, and the server says so at startup. The server does not need Ollama to be running already: when
nothing answers at `--ollama-url` and the `ollama` binary is installed, it
launches `ollama serve` itself and stops it on exit (`--no-ollama-autostart`
turns that off). Open the page with `?ocr=ollama`; the photo then goes to the
laptop server's `/ocr` endpoint, which asks Ollama to transcribe it, so no
Gemini key is needed. Large models take a few seconds per page; the status line
shows which model is answering.

## Query parameters

| Parameter          | Effect                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `?text=<text>`     | Speak that text right after connecting (no camera or key needed).      |
| `?ocr=ollama`      | Extract text with the local Ollama model instead of Gemini.            |
| `?server=<origin>` | Laptop server, default `http://localhost:8790`.                        |
| `?native=1`        | Force the browser voice instead of the server.                         |
| `?steps=<n>`       | Decoder Euler steps for this session (overrides the server's default). |
| `?key=<key>`       | Gemini API key.                                                        |

## Server API

| Route         | Body                                                   | Response                                            |
| ------------- | ------------------------------------------------------ | --------------------------------------------------- |
| `GET /health` |                                                        | `{ok, tts: {threads, steps, …}, ocr: {ollama…}}`    |
| `POST /tts`   | `{"text", "steps"?, "seed"?}`                          | `audio/wav` (16-bit, 22.05 kHz), `X-Timings` header |
| `POST /ocr`   | `{"image": <base64>, "mimeType"?, "prompt"?, "json"?}` | `{"text", "model", "ms"}`                           |

`/ocr` returns the model's reply verbatim; the page's prompt (`ocr.js`) asks
for a JSON object with the transcription, its language and an English
translation, and `json: true` switches Ollama to JSON output mode. Without a
prompt the server just transcribes.

CORS is open (`*`) because the page and the server sit on different ports.
Run `python -m unittest` in `server/` for the model-free unit tests, and
`pylint *.py` there for style (the `.pylintrc` next to the code sets the line
length and the few checks the numeric pipeline turns off).

## Credits

Original demo code: Apache-2.0, google-ai-edge/litert-samples. Models and data
downloaded at runtime by the server: `litert-community/Matcha-TTS` (MIT;
Matcha-TTS and HiFi-GAN checkpoints), DeepPhonemizer G2P model (MIT),
OpenPhonemizer espeak-IPA dictionary (Clear BSD). See `LICENSE` in this
folder.
