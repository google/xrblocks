import {
  PhoneControllerPage,
  phonePairingFromCode,
  phonePairingURL,
  readPhonePairing,
} from '../../build/addons/phone-companion/phone.js';
import {BroadcastChannelTransport} from '../../build/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';

const showError = (error) => {
  const element = document.querySelector('#error');
  element.hidden = false;
  element.textContent = error.message;
};
const panel = document.querySelector('#pair-panel');
const change = document.querySelector('#change-code');
let phone;

async function connect(pairing) {
  phone?.dispose();
  document.querySelector('#error').hidden = true;
  document.querySelector('#code').blur();
  panel.hidden = true;
  change.hidden = false;
  const client = new PhoneControllerPage(
    document.querySelector('#controller'),
    {
      pairing,
      transport: new URLSearchParams(location.search).has('local')
        ? new BroadcastChannelTransport()
        : undefined,
      onError: showError,
    }
  );
  phone = client;
  try {
    await client.connect();
  } catch (error) {
    client.dispose();
    if (phone !== client) return;
    phone = undefined;
    panel.hidden = false;
    showError(error);
  }
}

document.querySelector('#pair-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const pairing = phonePairingFromCode(document.querySelector('#code').value);
    history.replaceState(null, '', phonePairingURL(location.href, pairing));
    void connect(pairing);
  } catch (error) {
    showError(error);
  }
});

change.addEventListener('click', () => {
  phone?.dispose();
  phone = undefined;
  panel.hidden = false;
  change.hidden = true;
  document.querySelector('#error').hidden = true;
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(null, '', url);
  document.querySelector('#code').focus();
});

if (location.hash) {
  try {
    await connect(readPhonePairing(location.href));
  } catch (error) {
    showError(error);
  }
}
