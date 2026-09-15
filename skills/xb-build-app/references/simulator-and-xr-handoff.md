# Simulator and XR handoff

Read this reference when the app must run in the desktop simulator, on an XR
device, or on both.

## Shared startup

Use `new xb.Options()` to keep `formFactor: 'auto'`. Load
`xrblocks/addons/simulator/SimulatorAddons.js` when the app needs the simulator
settings, instructions, or hand-pose panels. Use `?formFactor=desktop` for an
exact simulator handoff URL.

Use `onSimulatorStarted()` and `onXRSessionStarted()` only for surface-specific
transitions. Put shared scene construction and state ownership in `init()` or a
shared application method.

## Simulator evidence

State:

- exact URL and simulator mode;
- mouse, keyboard, controller, or simulated-hand action;
- visible affordance before the action;
- expected result and release state;
- which sensor values are synthetic.

Use `?xrAutomation=1` only when the automation preset and agent context are
required. Use `?debug=1` only when an in-page driver needs `window.xb` and
`window.xbReady`.

## XR evidence

Declare camera, microphone, geolocation, depth, and other permissions before
initialization. Preserve the normal Enter XR flow. Use `enableVR()` only for an
immersive VR application; the default immersive mode is AR.

Name the target browser and device, physical input, required room signal,
permission prompts, expected result, and device-only checks. A simulator pass
does not prove comfort, tracking quality, passthrough alignment, device
performance, or extended-session behavior.
