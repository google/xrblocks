import {PermissionsManager} from './PermissionsManager';
import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from './WebXRSessionManager';

const XRBUTTON_WRAPPER_ID = 'XRButtonWrapper';
const XRBUTTON_CLASS = 'XRButton';

export class XRButton {
  public domElement = document.createElement('div');
  public simulatorButtonElement = document.createElement('button');
  public xrButtonElement = document.createElement('button');

  constructor(
    private sessionManager: WebXRSessionManager,
    private permissionsManager: PermissionsManager,
    private startText = 'ENTER XR',
    private endText = 'END XR',
    private invalidText = 'XR NOT SUPPORTED',
    private startSimulatorText = 'START SIMULATOR',
    showEnterSimulatorButton = false,
    public startSimulator = () => {},
    private permissions = {
      geolocation: false,
      camera: false,
      microphone: false,
    }
  ) {
    this.domElement.id = XRBUTTON_WRAPPER_ID;
    this.createXRButtonElement();

    if (showEnterSimulatorButton) {
      this.createSimulatorButton();
    }

    this.sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      this.showXRNotSupported.bind(this)
    );
    this.sessionManager.addEventListener(WebXRSessionEventType.READY, () =>
      this.onSessionReady()
    );
    this.sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_START,
      () => this.onSessionStarted()
    );
    this.sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnded.bind(this)
    );
  }

  private createSimulatorButton() {
    this.simulatorButtonElement.classList.add(XRBUTTON_CLASS);
    this.simulatorButtonElement.innerText = this.startSimulatorText;
    this.simulatorButtonElement.onclick = () => {
      this.domElement.remove();
      this.startSimulator();
    };
    this.domElement.appendChild(this.simulatorButtonElement);
  }

  private createXRButtonElement() {
    this.xrButtonElement.classList.add(XRBUTTON_CLASS);
    this.xrButtonElement.disabled = true;
    this.xrButtonElement.textContent = '...';
    this.domElement.appendChild(this.xrButtonElement);
  }

  private onSessionReady() {
    const button = this.xrButtonElement;
    button.style.display = '';
    button.innerHTML = this.startText;
    button.disabled = false;

    button.onclick = () => {
      this.permissionsManager
        .checkAndRequestPermissions(this.permissions)
        .then((result) => {
          if (result.granted) {
            this.sessionManager.startSession();
          } else {
            this.xrButtonElement.textContent =
              'Error:' + result.error + '\nPlease try again.';
          }
        });
    };
  }

  private showXRNotSupported() {
    this.xrButtonElement.textContent = this.invalidText;
    this.xrButtonElement.disabled = true;
  }

  private async onSessionStarted() {
    this.xrButtonElement.innerHTML = this.endText;
  }

  private onSessionEnded() {
    this.xrButtonElement.innerHTML = this.startText;
  }
}
