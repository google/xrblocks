# XR Blocks MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives a
coding agent the `xb-*` skills and the SDK's public API surface.

## Why

`AGENTS.md` puts it plainly: hallucinated or inconsistent APIs are the single
biggest cause of broken generated apps. An agent with no grounding writes
plausible-looking calls that do not exist — `createXRScene()`, `useGesture()`,
`xr.agent.hands.playGesture()` are all real examples from eval runs.

Skills answer "how do I do this in XR Blocks". This server delivers them
on demand, and adds a way to check that a symbol is real before calling it.

## Setup

The server ships with the package and needs no extra dependencies. Add it to
your client's MCP config (Claude Desktop, Copilot CLI at
`~/.copilot/mcp-config.json`, Cursor, ...):

```json
{
  "mcpServers": {
    "xrblocks": {
      "type": "stdio",
      "command": "npx",
      "args": ["xrblocks-mcp"]
    }
  }
}
```

Working from a clone instead of the published package:

```json
{
  "mcpServers": {
    "xrblocks": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/xrblocks/src/addons/mcp/server/bin.js"]
    }
  }
}
```

## Tools

| Tool                | Returns                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `list_skills`       | Every skill with a short description of what it covers and when to use it |
| `get_skill(name)`   | The full `SKILL.md`, including worked examples                            |
| `search_api(query)` | Matching declarations from the SDK's type definitions                     |

`list_skills` shortens each description, because it is the call an agent makes
first and its whole output lands in the context window before any work starts.
`get_skill` returns the untruncated text.

`search_api` indexes members as well as top-level declarations. Much of the API
an app actually calls is methods on a class rather than free functions —
`enableDepth()` lives on `Options` — and an index that missed those would report
a real API as missing, which is worse than not answering.

When nothing matches, `search_api` says so explicitly rather than returning
nothing, so the agent is told not to call the symbol rather than left to guess.

## Notes

`search_api` reads `build/xrblocks.d.ts`, which is generated. In a clone, run
`npm run build:sdk` first or the tool will say so.

The JSON-RPC stdio transport is implemented directly rather than via
`@modelcontextprotocol/sdk`. This package has one runtime dependency, and a
dependency in a shipped binary is paid by everyone who installs the SDK. The
trade-off is that protocol changes have to be tracked by hand.
