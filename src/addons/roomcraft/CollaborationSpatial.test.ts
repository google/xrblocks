import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Roomcraft} from './Roomcraft';
import {AIOptions} from '../../ai/AIOptions';
import {
  UIElement,
  getUIRevision,
  getUIStructureRevision,
} from '../../ui/UIElement';
import {UIButton} from '../../ui/components/UIButton';
import {UIText} from '../../ui/components/UIText';

// @ts-expect-error The browser demo is a JavaScript consumer.
import {RoomcraftConsole} from '../../../demos/roomcraft/main.js';
// @ts-expect-error The optional browser view is a JavaScript consumer.
import {CollaborationSpatialView} from '../../../demos/roomcraft/CollaborationSpatial.js';
// @ts-expect-error The handcrafted layouts are JavaScript data.
import {STARTER_SCENES} from '../../../demos/roomcraft/scenes.js';

const {mockCore} = vi.hoisted(() => ({
  mockCore: {
    interaction: {cancelObject: vi.fn()},
    ai: {options: undefined, isAvailable: () => false},
    sound: {
      soundSynthesizer: {playTone: vi.fn()},
      categoryVolumes: {getEffectiveVolume: () => 0},
    },
  },
}));

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../ai/AI')),
  ...(await import('../../ai/Gemini')),
  ...(await import('../../world/World')),
  ...(await import('../../interaction/Interaction')),
  ...(await import('../../utils/ThreeDisposal')),
  ...(await import('../../utils/ObjectPlacement')),
  ...(await import('../../utils/ModelLoader')),
  ...(await import('../../ui/components/UICard')),
  ...(await import('../../ui/components/UIButton')),
  ...(await import('../../ui/components/UIText')),
  ...(await import('../../ui/components/UIPanel')),
  core: mockCore,
  user: {height: 1.5},
  getUrlParameter: () => null,
}));

function participant(id: number, local = false) {
  return {
    id: `peer-${id}`,
    name: `Person ${id}`,
    local,
    color: 0x9db8a6,
    selection: '',
    micOn: false,
    mutedForMe: false,
  };
}

function initialState() {
  return {
    applied: {
      room: 'workshop',
      roomId: 'roomcraft-workshop',
      transport: 'broadcast',
      relay: '',
      name: 'Applied name',
    },
    draft: {
      name: 'Draft name',
      transport: 'websocket',
      relay: 'ws://localhost:3000',
    },
    draftDirty: true,
    transportLabel: 'Same-browser tabs',
    transportHelp: 'Use a relay for a shared WebSocket room.',
    status: 'ready',
    statusText: 'Connected to the workshop',
    error: '',
    pending: 0,
    joining: false,
    connected: true,
    roomBusy: false,
    controls: {
      resetDisabled: false,
      settingsDisabled: false,
      connectDisabled: false,
      retryDisabled: false,
      disconnectDisabled: false,
    },
    microphone: {
      transmitting: false,
      enabled: false,
      pending: false,
      disabled: false,
      label: 'Unmute my mic',
      statusText: 'Room mic off. Gemini Talk is separate.',
      error: '',
    },
    listening: {muted: false, disabled: false},
    participants: [participant(0, true), participant(1)],
  };
}

type State = ReturnType<typeof initialState>;

class Controller {
  state = initialState();
  listeners = new Set<(state: State) => void>();
  busy = false;
  getState = () => this.state;
  subscribe = (listener: (state: State) => void) => {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  };
  setDraft = vi.fn((field: keyof State['draft'], value: string) => {
    this.state.draft[field] = value;
    this.emit();
  });
  reconnect = vi.fn();
  resetDraft = vi.fn(() => {
    this.state.draft = {
      name: this.state.applied.name,
      transport: this.state.applied.transport,
      relay: this.state.applied.relay,
    };
    this.state.draftDirty = false;
    this.state.controls.resetDisabled = true;
    this.emit();
  });
  retry = vi.fn();
  leave = vi.fn();
  toggleVoice = vi.fn();
  togglePlayback = vi.fn();
  togglePeerPlayback = vi.fn();
  dispose = vi.fn();
  emit() {
    for (const listener of this.listeners) listener(this.state);
  }
}

const html = readFileSync('demos/roomcraft/index.html', 'utf8');
let room: Roomcraft;
let host: InstanceType<typeof RoomcraftConsole>;
let view: InstanceType<typeof CollaborationSpatialView> | undefined;
let controller: Controller;

