# Recorded Gemini traffic

`src/ai/Gemini.recorded.test.ts` sends the requests and Live sessions that `@google/genai` builds for xrblocks through [test-server](https://github.com/google/test-server), a record and replay proxy. In a normal test run the proxy replays the responses saved in `recordings/`, so the test needs no API key and never contacts Google. A request that differs from its recording, for example a new API version or body shape after an SDK upgrade, has no saved response and fails the test. A Live session with no recording closes with code 1006, and one that sends different messages closes with `input chunk mismatch`.

After changing a request, record the traffic again against the real API with your own key. Empty `recordings/` first so it keeps only the requests the tests send now:

```bash
rm -f test/gemini/recordings/*
GEMINI_API_KEY=your-key npm run test:gemini:record
```

To record only a new test, skip the `rm` and filter by name, for example `npm run test:gemini:record -- -t 'Live session'`.

The proxy forwards each request to Gemini and saves the request and response in `recordings/`, or every message for a Live session in a `.websocket.log` file. API keys and the other headers listed in `test-server.yml` are removed before anything is saved. Live sends the key in its WebSocket URL, so the test also passes it to test-server as `TEST_SERVER_SECRETS`, which replaces it with `REDACTED` wherever it appears. Commit the new recordings with the change that needed them.
