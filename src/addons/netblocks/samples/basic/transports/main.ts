import * as xb from 'xrblocks';
import {
  BroadcastChannelTransport,
  enableNet,
  NetCore,
  Transport,
  WebRTCTransport,
  WebSocketTransport,
} from 'netblocks';

/**
 * TransportsSample.
 *
 * Renders a tiny on-page UI that lets you pick a transport and connect.
 * We don't extend `NetSample` here because we want fine-grained control
 * over (re)connection — picking a different transport tears the existing
 * session down and starts a new one in-place.
 */
class TransportsSample extends xb.Script {
  net!: NetCore;
  private _peerCountEl?: HTMLSpanElement;
  private _statusEl?: HTMLSpanElement;

  async init() {
    this.net = enableNet();
    this._buildHud();
  }

  update() {
    if (this._peerCountEl && this.net.session) {
      this._peerCountEl.textContent = String(this.net.session.users.size);
    }
  }

  private _buildHud() {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      padding: '14px 18px',
      background: 'rgba(20,20,30,0.85)',
      color: '#eee',
      borderRadius: '12px',
      fontFamily: 'sans-serif',
      fontSize: '14px',
      zIndex: '999',
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
    } as Partial<CSSStyleDeclaration>);

    const label = document.createElement('span');
    label.textContent = 'Transport:';
    root.appendChild(label);

    for (const name of ['BroadcastChannel', 'WebRTC', 'WebSocket']) {
      const btn = document.createElement('button');
      btn.textContent = name;
      Object.assign(btn.style, {
        padding: '6px 10px',
        background: '#9177c7',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
      });
      btn.addEventListener('click', () => this._switchTo(name));
      root.appendChild(btn);
    }

    const status = document.createElement('span');
    status.textContent = ' · not connected';
    root.appendChild(status);
    this._statusEl = status;

    const peers = document.createElement('span');
    peers.textContent = ' · peers: ';
    const count = document.createElement('span');
    count.textContent = '0';
    peers.appendChild(count);
    root.appendChild(peers);
    this._peerCountEl = count;

    document.body.appendChild(root);
  }

  private async _switchTo(name: string) {
    this.net.leaveRoom();
    let transport: Transport;
    let url: string | null;
    switch (name) {
      case 'BroadcastChannel':
        transport = new BroadcastChannelTransport();
        break;
      case 'WebRTC':
        transport = new WebRTCTransport();
        break;
      case 'WebSocket':
        url = prompt('Relay WebSocket URL', 'ws://localhost:8765');
        if (!url) return;
        transport = new WebSocketTransport({url});
        break;
      default:
        return;
    }
    if (this._statusEl)
      this._statusEl.textContent = ` · connecting via ${name}…`;
    try {
      await this.net.joinRoom('netblocks-sample-transports', {
        transport,
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      });
      if (this._statusEl)
        this._statusEl.textContent = ` · connected via ${name}`;
    } catch (err) {
      if (this._statusEl)
        this._statusEl.textContent = ` · failed: ${(err as Error).message}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.enableUI();
  options.reticles.enabled = true;
  options.controllers.visualizeRays = false;
  const app = new TransportsSample();
  xb.add(app);
  await xb.init(options);
});
