import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import {
  Input,
  Options,
  UIButton,
  UICard,
  UISlider,
  UITextInput,
  Interaction,
} from 'xrblocks';
import {ScriptsManager} from '../../core/components/ScriptsManager';
import {TextInputEditor} from '../../ui/internal/TextInputEditor';
import {
  Transport,
  type TransportConnectOptions,
} from '../netblocks/src/core/transport/Transport';
import {
  PhoneCompanion,
  createPhonePairing,
  phonePairingURL,
  phonePairingFromCode,
  readPhonePairing,
} from './index';
import {PhoneControllerPage} from './phone';
import {PhoneLink} from './PhoneLink';
import {validMessage, type PhoneMessage} from './protocol';

class Wire extends Transport {
  name = 'test';
  isOpen = false;
  localPeerId = crypto.randomUUID();
  remotePeerIds = new Set<string>();
  other!: Wire;
  silent = false;
  packets: PhoneMessage[] = [];
  identity?: string;
  async connect(_options: TransportConnectOptions) {
    this.isOpen = true;
  }
  close() {
    this.isOpen = false;
    this.dispatchEvent(new Event('close'));
  }
  send(data: Uint8Array, target?: string) {
    if (
      this.silent ||
      !this.other.isOpen ||
      (target && target !== this.other.localPeerId)
    )
      return;
    const packet = JSON.parse(new TextDecoder().decode(data));
    this.identity = packet.identity;
    this.packets.push(packet.message);
    queueMicrotask(() => {
      if (this.other.isOpen) this.other.emitMessage(this.localPeerId, data);
    });
  }
  inject(
    message: unknown,
    token: string,
    peer = this.other.localPeerId,
    identity = this.other.identity
  ) {
    this.emitMessage(
      peer,
      new TextEncoder().encode(
        JSON.stringify({protocol: 'xrblocks-phone-1', token, identity, message})
      )
    );
  }
}

function wires() {
  const a = new Wire();
  const b = new Wire();
  a.other = b;
  b.other = a;
  return [a, b];
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function pointer(
  target: HTMLElement,
  type: string,
  id: number,
  x = 10,
  y = 10
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    cancelable: true,
  });
  Object.defineProperty(event, 'pointerId', {value: id});
  target.dispatchEvent(event);
}
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.useRealTimers();
});

