import {
  PhoneLink,
  readPhonePairing,
  type PhoneConnectionOptions,
  type PhoneConnectionState,
  type PhonePairing,
} from './PhoneLink.js';
import {
  MAX_TEXT_LENGTH,
  type PhoneMessage,
  type PhoneTextState,
} from './protocol.js';
import {ScreenWakeLock} from './ScreenWakeLock.js';

export interface PhoneControllerPageOptions extends PhoneConnectionOptions {
  pairing?: PhonePairing;
  /** Opens the embedding page's disconnect confirmation from the recovery action. */
  onDisconnectRequest?: () => void;
}

/** A DOM-only phone controller. No XR session, renderer, or gamepad is required. */
export class PhoneControllerPage {
  private readonly container = document.createElement('section');
  private readonly shadow = this.container.attachShadow({mode: 'open'});
  private readonly abort = new AbortController();
  private readonly link: PhoneLink;
  private readonly wakeLock = new ScreenWakeLock();
  private readonly status: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly editor: HTMLTextAreaElement;
  private readonly keyboard: HTMLButtonElement;
  private text: PhoneTextState | null = null;
  private field: {id: number; revision: number; label: string} | null = null;
  private keyboardRequested = false;
  private applyingRemote = false;
  private lastEdit = '';
  private composing = false;
  private dragMode?: 'hold' | 'toggle';
  private holdTimer?: ReturnType<typeof setTimeout>;
  private state: PhoneConnectionState['type'] = 'connecting';
  private everConnected = false;
  private foreground = !document.hidden;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private gestureFrame?: number;
  private multiTouch = false;
  private gesture?: {
    distance: number;
    x: number;
    y: number;
    lastDistance: number;
    lastY: number;
    mode?: 'zoom' | 'scroll';
  };
  private pointers = new Map<number, {x: number; y: number}>();
  private tap?: {x: number; y: number; time: number};
  private disposed = false;
  private readonly requestDisconnect?: () => void;

