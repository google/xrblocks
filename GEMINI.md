# Gemini repository guidance

Follow [`AGENTS.md`](AGENTS.md) when changing this repository.

For application authoring, read [`CONTEXT.md`](CONTEXT.md), then use the manual
page and focused template or sample for the requested task. Verify every public
symbol against [`src/xrblocks.ts`](src/xrblocks.ts) or the relevant addon's
public entry. Do not infer public APIs from implementation filenames.

The consumer task workflows live in [`skills/`](skills/). Addon-specific
reference lives in the addon's README and source TSDoc.
