# Agent Context

Capture scene context and ask Gemini to describe it.

## Run

Serve the repository and open `/templates/11_agent_context/`. Enter a prototype
API key when prompted.

## Controls

Click, pinch, or use a controller trigger to capture the scene. Open the
browser console to inspect the context and Gemini response.

General inference uses AI SDK `generateText` with a model created by
`await xb.createGoogle({promptForApiKey: true})`. Change the supplied model to
switch providers; `enableAI()` is only needed for Gemini Live.
