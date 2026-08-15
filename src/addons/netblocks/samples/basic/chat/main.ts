import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/Keyboard.js';
import {BroadcastChannelTransport} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * ChatSample.
 *
 * Plain text chat over `session.events`. Each message is one
 * `chat-message` RPC carrying `{ from, text, ts }`. Open this page in
 * two tabs to chat — `BroadcastChannelTransport` keeps the demo
 * self-contained with no signaling broker. To play with friends across
 * devices, click "Start new room" in the top-left HUD and share the
 * code; the framework swaps in `WebRTCTransport` automatically.
 *
 * The chat UI lives in two places:
 *   - a small floating DOM panel for desktop / pre-XR;
 *   - a spatial UI card + virtual keyboard inside the WebXR session, so
 *     headset users can read and type without leaving immersive mode.
 * Both views share the same underlying message log.
 */
interface ChatPayload {
  from: string;
  text: string;
  ts: number;
}

class ChatSample extends NetSample {
  private _displayName = `User-${Math.floor(Math.random() * 1000)}`;
  private _log?: HTMLDivElement;
  private _spatialLog?: xb.UIText;
  private _spatialLogLines: string[] = [];
  private _spatialDraft?: xb.UIText;
  private _keyboard?: Keyboard;

  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-chat',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: this._displayName,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '320px',
      maxHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(20, 20, 30, 0.85)',
      color: '#fff',
      borderRadius: '12px',
      padding: '10px',
      font: '13px system-ui, sans-serif',
      backdropFilter: 'blur(8px)',
      zIndex: '999',
    } as Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    header.textContent = `💬 chat · you are ${this._displayName}`;
    Object.assign(header.style, {
      fontWeight: '600',
      marginBottom: '6px',
      color: '#bfa9ff',
    });
    panel.appendChild(header);

    const log = document.createElement('div');
    Object.assign(log.style, {
      flex: '1 1 auto',
      overflowY: 'auto',
      minHeight: '120px',
      padding: '4px 0',
    });
    panel.appendChild(log);
    this._log = log;

    const inputRow = document.createElement('form');
    Object.assign(inputRow.style, {
      display: 'flex',
      gap: '6px',
      marginTop: '6px',
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Say something…';
    input.maxLength = 280;
    Object.assign(input.style, {
      flex: '1 1 auto',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid #444',
      background: '#13141c',
      color: '#fff',
      font: 'inherit',
    });
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Send';
    Object.assign(send.style, {
      padding: '6px 14px',
      borderRadius: '6px',
      border: 'none',
      background: '#9177c7',
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit',
    });
    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(inputRow);
    document.body.appendChild(panel);

    // While the chat box is focused, disable the simulator's keyboard
    // controls so typing letters like W/A/S/D doesn't move the camera.
    // Same approach as the gamepad/simulator settings panel — see PR
    // google/xrblocks#262.
    const controls = xb.core?.simulator?.controls;
    input.addEventListener('focus', () => {
      if (controls) controls.enabled = false;
    });
    input.addEventListener('blur', () => {
      if (controls) controls.enabled = true;
    });

    inputRow.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const payload: ChatPayload = {
        from: this._displayName,
        text,
        ts: Date.now(),
      };
      session.events.emit('chat-message', payload);
      this._appendLine(payload, /* self */ true);
      input.value = '';
    });

    session.events.on<ChatPayload>('chat-message', (payload) => {
      this._appendLine(payload, false);
    });

    this._buildSpatialHud(session);
  }

  private _appendLine(p: ChatPayload, self: boolean) {
    if (this._log) {
      const line = document.createElement('div');
      line.style.padding = '2px 0';
      const who = document.createElement('span');
      who.textContent = self ? 'you' : p.from;
      who.style.color = self ? '#9177c7' : '#7ac0ff';
      who.style.fontWeight = '600';
      line.appendChild(who);
      line.appendChild(document.createTextNode(`: ${p.text}`));
      this._log.appendChild(line);
      this._log.scrollTop = this._log.scrollHeight;
    }
    this._appendSpatialLine(`${self ? 'you' : p.from}: ${p.text}`);
  }

  private _appendSpatialLine(text: string) {
    if (!this._spatialLog) return;
    this._spatialLogLines.push(text);
    if (this._spatialLogLines.length > 12) this._spatialLogLines.shift();
    this._spatialLog.text = this._spatialLogLines.join('\n');
  }

  private _buildSpatialHud(session: NonNullable<this['net']['session']>) {
    this._spatialLog = new xb.UIText({
      text: '(start typing on the keyboard below to chat)',
      style: {
        width: '100%',
        flexGrow: 1,
        minHeight: 180,
        color: '#ffffff',
        fontSize: 20,
        whiteSpace: 'pre-line',
        verticalAlign: 'bottom',
        overflow: 'hidden',
      },
    });
    this._spatialDraft = new xb.UIText({
      text: '› ',
      style: {
        width: '100%',
        minHeight: 36,
        color: '#7ac0ff',
        fontSize: 22,
        whiteSpace: 'pre-line',
      },
    });
    const keyboard = new Keyboard({
      onValueChange: (text) => {
        if (this._spatialDraft) this._spatialDraft.text = `› ${text}`;
      },
      onSubmit: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const payload: ChatPayload = {
          from: this._displayName,
          text: trimmed,
          ts: Date.now(),
        };
        session.events.emit('chat-message', payload);
        this._appendLine(payload, true);
        keyboard.setValue('');
        if (this._spatialDraft) this._spatialDraft.text = '› ';
      },
    });
    this._keyboard = keyboard;

    const card = new xb.UICard({
      size: {width: 1.0, height: 0.9},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        backgroundColor: '#1a1a2add',
        borderRadius: 24,
      },
      children: [
        new xb.UIText({
          text: `💬 ${this._displayName}`,
          style: {
            width: '100%',
            color: '#bfa9ff',
            fontSize: 26,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        this._spatialLog,
        this._spatialDraft,
        keyboard,
      ],
    });
    card.position.set(-0.8, 1.4, -1.3);
    card.rotation.y = Math.PI / 8;
    this.add(card);
  }
}

NetSample.run(ChatSample);