async function setup(virtual = false) {
  host?.dispose();
  room?.dispose();
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  room = new Roomcraft();
  host = new RoomcraftConsole(room, {virtual});
  host.init();
  await host.start();
}

function attach() {
  host.collaboration = controller;
  view = new CollaborationSpatialView(host, controller);
  controller.dispose.mockImplementation(() => view?.dispose());
  return view;
}

function control(id: string): UIButton {
  const button = view.controls.get(id);
  expect(button).toBeInstanceOf(UIButton);
  return button;
}

function activate(id: string) {
  control(id).onClick?.();
}

function uiElements(root: THREE.Object3D): UIElement[] {
  const elements: UIElement[] = [];
  root.traverse((element) => {
    if (element instanceof UIElement) elements.push(element);
  });
  return elements;
}

function revisions(root: THREE.Object3D) {
  return uiElements(root).map((element) => [
    element,
    getUIRevision(element),
    getUIStructureRevision(element),
  ]);
}

function fixedHeight(element: UIElement): number {
  if (element.style.display === 'none') return 0;
  if (typeof element.style.height === 'number') return element.style.height;
  const children = element.children.filter(
    (child): child is UIElement =>
      child instanceof UIElement && child.style.display !== 'none'
  );
  return (
    children.reduce((height, child) => height + fixedHeight(child), 0) +
    Math.max(0, children.length - 1) * (element.style.gap ?? 0)
  );
}

beforeEach(async () => {
  view = undefined;
  controller = new Controller();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  camera.position.set(0, 1.5, 2);
  Object.assign(mockCore, {
    camera,
    renderer: {xr: {isPresenting: false, getReferenceSpace: () => ({})}},
  });
  Object.assign(mockCore.ai, {options: new AIOptions()});
  vi.stubGlobal('matchMedia', () =>
    Object.assign(new EventTarget(), {matches: false})
  );
  await setup();
});

