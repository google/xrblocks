import * as THREE from 'three';
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/index.js';
import {
  conversation,
  library,
  messagePresets,
  notePresets,
} from './examples.js';

const PANEL_DISTANCE_METERS = 1.15;
const SIMULATOR_FOV_DEGREES = 50;
const SIMULATOR_KEYBOARD_FOV_DEGREES = 70;
const DISPLAY_NAME_MAX_LENGTH = 24;

const colors = {
  surface: '#14242d',
  raised: '#203640',
  inset: '#0e1d25',
  accent: '#98e7d5',
  text: '#f2f8fa',
  muted: '#a6bec8',
  outline: '#365460',
};

const text = (value, size = 24, style = {}) =>
  new xb.UIText({
    text: value,
    style: {
      fontSize: size,
      color: colors.text,
      whiteSpace: 'pre-line',
      ...style,
    },
  });

const column = (children, style = {}) =>
  new xb.UIPanel({
    style: {width: '100%', flexDirection: 'column', gap: 12, ...style},
    children,
  });

const row = (children, style = {}) =>
  new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      ...style,
    },
    children,
  });

const button = (label, onClick, style = {}) =>
  new xb.UIButton({
    label,
    onClick,
    style: {fontSize: 20, padding: 12, ...style},
  });

function setText(element, value) {
  if (element.text !== value) element.text = value;
}

class SpatialUiLab extends xb.Script {
  name = 'SpatialUiLab';

  init() {
    xb.ui.setTheme({
      colors: {
        surface: colors.surface,
        raisedSurface: colors.raised,
        primary: colors.accent,
        primaryText: colors.inset,
        text: colors.text,
        secondaryText: colors.muted,
        outline: colors.outline,
      },
      borderRadius: 18,
      styles: {
        input: {
          backgroundColor: colors.inset,
          borderColor: colors.outline,
          padding: 12,
          borderRadius: 12,
        },
        button: {borderRadius: 12},
      },
    });

    this.status = text(
      'All examples run locally. No keys or accounts required.',
      18,
      {color: colors.muted, flexGrow: 1}
    );
    this.subtitle = text('', 20, {color: colors.muted});
    this.examples = [
      this.makeConversation(),
      this.makeLibrary(),
      this.makeNotes(),
      this.makeInputs(),
    ];
    this.keyboard = new Keyboard({
      input: this.examples[0].primary,
      open: false,
    });
    this.keyboardToggle = button('Spatial keyboard', () => {
      const visible = !this.keyboard.open;
      this.keyboard.open = visible;
      this.keyboardToggle.label = visible
        ? 'Hide keyboard'
        : 'Spatial keyboard';
    });
    this.keyboardToggle.xb.preserveTextFocus = true;

    this.navigation = this.examples.map((example, index) =>
      button(
        `${index + 1}. ${example.label}`,
        () => this.showExample(example.id),
        {flexGrow: 1}
      )
    );
    const content = column(
      this.examples.map((example) => example.panel),
      {height: 550, minHeight: 0}
    );
    const heading = row([
      column(
        [text('Spatial UI lab', 38, {fontWeight: 'bold'}), this.subtitle],
        {flexGrow: 1, width: 'auto'}
      ),
      text('XR BLOCKS\nSCROLL + TYPE', 16, {
        color: colors.accent,
        textAlign: 'right',
      }),
    ]);
    const children = [
      heading,
      row(this.navigation),
      content,
      row([this.status, this.keyboardToggle]),
      this.keyboard,
    ];
    const style = {
      flexDirection: 'column',
      gap: 18,
      padding: 26,
      backgroundColor: colors.surface,
      borderColor: colors.outline,
      borderWidth: 1,
      borderRadius: 24,
    };
    const params = new URLSearchParams(location.search);
    this.worldPanel = !params.has('overlay');
    this.panel = !this.worldPanel
      ? new xb.UIOverlay({
          style: {
            ...style,
            width: '94%',
            maxWidth: 1080,
            position: 'absolute',
            left: '50%',
            top: 24,
            transform: {translateX: '-50%'},
          },
          children,
        })
      : new xb.UICard({
          size: {width: 1.08, height: 'auto'},
          edge: true,
          manipulation: true,
          style,
          children,
        });
    this.needsPlacement = this.worldPanel;
    this.panel.visible = !this.worldPanel;
    this.add(this.panel);
    this.showExample(params.get('example') ?? 'conversation');
  }

  field(options) {
    const field = new xb.UITextInput({
      ...options,
      style: {fontSize: 26, ...options.style},
      onFocus: () => {
        this.keyboard.input = field;
        options.onFocus?.();
      },
    });
    return field;
  }

