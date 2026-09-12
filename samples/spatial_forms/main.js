import * as THREE from 'three';
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/index.js';

const PANEL_DISTANCE_METERS = 0.95;
const INITIAL_HISTORY_ENTRIES = 12;
const HISTORY_BOTTOM_TOLERANCE = 8;

class SpatialForms extends xb.Script {
  init() {
    this.status = new xb.UIText({
      text: 'Select a field to type. Editable text uses system fonts.',
      style: {fontSize: 18},
    });
    this.title = new xb.UITextInput({
      ariaLabel: 'Note title',
      value: 'My spatial notes',
      placeholder: 'Title',
      style: {height: 48, fontSize: 24},
      onFocus: () => (this.keyboard.input = this.title),
    });
    this.composer = new xb.UITextInput({
      ariaLabel: 'Message',
      multiline: true,
      placeholder: 'Write a note. Enter adds a line; Ctrl/Command+Enter sends.',
      style: {height: 120, fontSize: 24},
      onFocus: () => (this.keyboard.input = this.composer),
      onSubmit: () => this.send(),
    });
    this.history = new xb.UIScrollView({
      ariaLabel: 'Conversation history',
      style: {height: 240, gap: 12},
    });
    this.keyboard = new Keyboard({input: this.composer, open: false});

    const keyboardToggle = new xb.UIButton({
      label: 'Show keyboard',
      onClick: () => {
        this.keyboard.open = !this.keyboard.open;
        keyboardToggle.label = this.keyboard.open
          ? 'Hide keyboard'
          : 'Show keyboard';
      },
    });
    keyboardToggle.xb.preserveTextFocus = true;
    const actions = new xb.UIPanel({
      style: {flexDirection: 'row', gap: 12},
      children: [
        new xb.UIButton({label: 'Send', onClick: () => this.send()}),
        keyboardToggle,
        new xb.UIButton({
          label: 'Clear history',
          onClick: () => {
            this.history.clear();
            this.pendingBottom = undefined;
            this.history.scrollTo(0);
            this.status.text = 'History cleared.';
          },
        }),
      ],
    });

    const children = [
      new xb.UIText({text: 'Spatial forms', style: {fontSize: 32}}),
      this.title,
      this.history,
      this.composer,
      actions,
      this.status,
      this.keyboard,
    ];
    const style = {flexDirection: 'column', gap: 12, padding: 20};
    const overlay = new URLSearchParams(location.search).has('overlay');
    this.panel = overlay
      ? new xb.UIOverlay({
          style: {
            ...style,
            width: '90%',
            maxWidth: 820,
            left: '50%',
            top: 16,
            position: 'absolute',
            transform: {translateX: '-50%'},
          },
          children,
        })
      : new xb.UICard({
          size: {width: 0.82, height: 'auto'},
          manipulation: true,
          edge: true,
          style,
          children,
        });
    if (!overlay) {
      this.panel.add(
        new xb.FollowHead({
          offset: new THREE.Vector3(0, 0, -PANEL_DISTANCE_METERS),
          smoothing: 1,
        }),
        new xb.FaceCamera({mode: 'spherical', smoothing: 1})
      );
    }
    this.add(this.panel);
    for (let i = 1; i <= INITIAL_HISTORY_ENTRIES; i++) {
      this.append(
        `Example ${i}`,
        i === 1
          ? 'Try multiple lines, caf\u00e9, \u4f60\u597d, and \ud83d\ude42.\nThis conversation is local; no AI service is connected.'
          : `Scroll this history, then click Use in composer.\nDragging a row should scroll without activating its button.`
      );
    }
  }

  append(title, message) {
    this.history.add(
      new xb.UIPanel({
        style: {
          flexDirection: 'column',
          gap: 6,
          padding: 12,
          flexShrink: 0,
          backgroundColor: '#30343b',
        },
        children: [
          new xb.UIText({text: title, style: {fontSize: 18, color: '#aab2c0'}}),
          new xb.UIText({
            text: message,
            style: {fontSize: 24, whiteSpace: 'pre-line'},
          }),
          new xb.UIButton({
            label: 'Use in composer',
            onClick: () => {
              this.composer.value = message;
              if (this.composer.ready) this.composer.focus();
            },
          }),
        ],
      })
    );
  }

  send() {
    const message = this.composer.value;
    if (!message.trim()) {
      this.status.text = 'Enter a message before sending.';
      return;
    }
    const previousHeight = this.history.scrollHeight;
    const atBottom =
      this.history.maxScrollTop - this.history.scrollTop <
      HISTORY_BOTTOM_TOLERANCE;
    this.append(this.title.value.trim() || 'Untitled', message);
    this.composer.value = '';
    if (atBottom) this.pendingBottom = previousHeight;
    this.status.text = 'Added locally. Nothing was sent to an AI service.';
  }

  update() {
    const error = this.title.error ?? this.composer.error;
    if (error && error !== this.lastError) {
      this.lastError = error;
      this.status.text = `Text input unavailable: ${error.message}`;
    } else if (!error && this.lastError) {
      this.lastError = undefined;
      this.status.text = 'Text input is ready.';
    }
    if (
      this.pendingBottom !== undefined &&
      this.history.ready &&
      this.history.scrollHeight > this.pendingBottom
    ) {
      this.history.scrollTo(this.history.maxScrollTop);
      this.pendingBottom = undefined;
    }
  }
}

const options = new xb.Options();
options.enableHands();
options.xrButton.showEnterSimulatorButton = true;
options.simulator.environments = [
  {
    name: 'Spatial forms',
    manifestPath: 'data:application/json,%7B%22objects%22%3A%5B%5D%7D',
  },
];
xb.add(new SpatialForms());
await xb.init(options);