afterEach(() => {
  view?.dispose();
  host.dispose();
  room.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Roomcraft collaboration spatial view', () => {
  it.each([false, true])(
    'mounts only on attachment and preserves the author/example studio (virtual=%s)',
    async (virtual) => {
      await setup(virtual);
      const card = host.card;
      const author = host.xrAuthorPanel;
      const examples = host.xrExamplesPanel;
      const keyboard = host.xrKeyboard;
      const size = {...card.size};
      expect(host.xrTabs.children).toHaveLength(2);
      expect(host.xrCollaborationPanel).toBeUndefined();
      host.setSpatialTab('collaboration');
      expect(host.spatialTab).toBe('author');
      attach();
      expect(host.xrTabs.children).toHaveLength(3);
      expect(view.panel.parent).toBe(host.xrBody);
      expect(view.panel.style.display).toBe('none');
      expect(host.card).toBe(card);
      expect(card.size).toEqual(size);
      expect(host.xrKeyboard).toBe(keyboard);
      activate('tab');
      expect(host.spatialTab).toBe('collaboration');
      expect(host.xrAuthorContext.style.display).toBe('none');
      expect(host.xrFooter.style.display).toBe('none');
      expect(author.style.display).toBe('none');
      expect(examples.style.display).toBe('none');
      expect(view.panel.style.display).toBe('flex');
      view.dispose();
      expect(host.xrTabs.children).toHaveLength(2);
      expect(host.spatialTab).toBe('author');
      expect(host.xrAuthorContext.style.display).toBe('flex');
      expect(host.xrFooter.style.display).toBe('flex');
      expect(author.parent).toBe(host.xrBody);
      host.setSpatialTab('examples');
      expect(examples.style.display).toBe('flex');
      expect(host.card).toBe(card);
    }
  );

  it('shows applied identity separately from draft settings and calls controller actions', () => {
    attach();
    expect(view.roomText.text).toContain('workshop');
    expect(view.transportText.text).toContain('Same-browser tabs');
    expect(view.nameText.text).toBe('Applied name: Applied name');
    expect(control('name').label).toContain('Draft name');
    expect(view.statusText.text).toBe(controller.state.statusText);
    activate('connect');
    activate('retry');
    activate('disconnect');
    activate('microphone');
    activate('listening');
    activate('peer:peer-1');
    expect(controller.reconnect).toHaveBeenCalledTimes(1);
    expect(controller.retry).toHaveBeenCalledTimes(1);
    expect(controller.leave).toHaveBeenCalledTimes(1);
    expect(controller.toggleVoice).toHaveBeenCalledTimes(1);
    expect(controller.togglePlayback).toHaveBeenCalledTimes(1);
    expect(controller.togglePeerPlayback).toHaveBeenCalledWith('peer-1');
    expect(view.controls.has('peer:peer-0')).toBe(false);
    expect(controller.togglePeerPlayback).toHaveBeenCalledTimes(1);
    activate('settings');
    activate('transport:webrtc');
    expect(controller.setDraft).toHaveBeenCalledWith('transport', 'webrtc');
    expect(view.transportText.text).toContain('Same-browser tabs');
    expect(control('relay').disabled).toBe(true);
    expect(host.xrProviderText.text).toContain('Gemini');
  });

  it('declares column flow for stacked controls rather than relying on panel defaults', () => {
    attach();
    for (const panel of [
      view.appliedPanel,
      view.roster,
      view.peoplePanel,
      view.settingsPanel,
    ]) {
      expect(panel.style.flexDirection).toBe('column');
    }
    expect(view.participantRows.get('peer-1').panel.children[0]).toMatchObject({
      style: {flexDirection: 'column'},
    });
  });

  it('cancels held keyboard captures before changing their settings/authoring route', () => {
    attach();
    const routes: Array<string | undefined> = [];
    mockCore.interaction.cancelObject.mockImplementation((object, reason) => {
      expect(object).toBe(host.keyboardCard);
      expect(reason).toBe('disabled');
      routes.push(host.settingsKeyboard?.field);
    });
    activate('name');
    expect(routes.at(-1)).toBeUndefined();
    host.closeSettingsKeyboard();
    expect(routes.at(-1)).toBe('name');
  });

  it('discards shared edits and updates the settings keyboard without touching authoring', () => {
    attach();
    host.setPrompt('authoring stays here');
    activate('name');
    expect(host.settingsKeyboard.field).toBe('name');
    expect(control('settings').label).toContain('unapplied');
    expect(control('reset').label).toBe('Discard changes');
    expect(control('reset').ariaLabel).toBe('Discard changes');
    activate('reset');
    expect(controller.resetDraft).toHaveBeenCalledOnce();
    expect(host.xrKeyboard.value).toBe(controller.state.applied.name);
    expect(host.promptValue).toBe('authoring stays here');
    expect(control('reset').disabled).toBe(true);
    expect(control('settings').label).toBe('Connection settings');
    expect(controller.reconnect).not.toHaveBeenCalled();
    expect(controller.toggleVoice).not.toHaveBeenCalled();
  });

  it('renders pending, errors, microphone and separate incoming listening state', () => {
    attach();
    Object.assign(controller.state, {
      status: 'error',
      error: 'Relay refused',
      joining: true,
      pending: 2,
    });
    Object.assign(controller.state.controls, {
      settingsDisabled: true,
      connectDisabled: true,
      retryDisabled: true,
      disconnectDisabled: true,
    });
    Object.assign(controller.state.microphone, {
      pending: true,
      label: 'Cancel mic request',
      disabled: true,
      error: 'Microphone denied',
    });
    Object.assign(controller.state.listening, {muted: true, disabled: true});
    controller.emit();
    expect(view.errorText.text).toContain('Relay refused');
    expect(view.errorText.text).toContain('Microphone denied');
    expect(view.errorText.style.display).toBe('flex');
    expect(control('connect').label).toBe('Apply & reconnect');
    expect(control('microphone').label).toBe('Cancel mic request');
    expect(control('listening').label).toBe('Unmute everyone for me');
    for (const id of [
      'connect',
      'retry',
      'disconnect',
      'microphone',
      'listening',
      'name',
      'transport:webrtc',
    ]) {
      expect(control(id).disabled).toBe(true);
      activate(id);
    }
    expect(controller.reconnect).not.toHaveBeenCalled();
    expect(controller.toggleVoice).not.toHaveBeenCalled();
    expect(controller.togglePlayback).not.toHaveBeenCalled();
    Object.assign(controller.state.microphone, {
      pending: false,
      disabled: false,
      transmitting: true,
      label: 'Mute my mic',
    });
    controller.state.participants[1].micOn = true;
    controller.state.participants[1].mutedForMe = true;
    controller.emit();
    expect(control('microphone').label).toBe('Mute my mic');
    expect(control('peer:peer-1').label).toBe('Unmute for me');
    expect(view.participantRows.get('peer-1').detail.text).toContain('Mic on');
  });

  it('keeps settings editable during a pending connection when the shared model permits it', () => {
    attach();
    controller.state.pending = 2;
    controller.state.joining = true;
    controller.emit();
    expect(control('name').disabled).toBe(false);
    expect(control('relay').disabled).toBe(false);
    expect(control('transport:webrtc').disabled).toBe(false);
  });

  it('paginates keyed participants, clamps a shortened roster and removes callbacks for departures', () => {
    controller.state.participants = Array.from({length: 11}, (_, i) =>
      participant(i, i === 0)
    );
    attach();
    const first = view.participantRows.get('peer-1');
    const allRows = [...view.participantRows.values()];
    const visibleRows = () =>
      allRows.filter((entry) => entry.panel.style.display === 'flex');
    expect(visibleRows()).toHaveLength(2);
    expect(view.pageText.text).toBe('1/5 (10 peers)');
    activate('next');
    expect(view.pageText.text).toBe('2/5 (10 peers)');
    expect(first.panel.style.display).toBe('none');
    expect(visibleRows()).toHaveLength(2);
    activate('previous');
    expect(view.participantRows.get('peer-1')).toBe(first);
    expect(first.panel.style.display).toBe('flex');
    activate('next');
    activate('next');
    activate('next');
    activate('next');
    expect(visibleRows()).toHaveLength(2);
    expect(control('next').disabled).toBe(true);
    controller.state.participants = controller.state.participants.slice(0, 2);
    controller.emit();
    expect(view.pageText.text).toBe('1/1 (1 peer)');
    expect(view.participantRows.get('peer-1')).toBe(first);
    expect(allRows[2].panel.parent).toBeNull();
    expect(allRows[2].toggle.onClick).toBeUndefined();
  });

  it('keeps my microphone separate from the remote roster and shows errors once', () => {
    controller.state.participants = [participant(0, true)];
    controller.state.error = 'Relay refused';
    controller.state.microphone.error = 'Relay refused';
    attach();
    expect(view.participantRows.size).toBe(0);
    expect(view.emptyText.style.display).toBe('flex');
    expect(view.pageText.text).toBe('Just you');
    expect(control('microphone').label).toBe(controller.state.microphone.label);
    expect(view.statusText.text).toBe('Connection needs attention');
    expect(view.errorText.text).toBe('Relay refused');
    expect(view.microphoneStatus.text).not.toContain('Relay refused');
    expect(control('microphone').style.fontSize).toBe(30);
  });

  it.each([false, true])(
    'fits every page in the existing fixed card even with errors and long strings (virtual=%s)',
    async (virtual) => {
      await setup(virtual);
      controller.state.error = 'An error with a very long explanation. '.repeat(
        40
      );
      controller.state.applied.name = 'Long name '.repeat(80);
      controller.state.participants = Array.from({length: 20}, (_, i) => ({
        ...participant(i),
        name: 'A long participant name '.repeat(80),
        selection: 'A long object name '.repeat(80),
      }));
      attach();
      activate('tab');
      for (const section of ['people', 'settings']) {
        activate(section);
        const used = fixedHeight(view.panel);
        expect(used).toBeLessThanOrEqual(800);
        const cardSpace = host.studioSize.height / host.card.pixelSize;
        // Card padding, header, tabs, their two gaps, and the active body.
        expect(52 + 56 + 64 + 28 + used).toBeLessThanOrEqual(cardSpace);
        expect(view.panel.style.overflow).toBe('hidden');
      }
    }
  );

  it('does no label, disabled, style or tree writes for unchanged view snapshots', () => {
    attach();
    const before = revisions(host);
    const labels = vi.spyOn(UIButton.prototype, 'label', 'set');
    const disabled = vi.spyOn(UIButton.prototype, 'disabled', 'set');
    const texts = vi.spyOn(UIText.prototype, 'text', 'set');
    const children = [...view.panel.children];
    const styles = uiElements(host).map((element) => {
      const style = element.style;
      const write = vi.fn((target, key, value) =>
        Reflect.set(target, key, value)
      );
      Object.defineProperty(element, 'style', {
        configurable: true,
        value: new Proxy(style, {set: write}),
      });
      return write;
    });
    controller.emit();
    controller.emit();
    host.refresh();
    host.update(0);
    expect(labels).not.toHaveBeenCalled();
    expect(disabled).not.toHaveBeenCalled();
    expect(texts).not.toHaveBeenCalled();
    expect(styles.every((write) => write.mock.calls.length === 0)).toBe(true);
    expect(view.panel.children).toEqual(children);
    expect(revisions(host)).toEqual(before);
  });

  it('unsubscribes and unhooks only its own UI, including an active settings keyboard', () => {
    attach();
    activate('settings');
    activate('name');
    const panel = view.panel;
    const buttons = [...view.controls.values()] as UIButton[];
    const capturedAction = control('connect').onClick;
    expect(controller.listeners.size).toBe(1);
    expect(host.settingsKeyboard).not.toBeNull();
    view.dispose();
    view.dispose();
    controller.emit();
    capturedAction?.();
    expect(controller.reconnect).not.toHaveBeenCalled();
    expect(controller.listeners.size).toBe(0);
    expect(panel.parent).toBeNull();
    expect(buttons.every((button) => !button.onClick)).toBe(true);
    expect(host.settingsKeyboard).toBeNull();
    expect(host.xrKeyboard.onSubmit).toBeTypeOf('function');
    expect(host.card.parent).toBe(host);
  });
});

