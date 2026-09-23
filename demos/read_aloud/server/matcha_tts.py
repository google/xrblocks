"""Matcha-TTS on LiteRT (CPU/XNNPACK), the laptop-side engine for Read Aloud.

Pipeline (per chunk of <=127 phonemes):
  text -> G2P (275k-word espeak-IPA dictionary + DeepPhonemizer fallback)
       -> symbol ids -> blank-interspersed [256] -> emb.bin lookup [1,256,192]
       -> text encoder -> mu [1,80,256], logw [1,1,256]
       -> durations ceil(exp(logw)) * length_scale -> integer length regulator
       -> N Euler ODE steps of decoder(x, mu_y, t_sin [1,160], ymask)
       -> mel = x * std + mean -> HiFi-GAN vocoder -> waveform (ylen * hop).

Model files come from litert-community/Matcha-TTS on Hugging Face and are
cached in a user directory on first use; nothing is stored in the repository.
"""

from __future__ import annotations

import gzip
import json
import math
import os
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

HF_BASE = "https://huggingface.co/litert-community/Matcha-TTS/resolve/main/"
FILES = {
    "textenc": "matcha_textenc_fp16.tflite",
    "decoder": "matcha_decoder_fp16.tflite",
    "vocoder": "matcha_vocoder_fp16.tflite",
    "g2p": "dp_g2p_matcha_fp16.tflite",
    "emb": "emb.bin",
    "dict": "g2p_dict.txt.gz",
    "config": "config.json",
    "g2p_meta": "g2p_meta.json",
}
DEFAULT_MODEL_DIR = Path.home() / ".cache" / "xrblocks" / "read_aloud"
# 4 Euler steps: ear-approved quality at ~1/3 the latency of the model's 10.
DEFAULT_STEPS = 4
MAX_PIDS = 127  # the 256-slot budget after blank interspersing

TOKEN = re.compile(r"[a-z']+|\d+(?:\.\d+)?|[.,!?;:—…\"]")
WORD = re.compile(r"^[a-z']+$")
SENTENCE_END = re.compile(r"[.!?…]")

ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
        "eighty", "ninety"]


