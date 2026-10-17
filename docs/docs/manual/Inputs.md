---
sidebar_position: 5
title: Input & Controllers
---

## Input

The [`Input`](/api/classes/Input) object at `xb.core.input` provides access to
controllers. Interaction callbacks include the resolved target, hit surface,
and ray intersection.

For example, to detect which item is selected:

```js
export class ItemSelectionScript extends xb.Script {
  onSelectStart(event) {
    if (event.target && event.intersection) {
      console.log('Item selected:', event.target);
      console.log('Hit point:', event.intersection.point);
    }
  }
}
```

When a controller begins selecting, XRInput also sets `controller.userData.selected` to `true`.
This can be used to loop over controllers which are selecting.
For example:

```js
export class ItemSelectionScript extends xb.Script {
  update() {
    const controllers = xb.core.input.controllers;
    for (const controller of controllers) {
      if (controller.userData.selected) {
        handleController(controller);
      }
    }
  }
}
```

## Controllers

XR Blocks currently includes the following controllers:

- [WebXR input sources](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs) - this includes hand and controllers in Android XR.
- [`MouseController`](/api/classes/MouseController) - this becomes enabled in the simulator when User Mode is active.
- [`GazeController`](/api/classes/GazeController) - this controller represents the center of the screen in Android XR.

## Phone companion controller and keyboard

The optional `phone-companion` addon pairs a phone web page over netblocks WebRTC
using a code shown in the headset, or an optional QR on a separate screen.
It supplies a touchpad-controlled, head-relative pointer, tap/hold selection,
pinch-to-zoom, two-finger scrolling, native phone keyboard and best-effort phone vibration.
It does not require a gamepad or hand tracking, making it a fallback for WebXR
headsets such as Aura when gamepads are unavailable. Actual headset/browser
compatibility should be verified on the target device.

```js
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';

const phone = new PhoneCompanion({onConnectionChange: console.log});
xb.add(phone); // Before xb.init(); normal controllers/reticles stay enabled.
const url = phone.pairingURL('https://your-app.example/phone.html');
const code = phone.pairing.code;
// Display code in the headset. Optionally display url as a QR on a separate screen.
```

On the phone page, import `PhoneControllerPage` and `phonePairingFromCode` from
`xrblocks/addons/phone-companion/phone.js`. Pass
`{pairing: phonePairingFromCode(codeEnteredByUser)}` to the page constructor,
then call `await page.connect()`. Omitting `pairing` reads a QR/link's URL fragment.
This DOM-only entry does not need three.js or an XR session. The
[phone companion sample](pathname:///samples/phone_companion/) includes a pairing
code inside the headset, a phone code-entry page, and an optional desktop QR.
Users of Quest, Galaxy XR, Aura and other headsets can enter the code without
trying to scan the headset's display. Use an HTTPS URL reachable by both devices.

For native typing, assign `phone.input = field` in each `UITextInput`'s `onFocus`.
The user selects the field in XR, then taps the phone's keyboard button. Native
IME, dictation and autocorrect edits update the field through its ordinary editing
API. **Submit** invokes the field's submit callback and **Done** blurs it.
Only the bound, focused editable field is shared; the limit is 16,000 UTF-16 code
units. Phone edits from an old field revision are discarded.

The addon owns a dedicated transport and uses the normal Interaction pipeline,
so existing buttons, sliders and draggable objects work. Identify events with
`event.source.controller === phone.controller`. A successful selection requests
20 ms vibration; `phone.pulse(ms)` requests custom feedback up to 200 ms.
Vibration is optional and is unavailable in some phone browsers, including iOS
Safari. No phone orientation permission is requested.

On the touchpad, **pinch to zoom** the pointed-at scalable object or containing
panel (including over its UI controls). Spread to enlarge and pinch to shrink;
configured manipulation scale limits apply. Swipe two fingers together to scroll.
Hold **Hold to move** with one finger while sliding another on the pad to move
the panel or drag objects/sliders. The pinch gesture hint and
text-field prompt are plain text; the keyboard button appears when a field is ready.

Backgrounding or disconnecting the phone cancels held input; a silent peer times
out after five seconds. Script disposal closes its connection and unregisters the
controller. The phone requests a screen wake lock while paired and visible,
releasing it on background, disconnect or disposal. Unsupported/denied wake locks
are optional. The host is locked to the first phone page instance: if that page
is reloaded or a different phone is needed, reload the host and enter its new code.
Keep the pairing URL private. For networks needing TURN or a custom
broker, supply configured netblocks `WebRTCTransport` instances to both sides.
See the [addon setup and lifecycle contract](https://github.com/google/xrblocks/tree/main/src/addons/phone-companion).
