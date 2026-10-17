# Phone companion

Build with `npm run build`, serve the repository, and open
`/samples/phone_companion/` on the headset or desktop. Scan the QR with your phone
before entering XR, or scan the copy shown in the spatial card. Both pages must
be reachable from their devices; for a headset use an HTTPS deployment or HTTPS
development tunnel, rather than a localhost URL that resolves to the phone itself.

- Slide to adjust a head-relative pointer; tap to select.
- **Pinch to zoom** the pointed-at panel or scalable object, including over its UI controls.
- Hold **Hold to move** while sliding another finger on the pad to move the panel or drag objects/sliders.
- Swipe with two fingers to scroll. **Recenter** resets the pointer to gaze.
- Select the message field, then tap **Type: Message** on the phone to open its
  native keyboard. **Submit** sends the text; **Done** blurs the headset field.
- Successful selections request a short phone vibration where supported.

The phone requests a screen wake lock while paired and visible. Each host session
locks to its first phone page instance. If you reload the phone or change devices,
reload the host too and scan its new QR.

Default transport: netblocks WebRTC with its public PeerJS broker. Allow a few
seconds for discovery. Networks requiring TURN need a configured transport on
both pages; see the [addon README](../../src/addons/phone-companion/README.md).

For a same-browser two-tab check, open `/samples/phone_companion/?local=1` and
click **Open phone controller**. This uses BroadcastChannel instead of WebRTC.
It exercises the same input and text protocol without signaling infrastructure.
