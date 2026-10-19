# Gemini Live token server reference

This local Node.js reference keeps the long-lived Gemini API key on the server
and mints one-use ephemeral tokens with `@google/genai`'s `authTokens.create()`.
The server binds to `127.0.0.1:8787` by default (`HOST` and `PORT` can override
it), and exposes `POST /api/gemini-live-token`, returning
`{ "token": "auth_tokens/..." }` for `GeminiOptions.tokenProvider`. It allows
the origin in `ALLOWED_ORIGIN`, which defaults to the repo dev server at
`http://127.0.0.1:8080`, and answers matching CORS preflight requests.

Run it from the repository root:

```sh
GEMINI_API_KEY=your_server_side_key node tools/gemini-token-server/server.js
```

Set `ALLOWED_ORIGIN` to your app's exact origin when it differs from the
development default. The token is constrained to `GEMINI_LIVE_MODEL`, which
defaults to the SDK's `GEMINI_DEFAULT_LIVE_MODEL`; set that environment variable
when your app uses a different Live model. This server imports that default
directly from `src/ai/AIOptions.ts`, so run it with Node.js 24 or later, which
supports built-in TypeScript type stripping by default (and matches the
repository CI runtime). This requirement applies to the reference server, not
to the SDK package as a whole; ESM support by itself is not sufficient for this
TypeScript import.

The token request sets `liveConnectConstraints.model` and
`lockAdditionalFields: []`. This locks the token to the selected model without
locking the remaining Live configuration, so the client can provide its audio,
voice, and transcription settings when it connects.

The example token allows a new Live session to start for one minute and allows
the connection to remain active for up to 30 minutes. The client must use the
Gemini Developer API Live `v1alpha` endpoint. Fetch a new token when starting a
new session; an existing Live connection cannot refresh its token in place.

For production, route a same-origin path such as `/api/gemini-live-token` to
this server through your reverse proxy and set `ALLOWED_ORIGIN` to your app's
origin. This is not a production-ready server: authenticate and authorize each
request, apply rate limits and abuse protections, and use HTTPS. CORS is not
authentication. Never expose the server API key or serve this endpoint to
unauthenticated callers.
