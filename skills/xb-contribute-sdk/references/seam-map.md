# Contribution seam map

Read the branch that matches the change, then follow any cross-cutting rows it
touches. Source is authoritative; these landmarks tell you where to verify it.

## Internal branch

Keep an implementation internal when consumers neither import it nor configure
it. Trace its existing owner and production caller. Preserve constructor/init,
per-frame, XR-session, simulator, physics, and `dispose()` ordering as applicable.
Prove behavior at the nearest stable boundary instead of exporting the helper to
make it testable.

## Root-public branch

The consumer import boundary is [`../../../src/xrblocks.ts`](../../../src/xrblocks.ts).
[`../../../src/entry.ts`](../../../src/entry.ts) re-exports it and installs debug
globals; adding a second export there is unnecessary. TypeDoc also uses
`src/xrblocks.ts` as its entry point.

For a configurable subsystem, inspect and account for:

1. A focused `*Options` class with inert defaults and merge behavior.
2. Aggregation in `src/core/Options.ts`; a chainable `enable*()` when developers
   need a high-level switch; prerequisite permissions and feature cascades.
3. Construction and scene ownership in `src/core/Core.ts` or an existing parent
   `Script` such as `World`.
4. Registry registration by the constructor type dependents declare in
   `static dependencies`. Register option objects and runtime instances before
   dependent scripts initialize.
5. WebXR required/optional feature negotiation, renderer setup, and asynchronous
   initialization where applicable.
6. Frame, physics, session, simulator, and disposal calls owned by the same
   lifecycle that constructed the object.
7. Public values and public types re-exported from `src/xrblocks.ts`.

`Core` initializes depth before input/scripts in its frame loop and initializes
all scene scripts through `ScriptsManager`; preserve actual ordering unless the
contract and tests intentionally change it.

## Addon-public branch

Find the addon's intended entry before adding exports. Common entries include
`src/addons/<name>/index.ts`; UIBlocks instead exposes
`src/addons/uiblocks/src/index.ts`. Export consumer values and types from that
entry, not from the root barrel unless the capability is deliberately becoming
core.

Rollup emits every non-test addon source file beneath the same relative
`build/addons/` path. `package.json` exposes `./addons/*` as
`./build/addons/*`, so verify the complete import including any `index.js` or
nested segment against the emitted file. Bare repo aliases such as `uiblocks`
and `netblocks` are separate import-map/TypeScript conveniences; they are not
created by the package wildcard.

If the addon imports a heavy peer, check `externalPackages` in
`rollup.config.js`. If addon sources use a bare local alias, check
`src/addons/tsconfig.lib.json`. A new addon server or CLI may be intentionally
excluded from the browser Rollup glob and requires its own package/bin contract.

## Cross-cutting checks

- Public types appearing in declarations must remain resolvable by consumers.
- `three` remains one aligned peer dependency; avoid a bundled second copy.
- New browser permissions must be requested in `Options` before immersive XR.
- Optional device capabilities need an unsupported/no-data behavior and a
  desktop-simulator story when the simulator can model them.
- External AI, camera, microphone, or network behavior needs security/privacy
  guidance and explicit failure handling.
- Generated `build/` artifacts come from Rollup and are never hand-edited.