async function setup(page = false) {
  const [hostWire, phoneWire] = wires();
  const input = new Input();
  input.options = new Options();
  const camera = new THREE.PerspectiveCamera();
  const callbacks = new ScriptsManager(async () => {});
  const interaction = new Interaction({callbacks, scene: new THREE.Scene()});
  const host = new PhoneCompanion({transport: hostWire});
  const messages: PhoneMessage[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  const phone = page
    ? new PhoneControllerPage(root, {
        pairing: host.pairing,
        transport: phoneWire,
      })
    : new PhoneLink(
        'phone',
        host.pairing,
        {transport: phoneWire},
        (m) => messages.push(m),
        () => {}
      );
  cleanup.push(() => {
    host.dispose();
    if (phone instanceof PhoneLink) phone.close();
    else phone.dispose();
    input.dispose();
    root.remove();
  });
  await Promise.all([host.init({input, camera, interaction}), phone.connect()]);
  await flush();
  const frame = () => {
    input.sampleSources();
    interaction.update(input.getFrame());
    host.update();
  };
  const send = (message: PhoneMessage) => {
    hostWire.inject(message, host.pairing.token);
  };
  return {
    host,
    phone,
    hostWire,
    phoneWire,
    input,
    camera,
    interaction,
    callbacks,
    messages,
    root,
    frame,
    send,
  };
}

describe('Phone companion production input seam', () => {
  it('applies the final slider motion when move and button-up arrive between frames', async () => {
    const s = await setup();
    const slider = new UISlider({
      ariaLabel: 'Drag',
      min: 0,
      max: 100,
      value: 50,
    });
    await s.callbacks.initScript(slider);
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.2),
      new THREE.MeshBasicMaterial()
    );
    surface.position.z = -1;
    const unregister = s.interaction.registerHitSurface(surface, slider);
    cleanup.push(() => {
      unregister();
      slider.dispose();
      surface.geometry.dispose();
      surface.material.dispose();
    });
    s.send({type: 'button', down: true});
    s.frame();
    expect(slider.value).toBeCloseTo(50);
    s.send({type: 'move', x: 0.15, y: 0});
    s.send({type: 'button', down: false});
    s.frame();
    s.frame();
    expect(slider.value).toBeGreaterThan(70);
    expect(s.host.controller.userData.selected).toBe(false);
  });
  it('routes phone touchpad taps, hold cancellation and two-finger scrolling', async () => {
    const s = await setup(true);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const pad = shadow.querySelector<HTMLElement>('#pad')!;
    const hold = shadow.querySelector<HTMLElement>('#select')!;
    pad.setPointerCapture = vi.fn();
    hold.setPointerCapture = vi.fn();
    expect(hold.textContent).toBe('Hold to move');
    expect(shadow.querySelector('#keyboard-hint')?.tagName).toBe('P');
    expect(shadow.querySelector<HTMLButtonElement>('#keyboard')?.hidden).toBe(
      true
    );
    pointer(pad, 'pointerdown', 1);
    pointer(pad, 'pointerup', 1);
    await flush();
    s.frame();
    expect(s.host.controller.userData.selected).toBe(true);
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
    pointer(hold, 'pointerdown', 2);
    await flush();
    s.frame();
    expect(s.host.controller.userData.selected).toBe(true);
    pointer(hold, 'pointercancel', 2);
    await flush();
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
    const scroll = vi.spyOn(s.interaction, 'queueWheelIntent');
    pointer(pad, 'pointerdown', 3);
    pointer(pad, 'pointerdown', 4, 110, 10);
    pointer(pad, 'pointermove', 3, 10, 30);
    pointer(pad, 'pointerup', 3);
    pointer(pad, 'pointerup', 4);
    await flush();
    s.frame();
    expect(scroll).toHaveBeenCalledWith(s.host.controller, -10);
    expect(s.host.controller.userData.selected).toBe(false);
  });

  it('pinches a UI ancestor through real scaling, without a click, scroll or residual pointer motion', async () => {
    const s = await setup(true);
    const pad = s.root
      .querySelector('section')!
      .shadowRoot!.querySelector<HTMLElement>('#pad')!;
    pad.setPointerCapture = vi.fn();
    const click = vi.fn();
    const button = new UIButton({label: 'Content', onClick: click});
    const card = new UICard({
      size: {width: 1, height: 1},
      manipulation: {actions: {scale: {minScale: 0.5, maxScale: 2}}},
      children: [button],
    });
    new THREE.Scene().add(card);
    await s.callbacks.initScript(card);
    await s.callbacks.initScript(button);
    cleanup.push(() => {
      button.dispose();
      card.dispose();
    });
    s.host.controller.userData.lastIntersection = {
      object: button,
      point: new THREE.Vector3(0, 0, -1),
      distance: 1,
    };
    const scroll = vi.spyOn(s.interaction, 'queueWheelIntent');
    const movesBefore = s.phoneWire.packets.filter(
      (m) => m.type === 'move'
    ).length;
    pointer(pad, 'pointerdown', 1, 100, 100);
    pointer(pad, 'pointerdown', 2, 200, 100);
    pointer(pad, 'pointermove', 1, 75, 100);
    pointer(pad, 'pointermove', 2, 225, 100);
    pointer(pad, 'pointerup', 1, 75, 100);
    pointer(pad, 'pointermove', 2, 250, 100);
    pointer(pad, 'pointerup', 2, 250, 100);
    await flush();
    s.frame();
    expect(card.scale.x).toBeCloseTo(1.5);
    expect(scroll).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(s.phoneWire.packets.filter((m) => m.type === 'move')).toHaveLength(
      movesBefore
    );
    s.send({type: 'zoom', factor: 4});
    s.frame();
    expect(card.scale.x).toBe(2);
    s.send({type: 'zoom', factor: 0.25});
    s.frame();
    expect(card.scale.x).toBe(0.5);
    s.send({type: 'zoom', factor: 0.25});
    s.frame();
    expect(card.scale.x).toBe(0.5);
    card.xb!.interactionEnabled = false;
    s.send({type: 'zoom', factor: 2});
    s.frame();
    expect(card.scale.x).toBe(0.5);
    card.xb!.interactionEnabled = true;
    pointer(pad, 'pointerdown', 3, 100, 100);
    pointer(pad, 'pointerdown', 4, 200, 100);
    pointer(pad, 'pointermove', 4, 250, 100);
    pointer(pad, 'pointercancel', 4, 250, 100);
    await flush();
    s.frame();
    expect(card.scale.x).toBe(0.5);
  });

  it('pairs, points with head pose, preserves a fast tap, activates a real button and owns its reticle', async () => {
    const s = await setup();
    expect(s.host.connected).toBe(true);
    expect(s.host.controller.gamepad).toBeUndefined();
    expect(s.host.controller.reticle).toBeDefined();
    const clicked = vi.fn();
    const button = new UIButton({label: 'Phone', onClick: clicked});
    await s.callbacks.initScript(button);
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.1),
      new THREE.MeshBasicMaterial()
    );
    surface.position.z = -1;
    const unregister = s.interaction.registerHitSurface(surface, button);
    cleanup.push(() => {
      unregister();
      surface.geometry.dispose();
      surface.material.dispose();
      button.dispose();
    });
    s.send({type: 'button', down: true});
    s.send({type: 'button', down: false});
    s.frame();
    expect(s.interaction.isSelectingAt(button)).toBe(true);
    s.frame();
    expect(clicked).toHaveBeenCalledOnce();
    s.send({type: 'move', x: 0.1, y: 0.2});
    s.frame();
    expect(s.input.getFrame().raySources[0].ray.direction.x).toBeGreaterThan(0);
    expect(s.input.getFrame().raySources[0].ray.direction.y).toBeLessThan(0);
    s.send({type: 'center'});
    s.camera.rotation.y = 0.4;
    s.camera.position.set(1, 2, 3);
    s.frame();
    const ray = s.input.getFrame().raySources[0].ray;
    expect(ray.origin.toArray()).toEqual([1, 2, 3]);
    expect(ray.direction.x).toBeCloseTo(-Math.sin(0.4));
    const reticle = s.host.controller.reticle!;
    const dispose = vi.spyOn(reticle, 'dispose');
    s.host.dispose();
    s.host.dispose();
    expect(s.input.controllers).not.toContain(s.host.controller);
    expect(reticle.parent).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('ignores invalid or foreign packets and cancels a held selection on disconnect without activating', async () => {
    const s = await setup();
    const clicked = vi.fn();
    const button = new UIButton({label: 'Phone', onClick: clicked});
    await s.callbacks.initScript(button);
    s.host.controller.userData.lastIntersection = {
      object: button,
      point: new THREE.Vector3(0, 0, -1),
      distance: 1,
    };
    s.hostWire.inject({type: 'button', down: true}, 'wrong');
    s.hostWire.inject(
      {type: 'button', down: true},
      s.host.pairing.token,
      'other-peer'
    );
    s.hostWire.inject({type: 'move', x: 'bad', y: 1}, s.host.pairing.token);
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
    s.send({type: 'button', down: true});
    s.frame();
    expect(s.interaction.isSelectingAt(button)).toBe(true);
    (s.phone as PhoneLink).close();
    await flush();
    s.frame();
    expect(s.host.connected).toBe(false);
    expect(s.interaction.isSelectingAt(button)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
    expect(s.input.getFrame().raySources).toHaveLength(0);
  });

  it('times out a silent phone and drops queued presses', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'Date']});
    const s = await setup();
    s.send({type: 'button', down: true});
    s.frame();
    s.phoneWire.silent = true;
    await vi.advanceTimersByTimeAsync(6001);
    s.frame();
    expect(s.host.connected).toBe(false);
    expect(s.host.controller.userData.selected).toBe(false);
    s.phoneWire.silent = false;
    await vi.advanceTimersByTimeAsync(1001);
    expect(s.host.connected).toBe(true);
    expect(s.host.controller.userData.selected).toBe(false);
  });

  it('edits native-backed fields with Unicode, selection, limits, submit and stale-field protection', async () => {
    const s = await setup();
    const onInput = vi.fn();
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const field = new UITextInput({
      ariaLabel: 'Note',
      maxLength: 8,
      onInput,
      onSubmit,
      onChange,
    });
    const editor = new TextInputEditor(field, {
      isReady: () => true,
      caretAtPoint: () => undefined,
    });
    cleanup.push(() => editor.dispose());
    field.focus();
    s.host.input = field;
    s.host.update();
    await flush();
    const text = s.messages.filter((m) => m.type === 'text').at(-1)!;
    expect(text.state?.label).toBe('Note');
    expect(field.nativeKeyboardSuppressed).toBe(true);
    const revision = text.state!.revision;
    s.send({type: 'edit', revision, value: '你好🙂', start: 4, end: 4});
    s.send({type: 'edit', revision, value: '你好🙂abc', start: 4, end: 7});
    expect(field.value).toBe('你好🙂abc');
    expect(field.selectionEnd).toBe(7);
    expect(onInput).toHaveBeenCalledTimes(2);
    s.send({type: 'submit', revision});
    expect(onSubmit).toHaveBeenCalledWith('你好🙂abc');
    s.send({type: 'edit', revision, value: '0123456789', start: 10, end: 10});
    expect(field.value).toBe('01234567');
    s.send({type: 'edit', revision, value: 'stale', start: 5, end: 5});
    expect(field.value).toBe('01234567');
    field.blur();
    s.host.update();
    expect(onChange).toHaveBeenCalledWith('01234567');
    expect(field.nativeKeyboardSuppressed).toBe(false);
    s.send({type: 'edit', revision, value: 'late', start: 4, end: 4});
    expect(field.value).toBe('01234567');
  });

  it('mounts the phone DOM, commits composition only on completion and handles optional vibration', async () => {
    const s = await setup(true);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const editor = shadow.querySelector('textarea')!;
    const field = new UITextInput({ariaLabel: 'Native phone', multiline: true});
    const native = new TextInputEditor(field, {
      isReady: () => true,
      caretAtPoint: () => undefined,
    });
    cleanup.push(() => native.dispose());
    field.focus();
    s.host.input = field;
    await flush();
    editor.dispatchEvent(new CompositionEvent('compositionstart'));
    editor.value = '你好🙂';
    editor.setSelectionRange(4, 4);
    editor.dispatchEvent(new InputEvent('input'));
    await flush();
    expect(field.value).toBe('');
    editor.dispatchEvent(new CompositionEvent('compositionend'));
    await flush();
    expect(field.value).toBe('你好🙂');
    expect(editor.value).toBe('你好🙂');
    s.host.pulse(500);
    await flush(); // No vibration API in jsdom is supported.
    expect(s.hostWire.packets).toContainEqual({type: 'haptic', duration: 200});
    (s.phone as PhoneControllerPage).dispose();
    await flush();
    expect(s.host.connected).toBe(false);
    expect(s.root.children).toHaveLength(0);
    expect(field.nativeKeyboardSuppressed).toBe(false);
  });
});

