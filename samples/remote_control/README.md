# Remote Control Smoke Sample

Minimal scene for checking that `remote-control` can drive an XR Blocks page
from the command line.

The page shows one cube, connects to the localhost relay, and exposes these
scene tools:

- `getCubeState`
- `nudgeCube`
- `resetCube`

It also exposes the built-in remote-control tools:

- `step`
- `getCamera`
- `getHands`
- `getScreenshot`
- `getSimulatorState`

## Run It

Build the SDK and serve the repo:

```bash
npm run build
npm run serve
```

Start the relay in another terminal:

```bash
npx xrblocks-remote-control
```

Open the sample:

```text
http://127.0.0.1:8080/samples/remote_control/
```

To run multiple pages on one relay, give each page a session:

```text
http://127.0.0.1:8080/samples/remote_control/?remoteControlSession=run-1
http://127.0.0.1:8080/samples/remote_control/?remoteControlSession=run-2
```

Then send commands from a third terminal:

```bash
node samples/remote_control/send.mjs get-state
node samples/remote_control/send.mjs get-camera
node samples/remote_control/send.mjs step-forward
node samples/remote_control/send.mjs get-camera
node samples/remote_control/send.mjs get-cube
node samples/remote_control/send.mjs nudge-cube
node samples/remote_control/send.mjs reset-cube
```

Each command prints the raw JSON response.

Target a non-default session with `REMOTE_CONTROL_SESSION`:

```bash
REMOTE_CONTROL_SESSION=run-1 node samples/remote_control/send.mjs get-state
```

## Screenshots

Screenshot commands write returned image data to your OS temp directory and
print the file path:

```bash
node samples/remote_control/send.mjs screenshot
node samples/remote_control/send.mjs get-camera '{"screenshot":true}'
```

Files are saved under:

```text
$TMPDIR/xrblocks-remote-control/
```

## Generic Tool Calls

Call any built-in or scene tool by name:

```bash
node samples/remote_control/send.mjs tool getSimulatorState
node samples/remote_control/send.mjs tool getCamera '{"screenshot":true}'
node samples/remote_control/send.mjs tool nudgeCube '{"dx":0.25}'
```

## Custom Relay URL

If the relay is not on the default `ws://127.0.0.1:8791`, pass the URL to both
the page and CLI. You can combine this with `remoteControlSession`.

```text
http://127.0.0.1:8080/samples/remote_control/?remoteControlUrl=ws://127.0.0.1:9000
```

```bash
REMOTE_CONTROL_URL=ws://127.0.0.1:9000 node samples/remote_control/send.mjs get-state
```

## Troubleshooting

If the page reports that `RemoteControl.configureOptions` is missing, rebuild
the addon bundle:

```bash
npm run build
```

The sample imports from `build/addons/remote-control/`, not directly from
`src/`.