describe('Roomcraft settings keyboard routing', () => {
  it.each(['name', 'relay'] as const)(
    'mirrors external %s draft edits only into the active settings buffer',
    (field) => {
      host.setPrompt('Untouched author draft');
      const prompt = host.dom.prompt as HTMLTextAreaElement;
      prompt.setSelectionRange(3, 8, 'backward');
      attach();
      activate('settings');
      activate(field);
      const generate = vi.spyOn(host, 'generate');
      const setPrompt = vi.spyOn(host, 'setPrompt');
      const setValue = vi.spyOn(host.xrKeyboard, 'setValue');
      const otherField = field === 'name' ? 'relay' : 'name';
      const previous = host.xrKeyboard.value;
      controller.setDraft(otherField, 'Other field edited in the DOM');
      expect(host.xrKeyboard.value).toBe(previous);
      expect(setValue).not.toHaveBeenCalled();
      controller.setDraft(field, 'Edited in the DOM');
      expect(host.xrKeyboard.value).toBe('Edited in the DOM');
      expect(setValue).toHaveBeenCalledExactlyOnceWith('Edited in the DOM');
      controller.emit();
      expect(setValue).toHaveBeenCalledTimes(1);
      host.xrKeyboard.pressKey('x');
      expect(controller.state.draft[field]).toBe('Edited in the DOMx');
      host.xrKeyboard.pressKey('Enter');
      expect(controller.state.draft[field]).toBe('Edited in the DOMx');
      expect(host.settingsKeyboard).toBeNull();
      expect(host.xrKeyboard.value).toBe('Untouched author draft');
      expect(prompt.value).toBe('Untouched author draft');
      expect(prompt.selectionStart).toBe(3);
      expect(prompt.selectionEnd).toBe(8);
      expect(prompt.selectionDirection).toBe('backward');
      expect(setPrompt).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(controller.reconnect).not.toHaveBeenCalled();
      controller.setDraft(field, 'Changed after closing');
      expect(host.xrKeyboard.value).toBe('Untouched author draft');
    }
  );

  it.each(['name', 'relay'])(
    'edits %s without touching the author draft, caret, selection or Generate',
    async (field) => {
      const robot = STARTER_SCENES.find(
        (starter: {id: string}) => starter.id === 'robot-example'
      );
      await host.applyStarter(robot);
      room.select(room.layout.objects[0].id);
      const selection = room.selectedId;
      host.setPrompt('Preserve this author instruction');
      const prompt = host.dom.prompt as HTMLTextAreaElement;
      prompt.focus();
      prompt.setSelectionRange(4, 12, 'backward');
      const generate = vi.spyOn(host, 'generate');
      const setPrompt = vi.spyOn(host, 'setPrompt');
      const provider = vi.spyOn(host, 'connectGemini');
      host.toggleKeyboard();
      attach();
      activate('settings');
      activate(field);
      expect(host.xrKeyboard.value).toBe(
        controller.state.draft[field as keyof State['draft']]
      );
      expect(host.xrKeyboardTitle.text).toBe(
        `${field === 'name' ? 'Room display name' : 'Relay URL'}; Enter finishes editing.`
      );
      host.xrKeyboard.pressKey('x');
      expect(controller.state.draft[field as keyof State['draft']]).toMatch(
        /x$/
      );
      expect(control(field).label).toMatch(/x$/);
      host.xrKeyboard.pressKey('Enter');
      expect(host.settingsKeyboard).toBeNull();
      expect(host.xrKeyboard.value).toBe('Preserve this author instruction');
      expect(host.keyboardOpen).toBe(true);
      expect(prompt.value).toBe('Preserve this author instruction');
      expect(prompt.selectionStart).toBe(4);
      expect(prompt.selectionEnd).toBe(12);
      expect(prompt.selectionDirection).toBe('backward');
      expect(room.selectedId).toBe(selection);
      expect(setPrompt).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(controller.reconnect).not.toHaveBeenCalled();
      host.setSpatialTab('author');
      expect(host.xrKeyboardTitle.text).toContain('Enter generates');
    }
  );

  it('keeps concurrent DOM author edits out of the settings buffer and restores their latest value', () => {
    host.setPrompt('Original author draft');
    attach();
    activate('settings');
    activate('name');
    const buffer = host.xrKeyboard.value;
    const prompt = host.dom.prompt as HTMLTextAreaElement;
    prompt.value = 'A newer author draft';
    prompt.setSelectionRange(2, 6);
    prompt.dispatchEvent(new Event('input', {bubbles: true}));
    expect(host.xrKeyboard.value).toBe(buffer);
    expect(controller.state.draft.name).toBe(buffer);
    host.xrKeyboard.pressKey('x');
    expect(controller.state.draft.name).toBe(`${buffer}x`);
    host.closeSettingsKeyboard();
    expect(host.xrKeyboard.value).toBe('A newer author draft');
    expect(prompt.selectionStart).toBe(2);
    expect(prompt.selectionEnd).toBe(6);
  });

  it.each(['close', 'tab', 'section', 'dispose'])(
    'clears settings routing on %s without submission',
    (action) => {
      host.setPrompt('Author draft');
      attach();
      activate('settings');
      activate('name');
      const onClose = vi.fn();
      host.settingsKeyboard.onClose = onClose;
      const generate = vi.spyOn(host, 'generate');
      if (action === 'close') host.toggleKeyboard();
      else if (action === 'tab') host.setSpatialTab('examples');
      else if (action === 'section') activate('people');
      else host.dispose();
      expect(host.settingsKeyboard).toBeNull();
      expect(host.xrKeyboard.value).toBe('Author draft');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(generate).not.toHaveBeenCalled();
      expect(controller.reconnect).not.toHaveBeenCalled();
      if (action === 'dispose') {
        expect(host.xrKeyboard.onSubmit).toBeUndefined();
        expect(controller.listeners.size).toBe(0);
      }
    }
  );
});

