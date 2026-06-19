#!/usr/bin/env python3
"""Smoke test: serve the workspace via http and load index.html in headless
chromium. Captures uncaught errors and pageerror events. Returns a binary
smoke_ok plus the list of errors for inspection.

We rewrite the workspace's importmap so xrblocks loads from the CDN
(@build branch) instead of `../../build/...` relative paths, which would
break inside a freshly-copied workspace dir.

Usage:
  python evals/prototypes/smoke.py <workspace_dir>
"""
from __future__ import annotations

import json
import pathlib
import re
import socket
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial

from playwright.sync_api import sync_playwright


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def rewrite_importmap(html_path: pathlib.Path) -> None:
    """Swap relative `../../build/...` paths for the public CDN @build
    URLs, so the workspace is self-contained."""
    html = html_path.read_text()
    html = html.replace(
        '"xrblocks": "../../build/xrblocks.js"',
        '"xrblocks": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/xrblocks.js"',
    )
    html = html.replace(
        '"xrblocks/addons/": "../../build/addons/"',
        '"xrblocks/addons/": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/addons/"',
    )
    html_path.write_text(html)


# Filter out known-benign xrblocks startup noise. These fire on every
# desktop / non-XR load and aren't user-code errors.
BENIGN_PATTERNS = [
    re.compile(r"WebXR.*not supported", re.I),
    re.compile(r"immersive-ar.*not supported", re.I),
    re.compile(r"navigator\.xr.*null", re.I),
    re.compile(r"AudioContext.*user gesture", re.I),
    re.compile(r"WebGL.*deprecated", re.I),
    re.compile(r"\bfavicon\b", re.I),
    # Template references ../../samples/main.css which doesn't exist in the
    # standalone workspace. Cosmetic; not an app error.
    re.compile(r"main\.css", re.I),
    re.compile(r"samples/main\.css", re.I),
]


def is_benign(message: str) -> bool:
    return any(p.search(message) for p in BENIGN_PATTERNS)


def smoke(workspace: pathlib.Path, wait_ms: int = 5000) -> dict:
    rewrite_importmap(workspace / "index.html")

    port = free_port()
    handler = partial(SimpleHTTPRequestHandler, directory=str(workspace))
    httpd = HTTPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **kw: None  # type: ignore
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    errors: list[dict] = []
    console_msgs: list[dict] = []
    failed_requests: list[dict] = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context()
            page = ctx.new_page()

            page.on(
                "pageerror",
                lambda exc: errors.append(
                    {"type": "pageerror", "message": str(exc)}
                ),
            )
            page.on(
                "console",
                lambda msg: console_msgs.append(
                    {"type": msg.type, "text": msg.text}
                ),
            )
            page.on(
                "requestfailed",
                lambda req: failed_requests.append(
                    {"url": req.url, "failure": str(req.failure)}
                ),
            )

            try:
                page.goto(f"http://127.0.0.1:{port}/index.html", timeout=15000)
                page.wait_for_timeout(wait_ms)
            except Exception as e:
                errors.append({"type": "navigation", "message": str(e)})

            browser.close()
    finally:
        httpd.shutdown()

    real_errors = [e for e in errors if not is_benign(e["message"])]
    real_console = [
        m for m in console_msgs if m["type"] == "error" and not is_benign(m["text"])
    ]
    real_requests = [r for r in failed_requests if not is_benign(r["url"])]

    smoke_ok = (
        1.0
        if not real_errors and not real_console and not real_requests
        else 0.0
    )
    return {
        "smoke_ok": smoke_ok,
        "page_errors": real_errors,
        "console_errors": real_console,
        "failed_requests": real_requests,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: smoke.py <workspace_dir>", file=sys.stderr)
        return 1
    workspace = pathlib.Path(argv[0])
    if not (workspace / "index.html").exists():
        print(f"no index.html in {workspace}", file=sys.stderr)
        return 1
    result = smoke(workspace)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
