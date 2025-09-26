# Predefined AI Query Demo

A simple spatial interface for sending predefined text and image data to Gemini AI.

## Setup

This is only for demonstration and prototyping purposes:

1. Add your Gemini API key apending like `<website-domain>/templates/7_ai_live/?key=AIxxxxxxxxxxxxxxxx`,
or put it in a JSON file `keys.json` with
`{"gemini": {"apiKey": "AIxxxxxxxxxxxxxxxx"}}`

2. Open in browser and click the text button to start

## Keep your API keys safe

Never commit API keys to source control. Do not check your API key into version
control systems like Git.

Never expose API keys on the client-side. Do not use your API key directly in
web or mobile apps in production. Keys in client-side code
(including our JavaScript/TypeScript libraries and REST calls) can be extracted.

## How to Use

- **Send Text**: Sends a predefined text question to Gemini.
- **Send Image**: Sends a predefined image and question to Gemini.

AI responses appear in the 3D panel.