def _int_to_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        rest = " " + _int_to_words(n % 100) if n % 100 else ""
        return ONES[n // 100] + " hundred" + rest
    for div, name in ((10**9, "billion"), (10**6, "million"), (10**3, "thousand")):
        if n >= div:
            head = _int_to_words(n // div) + " " + name
            return head + (" " + _int_to_words(n % div) if n % div else "")
    return ONES[0]


def number_to_words(token: str) -> str:
    """'1234.5' -> 'one thousand two hundred thirty four point five'."""
    integer, _, frac = token.partition(".")
    if len(integer) > 12:
        out = " ".join(ONES[int(d)] for d in integer)
    else:
        out = _int_to_words(int(integer))
    if frac:
        out += " point " + " ".join(ONES[int(d)] for d in frac)
    return out


def parse_dict(text: str) -> dict[str, str]:
    """Parses g2p_dict.txt (word<TAB>ipa per line)."""
    out: dict[str, str] = {}
    for line in text.split("\n"):
        word, tab, ipa = line.partition("\t")
        if tab and word:
            out[word] = ipa
    return out


def split_sentences(text: str) -> list[str]:
    """Splits text into sentences so each request stays short and playback
    can start early. Blank lines and sentence-final punctuation both split."""
    parts: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        buf = ""
        for piece in re.split(r"(?<=[.!?…])\s+", paragraph.strip()):
            piece = piece.strip()
            if not piece:
                continue
            buf = (buf + " " + piece).strip()
            if len(buf) >= 60 or SENTENCE_END.search(piece[-1:]):
                parts.append(buf)
                buf = ""
        if buf:
            parts.append(buf)
    return parts


# --------------------------------------------------------------------- assets


def fetch_assets(model_dir: Path = DEFAULT_MODEL_DIR, log=print) -> dict[str, Path]:
    """Downloads the model files once into `model_dir`."""
    model_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for key, name in FILES.items():
        path = model_dir / name
        if not path.exists():
            url = HF_BASE + name
            log(f"downloading {name} ...")
            tmp = path.with_suffix(path.suffix + ".part")
            with urllib.request.urlopen(url) as response, open(tmp, "wb") as out:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
            tmp.replace(path)
        paths[key] = path
    return paths


# ---------------------------------------------------------------------- models


class Model:
    """One compiled .tflite model with positional inputs/outputs."""

    def __init__(self, path: Path, num_threads: int):
        from ai_edge_litert.interpreter import Interpreter

        self.interpreter = Interpreter(model_path=str(path), num_threads=num_threads)
        self.interpreter.allocate_tensors()
        self.inputs = self.interpreter.get_input_details()
        self.outputs = self.interpreter.get_output_details()

    def run(self, *arrays: np.ndarray) -> list[np.ndarray]:
        for detail, value in zip(self.inputs, arrays):
            self.interpreter.set_tensor(detail["index"], np.ascontiguousarray(value, dtype=np.float32))
        self.interpreter.invoke()
        return [self.interpreter.get_tensor(d["index"]) for d in self.outputs]


class G2P:
    def __init__(self, dictionary: dict[str, str], meta: dict, model: Model | None):
        self.dict = dictionary
        self.meta = meta
        self.model = model
        self.special = set(meta["special"])
        self.cache: dict[str, str] = {}

    def word_to_ipa(self, word: str) -> str:
        hit = self.dict.get(word)
        if hit is not None:
            return hit
        if word not in self.cache:
            self.cache[word] = self._neural(word) if self.model else ""
        return self.cache[word]

    def phoneme(self, k: int) -> str | None:
        """idx2ph is a list in some metadata versions and a {"index": ph} map in
        others (the Hugging Face file); accept both."""
        table = self.meta["idx2ph"]
        if isinstance(table, dict):
            return table.get(str(k))
        return table[k] if k < len(table) else None

    def _neural(self, word: str) -> str:
        m = self.meta
        ids = [m["start"]]
        for ch in word:
            idx = m["char2idx"].get(ch)
            if idx is not None:
                ids.extend([idx] * m["char_repeats"])
        ids.append(m["end"])
        length = min(len(ids), m["MAXT"])
        inp = np.zeros((1, m["MAXT"]), np.float32)
        inp[0, :length] = ids[:length]
        logits = self.model.run(inp)[0].reshape(m["MAXT"], m["n_phonemes"])
        best = logits[:length].argmax(axis=1)
        out = ""
        prev = -1
        for k in best:
            k = int(k)
            if k == prev:
                continue
            prev = k
            ph = self.phoneme(k)
            if k == 0 or ph is None or ph in self.special:
                continue
            out += ph.replace("-", "")
        return out


def phonemize(g2p: G2P, sym_to_id: dict[str, int], text: str, max_pids: int = MAX_PIDS) -> list[dict]:
    """Text -> chunks of Matcha symbol ids (each <= max_pids)."""
    space_id = sym_to_id[" "]
    pieces: list[dict] = []
    for match in TOKEN.finditer(text.lower()):
        tok = match.group(0)
        words = None
        if tok[0].isdigit():
            words = number_to_words(tok).split(" ")
        elif WORD.match(tok):
            words = [tok]
        if words is not None:
            for w in words:
                ipa = g2p.word_to_ipa(w)
                if not ipa:
                    continue
                ids = [sym_to_id[ch] for ch in ipa if ch in sym_to_id]
                if ids:
                    pieces.append({"ids": ids, "ipa": ipa, "word": True, "end": False})
        else:
            # '!' gets an awkward pause from the duration model; speak it as '.'
            norm = "." if tok == "!" else tok
            sid = sym_to_id.get(norm)
            if sid is not None:
                pieces.append({"ids": [sid], "ipa": norm, "word": False,
                               "end": bool(SENTENCE_END.search(norm))})

    chunks: list[dict] = []
    cur = {"ids": [], "ipa": ""}

    def flush():
        nonlocal cur
        if cur["ids"]:
            chunks.append(cur)
        cur = {"ids": [], "ipa": ""}

    for p in pieces:
        sep = 1 if p["word"] and cur["ids"] else 0
        if len(cur["ids"]) + sep + len(p["ids"]) > max_pids:
            flush()
        if p["word"] and cur["ids"]:
            cur["ids"].append(space_id)
            cur["ipa"] += " "
        cur["ids"].extend(p["ids"])
        cur["ipa"] += p["ipa"]
        if p["end"]:
            flush()
    flush()
    return chunks


def sin_pos_emb(t: float, dim: int) -> np.ndarray:
    """Sinusoidal ODE-time embedding (Matcha SinusoidalPosEmb, scale=1000)."""
    half = dim // 2
    k = -math.log(10000) / (half - 1)
    e = 1000.0 * t * np.exp(np.arange(half) * k)
    return np.concatenate([np.sin(e), np.cos(e)]).astype(np.float32)[None]


def length_regulate(mu: np.ndarray, logw: np.ndarray, tmask: np.ndarray, cfg: dict):
    """Durations -> integer length regulator. Returns (mu_y [F, MAX_MEL], ylen)."""
    max_mel = cfg["MAX_MEL"]
    # Round the exponent a hair so exp(log(n)) does not creep above n.
    durations = np.ceil(np.exp(logw) * tmask - 1e-6) * cfg["length_scale"]
    cum = np.cumsum(durations)
    ylen = int(min(max(int(cum[-1]), 1), max_mel))
    positions = np.searchsorted(cum, np.arange(ylen), side="right")
    positions = np.clip(positions, 0, cfg["MAX_TEXT"] - 1)
    mu_y = np.zeros((cfg["n_feats"], max_mel), np.float32)
    mu_y[:, :ylen] = mu[:, positions]
    return mu_y, ylen


@dataclass
class SynthesisResult:
    wav: np.ndarray  # float32 in [-1, 1]
    sample_rate: int
    chunks: int
    timings_ms: dict = field(default_factory=dict)


class MatchaTTS:
    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, num_threads: int | None = None, log=print):
        self.num_threads = num_threads or max(1, min(8, os.cpu_count() or 4))
        paths = fetch_assets(model_dir, log)
        self.cfg = json.loads(paths["config"].read_text())
        meta = json.loads(paths["g2p_meta"].read_text())
        self.sym_to_id = {s: i for i, s in enumerate(self.cfg["symbols"]) if len(s) == 1}
        with gzip.open(paths["dict"], "rt", encoding="utf-8") as f:
            dictionary = parse_dict(f.read())
        self.emb = np.fromfile(paths["emb"], "<f4").reshape(-1, self.cfg["n_channels"])
        log(f"compiling models ({self.num_threads} threads) ...")
        self.textenc = Model(paths["textenc"], self.num_threads)
        self.decoder = Model(paths["decoder"], self.num_threads)
        self.vocoder = Model(paths["vocoder"], self.num_threads)
        self.g2p = G2P(dictionary, meta, Model(paths["g2p"], self.num_threads))

    @property
    def sample_rate(self) -> int:
        return int(self.cfg["sample_rate"])

    def warm_up(self) -> float:
        start = time.perf_counter()
        self.synthesize("Ready.", steps=1)
        return (time.perf_counter() - start) * 1000

    def synthesize(self, text: str, steps: int = DEFAULT_STEPS, seed: int = 0) -> SynthesisResult:
        cfg = self.cfg
        timings = {"g2p": 0.0, "textenc": 0.0, "decoder": 0.0, "vocoder": 0.0}
        t0 = time.perf_counter()
        chunks = phonemize(self.g2p, self.sym_to_id, text)
        timings["g2p"] = (time.perf_counter() - t0) * 1000
        wavs = [self._synthesize_chunk(c["ids"], steps, seed + i, timings) for i, c in enumerate(chunks)]
        wav = np.concatenate(wavs) if wavs else np.zeros(0, np.float32)
        return SynthesisResult(wav, self.sample_rate, len(chunks),
                               {k: round(v, 1) for k, v in timings.items()})

    def _synthesize_chunk(self, pids: list[int], steps: int, seed: int, timings: dict) -> np.ndarray:
        cfg = self.cfg
        max_text, max_mel = cfg["MAX_TEXT"], cfg["MAX_MEL"]
        feats, tdim = cfg["n_feats"], cfg["in_channels"]

        # ids[2k+1] = pids[k]; blanks (id 0) elsewhere -> embedding lookup
        ids = np.zeros(max_text, np.int64)
        ids[1:2 * len(pids):2] = pids
        tmask = (np.arange(max_text) < min(2 * len(pids) + 1, max_text)).astype(np.float32)

        t0 = time.perf_counter()
        outs = self.textenc.run(self.emb[ids][None], tmask[None, None])
        mu, logw = sorted(outs, key=lambda a: -a.shape[1])  # [1,80,256], [1,1,256]
        timings["textenc"] += (time.perf_counter() - t0) * 1000

        mu_y, ylen = length_regulate(mu[0], logw[0, 0], tmask, cfg)
        ymask = (np.arange(max_mel) < ylen).astype(np.float32)[None, None]

        rng = np.random.default_rng(seed)
        x = np.zeros((1, feats, max_mel), np.float32)
        x[0, :, :ylen] = rng.standard_normal((feats, ylen), dtype=np.float32)
        t0 = time.perf_counter()
        for s in range(steps):
            v = self.decoder.run(x, mu_y[None], sin_pos_emb(s / steps, tdim), ymask)[0]
            x += v / steps
        timings["decoder"] += (time.perf_counter() - t0) * 1000

        mel = np.zeros_like(x)
        mel[0, :, :ylen] = x[0, :, :ylen] * cfg["mel_std"] + cfg["mel_mean"]
        t0 = time.perf_counter()
        wav = self.vocoder.run(mel)[0].reshape(-1)[: ylen * cfg["hop"]]
        timings["vocoder"] += (time.perf_counter() - t0) * 1000
        return np.clip(wav, -1, 1).astype(np.float32)


def to_wav_bytes(wav: np.ndarray, sample_rate: int) -> bytes:
    """Float32 mono -> 16-bit PCM WAV."""
    import io
    import wave

    pcm = (np.clip(wav, -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "Hello from Matcha T T S on the laptop."
    tts = MatchaTTS()
    print(f"warm-up {tts.warm_up():.0f} ms")
    result = tts.synthesize(text)
    seconds = len(result.wav) / result.sample_rate
    total = sum(result.timings_ms.values())
    print(f"{result.chunks} chunk(s), {seconds:.1f} s of audio, {result.timings_ms}, RTF {total / 1000 / max(seconds, 1e-6):.2f}")
    out = Path("read_aloud_test.wav")
    out.write_bytes(to_wav_bytes(result.wav, result.sample_rate))
    print(f"wrote {out}")