describe('Pairing protocol', () => {
  it('derives the same pairing from a typed code and preserves custom room/token links', () => {
    const pairing = phonePairingFromCode('k7 q2');
    expect(pairing.code).toBe('K7Q2');
    expect(phonePairingFromCode('K7-Q2')).toEqual(pairing);
    expect(createPhonePairing().code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    for (const code of ['', 'ABC', 'ABCD1', 'ABC1', 'ABCI', 'ABC!']) {
      expect(() => phonePairingFromCode(code)).toThrow('4-character');
    }
    const custom = {roomId: 'custom-room', token: 'custom-token'};
    expect(
      readPhonePairing(
        phonePairingURL('https://example.com/phone.html', custom)
      )
    ).toEqual(custom);
    expect(() =>
      phonePairingURL('https://example.com/phone.html', {
        ...custom,
        code: pairing.code,
      })
    ).toThrow('does not match');
  });
  it('locks to the first phone instance even when another holder of the URL reuses its transport slot', async () => {
    const s = await setup();
    const originalIdentity = s.phoneWire.identity;
    (s.phone as PhoneLink).close();
    await flush();
    expect(s.host.connected).toBe(false);
    const replacement = new Wire();
    replacement.localPeerId = s.phoneWire.localPeerId;
    replacement.other = s.hostWire;
    s.hostWire.other = replacement;
    const otherPhone = new PhoneLink(
      'phone',
      s.host.pairing,
      {transport: replacement},
      () => {},
      () => {}
    );
    cleanup.push(() => otherPhone.close());
    await otherPhone.connect();
    await flush();
    expect(replacement.identity).not.toBe(originalIdentity);
    expect(s.host.connected).toBe(false);
    s.send({type: 'button', down: true});
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
  });
  it('round-trips credentials through a URL fragment and rejects malformed text states', () => {
    const pairing = createPhonePairing();
    const url = phonePairingURL(
      'https://example.com/phone.html?local=1',
      pairing
    );
    expect(readPhonePairing(url)).toEqual(pairing);
    expect(new URL(url).search).toBe('?local=1');
    expect(() => readPhonePairing('https://example.com/')).toThrow();
    expect(
      validMessage({
        type: 'text',
        state: {type: 'ping', label: '', multiline: true, maxLength: 5},
      })
    ).toBe(false);
    expect(
      validMessage({type: 'edit', revision: 1, value: 'a', start: 1, end: 0})
    ).toBe(false);
    for (const factor of [0, -1, 5, Infinity, NaN]) {
      expect(validMessage({type: 'zoom', factor})).toBe(false);
    }
  });

  it('cleans up a late connection after disposal and rejects reuse', async () => {
    const [transport] = wires();
    let resolve!: () => void;
    transport.connect = () =>
      new Promise<void>((done) => {
        resolve = () => {
          transport.isOpen = true;
          done();
        };
      });
    const link = new PhoneLink(
      'host',
      createPhonePairing(),
      {transport},
      () => {},
      () => {}
    );
    const pending = link.connect();
    link.close();
    resolve();
    await pending;
    expect(transport.isOpen).toBe(false);
    await expect(link.connect()).rejects.toThrow('single-use');
  });
});
