import * as THREE from 'three';
import * as xb from 'xrblocks';
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';
import {BroadcastChannelTransport} from 'xrblocks/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';

const local = new URLSearchParams(location.search).has('local');

class PhoneDemo extends xb.Script {
  init() {
    const localTest = document.querySelector('#local-test');
    if (!navigator.xr) localTest.hidden = false;
    else {
      // Hide on XR-capable devices before entering a session too. A pairing
      // link in a new tab is useful only for same-computer testing/copying.
      void Promise.all([
        navigator.xr.isSessionSupported('immersive-vr'),
        navigator.xr.isSessionSupported('immersive-ar'),
      ])
        .then((supported) => {
          localTest.hidden =
            supported.some(Boolean) || xb.core.renderer.xr.isPresenting;
        })
        .catch(() => {
          /* Leave hidden when capability detection is unavailable. */
        });
    }
    const phonePage = new URL('phone.html', import.meta.url);
    if (local) phonePage.searchParams.set('local', '1');
    const status = new xb.UIText({text: 'Connecting to signaling…'});
    const requestText = new xb.UIText({
      text: 'New phones require approval here.',
    });
    const codeText = new xb.UIText({
      text: 'Connecting…',
      style: {fontSize: 36, fontWeight: 'bold'},
    });
    const setStatus = (text) => {
      status.text = text;
      document.querySelector('#status').textContent = text;
    };
    const replace = () => {
      void this.phone.replacePhone().catch((error) => setStatus(error.message));
    };
    const replaceButton = new xb.UIButton({
      label: 'Replace phone / New code',
      onClick: replace,
    });
    const approvalActions = new xb.UIPanel({
      style: {flexDirection: 'row', gap: 8},
    });
    const showRequest = (request) => {
      const id = request?.id;
      const label = request
        ? `Compare ${request.comparison} with your phone, then accept.`
        : 'New phones require approval here.';
      requestText.text = label;
      document.querySelector('#pair-request').textContent = label;
      const accept = () => {
        if (id)
          void this.phone
            .acceptPhone(id)
            .catch((error) => setStatus(error.message));
      };
      const reject = () => {
        if (id) this.phone.rejectPhone(id);
      };
      // Replace the controls, not just their callbacks. An in-flight press for
      // an old request must never approve a newly arrived phone.
      approvalActions.clear();
      approvalActions.add(
        new xb.UIButton({
          label: 'Accept phone',
          disabled: !id,
          onClick: accept,
        }),
        new xb.UIButton({
          label: 'Reject phone',
          disabled: !id,
          onClick: reject,
        }),
        replaceButton
      );
      for (const [selector, action] of [
        ['#accept-phone', accept],
        ['#reject-phone', reject],
      ]) {
        const previous = document.querySelector(selector);
        const button = previous.cloneNode(true);
        button.disabled = !id;
        button.onclick = action;
        previous.replaceWith(button);
      }
    };
    showRequest(null);
    document.querySelector('#replace-phone').onclick = replace;
    const pairingChanged = () => {
      const open = this.phone.pairingOpen;
      codeText.text = open ? this.phone.pairing.code : 'Invitation closed';
      document.querySelector('#pairing-code').textContent = codeText.text;
      document.querySelector('#qr').hidden = !open;
      const link = document.querySelector('#link');
      if (open) {
        const url = this.phone.pairingURL(phonePage);
        link.href = url;
        setStatus(
          'Single-use, 90-second invitation. Compare the phone’s six digits before accepting.'
        );
        // The optional QR is local and never blocks manual pairing.
        void import('qrcode-generator')
          .then(({default: qrcode}) => {
            if (
              !this.phone.pairingOpen ||
              this.phone.pairingURL(phonePage) !== url
            )
              return;
            const qr = qrcode(0, 'M');
            qr.addData(url);
            qr.make();
            document.querySelector('#qr').src = qr.createDataURL(6, 24);
          })
          .catch(() => {
            document.querySelector('#qr').hidden = true;
          });
      } else {
        link.removeAttribute('href');
        setStatus(
          'Invitation closed. Use Replace phone / New code to pair another phone.'
        );
      }
    };
    this.phone = new PhoneCompanion({
      transportFactory: local
        ? () => new BroadcastChannelTransport()
        : undefined,
      onPairingChange: pairingChanged,
      onPairingRequest: showRequest,
      onConnectionChange: (connected) =>
        setStatus(
          connected ? 'Phone connected · slide to point' : 'Waiting for phone…'
        ),
      onError: (error) => setStatus(`Connection error: ${error.message}`),
    });
    const phoneLanding = document.querySelector('#phone-page');
    phoneLanding.href = phonePage.href;
    phoneLanding.textContent = phonePage.href;
    let count = 0;
    const counter = new xb.UIButton({
      label: 'Tap me: 0',
      onClick: () => {
        counter.label = `Tap me: ${++count}`;
      },
    });
    const result = new xb.UIText({
      text: 'Select the field, then tap Open keyboard on your phone.',
    });
    const field = new xb.UITextInput({
      ariaLabel: 'Message',
      placeholder: 'Type with your phone',
      multiline: true,
      style: {height: 110},
      onFocus: () => {
        this.phone.input = field;
      },
      onSubmit: (value) => {
        result.text = `Submitted: ${value}`;
        this.phone.pulse(60);
      },
    });
    const card = new xb.UICard({
      size: {width: 0.85, height: 'auto'},
      manipulation: true,
      style: {padding: 20, gap: 12},
      children: [
        new xb.UIExitButton(),
        new xb.UIText({text: 'Phone companion', style: {fontSize: 32}}),
        status,
        codeText,
        requestText,
        approvalActions,
        new xb.UIText({
          text: `On your phone, open:\n${phonePage.href}\nThen enter the code above.`,
          style: {fontSize: 16, whiteSpace: 'pre-line'},
        }),
        counter,
        field,
        result,
        new xb.UISlider({
          ariaLabel: 'Phone slider',
          style: {width: '100%', height: 48},
          min: 0,
          max: 100,
          value: 50,
          onInput: (value) => {
            result.text = `Slider: ${Math.round(value)}`;
          },
        }),
      ],
    });
    card.add(
      new xb.FollowHead({offset: new THREE.Vector3(0, 0, -0.85), smoothing: 1}),
      new xb.FaceCamera({mode: 'spherical', smoothing: 1})
    );
    this.add(card, this.phone);
  }

  onXRSessionStarted() {
    document.querySelector('#local-test').hidden = true;
  }
}

xb.add(new PhoneDemo());
xb.init();
