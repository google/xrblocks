# Phone companion

Build with `npm run build`, serve the repository, and open
`/samples/phone_companion/` on the headset or desktop. On the phone open
`/samples/phone_companion/phone.html` on the same site and enter the headset code.
Compare the six verification digits on both devices, then choose **Accept phone**
in the headset. The desktop QR is optional; it uses a long random token.

Invitations last 90 seconds, permit five handshake attempts, and are consumed
once. Each headset owns its state and automatically rerolls a colliding code.
Use **Replace phone / New code** for a reloaded or different phone; it revokes the
old session without reloading the headset. Do not accept mismatched digits.

- Slide to point and tap to select.
- Hold **Hold to move** while sliding another finger to drag objects/sliders.
- Pinch to zoom the targeted panel/object; swipe two fingers to scroll.
- Select a field, then tap its keyboard button on the phone. No field value is
  shared before that tap. **Submit** invokes the app callback; **Done** returns
  to the touchpad.
- Selections request optional vibration; a wake lock keeps the paired phone
  screen on while visible where supported.

The phone link is relative to the sample's `main.js`. The docs deployment copies
`samples/` and `build/` together; its phone page is
`https://xrblocks.github.io/samples/phone_companion/phone.html` after deployment.
Other hosts should preserve this layout or configure their own phone-page URL.
Use HTTPS URLs reachable by both devices, rather than a phone-local localhost URL.

Default transport: netblocks WebRTC, with a separate unordered zero-retransmission
motion channel. The public PeerJS broker is best-effort; configure signaling/TURN
on both sides if needed. See the [addon README](../../src/addons/phone-companion/README.md).

For a same-browser test, open `/samples/phone_companion/?local=1`, open the phone
page in the same browser context, enter the code and approve it. This uses
BroadcastChannel and the same authenticated pairing, input and editing flow.
