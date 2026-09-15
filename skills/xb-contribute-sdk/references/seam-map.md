# XR Blocks production seam map

Read only the branch selected in the contribution contract.

## Internal change

Trace:

```text
existing public behavior
  -> runtime owner
  -> internal implementation
  -> lifecycle and cleanup
  -> boundary-level test
```

No new export is required. Prove the existing public behavior that consumes the
internal change.

## Root-public change

Trace:

```text
Options or public constructor
  -> Core construction and registry registration
  -> dependent Script or subsystem
  -> frame/session lifecycle
  -> disposal
  -> src/xrblocks.ts
  -> build/xrblocks.js and build/xrblocks.d.ts
```

Confirm any option default, `enable*()` prerequisite, permission, and feature
dependency. A root consumer imports from `xrblocks`, not an implementation path.

## Addon-public change

Trace:

```text
addon public entry
  -> Rollup addon input
  -> external dependency policy
  -> emitted build/addons path
  -> package export wildcard
  -> addon README and executable sample
```

Use the addon's intended entry file. Verify the exact browser and package
subpath from emitted output. Repository-only aliases are not consumer imports.

## Shared lifecycle checks

For each branch, locate or mark not applicable:

- configuration and permissions before initialization;
- construction and registration order;
- update, fixed-step, session-start, and session-end hooks;
- event and listener ownership;
- GPU, media, timer, worker, network, and registry cleanup;
- unsupported and partial-runtime states;
- public type and declaration output.
