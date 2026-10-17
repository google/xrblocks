import * as THREE from 'three';
import * as xb from 'xrblocks';
import {PhoneCompanion} from 'xrblocks/addons/phone-companion/index.js';
import {BroadcastChannelTransport} from 'xrblocks/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';
import qrcode from 'qrcode-generator';

const local = new URLSearchParams(location.search).has('local');

class PhoneDemo extends xb.Script {
  init() {
    const status = new xb.UIText({text: 'Scan the QR to pair your phone.'});
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
    const phonePage = new URL('phone.html', location.href);
    if (local) phonePage.searchParams.set('local', '1');
    const url = this.phone.pairingURL(phonePage);
    document.querySelector('#link').href = url;
    // Generate the QR locally: the pairing credential is never sent to an image service.
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const qrURL = qr.createDataURL(6, 24);
    document.querySelector('#qr').src = qrURL;
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
        new xb.UIImage({
          src: qrURL,
          ariaLabel: 'Phone pairing QR',
          style: {width: 200, height: 200},
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
        : 'Scan the QR to pair your phone.'
    );
  }
}

xb.add(new PhoneDemo());
xb.init();
