import {
  PhoneControllerPage,
  phonePairingFromCode,
  readPhonePairing,
} from '../../build/addons/phone-companion/phone.js';
import {BroadcastChannelTransport} from '../../build/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';

const panel = document.querySelector('#pair-panel');
const shell = document.querySelector('#controller-shell');
const code = document.querySelector('#code');
const error = document.querySelector('#error');
const dialog = document.querySelector('#disconnect-dialog');
let phone;

function clearError() {
  error.hidden = true;
  error.textContent = '';
  code.removeAttribute('aria-invalid');
}
function showCodeError(message) {
  error.hidden = false;
  error.textContent = message;
  code.setAttribute('aria-invalid', 'true');
  code.focus();
}
function clearURL() {
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(null, '', url);
}

async function connect(pairing) {
  phone?.dispose();
  clearError();
  code.blur();
  panel.hidden = true;
  shell.hidden = false;
  const client = new PhoneControllerPage(
    document.querySelector('#controller'),
    {
      pairing,
      transportFactory: new URLSearchParams(location.search).has('local')
        ? () => new BroadcastChannelTransport()
        : undefined,
    }
  );
  phone = client;
  try {
    await client.connect();
  } catch {
    // The controller owns the plain-language failure screen and next steps.
    // Keep it visible until the user explicitly disconnects.
  }
}

code.addEventListener('input', clearError);
document.querySelector('#pair-form').addEventListener('submit', (event) => {
  event.preventDefault();
  let pairing;
  try {
    pairing = phonePairingFromCode(code.value);
  } catch {
    showCodeError('Enter the 4-character pairing code shown in the headset.');
    return;
  }
  clearURL();
  void connect(pairing);
});

document
  .querySelector('#change-code')
  .addEventListener('click', () => dialog.showModal());
document
  .querySelector('#keep-connected')
  .addEventListener('click', () => dialog.close());
document.querySelector('#confirm-disconnect').addEventListener('click', () => {
  dialog.close();
  phone?.dispose();
  phone = undefined;
  shell.hidden = true;
  panel.hidden = false;
  code.value = '';
  clearError();
  clearURL();
  code.focus();
});

if (location.hash) {
  try {
    await connect(readPhonePairing(location.href));
  } catch {
    shell.hidden = true;
    panel.hidden = false;
    showCodeError(
      'That pairing link could not be opened. Enter a new pairing code from the headset.'
    );
  }
}
