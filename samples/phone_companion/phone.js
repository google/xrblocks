import {PhoneControllerPage} from '../../build/addons/phone-companion/phone.js';
import {BroadcastChannelTransport} from '../../build/addons/netblocks/src/core/transport/BroadcastChannelTransport.js';

const showError = (error) => {
  const element = document.querySelector('#error');
  element.hidden = false;
  element.textContent = error.message;
};
try {
  const phone = new PhoneControllerPage(document.body, {
    transport: new URLSearchParams(location.search).has('local')
      ? new BroadcastChannelTransport()
      : undefined,
    onError: showError,
  });
  await phone.connect();
} catch (error) {
  showError(error);
}
