# Recorded Gemini traffic

`src/ai/Gemini.recorded.test.ts` sends the requests that `@google/genai` builds for xrblocks through [test-server](https://github.com/google/test-server), a record and replay proxy. In a normal test run the proxy replays the responses saved in `recordings/`, so the test needs no API key and never contacts Google. A request that differs from its recording, for example a new API version or body shape after an SDK upgrade, has no saved response and fails the test.

After changing a request, record the traffic again against the real API with your own key. Empty `recordings/` first so it keeps only the requests the tests send now:

```bash
rm -f test/gemini/recordings/*.json
GEMINI_API_KEY=your-key npm run test:gemini:record
```

The proxy forwards each request to Gemini and saves the request and response in `recordings/`. API keys and the other headers listed in `test-server.yml` are removed before anything is saved. Commit the new recordings with the change that needed them.
