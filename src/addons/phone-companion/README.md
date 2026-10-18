# Phone companion

A phone supplies a touchpad, head-relative pointer, selection, pinch zoom,
two-finger scrolling, native text editing and optional vibration. It needs no
Gamepad API, hand tracking or phone motion sensors.

## Pairing in a headset

1. Open the phone landing page and enter the headset's four-character code.
   A desktop/mirrored screen can instead show an optional QR.
2. **Compare the six verification digits on the phone and headset.** Only accept
   when they match and this is the phone you intend to connect.
3. Accept on the headset. No pointer control or field values are available before
   acceptance.

Each invitation lasts **90 seconds** from signaling startup and permits at most
**five handshake attempts**, shared across all peer IDs for that invitation.
Approval consumes it once and rotates both credentials. Expired/used invitations
cannot authorize another phone. The QR contains a fresh **256-bit random token**,
not the short code as its credential. Credentials are removed from the phone URL
with `history.replaceState` after reading; manual entry never writes the code to
the URL. Credentials themselves are never sent over the transport.

Every `PhoneCompanion` owns its code, token, expiry, attempt budget, approval and
session keys. Opening the same app URL on many headsets does not share those
values. Hosts announce room occupancy directly to peers. If two unpaired hosts
roll the same code, they generate fresh independent invitations (up to five
automatic retries). An already-approved session is never displaced by a code
collision. Update your displayed invitation through `onPairingChange`.

Four-character rooms remain discoverable and codes can be guessed: the code is
**not sufficient authentication**. Matching-digit approval binds an ephemeral
P-256 ECDH exchange. After acceptance, HKDF derives direction-separated AES-GCM
message keys and an HMAC reconnect key. This is not a PAKE; comparing the digits
is important for manual-code pairing. The phone commits to a fresh per-peer key
before the host reveals its own key, preventing adaptive key selection to grind
matching verification digits. Public-broker denial of service is still
possible. QR credential proofs use the long token instead of the short code.

## Headset API

```js
import * as xb from 'xrblocks';
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';

const prompt = new xb.UIText({text: 'Waiting for a phone'});
const controls = new xb.UIPanel();
const phone = new PhoneCompanion({
  onPairingRequest: (request) => {
    prompt.text = request
      ? `Compare ${request.comparison} with the phone before accepting.`
      : 'Waiting for a phone';
    controls.clear();
    if (request) {
      const id = request.id;
      controls.add(
        new xb.UIButton({
          label: 'Accept phone',
          onClick: () => void phone.acceptPhone(id),
        })
      );
    }
  },
  allowTextInput: (field) => field.userData.private !== true,
  onError: console.error,
});
const replace = new xb.UIButton({
  label: 'Replace phone / New code',
  onClick: () => void phone.replacePhone(),
});
// Mount prompt/controls/replace in your UICard. See the complete sample below.
xb.add(phone);
xb.init();
```

Use `phone.rejectPhone(request.id)` to reject a request. There is no automatic
acceptance. While `phone.pairingOpen` is true, display `phone.pairing.code` and/or
`phone.pairingURL(phonePageURL)`. `onPairingChange` signals expiry, consumption,
collision recovery and replacement; hide a closed invitation.

**Replace phone / New code** explicitly revokes the old session, cancels input,
and creates a new invitation. Use it when the phone reloads or another phone
should take over; the headset app itself need not reload. A temporary connection
loss can resume the original in-memory session only with a fresh, ten-second
HMAC challenge proof. Public peer IDs, UUIDs and the old invitation cannot resume
it. Reconnect epochs and per-lane sequence numbers reject replayed data.

The script registers an ordinary `controller-ray` source with `Input`.
`event.source.controller === phone.controller` identifies it. Keep controllers
and reticles enabled (the defaults). `sensitivity` defaults to 1.5 radians per
touchpad dimension; the head-relative offset is bounded to ±1.2 radians.

## Phone page

```js
import {
  PhoneControllerPage,
  phonePairingFromCode,
} from 'xrblocks/addons/phone-companion/phone.js';

// After submitting a code-entry form:
const page = new PhoneControllerPage(document.body, {
  pairing: phonePairingFromCode(codeEnteredByUser),
});
await page.connect(); // Signaling is ready; acceptance is still required.
// page.dispose() when removing the controller from an SPA.
```

Omit `pairing` for a QR/link URL; the constructor consumes and clears its fragment.
This entry has no XR engine or three.js dependency. The
[executable sample](../../../samples/phone_companion/) includes both pages,
headset acceptance/replacement UI, manual codes and local QR generation.
Phone URLs follow the sample's deployment path, including the docs site.

## Motion, delivery and cleanup

- Slide to point, tap to select, or hold **Hold to move** while sliding another
  finger to drag. Pinch to zoom the targeted scalable object or its containing
  UI panel. Two-finger swipes scroll. Scale limits remain enforced by Interaction.
- Motion is coalesced per phone animation frame and encrypted onto a separate
  WebRTC channel with `ordered: false, maxRetransmits: 0`. Cumulative motion
  samples tolerate dropped packets; reliable button edges carry their exact
  pointer pose. Buttons, text and session control remain reliable and ordered.
- Inbound traffic has size, queue and per-message token-bucket limits. A reliable
  sequence gap or control-rate violation cancels the source rather than leaving
  a button held. Old/out-of-order lossy packets are discarded.
- For custom signaling/STUN/TURN, pass a **fresh-instance** `transportFactory`
  to the host, e.g. `() => new WebRTCTransport({unreliableChannel: true, ...})`.
  Pass a similarly configured `transport` to each phone page. Replacement uses
  the factory. BroadcastChannel supports local tests; transports without an
  unreliable lane are rejected rather than silently routing motion reliably.
- The default PeerJS broker is best-effort; some networks need TURN. Use HTTPS.
- Backgrounding, cancellation or peer loss releases held input. Missing
  authenticated traffic times out after five seconds. Dispose closes network
  listeners, timers, key references, input registration and owned reticles.
- A screen wake lock is requested only while paired and visible, released on
  background/disconnect/disposal, and reacquired on return where supported.

## Keyboard privacy and haptics

Assign `phone.input = field` from each `UITextInput`'s `onFocus`. Before **Open
keyboard** is tapped, only the allowed focused field's label/revision is sent,
not its value or selection. The authenticated open request enables mirroring for
that field. Switching fields, disconnecting or finishing editing resets this
permission. Set `allowTextInput` to deny passwords or other sensitive fields
entirely; mark them before focus, e.g. `field.userData.private = true`.

Native composition, dictation, autocorrect and emoji use the phone's editor.
Applying remote state does not emit edits. An existing value above `maxLength`
is preserved until an actual edit; minimal-difference edits preserve untouched
text. Normal `onInput`, `onChange` and `onSubmit` callbacks still apply. Stale
field revisions are rejected. Fields above 16,000 UTF-16 code units are not shared.

Successful selection requests 20 ms of phone vibration. `phone.pulse(ms)` requests
up to 200 ms. Vibration and software-keyboard suppression are browser-dependent;
unsupported vibration (including iOS Safari) is a no-op.