  fill(field, value) {
    field.value = value;
    if (field.ready && !field.disabled) {
      field.focus();
      field.setSelectionRange(value.length, value.length);
    }
  }

  showExample(id) {
    const selected =
      this.examples.find((example) => example.id === id) ?? this.examples[0];
    this.activeExample = selected;
    for (const [index, example] of this.examples.entries()) {
      const active = example === selected;
      example.panel.visible = active;
      example.panel.style.display = active ? 'flex' : 'none';
      this.navigation[index].style.backgroundColor = active
        ? colors.accent
        : colors.raised;
      this.navigation[index].style.color = active ? colors.inset : colors.text;
    }
    this.keyboard.input = selected.primary;
    this.subtitle.text = selected.description;
    this.status.text = selected.hint;
  }

  makeConversation() {
    const history = new xb.UIScrollView({
      ariaLabel: 'Conversation history',
      style: {flexGrow: 1, flexBasis: 0, minHeight: 140, gap: 12},
    });
    const composer = this.field({
      ariaLabel: 'Message composer',
      multiline: true,
      placeholder:
        'Write a thought. Enter adds a line; Ctrl/Command+Enter sends.',
      style: {height: 128},
      onSubmit: () => send(),
    });
    const count = text('0 characters', 18, {color: colors.muted});
    let pendingBottom;
    const append = (author, value, kind = 'you') => {
      history.add(
        column(
          [
            text(author, 16, {
              color: kind === 'you' ? colors.accent : colors.muted,
              fontWeight: 'bold',
            }),
            text(value, 24),
          ],
          {
            width: '94%',
            alignSelf: kind === 'you' ? 'flex-end' : 'flex-start',
            flexShrink: 0,
            padding: 16,
            gap: 6,
            backgroundColor: kind === 'you' ? '#25483f' : colors.raised,
            borderRadius: 16,
          }
        )
      );
    };
    const send = () => {
      if (!composer.value.trim()) {
        this.status.text = 'Write a message first, or choose a sample below.';
        return;
      }
      pendingBottom = history.scrollHeight;
      append('YOU', composer.value);
      composer.value = '';
      this.status.text =
        'Added to this page only. No request was sent to a server.';
    };
    for (const message of conversation) append(...message);
    const presets = messagePresets.map(([label, value]) => {
      const preset = button(label, () => this.fill(composer, value), {
        backgroundColor: colors.raised,
        color: colors.text,
      });
      preset.xb.preserveTextFocus = true;
      return preset;
    });
    return {
      id: 'conversation',
      label: 'Conversation',
      description:
        'Scrolling history, a multiline composer, and one shared keyboard.',
      hint: 'Enter creates a line. Ctrl/Command+Enter sends locally.',
      primary: composer,
      fields: [composer],
      panel: column(
        [
          history,
          row([
            text('TRY A STARTING POINT', 16, {color: colors.muted}),
            ...presets,
          ]),
          composer,
          row(
            [
              count,
              button('Jump to latest', () =>
                history.scrollTo(history.maxScrollTop)
              ),
              button('Send locally', send),
            ],
            {justifyContent: 'space-between'}
          ),
        ],
        {height: '100%'}
      ),
      update: () => {
        setText(count, `${Array.from(composer.value).length} characters`);
        if (
          pendingBottom !== undefined &&
          history.ready &&
          history.scrollHeight > pendingBottom
        ) {
          history.scrollTo(history.maxScrollTop);
          pendingBottom = undefined;
        }
      },
    };
  }

