# Phone companion

A paired phone web page supplies a touchpad, head-relative pointer, selection,
pinch-to-zoom, two-finger scrolling, native text editing and optional vibration. No Gamepad API,
hand tracking or phone motion sensors are used. It is intended as a fallback on
WebXR headsets, including Aura when gamepads are unavailable; device-specific
compatibility still needs testing.

## Headset application

```js
import * as xb from 'xrblocks';
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';

const phone = new PhoneCompanion({
  onConnectionChange: (connected) => console.log('Phone paired:', connected),
  onError: console.error,
});
const field = new xb.UITextInput({
  ariaLabel: 'Message',
  onFocus: () => {
    phone.input = field;
  },
  onSubmit: (text) => console.log(text),
});
// Add field to your mounted UICard/UIOverlay.
xb.add(phone);
const link = phone.pairingURL('https://your-app.example/phone.html');
const code = phone.pairing.code;
// Show code inside the headset; users type it on your phone page.
// The link can also be a QR on a desktop or mirrored screen.
xb.init();
```

The Script owns the transport and registers an ordinary `controller-ray` source
with `Input`. Existing buttons, sliders, selection hooks and manipulation work
through `Interaction`. `event.source.controller === phone.controller` identifies
phone events. Keep controllers and reticles enabled (the defaults).
Pinching scales the pointed-at manipulable object or the containing panel when
over a UI control, honoring its scale limits. Spread to enlarge; pinch to shrink.
Two-finger swipes scroll instead. Gesture intent locks after initial movement;
lift both fingers to start another gesture. Hold **Hold to move** with one finger
while sliding another finger on the pad to move a panel or drag objects/sliders;
release the button to drop. **Pinch to zoom** is plain touchpad guidance.
`sensitivity` defaults to 1.5 radians per touchpad dimension; the offset is bounded
to ±1.2 radians relative to the current head pose. This is a relative pointer,
not a tracked 6-DoF phone pose.

## Phone page

```js
import {
  PhoneControllerPage,
  phonePairingFromCode,
} from 'xrblocks/addons/phone-companion/phone.js';

// Called after the user submits your pairing-code form:
const page = new PhoneControllerPage(document.body, {
  pairing: phonePairingFromCode(codeEnteredByUser),
});
await page.connect();
// page.dispose() when removing the controller from a single-page application.
```

This separate entry needs no XR Blocks engine, three.js, renderer, or WebXR on the
phone. Omitting `pairing` reads a code or legacy room/token from the URL fragment
for QR/link entry. The [executable sample](../../../samples/phone_companion/)
includes a phone landing page with code entry, a code inside the headset, and an
optional desktop QR. A phone cannot scan a QR visible only inside a headset;
use code entry on Quest, Galaxy XR, Aura, or other headsets.

## Connection and lifecycle

- Each companion uses a **dedicated** netblocks transport, separate from an app's
  multiplayer `NetSession`. Default: `WebRTCTransport`; no avatar or presence loop.
- Mounting starts signaling. `connected` means an opposite-role peer completed
  the token handshake, not merely that the broker is open. Only one phone is
  accepted at a time; other senders and malformed packets are ignored.
- Both constructors accept `transport`, a fresh, exclusively owned netblocks
  transport. For custom signaling/STUN/TURN, pass `new WebRTCTransport(options)`
  on **both** pages. Connection configuration is not encoded into the QR.
- WebRTC uses netblocks' best-effort public PeerJS broker by default. Some
  networks require TURN. Use HTTPS pages reachable by both devices.
- Default pairing uses a cryptographically random four-character alphanumeric
  code such as `K7Q2` (20 bits; ambiguous `0/O` and `1/I` are excluded).
  Both pages derive the dedicated room and token
  from that code; it is a bearer credential, like the QR/link. Keep it private.
  `phonePairingFromCode()` accepts lowercase, spaces and hyphens. A fresh
  `PhoneCompanion` creates a fresh code. Custom room/token pairings remain supported.
  Short codes prioritize headset entry over resistance to guessing; use custom,
  longer room/token credentials when that is required.
- The host locks to the **first paired phone instance** for its lifetime using an
  additional random identity that is never included in the QR. A dropped phone
  can reconnect while its page remains alive; another holder of the link cannot
  take its place, even if the WebRTC broker reuses that phone's slot ID. Reloading
  the phone page creates a new instance: reload the host and enter its new code to
  pair again. The link can still be claimed by anyone who possesses it before
  the first successful pairing.
- Cancel, backgrounding the phone, peer leave and five seconds of missed
  heartbeats cancel held selections. Transport loss releases keyboard suppression.
  Discovery can re-pair the same phone instance after a transient peer loss.
  Reload both pages and enter the new code after a closed/failed transport;
  instances are single-use. Dispose the Script to release transport,
  timers, pointer capture state, native-keyboard suppression and the owned reticle.
- While paired and visible, the phone requests a screen wake lock. Backgrounding,
  disconnecting or disposal releases it; returning to the foreground requests it
  again. Denied/unsupported wake locks do not prevent controller use.
- netblocks currently exposes one reliable ordered data channel. Move, scroll
  and zoom therefore share delivery with button/text messages and may stall on
  packet loss. A TODO marks the future separate unreliable motion channel;
  selection edges and text must remain reliable and ordered.

## Keyboard and haptics

Assign `phone.input` from each field's `onFocus`. Only that field, while focused,
ready and editable, is mirrored to the phone. Edits go through `insertText` and
selection APIs, preserving `onInput`, `onChange`, `onSubmit`, read-only and
max-length semantics. Fields longer than 16,000 UTF-16 code units are not mirrored.
External edits/focus changes invalidate old phone revisions. Composition is
committed after `compositionend`, allowing IME, dictation, emoji and autocorrect
through the phone's native editor. The phone sends text, not synthetic keycodes.

The text-field prompt is plain guidance; the keyboard button appears only when
a field is ready. The user must tap it to open the native keyboard;
browsers cannot open it from a network message. Keyboard suppression on the
headset is best-effort. On phones, `navigator.vibrate` support and activation
policy vary (notably absent on iOS Safari); unsupported vibration is a no-op.
Successful selections request 20 ms; applications can call `phone.pulse(ms)`
(maximum 200 ms).
