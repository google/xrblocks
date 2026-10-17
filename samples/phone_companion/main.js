import * as THREE from 'three';
import * as xb from 'xrblocks';
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';
import {BroadcastChannelTransport} from 'xrblocks/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';

const local = new URLSearchParams(location.search).has('local');

class PhoneDemo extends xb.Script {
  init() {
    const status = new xb.UIText({
      text: 'Enter the pairing code on your phone.',
    });
    const setStatus = (text) => {
      status.text = text;
      document.querySelector('#status').textContent = text;
    };
    this.phone = new PhoneCompanion({
      transport: local ? new BroadcastChannelTransport() : undefined,
      onConnectionChange: (connected) =>
        setStatus(
          connected ? 'Phone connected · slide to point' : 'Waiting for phone…'
        ),
      onError: (error) => setStatus(`Connection error: ${error.message}`),
    });
    const phonePage = new URL('phone.html', import.meta.url);
    if (local) phonePage.searchParams.set('local', '1');
    const url = this.phone.pairingURL(phonePage);
    document.querySelector('#link').href = url;
    document.querySelector('#pairing-code').textContent =
      this.phone.pairing.code;
    const phoneLanding = document.querySelector('#phone-page');
    phoneLanding.href = phonePage.href;
    phoneLanding.textContent = phonePage.href;
    // The optional QR must not block headset code pairing. Generate it locally;
    // the pairing credential is never sent to an image service.
    void import('qrcode-generator')
      .then(({default: qrcode}) => {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        document.querySelector('#qr').src = qr.createDataURL(6, 24);
      })
      .catch(() => {
        document.querySelector('#qr').hidden = true;
      });
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
        new xb.UIText({
          text: this.phone.pairing.code,
          style: {fontSize: 36, fontWeight: 'bold'},
        }),
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
    setStatus(
      local
        ? 'Local two-tab mode · open the controller link'
        : 'Enter the pairing code on your phone.'
    );
  }
}

xb.add(new PhoneDemo());
xb.init();
