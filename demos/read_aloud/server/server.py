"""Read Aloud laptop server: Matcha-TTS on LiteRT plus an optional Ollama OCR
proxy, both reached by the headset page over a forwarded localhost port.

    python server.py [--port 8790] [--threads 8] [--ollama-model gemma4:26b-uc]

Endpoints (CORS enabled, JSON in unless noted):
  GET  /health                -> {"ok", "tts": {...}, "ocr": {...}}
  POST /tts   {text, steps?, seed?}  -> audio/wav (16-bit PCM); header X-Timings
  POST /ocr   {image (base64), mimeType?} -> {"text"} via Ollama /api/chat
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from matcha_tts import DEFAULT_MODEL_DIR, DEFAULT_STEPS, MatchaTTS, to_wav_bytes

OCR_PROMPT = (
    "Transcribe all printed text in this photo in natural reading order. "
    "Return only the text, with paragraphs separated by blank lines. "
    "Do not describe the image. If there is no readable text, return exactly NONE."
)


class Engine:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.lock = threading.Lock()
        self.ollama_process: subprocess.Popen | None = None
        self.tts = MatchaTTS(Path(args.model_dir).expanduser(), args.threads)
        self.warmup_ms = self.tts.warm_up()
        if args.ollama_autostart and not self.ollama_available():
            self.start_ollama()

    def start_ollama(self, wait_s: float = 15.0) -> bool:
        """Launches `ollama serve` when the binary is installed but nothing
        answers at --ollama-url yet. Only a local URL can be started here."""
        binary = shutil.which("ollama")
        is_local = "127.0.0.1" in self.args.ollama_url or "localhost" in self.args.ollama_url
        if not binary or not is_local:
            return False
        print("starting `ollama serve` ...")
        self.ollama_process = subprocess.Popen(
            [binary, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + wait_s
        while time.monotonic() < deadline:
            if self.ollama_available():
                return True
            time.sleep(0.5)
        return False

    def shutdown(self):
        if self.ollama_process and self.ollama_process.poll() is None:
            self.ollama_process.terminate()

    def health(self) -> dict:
        return {
            "ok": True,
            "tts": {
                "engine": "matcha-tts/litert",
                "threads": self.tts.num_threads,
                "sampleRate": self.tts.sample_rate,
                "steps": self.args.steps,
                "warmupMs": round(self.warmup_ms),
            },
            "ocr": {
                "ollamaUrl": self.args.ollama_url,
                "ollamaModel": self.args.ollama_model,
                "ollamaAvailable": self.ollama_available(),
                # None: model not pulled or Ollama down; False: text-only model.
                "ollamaVision": self.ollama_vision(),
            },
        }

    def ollama_vision(self) -> bool | None:
        capabilities = self.ollama_model_capabilities()
        return None if capabilities is None else "vision" in capabilities

    def ollama_available(self) -> bool:
        try:
            with urllib.request.urlopen(self.args.ollama_url + "/api/tags", timeout=1) as r:
                return r.status == 200
        except (urllib.error.URLError, OSError, ValueError):
            return False

    def ollama_model_capabilities(self) -> list[str] | None:
        """Capabilities Ollama reports for the configured model, or None when
        Ollama is down or the model is not pulled."""
        payload = json.dumps({"model": self.args.ollama_model}).encode()
        request = urllib.request.Request(
            self.args.ollama_url + "/api/show", data=payload,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=5) as r:
                return list(json.loads(r.read()).get("capabilities") or [])
        except (urllib.error.URLError, OSError, ValueError):
            return None

    def speak(self, text: str, steps: int, seed: int):
        with self.lock:
            return self.tts.synthesize(text, steps=steps, seed=seed)

    def ocr(self, image_b64: str) -> str:
        payload = json.dumps({
            "model": self.args.ollama_model,
            "messages": [{"role": "user", "content": OCR_PROMPT, "images": [image_b64]}],
            "stream": False,
            "options": {"temperature": 0},
        }).encode()
        request = urllib.request.Request(
            self.args.ollama_url + "/api/chat", data=payload,
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as r:
            body = json.loads(r.read())
        return (body.get("message") or {}).get("content", "").strip()


class Handler(BaseHTTPRequestHandler):
    engine: Engine  # set on the class by main()

    def log_message(self, fmt, *args):  # quieter default log
        print(f"{self.address_string()} {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "X-Timings, X-Chunks")

    def _send(self, status: HTTPStatus, body: bytes, content_type: str, extra: dict | None = None):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: HTTPStatus, data: dict, extra: dict | None = None):
        self._send(status, json.dumps(data).encode(), "application/json", extra)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        data = json.loads(raw or b"{}")
        if not isinstance(data, dict):
            raise ValueError("JSON object expected")
        return data

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            self._json(HTTPStatus.OK, self.engine.health())
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            data = self._read_json()
            if path == "/tts":
                self._tts(data)
            elif path == "/ocr":
                self._ocr(data)
            else:
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (ValueError, KeyError) as error:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:300]
            self._json(HTTPStatus.BAD_GATEWAY, {"error": f"Ollama HTTP {error.code}: {detail}"})
        except urllib.error.URLError as error:
            self._json(HTTPStatus.BAD_GATEWAY, {"error": f"Ollama unreachable: {error.reason}"})
        except Exception as error:  # noqa: BLE001 - report anything to the page
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"{type(error).__name__}: {error}"})

    def _tts(self, data: dict):
        text = str(data.get("text", "")).strip()
        if not text:
            raise ValueError("text is required")
        steps = int(data.get("steps") or self.engine.args.steps)
        seed = int(data.get("seed") or 0)
        start = time.perf_counter()
        result = self.engine.speak(text, steps, seed)
        if result.chunks == 0:
            self._json(HTTPStatus.OK, {"error": "nothing pronounceable"}, {"X-Chunks": "0"})
            return
        timings = dict(result.timings_ms, total=round((time.perf_counter() - start) * 1000, 1))
        self._send(HTTPStatus.OK, to_wav_bytes(result.wav, result.sample_rate), "audio/wav",
                   {"X-Timings": json.dumps(timings), "X-Chunks": str(result.chunks)})

    def _ocr(self, data: dict):
        image = str(data.get("image", ""))
        if not image:
            raise ValueError("image (base64) is required")
        if image.startswith("data:"):
            image = image.split(",", 1)[1]
        base64.b64decode(image, validate=True)  # reject junk before Ollama sees it
        start = time.perf_counter()
        text = self.engine.ocr(image)
        self._json(HTTPStatus.OK, {"text": text, "model": self.engine.args.ollama_model,
                                   "ms": round((time.perf_counter() - start) * 1000)})


def main():
    sys.stdout.reconfigure(line_buffering=True)  # progress shows up when piped to a log
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1", help="bind address (0.0.0.0 for LAN access)")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR), help="where the model files are cached")
    parser.add_argument("--threads", type=int, default=None, help="XNNPACK threads (default: CPU count, max 8)")
    parser.add_argument("--steps", type=int, default=DEFAULT_STEPS, help="decoder Euler steps (4 fast, 10 = model default)")
    parser.add_argument("--ollama-url", default=os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"))
    parser.add_argument("--ollama-model", default="gemma4:26b-uc",
                        help="vision model for /ocr (any Ollama model with the vision capability)")
    parser.add_argument("--no-ollama-autostart", dest="ollama_autostart", action="store_false",
                        help="do not launch `ollama serve` when Ollama is installed but not running")
    args = parser.parse_args()

    Handler.engine = Engine(args)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    health = Handler.engine.health()
    ocr = health["ocr"]
    if not ocr["ollamaAvailable"]:
        ollama_state = "not running"
    elif ocr["ollamaVision"] is None:
        ollama_state = f"running, but `{args.ollama_model}` is not pulled"
    elif not ocr["ollamaVision"]:
        ollama_state = f"running, but `{args.ollama_model}` has no vision capability (pick another with --ollama-model)"
    else:
        ollama_state = "available"
    print(f"Read Aloud server on http://{args.host}:{args.port}  "
          f"(tts: {health['tts']['threads']} threads, warm-up {health['tts']['warmupMs']} ms; "
          f"ollama {args.ollama_model} at {args.ollama_url}: {ollama_state})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        Handler.engine.shutdown()


if __name__ == "__main__":
    main()
