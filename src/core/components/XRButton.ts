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
  private disposed = false;

  constructor(
    private sessionManager: WebXRSessionManager,
    private permissionsManager: PermissionsManager,
    private appTitle = '',
    private appDescription = '',
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
    this.createXRAppTitle();
    this.createXRAppDescription();
    this.createXRButtonElement();

    if (showEnterSimulatorButton) {
      this.createSimulatorButton();
    }

    this.sessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      this.onUnsupported
    );
    this.sessionManager.addEventListener(
      WebXRSessionEventType.READY,
      this.onReady
    );
    this.sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onSessionStart
    );
    this.sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnd
    );
  }

  private onUnsupported = () => this.showXRNotSupported();
  private onReady = () => this.onSessionReady();
  private onSessionStart = () => this.onSessionStarted();
  private onSessionEnd = () => this.onSessionEnded();

  private createSimulatorButton() {
    this.simulatorButtonElement.classList.add(XRBUTTON_CLASS);
    this.simulatorButtonElement.innerText = this.startSimulatorText;
    this.simulatorButtonElement.onclick = () => {
      this.domElement.remove();
      this.startSimulator();
    };
    this.domElement.appendChild(this.simulatorButtonElement);
  }

  private createXRAppTitle() {
    if (!this.appTitle) {
      return;
    }
    const appTitle = document.createElement('h1');
    appTitle.textContent = this.appTitle;
    this.domElement.appendChild(appTitle);
  }

  private createXRAppDescription() {
    if (!this.appDescription) {
      return;
    }
    const appDescription = document.createElement('h4');
    appDescription.textContent = this.appDescription;
    this.domElement.appendChild(appDescription);
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

    const allowsVideoFallback = this.sessionManager
      .getSessionOptions()
      ?.optionalFeatures?.includes('camera-access');

    button.onclick = () => {
      this.permissionsManager
        .checkAndRequestPermissions(this.permissions, {
          allowVideoFallback: allowsVideoFallback,
        })
        .then((result) => {
          if (this.disposed) return;
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
    this.xrButtonElement.onclick = () => {
      void this.sessionManager.endSession();
    };
  }

  private onSessionEnded() {
    this.onSessionReady();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionManager.removeEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      this.onUnsupported
    );
    this.sessionManager.removeEventListener(
      WebXRSessionEventType.READY,
      this.onReady
    );
    this.sessionManager.removeEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onSessionStart
    );
    this.sessionManager.removeEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnd
    );
    this.simulatorButtonElement.onclick = null;
    this.xrButtonElement.onclick = null;
    this.domElement.remove();
  }
}
