import {
  PhoneLink,
  readPhonePairing,
  type PhoneConnectionOptions,
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
  private selectPointer?: number;
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

  constructor(root: HTMLElement, options: PhoneControllerPageOptions = {}) {
    const pairing = options.pairing ?? readPhonePairing(location.href);
    this.shadow.innerHTML = `
      <style>
        :host { display:block; color:#f4f6fa; font:16px system-ui,sans-serif; }
        * { box-sizing:border-box; }
        main { max-width:620px; margin:auto; padding:16px; }
        h1 { font-size:24px; margin:0 0 8px; }
        p { line-height:1.5; }
        #pad { height:38dvh; min-height:180px; border:2px solid #7faeff;
          border-radius:24px; background:#15243c; display:grid; place-content:center;
          text-align:center; touch-action:none; user-select:none; }
        .row { display:flex; gap:12px; margin:12px 0; }
        button { flex:1; min-height:52px; border:0; border-radius:12px;
          background:#a7c7ff; color:#10213b; font:inherit; touch-action:none; }
        button:disabled { opacity:.45; }
        textarea { width:100%; min-height:100px; font:18px system-ui;
          border-radius:12px; padding:12px; background:#fff; color:#111; }
        [hidden] { display:none; }
      </style>
      <main>
        <h1>XR Blocks · Phone controller</h1>
        <p id="status" role="status">Connecting…</p>
        <div id="pad" aria-label="Pointer touchpad">Slide to point · Tap to select<br>Pinch to zoom</div>
        <p>Two-finger swipe to scroll.</p>
        <div class="row"><button id="select" disabled>Hold to move</button><button id="center" disabled>Recenter</button></div>
        <p id="keyboard-hint">Select a text field in the headset to type.</p>
        <button id="keyboard" hidden disabled>Open keyboard</button>
        <textarea id="editor" aria-label="Headset text field" hidden disabled></textarea>
        <div id="text-actions" class="row" hidden><button id="submit" disabled>Submit</button><button id="done" disabled>Done</button></div>
        <p>Look toward your target, then slide to adjust the pointer. Keep this page open.</p>
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
          this.status.textContent = message;
          options.onStatus?.(message);
        },
      },
      (message) => this.receive(message),
      (connected) => {
        this.wakeLock.setActive(connected && !document.hidden);
        this.cancel();
        this.applyField(null);
        this.status.textContent = connected
          ? 'Connected to headset'
          : 'Waiting for headset…';
        this.find<HTMLButtonElement>('select').disabled = !connected;
        this.find<HTMLButtonElement>('center').disabled = !connected;
      }
    );
    const signal = this.abort.signal;
    this.pad.addEventListener('pointerdown', this.padDown, {signal});
    this.pad.addEventListener('pointermove', this.padMove, {signal});
    this.pad.addEventListener('pointerup', this.padUp, {signal});
    this.pad.addEventListener('pointercancel', () => this.cancel(), {signal});
    this.pad.addEventListener(
      'lostpointercapture',
      (event) => {
        if (this.pointers.has(event.pointerId)) this.cancel();
      },
      {signal}
    );
    const select = this.find<HTMLButtonElement>('select');
    select.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !this.connected ||
          this.selectPointer !== undefined ||
          this.multiTouch
        )
          return;
        event.preventDefault();
        this.tap = undefined;
        this.selectPointer = event.pointerId;
        select.setPointerCapture(event.pointerId);
        this.link.send({type: 'button', down: true});
      },
      {signal}
    );
    select.addEventListener(
      'pointerup',
      (event) => {
        if (this.selectPointer !== event.pointerId) return;
        this.selectPointer = undefined;
        this.link.send({type: 'button', down: false});
      },
      {signal}
    );
    for (const type of ['pointercancel', 'lostpointercapture']) {
      select.addEventListener(
        type,
        () => {
          if (this.selectPointer !== undefined) this.cancel();
        },
        {signal}
      );
    }
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
        this.container.scrollIntoView({block: 'start'});
      },
      {signal}
    );
    window.addEventListener('blur', () => this.cancel(), {signal});
    window.addEventListener(
      'pagehide',
      (event) => {
        if (event.persisted) {
          this.cancel();
          this.link.setForeground(false);
          this.wakeLock.setActive(false);
        } else this.dispose();
      },
      {signal}
    );
    window.addEventListener(
      'pageshow',
      () => this.link.setForeground(!document.hidden),
      {signal}
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.cancel();
        this.link.setForeground(!document.hidden);
        this.wakeLock.setActive(this.connected && !document.hidden);
      },
      {signal}
    );
  }

  get connected(): boolean {
    return this.link.connected;
  }

  async connect(): Promise<void> {
    try {
      await this.link.connect();
      if (!this.connected && !this.disposed) {
        this.status.textContent =
          'Waiting for headset… Keep its browser page open.';
      }
    } catch (error) {
      this.status.textContent = 'Connection failed. Reload to try again.';
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.wakeLock.dispose();
    this.cancel();
    this.link.close();
    this.abort.abort();
    this.container.remove();
  }

  private find<T extends HTMLElement>(id: string): T {
    return this.shadow.getElementById(id) as T;
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
    this.find('text-actions').hidden = !this.keyboardRequested;
    this.editor.disabled = !field;
    this.keyboard.textContent = field
      ? `Type: ${field.label}`
      : 'Open keyboard';
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
    this.keyboard.textContent = `Type: ${state.label}`;
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
      if (this.selectPointer !== undefined) {
        this.selectPointer = undefined;
        this.link.send({type: 'cancel'});
      }
      this.resetGesture();
    }
    this.tap =
      !this.multiTouch && this.selectPointer === undefined
        ? {x: event.clientX, y: event.clientY, time: Date.now()}
        : undefined;
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
    if (!this.pointers.delete(event.pointerId)) return;
    if (
      this.tap &&
      Date.now() - this.tap.time < 350 &&
      !this.multiTouch &&
      this.selectPointer === undefined
    ) {
      this.link.send({type: 'button', down: true});
      this.link.send({type: 'button', down: false});
    }
    this.tap = undefined;
    if (!this.pointers.size) this.multiTouch = false;
    this.resetGesture();
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
      const factor = Math.max(
        0.25,
        Math.min(4, pair.distance / gesture.lastDistance)
      );
      if (factor !== 1) this.link.send({type: 'zoom', factor});
      gesture.lastDistance = pair.distance;
    } else if (gesture.mode === 'scroll') {
      const delta = Math.max(-1000, Math.min(1000, gesture.lastY - pair.y));
      if (delta) this.link.send({type: 'scroll', delta});
      gesture.lastY = pair.y;
    }
  }

  private cancel(): void {
    this.pointers.clear();
    this.resetGesture();
    this.multiTouch = false;
    this.tap = undefined;
    this.selectPointer = undefined;
    this.link.send({type: 'cancel'});
  }
}