describe('Roomcraft unchanged refresh regression', () => {
  it('retains DOM options and part nodes and performs no DOM/UIKit writes on unchanged refresh', async () => {
    const robot = STARTER_SCENES.find(
      (starter: {id: string}) => starter.id === 'robot-example'
    );
    await host.applyStarter(robot);
    room.select(room.layout.objects[0].id);
    const options = [...host.dom.selection.children];
    const parts = [...host.dom.parts.children];
    expect(parts.length).toBeGreaterThan(0);
    expect(host.xrProviderText.text).toContain(
      'Microphone recording is unavailable here; use Keyboard.'
    );
    const labels = vi.spyOn(UIButton.prototype, 'label', 'set');
    const disabled = vi.spyOn(UIButton.prototype, 'disabled', 'set');
    const texts = vi.spyOn(UIText.prototype, 'text', 'set');
    const before = revisions(host);
    const observer = new MutationObserver(() => {});
    observer.observe(host.dom.console, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    host.refresh();
    host.refresh();
    host.update(0);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    expect(labels).not.toHaveBeenCalled();
    expect(disabled).not.toHaveBeenCalled();
    expect(texts).not.toHaveBeenCalled();
    expect(revisions(host)).toEqual(before);
    expect(host.dom.selection.children).toHaveLength(options.length);
    options.forEach((option, index) => {
      expect(host.dom.selection.children[index]).toBe(option);
    });
    expect(host.dom.parts.children).toHaveLength(parts.length);
    parts.forEach((part, index) => {
      expect(host.dom.parts.children[index]).toBe(part);
    });
    room.select(null);
    expect([...host.dom.selection.children]).toEqual(options);
    expect(host.dom.parts.children).toHaveLength(0);
  });
});
