# XR Blocks skills

This directory contains portable task workflows for agents that build XR
Blocks applications or contribute to the SDK. Each skill follows the Agent
Skills directory format: a required `SKILL.md` plus optional `references/`,
`scripts/`, and `assets/`.

Agent hosts can expose or install these directories through their supported
skill-discovery mechanism. This README is a human-readable index, not a
platform-specific manifest or discovery mechanism.

| Skill                                                   | Task outcome                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| [`xb-build-app`](xb-build-app/SKILL.md)                 | Deliver one complete, testable XR Blocks experience slice        |
| [`xb-add-spatial-ui`](xb-add-spatial-ui/SKILL.md)       | Build a usable interface with the current built-in UI            |
| [`xb-add-interactions`](xb-add-interactions/SKILL.md)   | Turn user intent into current events, feedback, and manipulation |
| [`xb-add-world-sensing`](xb-add-world-sensing/SKILL.md) | Connect physical-world evidence to observable app state          |
| [`xb-add-ai`](xb-add-ai/SKILL.md)                       | Connect one AI input and provider path to an observable result   |
| [`xb-debug-app`](xb-debug-app/SKILL.md)                 | Trace one broken behavior from red evidence to a proved repair   |
| [`xb-contribute-sdk`](xb-contribute-sdk/SKILL.md)       | Complete one SDK change across every affected repository seam    |

Exact API facts belong to public entries and TSDoc. Concepts and examples
belong to the manual, templates, and samples. Skills contain task steps,
branch selection, and checkable completion criteria.

`xb-contribute-sdk` is repository-facing. The other workflows are for
applications that consume XR Blocks.
