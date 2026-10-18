# Phone companion

A phone supplies a touchpad, head-relative pointer, selection, pinch zoom,
two-finger scrolling, native text editing and optional vibration. It needs no
Gamepad API, hand tracking or phone motion sensors.

## Pairing in a headset

1. Open the phone landing page and enter the headset's four-character code.
   A desktop/mirrored screen can instead show an optional QR.
2. **Compare the six verification digits on the phone and headset.** Only accept
   when they match and this is the phone you intend to connect.
3. Tap **Numbers match** on the phone and choose **Accept phone** in the headset,
   in either order. Neither endpoint activates until both decisions are complete.
   If the numbers differ, reject the request. A peer knowing the short code cannot
   activate the phone or show editable fields merely by sending an approval.

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

The pairing transport is exclusively owned by this addon. Phones wait for a
credential-verified host announcement (or a session-key proof on reconnect),
then address only that host. Other phone connections in the transport's mesh
are ignored by `PhoneLink`. A headset's multiplayer NetSession must use its own
transport and room; phones never join that multiplayer room.

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
      ? request.accepted
        ? `Headset accepted. Compare ${request.comparison} and tap Numbers match on the phone.`
        : `Compare ${request.comparison} on both devices before confirming.`
      : 'Waiting for a phone';
    controls.clear();
    if (request && !request.accepted) {
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
  label: 'Pair a different phone',
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
`request.accepted` keeps the comparison visible after headset acceptance while
waiting for the phone's confirmation. `acceptPhone()` records the headset's
decision; `onConnectionChange(true)` reports the completed mutual confirmation.

**Pair a different phone** explicitly revokes the old session, cancels input,
and creates a new invitation. Use it when the phone reloads or another phone
should take over; the headset app itself need not reload. A temporary connection
loss can resume the original in-memory session only with a fresh, ten-second
HMAC challenge proof. Each attempt starts with a fresh phone nonce; both the
phone nonce and headset nonce are bound into both proofs and the new epoch.
Public peer IDs, UUIDs, old invitations and recorded resume exchanges cannot
resume it. Per-lane sequence numbers also reject replayed application data.

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

The phone UI separates number verification from the accepted touchpad. Connection
loss dims the controls, prolonged failures explain how to pair again, and recovery
briefly shows **Reconnected**. `onStateChange` exposes structured connection states
for custom shells; `onStatus` remains available for diagnostic/status callbacks.
The sample asks before **Disconnect** and clears the pairing code afterward.
During connection loss, connected-only hints are hidden. Failed-reconnect
instructions appear beneath the status with a primary **Disconnect** action;
`onDisconnectRequest` lets an embedding page open its existing confirmation.
Typing collapses the pad on phones/cover screens and uses a side-by-side layout
on unfolded screens. These are CSS layouts; resizing does not replace the session
or reset pointer offsets.

## Motion, delivery and cleanup

- Slide to point, tap to select, or hold on the pad then slide to drag; release
  to drop. The **Drag / Drop** toggle also supports one-finger dragging.
  Pinch to zoom the targeted scalable object or its containing
  UI panel. Two-finger swipes scroll. Scale limits remain enforced by Interaction.
- Motion is coalesced per phone animation frame and encrypted onto a separate
  WebRTC channel with `ordered: false, maxRetransmits: 0`. Cumulative motion
  samples tolerate dropped packets; reliable button edges carry their exact
  pointer pose. Buttons, text and session control remain reliable and ordered.
- Inbound traffic has size, queue and per-message token-bucket limits. A reliable
  sequence gap or control-rate violation cancels the source rather than leaving
  a button held. Old/out-of-order lossy packets are discarded.
  Unidentified peers are size-checked and rate-limited before UTF-8 decoding or
  JSON parsing; their handshake packets are capped at 2 KiB.
- For custom signaling/STUN/TURN, pass a **fresh-instance** `transportFactory`
  to the host, e.g. `() => new WebRTCTransport({unreliableChannel: true, ...})`.
  Pass a similarly configured `transportFactory` to each phone page. Replacement
  uses the factory. WebRTC signaling-only repair preserves the existing peer ID
  and data channels on both endpoints. For other transports, a standby is opened
  before replacing a lost connection, while a healthy data link or pending
  pairing continues on the old transport. A custom single `transport` without
  a factory only forwards transport errors; it is not automatically replaced. BroadcastChannel
  supports local tests; transports without an
  unreliable lane are rejected rather than silently routing motion reliably.
- The default PeerJS broker is best-effort; some networks need TURN. Use HTTPS.
- Backgrounding, cancellation or peer loss releases held input. Missing
  authenticated traffic times out after five seconds. Dispose closes network
  listeners, timers, key references, input registration and owned reticles.
- A screen wake lock is requested only while paired and visible, released on
  background/disconnect/disposal, and reacquired on return where supported.
- Broker errors do not disconnect an approved, healthy peer-to-peer link. Loss
  of the headset peer or five seconds without authenticated traffic triggers
  recovery; both endpoints can repair their own signaling. Returning from the
  background does not force a swap during initial connection or pending pairing.
  Approval received while hidden is still processed on the old live transport.
- A lost data link authenticates a fresh epoch with the existing session secret,
  even after the invitation expires. The UI shows **Connection lost. Trying to
  reconnect…** and retries with bounded backoff while visible. The 20-second UI
  timeout pauses while hidden and restarts on return/new recovery attempts.
  Repeated background cycles and
  persisted page restores retain the session; explicit disposal/reload revokes
  its in-memory key. The headset's multiplayer transport is independent.

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