  constructor(root: HTMLElement, options: PhoneControllerPageOptions = {}) {
    this.requestDisconnect = options.onDisconnectRequest;
    const pairing = options.pairing ?? readPhonePairing(location.href);
    this.shadow.innerHTML = `
      <style>
        :host { display:block; height:100%; min-height:0; color:#f4f6fa; font:16px system-ui,sans-serif; }
        * { box-sizing:border-box; }
        main { max-width:620px; height:100%; min-height:0; margin:auto; padding:16px;
          padding-top:max(12px, env(safe-area-inset-top)); padding-left:max(16px, env(safe-area-inset-left));
          padding-right:max(16px, env(safe-area-inset-right)); display:flex; flex-direction:column; gap:12px; overflow:hidden; }
        h1 { font-size:22px; margin:0; } h2 { font-size:28px; margin:0; }
        p { line-height:1.4; margin:0; } .brand { color:#9aaecb; font-size:12px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:4px; }
        #status { color:#abc9f7; margin-top:6px; font-size:14px; }
        #pairing-stage { flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; gap:20px; text-align:center; max-width:460px; margin:auto; }
        #verification { display:block; font:700 clamp(44px, 10vw, 76px)/1.2 ui-monospace,monospace; font-variant-numeric:tabular-nums; letter-spacing:.06em; color:#c4d9ff; }
        #numbers-match { flex:0 0 auto; }
        #stage-help { color:#c4d0e2; } #stage-help strong { color:white; }
        #controls { flex:1; min-height:0; display:flex; flex-direction:column; gap:12px; }
        #pointer-panel { display:flex; flex-direction:column; flex:1; min-height:0; gap:10px; }
        #pad { flex:1; min-height:80px; border:2px solid #7faeff; position:relative;
          border-radius:24px; background:#15243c; display:grid; place-content:center;
          text-align:center; touch-action:none; overscroll-behavior:none; user-select:none; -webkit-user-select:none; }
        #pad small { display:block; color:#b2c3dd; margin-top:6px; }
        #pad[aria-disabled="true"] { opacity:.35; pointer-events:none; border-style:dashed; }
        #pad[data-gesture="drag"] { border-color:#8ce3b9; background:#16332e; }
        #pad[data-gesture="scroll"], #pad[data-gesture="zoom"] { border-color:#d2b1ff; }
        #feedback { position:absolute; bottom:12px; left:12px; right:12px; font-size:14px; color:#b6f1d4; }
        #gesture-help, #keyboard-hint { font-size:13px; color:#a9b9d1; text-align:center; }
        main:not([data-state="connected"]) #gesture-help,
        main:not([data-state="connected"]) #keyboard-hint { display:none; }
        .row { display:flex; gap:10px; }
        button { flex:1; min-height:48px; border:0; border-radius:12px; padding:10px 14px;
          background:#a7c7ff; color:#10213b; font:inherit; touch-action:manipulation; }
        button[aria-pressed="true"] { background:#8ce3b9; }
        button:focus-visible, textarea:focus-visible { outline:3px solid #fff; outline-offset:2px; }
        button:disabled { opacity:.45; }
        #keyboard-panel { min-height:0; } #keyboard { width:100%; }
        #typing-panel { min-height:0; height:100%; display:flex; flex-direction:column; gap:10px; }
        #editor-label { font-weight:600; }
        textarea { width:100%; min-height:60px; flex:1; resize:none; font:18px system-ui; overflow:auto;
          border-radius:12px; padding:12px; background:#fff; color:#111; }
        main.typing #pointer-panel, main.typing #keyboard, main.typing #keyboard-hint { display:none; }
        main.typing #keyboard-panel { flex:1; }
        #recovery-help { font-size:16px; color:#e3ecfa; }
        main[data-state="failed"] #recovery-help { padding:12px; border:1px solid #596d8b; border-radius:12px; background:#17243b; }
        #recovery-disconnect { flex:0 0 auto; width:100%; }
        [hidden] { display:none !important; }
        @media (min-width:640px) and (min-height:480px) {
          main.typing { max-width:1100px; }
          main.typing #controls { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); gap:20px; }
          main.typing #pointer-panel { display:flex; }
        }
        @media (max-height:480px) and (min-width:500px) {
          main { padding:8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left)); gap:8px; max-width:100%; }
          .brand { display:none; } h1 { font-size:17px; } h2 { font-size:22px; }
          header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
          #status { margin:0; } #pairing-stage { gap:8px; } #verification { font-size:48px; }
          #stage-help { font-size:14px; }
          #controls { display:grid; grid-template-columns:minmax(0, 1fr) minmax(170px, .45fr); gap:12px; }
          #keyboard-panel { align-self:center; } #pointer-panel { gap:6px; }
          #pad { border-radius:16px; } #gesture-help { font-size:12px; }
          button { min-height:44px; padding:8px 12px; }
          main.typing #controls { display:flex; } main.typing #keyboard-panel { align-self:stretch; }
        }
      </style>
      <main>
        <header><div><p class="brand">XR Blocks</p><h1>Phone controller</h1></div><p id="status" role="status">Connecting to headset…</p></header>
        <p id="recovery-help" hidden></p>
        <button id="recovery-disconnect" hidden>Disconnect</button>
        <section id="pairing-stage" aria-labelledby="stage-title">
          <h2 id="stage-title">Connecting to headset</h2>
          <p id="verification" aria-label="Verification number" hidden></p>
          <p id="stage-help">Keep the headset's pairing screen open.</p>
          <button id="numbers-match" hidden>Numbers match</button>
        </section>
        <div id="controls" hidden>
          <section id="pointer-panel" aria-label="Pointer controls">
            <div id="pad" aria-label="Pointer touchpad" aria-disabled="true"><div>Slide to point<small>Tap to select</small></div><span id="feedback"></span></div>
            <p id="gesture-help">Hold, then slide to drag · Two fingers to scroll or pinch</p>
            <div class="row"><button id="select" aria-pressed="false" disabled>Drag</button><button id="center" disabled>Recenter</button></div>
          </section>
          <section id="keyboard-panel" aria-label="Phone keyboard">
            <p id="keyboard-hint">Select a text field in the headset to type.</p>
            <button id="keyboard" hidden disabled>Open keyboard</button>
            <div id="typing-panel" hidden>
              <label id="editor-label" for="editor">Headset text field</label>
              <textarea id="editor" aria-label="Headset text field" hidden disabled></textarea>
              <div id="text-actions" class="row" hidden><button id="submit" disabled>Submit</button><button id="done" disabled>Done</button></div>
            </div>
          </section>
        </div>
      </main>`;
    root.append(this.container);
    this.status = this.find('status');
    this.pad = this.find('pad');
    this.editor = this.find('editor');
    this.keyboard = this.find('keyboard');
    this.link = new PhoneLink(
      'phone',
      pairing,
      {
        ...options,
        onStatus: (message) => {
          options.onStatus?.(message);
        },
        onStateChange: (state) => {
          this.showState(state);
          options.onStateChange?.(state);
        },
        onError: (error) => {
          options.onError?.(error);
        },
      },
      (message) => this.receive(message),
      (connected) => {
        this.wakeLock.setActive(connected && !document.hidden);
        this.cancel();
        this.applyField(null);
      }
    );
    const signal = this.abort.signal;
    this.find('recovery-disconnect').addEventListener(
      'click',
      () => this.requestDisconnect?.(),
      {signal}
    );
    this.pad.addEventListener('pointerdown', this.padDown, {signal});
    this.pad.addEventListener('pointermove', this.padMove, {signal});
    this.pad.addEventListener('pointerup', this.padUp, {signal});
    this.pad.addEventListener('pointercancel', () => this.cancel(), {signal});
    this.pad.addEventListener(
      'contextmenu',
      (event) => event.preventDefault(),
      {signal}
    );
    this.pad.addEventListener(
      'lostpointercapture',
      (event) => {
        if (this.pointers.has(event.pointerId)) this.cancel();
      },
      {signal}
    );
    this.find('select').addEventListener(
      'click',
      () => {
        if (!this.connected || this.multiTouch) return;
        if (this.dragMode) this.endDrag();
        else this.beginDrag('toggle');
      },
      {signal}
    );
    this.find('center').addEventListener(
      'click',
      () => this.link.send({type: 'center'}),
      {signal}
    );
    this.keyboard.addEventListener(
      'click',
      () => {
        // Native software keyboards require a local user gesture, not an RPC.
        if (!this.field) return;
        this.cancel();
        this.keyboardRequested = true;
        this.updateTypingLayout();
        this.editor.disabled = false;
        this.editor.hidden = false;
        this.editor.focus();
        this.link.send({type: 'open-keyboard', fieldId: this.field.id});
      },
      {signal}
    );
    this.editor.addEventListener(
      'compositionstart',
      () => {
        this.composing = true;
      },
      {signal}
    );
    this.editor.addEventListener(
      'compositionend',
      () => {
        this.composing = false;
        this.sendEdit();
      },
      {signal}
    );
    this.editor.addEventListener('input', () => this.sendEdit(), {signal});
    this.editor.addEventListener('select', () => this.sendEdit(), {signal});
    this.editor.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' &&
          !event.isComposing &&
          !this.composing &&
          (!this.text?.multiline || event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          this.submit();
        }
      },
      {signal}
    );
    this.find('submit').addEventListener('click', () => this.submit(), {
      signal,
    });
    this.find('done').addEventListener(
      'click',
      () => {
        this.sendEdit();
        if (this.text)
          this.link.send({type: 'done', revision: this.text.revision});
        this.editor.blur();
        this.editor.hidden = true;
        this.keyboardRequested = false;
        this.text = null;
        this.cancel();
        this.updateTypingLayout();
      },
      {signal}
    );
    window.addEventListener('blur', () => this.cancel(), {signal});
    window.addEventListener(
      'pagehide',
      (event) => {
        if (event.persisted) {
          this.cancel();
          this.updateForeground(false);
        } else this.dispose();
      },
      {signal}
    );
    window.addEventListener(
      'pageshow',
      () => this.updateForeground(!document.hidden),
      {signal}
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.cancel();
        this.updateForeground(!document.hidden);
      },
      {signal}
    );
    this.link.setForeground(this.foreground);
  }

  private updateForeground(visible: boolean): void {
    this.foreground = visible;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (
      visible &&
      !this.connected &&
      this.everConnected &&
      (this.state === 'reconnecting' || this.state === 'failed')
    )
      this.showState({type: 'reconnecting'});
    this.link.setForeground(visible);
    this.wakeLock.setActive(this.connected && visible);
  }

  get connected(): boolean {
    return this.link.connected;
  }

  async connect(): Promise<void> {
    try {
      await this.link.connect();
    } catch (error) {
      this.showState({type: 'failed', reason: 'connection'});
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.noticeTimer);
    this.wakeLock.dispose();
    this.cancel();
    this.link.close();
    this.abort.abort();
    this.container.remove();
  }

  private find<T extends HTMLElement>(id: string): T {
    return this.shadow.getElementById(id) as T;
  }

  private showState(state: PhoneConnectionState): void {
    if (this.disposed) return;
    const previous = this.state;
    this.state = state.type;
    const main = this.shadow.querySelector('main')!;
    main.dataset.state = state.type;
    const connected = state.type === 'connected';
    const recoveryAction =
      state.type === 'failed' && this.everConnected && !!this.requestDisconnect;
    this.find('recovery-disconnect').hidden = !recoveryAction;
    this.container.toggleAttribute('data-recovery-action', recoveryAction);
    const stage = this.find('pairing-stage');
    stage.hidden = connected || this.everConnected;
    this.find('controls').hidden = !connected && !this.everConnected;
    this.pad.setAttribute('aria-disabled', String(!connected));
    this.find<HTMLButtonElement>('select').disabled = !connected;
    this.find<HTMLButtonElement>('center').disabled = !connected;
    this.keyboard.disabled = !connected || !this.field;
    this.find('verification').hidden = state.type !== 'verification';
    this.find('numbers-match').hidden = state.type !== 'verification';
    const help = this.find('recovery-help');
    help.hidden = true;
    if (state.type !== 'reconnecting') {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (!connected) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = undefined;
    }
    switch (state.type) {
      case 'connecting':
        this.status.textContent = 'Connecting to headset…';
        this.find('stage-title').textContent = 'Finding your headset';
        this.find('stage-help').textContent =
          'Keep the pairing screen open in your headset.';
        break;
      case 'verification':
        this.status.textContent = state.confirmed
          ? 'Waiting for Accept phone'
          : 'Confirm the number on both devices';
        this.find('stage-title').textContent = 'Check the number';
        this.find('verification').textContent =
          `${state.comparison.slice(0, 3)} ${state.comparison.slice(3)}`;
        this.find('stage-help').innerHTML =
          'Check that this number matches the headset.<br><br>If it matches, tap <strong>Numbers match</strong> here and choose <strong>Accept phone</strong> in the headset. If it does not match, choose <strong>Reject phone</strong>.';
        {
          const previous = this.find<HTMLButtonElement>('numbers-match');
          const button = previous.cloneNode(true) as HTMLButtonElement;
          button.disabled = state.confirmed;
          button.addEventListener(
            'click',
            () => {
              void this.link
                .confirmNumbers(state.id)
                .catch(() =>
                  this.showState({type: 'failed', reason: 'connection'})
                );
            },
            {signal: this.abort.signal}
          );
          previous.replaceWith(button);
        }
        break;
      case 'connected': {
        const reconnected = this.everConnected && previous !== 'connected';
        this.everConnected = true;
        if (previous !== 'connected') {
          this.status.textContent = reconnected
            ? 'Reconnected'
            : 'Connected to headset';
          if (reconnected)
            this.noticeTimer = setTimeout(() => {
              if (!this.disposed && this.state === 'connected')
                this.status.textContent = 'Connected to headset';
            }, 2500);
        }
        break;
      }
      case 'reconnecting':
        this.status.textContent = 'Connection lost. Trying to reconnect…';
        if (this.everConnected) {
          help.hidden = false;
          help.textContent =
            'Keep the headset page open and both devices online.';
        } else {
          this.find('stage-title').textContent = 'Trying to reconnect';
          this.find('stage-help').textContent =
            'Keep the headset page open and both devices online.';
        }
        if (this.foreground && !this.reconnectTimer)
          this.reconnectTimer = setTimeout(() => {
            this.showState({type: 'failed', reason: 'connection'});
          }, 20000);
        break;
      case 'failed': {
        const title =
          state.reason === 'expired'
            ? 'Pairing code expired'
            : state.reason === 'rejected'
              ? 'Pairing was declined'
              : this.everConnected
                ? 'Couldn’t reconnect'
                : 'Couldn’t connect';
        this.status.textContent = title;
        const instructions =
          'Choose Disconnect here, then Pair a different phone in the headset to get a new pairing code. Keep both devices online.';
        if (this.everConnected) {
          help.hidden = false;
          help.textContent = instructions;
        } else {
          this.find('stage-title').textContent = title;
          this.find('stage-help').textContent = instructions;
        }
        this.cancel();
        this.applyField(null);
        break;
      }
    }
  }

  private updateTypingLayout(): void {
    this.shadow
      .querySelector('main')!
      .classList.toggle('typing', this.keyboardRequested);
    this.find('typing-panel').hidden = !this.keyboardRequested;
    this.find('text-actions').hidden = !this.keyboardRequested;
  }

  private feedback(mode?: 'drag' | 'scroll' | 'zoom'): void {
    this.pad.dataset.gesture = mode ?? '';
    this.find('feedback').textContent =
      mode === 'drag'
        ? this.dragMode === 'toggle'
          ? 'Dragging · Tap Drop to release'
          : 'Dragging · Release to drop'
        : mode === 'scroll'
          ? 'Scrolling'
          : mode === 'zoom'
            ? 'Zooming'
            : '';
  }

  private beginDrag(mode: 'hold' | 'toggle'): void {
    clearTimeout(this.holdTimer);
    this.tap = undefined;
    this.dragMode = mode;
    this.find('select').textContent = 'Drop';
    this.find('select').setAttribute('aria-pressed', 'true');
    this.feedback('drag');
    this.link.send({type: 'button', down: true});
  }

  private endDrag(release = true): void {
    if (this.dragMode && release) this.link.send({type: 'button', down: false});
    this.dragMode = undefined;
    this.find('select').textContent = 'Drag';
    this.find('select').setAttribute('aria-pressed', 'false');
    this.feedback();
  }

  private receive(message: PhoneMessage): void {
    if (message.type === 'field') this.applyField(message.field);
    if (message.type === 'text') this.applyText(message.state);
    if (message.type === 'haptic' && !document.hidden) {
      try {
        navigator.vibrate?.(message.duration);
      } catch {
        /* Optional capability. */
      }
    }
  }

  private applyField(
    field: {id: number; revision: number; label: string} | null
  ): void {
    if (!field || field.id !== this.field?.id) {
      this.keyboardRequested = false;
      this.text = null;
      this.editor.blur();
      this.editor.hidden = true;
      this.editor.value = '';
    }
    this.field = field;
    if (this.text?.revision !== field?.revision) this.text = null;
    this.keyboard.disabled = !field;
    this.keyboard.hidden = !field;
    this.find('keyboard-hint').hidden = !!field;
    this.updateTypingLayout();
    this.editor.disabled = !field;
    this.keyboard.textContent = field
      ? `Open keyboard: ${field.label}`
      : 'Open keyboard';
    this.find('editor-label').textContent =
      field?.label ?? 'Headset text field';
  }

  private applyText(state: PhoneTextState | null): void {
    if (!state) {
      this.text = null;
      return;
    }
    if (!this.keyboardRequested || state.revision !== this.field?.revision)
      return;
    this.text = state;
    this.composing = false;
    this.applyingRemote = true;
    this.find('text-actions').hidden = false;
    this.find<HTMLButtonElement>('submit').disabled = false;
    this.find<HTMLButtonElement>('done').disabled = false;
    this.keyboard.textContent = `Open keyboard: ${state.label}`;
    try {
      this.editor.setAttribute('aria-label', state.label);
      this.editor.maxLength = state.maxLength;
      this.editor.value = state.value;
      this.editor.setSelectionRange(state.start, state.end);
      this.lastEdit = JSON.stringify([
        state.value,
        this.editor.selectionStart,
        this.editor.selectionEnd,
      ]);
    } finally {
      this.applyingRemote = false;
    }
  }

  private sendEdit(): void {
    if (
      !this.text ||
      !this.keyboardRequested ||
      this.applyingRemote ||
      this.composing ||
      !this.connected
    )
      return;
    const value = this.editor.value;
    if (value.length > MAX_TEXT_LENGTH) return;
    const snapshot = JSON.stringify([
      value,
      this.editor.selectionStart,
      this.editor.selectionEnd,
    ]);
    if (snapshot === this.lastEdit) return;
    this.lastEdit = snapshot;
    this.link.send({
      type: 'edit',
      revision: this.text.revision,
      value,
      start: Math.min(this.editor.selectionStart, value.length),
      end: Math.min(this.editor.selectionEnd, value.length),
    });
  }

  private submit(): void {
    this.sendEdit();
    if (this.text && !this.composing)
      this.link.send({type: 'submit', revision: this.text.revision});
  }

  private padDown = (event: PointerEvent): void => {
    if (!this.connected) return;
    event.preventDefault();
    // Return to pointing even while the phone's native editor still has focus.
    this.editor.blur();
    this.pad.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (this.pointers.size > 1) {
      this.multiTouch = true;
      clearTimeout(this.holdTimer);
      if (this.dragMode) {
        this.endDrag(false);
        this.link.send({type: 'cancel'});
      }
      this.resetGesture();
    }
    this.tap =
      !this.multiTouch && !this.dragMode
        ? {x: event.clientX, y: event.clientY, time: Date.now()}
        : undefined;
    if (this.tap)
      this.holdTimer = setTimeout(() => {
        if (this.connected && this.tap && this.pointers.size === 1)
          this.beginDrag('hold');
      }, 400);
  };

  private padMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    if (
      this.tap &&
      Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) > 8
    ) {
      this.tap = undefined;
      clearTimeout(this.holdTimer);
    }
    if (this.multiTouch) {
      if (this.gestureFrame === undefined) {
        this.gestureFrame = requestAnimationFrame(() => this.flushGesture());
      }
    } else {
      const rect = this.pad.getBoundingClientRect();
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      this.link.send({
        type: 'move',
        x: clamp(dx / Math.max(1, rect.width)),
        y: clamp(dy / Math.max(1, rect.height)),
      });
    }
  };

  private padUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.flushGesture();
    clearTimeout(this.holdTimer);
    if (!this.pointers.delete(event.pointerId)) return;
    if (
      this.tap &&
      Date.now() - this.tap.time < 350 &&
      !this.multiTouch &&
      !this.dragMode
    ) {
      this.link.send({type: 'button', down: true});
      this.link.send({type: 'button', down: false});
    }
    if (this.dragMode === 'hold') this.endDrag();
    this.tap = undefined;
    if (!this.pointers.size) this.multiTouch = false;
    this.resetGesture();
    if (!this.pointers.size && !this.dragMode) this.feedback();
  };

  private measureGesture():
    | {distance: number; x: number; y: number}
    | undefined {
    if (this.pointers.size !== 2) return undefined;
    const [a, b] = [...this.pointers.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  private resetGesture(): void {
    if (this.gestureFrame !== undefined)
      cancelAnimationFrame(this.gestureFrame);
    this.gestureFrame = undefined;
    const pair = this.measureGesture();
    this.gesture = pair
      ? {...pair, lastDistance: pair.distance, lastY: pair.y}
      : undefined;
  }

  private flushGesture(): void {
    if (this.gestureFrame !== undefined)
      cancelAnimationFrame(this.gestureFrame);
    this.gestureFrame = undefined;
    const pair = this.measureGesture();
    const gesture = this.gesture;
    if (!pair || !gesture) return;
    // Coalesce both fingers in one frame, then lock intent until a finger lifts.
    if (!gesture.mode) {
      const spread = Math.abs(pair.distance - gesture.distance);
      const travel = Math.hypot(pair.x - gesture.x, pair.y - gesture.y);
      if (gesture.distance >= 12 && spread >= 8 && spread > travel * 1.5)
        gesture.mode = 'zoom';
      else if (Math.abs(pair.y - gesture.y) >= 8) gesture.mode = 'scroll';
      else return;
    }
    if (
      gesture.mode === 'zoom' &&
      pair.distance >= 12 &&
      gesture.lastDistance >= 12
    ) {
      this.feedback('zoom');
      const factor = Math.max(
        0.25,
        Math.min(4, pair.distance / gesture.lastDistance)
      );
      if (factor !== 1) this.link.send({type: 'zoom', factor});
      gesture.lastDistance = pair.distance;
    } else if (gesture.mode === 'scroll') {
      this.feedback('scroll');
      const delta = Math.max(-1000, Math.min(1000, gesture.lastY - pair.y));
      if (delta) this.link.send({type: 'scroll', delta});
      gesture.lastY = pair.y;
    }
  }

  private cancel(): void {
    clearTimeout(this.holdTimer);
    this.pointers.clear();
    this.resetGesture();
    this.multiTouch = false;
    this.tap = undefined;
    this.dragMode = undefined;
    this.find('select').textContent = 'Drag';
    this.find('select').setAttribute('aria-pressed', 'false');
    this.feedback();
    this.link.send({type: 'cancel'});
  }
}
