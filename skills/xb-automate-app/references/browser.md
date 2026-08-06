# Real-browser automation bridge

Use this branch when a browser driver can control the running page through DOM
input, the public SDK debug global, screenshots, or app-owned state.

## Start with explicit automation access

Open the app with both flags when the driver needs simulator automation and SDK
access:

```text
?xrAutomation=1&debug=1
```

`xrAutomation=1` applies `enableAutomationMode()`: desktop simulator autostart,
hands, camera, scene context, and hidden simulator panels. `debug=1`
independently installs the public SDK namespace as `window.xb` and the
initialization promise as `window.xbReady`.

App-owned setup can apply the preset directly:

```js
const options = new xb.Options().enableAutomationMode();
await xb.init(options);
```

## Handshake without a timing race

Wait for the module entry to install the debug promise, then await it:

```js
await page.goto(`${appUrl}?xrAutomation=1&debug=1`);
await page.waitForFunction(() => 'xbReady' in window);
await page.evaluate(() => window.xbReady);
```

Bound navigation and readiness with harness timeouts. `window.xbReady` resolves
after `xb.init()` and rejects with its initialization error. If domain setup
continues afterward, expose a separate promise such as `window.appReady` and
await it before issuing commands.

## Observe and command

Drive browser-facing behavior through click, tap, mouse, keyboard, focus, and
permission controls. Inspect only symbols exported from `src/xrblocks.ts`
through `window.xb`.

Automation mode enables scene context, so a semantic observation can be:

```js
const tree = await page.evaluate(() => window.xb.context.scene.runDetection());
```

Use app-owned JSON-serializable functions for domain operations that DOM input
or the public SDK cannot express. Keep their names narrow and their arguments
validated. URL flags alone do not provide embodied simulator actions; use the
remote-control bridge when the controller needs locomotion or hand commands.

## Smoke and handoff

Smoke one cold-page connection: await readiness, read one observation, inspect
the exposed operation names, and close the page/context.
Document the URL flags, readiness promises, exposed functions, required
permissions, and resource cleanup. The bridge is ready when another browser
driver can repeat that connection sequence without inspecting private code.

Authoritative sources:

- [`../../../src/debug/DebugGlobals.ts`](../../../src/debug/DebugGlobals.ts)
- [`../../../src/core/Options.ts`](../../../src/core/Options.ts)
- [`../../../docs/docs/manual/Context.mdx`](../../../docs/docs/manual/Context.mdx)
- [`../../../docs/docs/manual/Simulator.mdx`](../../../docs/docs/manual/Simulator.mdx)
