import * as xb from 'xrblocks';

const PAGE_SIZE = 3;
const TRANSPORTS = [
  ['broadcast', 'Same browser'],
  ['webrtc', 'WebRTC'],
  ['websocket', 'Relay'],
];

function setChanged(target, key, value) {
  if (target[key] !== value) target[key] = value;
}

function text(value, height = 28, style = {}) {
  return new xb.UIText({
    text: value,
    style: {
      width: '100%',
      height,
      flexShrink: 0,
      fontSize: 24,
      lineHeight: 1.15,
      color: '#c2b6a8',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      ...style,
    },
  });
}

function row(children, height = 56) {
  return new xb.UIPanel({
    style: {
      width: '100%',
      height,
      flexShrink: 0,
      flexDirection: 'row',
      gap: 8,
    },
    children,
  });
}

/** An optional view of the existing collaboration controller, with no sessions. */
export class CollaborationSpatialView {
  constructor(consoleScript, controller) {
    this.host = consoleScript;
    this.controller = controller;
    this.disposed = false;
    this.page = 0;
    this.section = 'people';
    this.controls = new Map();
    this.participantRows = new Map();
    this.state = controller.getState();

    this.tab = this.button('tab', 'People', () =>
      this.host.setSpatialTab('collaboration')
    );
    this.tab.style.fontSize = 32;
    this.roomText = text('');
    this.transportText = text('');
    this.nameText = text('');
    this.statusText = text('', 56);
    this.errorText = text('', 64, {color: '#ffae98'});
    this.appliedPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 96,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 6,
      },
      children: [this.roomText, this.transportText, this.nameText],
    });
    this.connectionRow = row([
      this.button('connect', 'Apply & reconnect', () => controller.reconnect()),
      this.button('retry', 'Retry', () => controller.retry()),
      this.button('disconnect', 'Disconnect', () => controller.leave()),
    ]);
    this.sectionRow = row(
      [
        this.button('people', 'People / audio', () =>
          this.setSection('people')
        ),
        this.button('settings', 'Connection settings', () =>
          this.setSection('settings')
        ),
      ],
      52
    );

    this.microphoneStatus = text('', 48, {fontSize: 22, lineHeight: 1.08});
    this.roster = new xb.UIPanel({
      style: {
        width: '100%',
        height: 214,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
    });
    this.emptyText = text('No participants connected.', 66);
    this.roster.add(this.emptyText);
    this.pageText = text('', 48, {
      width: 200,
      textAlign: 'center',
      verticalAlign: 'middle',
    });
    this.peoplePanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 434,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
      children: [
        row([
          this.button('microphone', 'Unmute my mic', () =>
            controller.toggleVoice()
          ),
          this.button('listening', 'Mute everyone for me', () =>
            controller.togglePlayback()
          ),
        ]),
        this.microphoneStatus,
        this.roster,
        row(
          [
            this.button('previous', 'Previous', () => this.changePage(-1)),
            this.pageText,
            this.button('next', 'Next', () => this.changePage(1)),
          ],
          48
        ),
        text('Room audio only. Gemini Talk is separate on Create / edit.', 36),
      ],
    });

    this.transportHelp = text('', 96);
    this.relayText = text('', 56);
    this.settingsPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 436,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
      children: [
        this.transportHelp,
        row(
          [this.button('name', 'Edit name', () => this.editField('name'))],
          64
        ),
        row(
          TRANSPORTS.map(([value, label]) =>
            this.button(`transport:${value}`, label, () =>
              controller.setDraft('transport', value)
            )
          ),
          52
        ),
        row(
          [
            this.button('relay', 'Edit relay URL', () =>
              this.editField('relay')
            ),
          ],
          64
        ),
        this.relayText,
        text(
          'Draft settings apply only with Reconnect. Enter saves the field; it never generates or reconnects.',
          64
        ),
      ],
    });
    this.panel = new xb.UIPanel({
      style: {
        width: '100%',
        maxHeight: 800,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
      },
      children: [
        this.appliedPanel,
        this.statusText,
        this.errorText,
        this.connectionRow,
        this.sectionRow,
        this.peoplePanel,
        this.settingsPanel,
      ],
    });
    this.panel.name = 'RoomcraftCollaborationPanel';
    this.host.attachCollaborationPanel(this.tab, this.panel);
    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  button(id, label, action) {
    const button = new xb.UIButton({
      label,
      style: {
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        height: '100%',
        fontSize: 26,
        borderRadius: 14,
        backgroundColor: '#30292d',
        color: '#f6ece0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ':disabled': {opacity: 0.45},
      },
      onClick: () => {
        if (this.disposed || button.disabled) return;
        this.host.playButtonSound();
        return action();
      },
    });
    button.name = `RoomcraftCollaboration:${id}`;
    this.controls.set(id, button);
    return button;
  }

  setSection(section) {
    if (this.section !== section) this.host.closeSettingsKeyboard();
    this.section = section;
    this.render(this.state);
  }

  changePage(direction) {
    this.page += direction;
    this.render(this.state);
  }

  editField(field) {
    this.host.openSettingsKeyboard({
      field,
      label: field === 'name' ? 'Room display name' : 'Relay URL',
      value: this.state.draft[field],
      onChange: (value) => this.controller.setDraft(field, value),
      onSubmit: (value) => this.controller.setDraft(field, value),
    });
  }

  createParticipant(participant) {
    const title = text('', 28, {fontSize: 24});
    const detail = text('', 28, {fontSize: 22});
    const toggle = this.button(`peer:${participant.id}`, 'Mute', () =>
      this.controller.togglePeerPlayback(participant.id)
    );
    toggle.style.flexGrow = 0;
    toggle.style.flexBasis = 230;
    const panel = row(
      [
        new xb.UIPanel({
          style: {
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 0,
            flexDirection: 'column',
            gap: 2,
          },
          children: [title, detail],
        }),
        toggle,
      ],
      66
    );
    panel.name = `RoomcraftParticipant:${participant.id}`;
    this.roster.add(panel);
    const entry = {panel, title, detail, toggle};
    this.participantRows.set(participant.id, entry);
    return entry;
  }

  render(state) {
    if (this.disposed) return;
    this.state = state;
    for (const field of ['name', 'relay']) {
      this.host.syncSettingsKeyboard(field, state.draft[field]);
    }
    setChanged(this.roomText, 'text', `Room: ${state.applied.roomId}`);
    setChanged(
      this.transportText,
      'text',
      `Applied transport: ${state.transportLabel}`
    );
    setChanged(this.nameText, 'text', `Applied name: ${state.applied.name}`);
    setChanged(this.statusText, 'text', state.statusText);
    setChanged(
      this.statusText.style,
      'color',
      state.status === 'ready' ? '#9db8a6' : '#c2b6a8'
    );
    const errors = [state.error, state.microphone.error]
      .filter(Boolean)
      .join(' | ');
    setChanged(this.errorText, 'text', errors);
    setChanged(this.errorText.style, 'display', errors ? 'flex' : 'none');
    setChanged(this.controls.get('connect'), 'label', 'Apply & reconnect');
    for (const action of ['connect', 'retry', 'disconnect']) {
      setChanged(
        this.controls.get(action),
        'disabled',
        state.controls[`${action}Disabled`]
      );
    }
    const mic = this.controls.get('microphone');
    setChanged(mic, 'label', state.microphone.label);
    setChanged(mic, 'ariaLabel', state.microphone.label);
    setChanged(mic, 'disabled', state.microphone.disabled);
    setChanged(
      mic.style,
      'backgroundColor',
      state.microphone.transmitting ? '#8d352c' : '#30292d'
    );
    setChanged(this.microphoneStatus, 'text', state.microphone.statusText);
    setChanged(
      this.controls.get('listening'),
      'label',
      state.listening.muted ? 'Unmute everyone for me' : 'Mute everyone for me'
    );
    setChanged(
      this.controls.get('listening'),
      'disabled',
      state.listening.disabled
    );

    setChanged(
      this.peoplePanel.style,
      'display',
      this.section === 'people' ? 'flex' : 'none'
    );
    setChanged(
      this.settingsPanel.style,
      'display',
      this.section === 'settings' ? 'flex' : 'none'
    );
    for (const section of ['people', 'settings']) {
      setChanged(
        this.controls.get(section).style,
        'backgroundColor',
        this.section === section ? '#8a4a33' : '#30292d'
      );
    }
    setChanged(this.transportHelp, 'text', state.transportHelp);
    setChanged(
      this.controls.get('name'),
      'label',
      `Edit name: ${state.draft.name || '(empty)'}`
    );
    setChanged(
      this.controls.get('relay'),
      'label',
      `Edit relay: ${state.draft.relay || '(empty)'}`
    );
    setChanged(
      this.controls.get('relay'),
      'disabled',
      !!state.controls.settingsDisabled || state.draft.transport !== 'websocket'
    );
    setChanged(
      this.controls.get('name'),
      'disabled',
      !!state.controls.settingsDisabled
    );
    setChanged(
      this.relayText,
      'text',
      `Applied relay: ${state.applied.transport === 'websocket' ? state.applied.relay : 'not used'}`
    );
    for (const [value] of TRANSPORTS) {
      const button = this.controls.get(`transport:${value}`);
      setChanged(button, 'disabled', !!state.controls.settingsDisabled);
      setChanged(
        button.style,
        'backgroundColor',
        state.draft.transport === value ? '#8a4a33' : '#30292d'
      );
    }

    const ids = new Set(
      state.participants.map((participant) => participant.id)
    );
    for (const [id, entry] of this.participantRows) {
      if (ids.has(id)) continue;
      entry.toggle.onClick = undefined;
      entry.panel.removeFromParent();
      entry.panel.dispose();
      this.participantRows.delete(id);
      this.controls.delete(`peer:${id}`);
    }
    const pages = Math.max(1, Math.ceil(state.participants.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    state.participants.forEach((participant, index) => {
      const entry =
        this.participantRows.get(participant.id) ??
        this.createParticipant(participant);
      setChanged(
        entry.panel.style,
        'display',
        Math.floor(index / PAGE_SIZE) === this.page ? 'flex' : 'none'
      );
      setChanged(
        entry.title,
        'text',
        `mic ${participant.micOn ? 'on' : 'off'} - ${participant.name}${participant.local ? ' (you)' : ''}`
      );
      setChanged(entry.title.style, 'color', participant.color);
      setChanged(
        entry.detail,
        'text',
        participant.selection || 'Nothing selected'
      );
      setChanged(
        entry.toggle,
        'label',
        participant.local
          ? 'Your microphone'
          : participant.mutedForMe
            ? 'Unmute for me'
            : 'Mute for me'
      );
      setChanged(
        entry.toggle,
        'disabled',
        participant.local || !state.connected
      );
      setChanged(
        entry.toggle,
        'ariaLabel',
        participant.local
          ? 'Your microphone is controlled above'
          : `${participant.mutedForMe ? 'Unmute' : 'Mute'} ${participant.name} for me`
      );
    });
    setChanged(
      this.emptyText.style,
      'display',
      state.participants.length ? 'none' : 'flex'
    );
    setChanged(
      this.pageText,
      'text',
      `${this.page + 1} / ${pages} (${state.participants.length})`
    );
    setChanged(this.controls.get('previous'), 'disabled', this.page === 0);
    setChanged(this.controls.get('next'), 'disabled', this.page === pages - 1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.host.detachCollaborationPanel(this.panel);
    for (const button of this.controls.values()) button.onClick = undefined;
    this.panel.dispose();
    this.tab.dispose();
    this.controls.clear();
    this.participantRows.clear();
  }
}