  makeLibrary() {
    const results = new xb.UIScrollView({
      ariaLabel: 'Pattern library results',
      style: {width: '60%', height: '100%', gap: 10},
    });
    const selectedTitle = text('Pick a pattern', 28, {fontWeight: 'bold'});
    const details = this.field({
      ariaLabel: 'Pattern details',
      multiline: true,
      readOnly: true,
      value:
        'Select Inspect on any result.\n\nThis read-only field still supports text selection and copying.',
      style: {height: 244},
    });
    const count = text('', 18, {color: colors.muted});
    const search = this.field({
      ariaLabel: 'Search patterns',
      placeholder: 'Search by name, category, or description...',
      style: {height: 58},
      onInput: () => filter(),
    });
    const filter = () => {
      const query = search.value.trim().toLowerCase();
      const matches = library.filter((entry) =>
        entry.join(' ').toLowerCase().includes(query)
      );
      results.clear();
      results.scrollTo(0);
      for (const [name, category, icon, description, detail] of matches) {
        const inspect = button(
          'Inspect',
          () => {
            selectedTitle.text = name;
            details.value = detail;
          },
          {fontSize: 18, backgroundColor: colors.inset, color: colors.accent}
        );
        inspect.xb.preserveTextFocus = true;
        results.add(
          column(
            [
              row([
                new xb.UIIcon({
                  icon,
                  ariaLabel: category,
                  style: {width: 26, height: 26, color: colors.accent},
                }),
                text(category, 15, {color: colors.muted, flexGrow: 1}),
                inspect,
              ]),
              text(name, 26, {fontWeight: 'bold'}),
              text(description, 21, {color: colors.muted}),
            ],
            {
              padding: 16,
              flexShrink: 0,
              backgroundColor: colors.raised,
              borderRadius: 16,
            }
          )
        );
      }
      if (matches.length === 0) {
        results.add(
          column(
            [
              text('No matching patterns', 26),
              text('Try "notes", "compose", or clear the search.', 21, {
                color: colors.muted,
              }),
            ],
            {padding: 20}
          )
        );
      }
      setText(count, `${matches.length} of ${library.length} patterns`);
    };
    filter();
    return {
      id: 'library',
      label: 'Library',
      description:
        'Filter a retained collection without replacing the focused input.',
      hint: 'Try "notes" or "compose". Inspect keeps the search field focused.',
      primary: search,
      fields: [search, details],
      panel: column(
        [
          search,
          count,
          row(
            [
              results,
              column(
                [
                  text('PATTERN DETAILS', 16, {color: colors.accent}),
                  selectedTitle,
                  details,
                  text(
                    'Read-only is still selectable.\nThis is a finite list, not virtualization.',
                    19,
                    {color: colors.muted}
                  ),
                ],
                {
                  width: '40%',
                  height: '100%',
                  padding: 18,
                  backgroundColor: colors.inset,
                  borderRadius: 16,
                }
              ),
            ],
            {flexGrow: 1, minHeight: 0, alignItems: 'stretch'}
          ),
        ],
        {height: '100%'}
      ),
    };
  }

  makeNotes() {
    const title = this.field({
      ariaLabel: 'Notebook title',
      value: 'A field guide to better spatial UI',
      style: {height: 58},
    });
    const note = this.field({
      ariaLabel: 'Notebook body',
      multiline: true,
      value: notePresets[0][1],
      style: {flexGrow: 1, flexBasis: 0, minHeight: 200},
    });
    const count = text('', 18, {color: colors.muted, flexGrow: 1});
    const lock = button('Make read-only', () => {
      note.readOnly = !note.readOnly;
      lock.label = note.readOnly ? 'Enable editing' : 'Make read-only';
      this.status.text = note.readOnly
        ? 'Read-only: select, scroll, and copy. Editing is disabled.'
        : 'Editing enabled. This notebook stays in the page.';
    });
    return {
      id: 'notes',
      label: 'Notes',
      description:
        'Wrapped lines, selection, caret reveal, and multilingual text.',
      hint: 'Try the language sampler, select a paragraph, or make the note read-only.',
      primary: note,
      fields: [title, note],
      panel: column(
        [
          title,
          row(
            notePresets.map(([label, value]) =>
              button(
                label,
                () => {
                  note.readOnly = false;
                  lock.label = 'Make read-only';
                  this.fill(note, value);
                },
                {
                  backgroundColor: colors.raised,
                  color: colors.text,
                  flexGrow: 1,
                }
              )
            )
          ),
          note,
          row([
            count,
            lock,
            button('Keep draft', () => {
              this.status.text =
                'Draft kept while this page stays open. No persistent storage or server is used.';
            }),
          ]),
        ],
        {height: '100%'}
      ),
      update: () =>
        setText(
          count,
          `${note.value.split('\n').length} lines · ${Array.from(note.value).length} characters`
        ),
    };
  }

