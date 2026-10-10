# XR Blocks E2E Tests

Browser-level end-to-end tests for XR Blocks, separate from the colocated
Vitest suite (`npm test`). These drive the real built SDK in a real Chromium
page.

## Layout

| Path                                     | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `playwright.config.ts`                   | Playwright config; `sim-webgl` and `sim-webgpu` projects                 |
| `global-setup.ts` / `global-teardown.ts` | Static repo server on an ephemeral port (bind 0)                         |
| `server.ts`                              | Minimal static file server used by the fixtures                          |
| `drivers/types.ts`                       | `XRTestDriver` interface shared by all drivers                           |
| `drivers/simulator.ts`                   | Desktop-simulator driver (`?debug=1&xrAutomation=1` + `EmbodiedControl`) |
| `fixtures/boot.ts`                       | Test fixture that boots the harness app                                  |
| `fixtures/apps/harness.html`             | Deterministic probe app (probe, grabbable, UI card)                      |
| `scenarios/`                             | Specs                                                                    |

## Running

```bash
npm run build:sdk      # harness loads /build/xrblocks.js
npx playwright install chromium
npm run test:e2e
```

Useful knobs:

- `E2E_GL=vulkan|swiftshader` — GPU backend flags (default: vulkan locally,
  swiftshader in CI).
- `npm run test:e2e -- --project=sim-webgl` — one backend.

## How the simulator driver works

The harness app is booted with `?debug=1` (exposes `window.xb`) and
`?xrAutomation=1` (the shared automation preset: auto-started simulator,
hands + camera + context enabled). Deterministic time control comes from the
`embodied-control` addon, which pauses the core after init and advances it
only via `step()`.

## Adding scenarios

Write specs against the `XRTestDriver` interface in `drivers/types.ts`, not
against the simulator driver directly — a WebXR driver (IWER-backed) is
planned so the same scenarios run against emulated immersive sessions.