  makeInputs() {
    const name = this.field({
      ariaLabel: 'Display name',
      placeholder: 'e.g. Sam',
      maxLength: DISPLAY_NAME_MAX_LENGTH,
      style: {height: 58},
    });
    const workspace = this.field({
      ariaLabel: 'Workspace',
      value: 'Studio A / design review',
      readOnly: true,
      style: {height: 58},
    });
    const connection = this.field({
      ariaLabel: 'Connection',
      value: 'Unavailable in this local example',
      disabled: true,
      style: {height: 58},
    });
    const feedback = this.field({
      ariaLabel: 'Feedback',
      multiline: true,
      placeholder: 'A longer response, with room for another line.',
      style: {height: 150},
    });
    const review = text('Fill the fields, then review the draft locally.', 22, {
      color: colors.muted,
    });
    const length = text(`0 / ${name.maxLength} code units`, 18, {
      color: colors.muted,
    });
    const form = new xb.UIScrollView({
      ariaLabel: 'Field-state examples',
      style: {flexGrow: 1, flexBasis: 0, minHeight: 180, gap: 16},
      children: [
        column(
          [
            text(`EDITABLE · maxLength: ${name.maxLength}`, 16, {
              color: colors.accent,
            }),
            name,
            length,
          ],
          {flexShrink: 0}
        ),
        column(
          [
            text('READ-ONLY · selectable and copyable', 16, {
              color: colors.accent,
            }),
            workspace,
          ],
          {flexShrink: 0}
        ),
        column(
          [
            text('DISABLED · unavailable, not just transparent', 16, {
              color: colors.muted,
            }),
            connection,
          ],
          {flexShrink: 0}
        ),
        column(
          [
            text('MULTILINE · inside another scroll view', 16, {
              color: colors.accent,
            }),
            feedback,
          ],
          {flexShrink: 0}
        ),
      ],
    });
    const fill = () => {
      name.value = 'Sam';
      feedback.value =
        'The keyboard follows the focused field.\nThe surrounding form can scroll independently.';
      this.status.text =
        'Example values loaded without firing user-input callbacks.';
    };
    return {
      id: 'inputs',
      label: 'Inputs',
      description:
        'Editable, read-only, disabled, and length-limited fields in one form.',
      hint: 'Tab through the fields. Focusing feedback reveals it inside the form.',
      primary: name,
      fields: [name, workspace, connection, feedback],
      panel: column(
        [
          form,
          row([
            button('Fill example', fill),
            button('Reveal feedback', () => {
              if (form.ready) form.reveal(feedback);
              if (feedback.ready) feedback.focus();
            }),
            button('Review locally', () => {
              review.text = name.value.trim()
                ? `Ready for ${name.value.trim()}.\nFeedback: ${Array.from(feedback.value).length} characters. Nothing was sent.`
                : 'Add a display name before reviewing the draft.';
            }),
          ]),
          review,
        ],
        {height: '100%'}
      ),
      update: () =>
        setText(length, `${name.value.length} / ${name.maxLength} code units`),
    };
  }

  onXRSessionStarted() {
    this.queuePlacement();
  }

  onXRSessionEnded() {
    this.queuePlacement();
  }

  onSimulatorStarted() {
    this.queuePlacement();
  }

  queuePlacement() {
    if (!this.worldPanel) return;
    this.needsPlacement = true;
    if (this.panel) this.panel.visible = false;
  }

  placePanel() {
    const viewer = xb.camera.getWorldPosition(new THREE.Vector3());
    const forward = xb.camera.getWorldDirection(new THREE.Vector3());
    this.panel.position
      .copy(viewer)
      .addScaledVector(forward, PANEL_DISTANCE_METERS);
    this.worldToLocal(this.panel.position);
    this.panel.lookAt(viewer);
    this.panel.visible = true;
    this.needsPlacement = false;
  }

  update(_time, frame) {
    if (!this.activeExample) return;
    if (this.needsPlacement) {
      const xr = xb.core.renderer.xr;
      if (xr.isPresenting) {
        const space = xr.getReferenceSpace();
        if (frame && space && frame.getViewerPose(space)) this.placePanel();
      } else if (xb.core.simulatorRunning) {
        this.placePanel();
      }
    }
    if (
      xb.core.simulatorRunning &&
      xb.camera instanceof THREE.PerspectiveCamera
    ) {
      const fov = this.keyboard.visible
        ? SIMULATOR_KEYBOARD_FOV_DEGREES
        : SIMULATOR_FOV_DEGREES;
      if (xb.camera.fov !== fov) {
        xb.camera.fov = fov;
        xb.camera.updateProjectionMatrix();
      }
    }
    this.activeExample.update?.();
    const error = this.activeExample.fields
      .map((field) => field.error)
      .find(Boolean);
    if (error && error !== this.lastError) {
      this.lastError = error;
      this.status.text = `Text input unavailable: ${error.message}`;
    } else if (!error && this.lastError) {
      this.lastError = undefined;
      this.status.text = this.activeExample.hint;
    }
  }
}

const options = new xb.Options();
options.enableHands();
options.xrButton.showEnterSimulatorButton = true;
options.simulator.environments = [
  {
    name: 'UI lab',
    manifestPath: 'data:application/json,%7B%22objects%22%3A%5B%5D%7D',
  },
];
options.simulator.simulatorSettingsPanel.enabled = false;
options.simulator.instructions.enabled = false;
options.simulator.handPosePanel.enabled = false;
if (new URLSearchParams(location.search).has('capture'))
  options.reticles.enabled = false;
xb.add(new SpatialUiLab());
await xb.init(options);
