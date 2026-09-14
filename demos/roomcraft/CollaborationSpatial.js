import * as xb from 'xrblocks';

const PAGE_SIZE = 2;
const TRANSPORTS = [
  ['broadcast', 'Same browser'],
  ['webrtc', 'WebRTC'],
  ['websocket', 'Relay'],
];

function setChanged(target, key, value) {
  if (target[key] !== value) target[key] = value;
}

function text(value, height = 32, style = {}) {
  return new xb.UIText({
    text: value,
    style: {
      width: '100%',
      height,
      flexShrink: 0,
      fontSize: 28,
      lineHeight: 1.1,
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
    this.section = controller.getState().applied.room ? 'people' : 'rooms';
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
    this.statusText = text('', 36);
    this.errorText = text('', 96, {color: '#ffae98'});
    this.appliedPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 96,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 0,
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
        this.button('rooms', 'Room codes', () => this.setSection('rooms')),
        this.button('diagnostics', 'Diagnostics', () =>
          this.setSection('diagnostics')
        ),
      ],
      52
    );

    this.microphoneStatus = text('', 64, {fontSize: 26});
    this.roster = new xb.UIPanel({
      style: {
        width: '100%',
        height: 180,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 12,
      },
    });
    this.emptyText = text(
      'No other people connected. Share the peer link to invite someone.',
      84
    );
    this.roster.add(this.emptyText);
    this.pageText = text('', 52, {
      width: 240,
      textAlign: 'center',
      verticalAlign: 'middle',
    });
    this.peoplePanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 424,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
      children: [
        row(
          [
            this.button('microphone', 'Unmute my mic', () =>
              controller.toggleVoice()
            ),
            this.button('listening', 'Mute everyone for me', () =>
              controller.togglePlayback()
            ),
          ],
          64
        ),
        this.microphoneStatus,
        this.roster,
        row(
          [
            this.button('previous', 'Previous', () => this.changePage(-1)),
            this.pageText,
            this.button('next', 'Next', () => this.changePage(1)),
          ],
          52
        ),
        text('Local listening only. Gemini Talk is in Create / edit.', 32),
      ],
    });

    this.codeText = text('', 56, {fontSize: 36, fontWeight: 'bold'});
    this.codeHint = text('', 80);
    this.roomsPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 400,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 12,
      },
      children: [
        this.codeText,
        row(
          [
            this.button('lobby-name', 'Name to use', () =>
              this.editField('name')
            ),
          ],
          52
        ),
        row(
          [
            this.button('start-room', 'Start new room', () =>
              controller.startRoom()
            ),
            this.button('copy-code', 'Copy code', () => controller.copyCode()),
          ],
          60
        ),
        row(
          [
            this.button('room-code', 'Enter code', () => this.editRoomCode()),
            this.button('join-room', 'Join', () => controller.joinRoom()),
          ],
          60
        ),
        this.codeHint,
        text('Room changes stop your mic; unmute stays opt-in.', 32),
      ],
    });

    this.transportHelp = text('', 88, {fontSize: 26, lineHeight: 1.08});
    this.relayText = text('', 64);
    this.settingsPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 416,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
      children: [
        this.transportHelp,
        row(
          [
            this.button('name', 'Edit name', () => this.editField('name')),
            this.button('reset', 'Discard changes', () =>
              controller.resetDraft()
            ),
          ],
          60
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
          60
        ),
        this.relayText,
        text(
          'Enter finishes editing. Discard changes restores applied settings without reconnecting or changing the scene, prompt or audio.',
          52,
          {fontSize: 24, lineHeight: 1.05}
        ),
      ],
    });
    this.diagnosticText = text('', 292, {
      fontSize: 26,
      lineHeight: 1.1,
      whiteSpace: 'pre-line',
      verticalAlign: 'top',
    });
    this.diagnosticNotice = text('', 56, {fontSize: 24, lineHeight: 1.1});
    this.diagnosticsPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: 416,
        flexShrink: 0,
        flexDirection: 'column',
        gap: 8,
      },
      children: [
        this.diagnosticText,
        row(
          [
            this.button('copy-diagnostics', 'Copy diagnostics', () =>
              controller.copyDiagnostics()
            ),
            this.button('refresh-diagnostics', 'Refresh report', () =>
              controller.refreshDiagnostics()
            ),
          ],
          52
        ),
        this.diagnosticNotice,
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
        this.roomsPanel,
        this.diagnosticsPanel,
      ],
    });
    this.panel.name = 'RoomcraftCollaborationPanel';
    this.controls.get('name').style.flexGrow = 2;
    this.controls.get('start-room').style.backgroundColor = '#8a4a33';
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
        fontSize: 30,
        lineHeight: 1.1,
        padding: 8,
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

  editRoomCode() {
    this.host.openSettingsKeyboard({
      field: 'room-code',
      label: 'Room code; press Join after editing',
      value: this.state.rooms.input,
      onChange: (value) => this.controller.setJoinCode(value),
      onSubmit: (value) => this.controller.setJoinCode(value),
    });
  }

  createParticipant(participant) {
    const title = text('', 38, {fontSize: 32, fontWeight: 'bold'});
    const detail = text('', 30, {fontSize: 26});
    const toggle = this.button(`peer:${participant.id}`, 'Mute', () =>
      this.controller.togglePeerPlayback(participant.id)
    );
    toggle.style.flexGrow = 0;
    toggle.style.flexBasis = 260;
    const panel = row(
      [
        new xb.UIPanel({
          style: {
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 0,
            flexDirection: 'column',
            gap: 4,
          },
          children: [title, detail],
        }),
        toggle,
      ],
      84
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
    this.host.syncSettingsKeyboard('room-code', state.rooms.input);
    setChanged(
      this.roomText,
      'text',
      `${state.rooms.mode} view | Room: ${state.applied.room || 'not joined'}`
    );
    setChanged(
      this.codeText,
      'text',
      state.rooms.code
        ? `Room code: ${state.rooms.code}`
        : state.applied.room
          ? `Named room: ${state.applied.room}`
          : 'Start a room or enter a code'
    );
    setChanged(this.codeHint, 'text', state.rooms.notice || state.peerHint);
    setChanged(
      this.controls.get('room-code'),
      'label',
      `Code: ${state.rooms.input || '(enter)'}`
    );
    setChanged(
      this.controls.get('room-code'),
      'disabled',
      state.rooms.startDisabled
    );
    setChanged(
      this.controls.get('start-room'),
      'disabled',
      state.rooms.startDisabled
    );
    setChanged(
      this.controls.get('join-room'),
      'disabled',
      state.rooms.joinDisabled
    );
    setChanged(this.controls.get('join-room'), 'label', state.rooms.joinLabel);
    setChanged(
      this.controls.get('lobby-name'),
      'label',
      `Name to use: ${state.draft.name || '(enter)'}`
    );
    setChanged(
      this.controls.get('lobby-name'),
      'disabled',
      state.controls.settingsDisabled
    );
    setChanged(
      this.controls.get('copy-code'),
      'disabled',
      state.rooms.copyDisabled
    );
    setChanged(
      this.transportText,
      'text',
      `Applied transport: ${state.transportLabel}`
    );
    setChanged(this.nameText, 'text', `Applied name: ${state.applied.name}`);
    setChanged(
      this.statusText,
      'text',
      state.error
        ? 'Connection needs attention'
        : !state.applied.room
          ? 'Your scene is local. Start or join a room.'
          : state.statusText
    );
    setChanged(
      this.connectionRow.style,
      'display',
      state.applied.room ? 'flex' : 'none'
    );
    setChanged(
      this.statusText.style,
      'color',
      state.status === 'ready' ? '#9db8a6' : '#c2b6a8'
    );
    const errors = [
      ...new Set([state.error, state.microphone.error].filter(Boolean)),
    ].join(' | ');
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
    setChanged(
      this.microphoneStatus,
      'text',
      state.microphone.error
        ? `My microphone is ${state.microphone.transmitting ? 'on' : state.microphone.enabled ? 'muted' : 'off'}. Incoming audio is separate.`
        : state.microphone.statusText
    );
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
    setChanged(
      this.roomsPanel.style,
      'display',
      this.section === 'rooms' ? 'flex' : 'none'
    );
    setChanged(
      this.diagnosticsPanel.style,
      'display',
      this.section === 'diagnostics' ? 'flex' : 'none'
    );
    setChanged(this.diagnosticText, 'text', state.diagnostics.summary);
    setChanged(
      this.diagnosticNotice,
      'text',
      state.diagnostics.notice ||
        'Local metadata only. Download the full log in browser controls; nothing uploads automatically.'
    );
    setChanged(
      this.controls.get('copy-diagnostics'),
      'disabled',
      state.diagnostics.disabled || state.diagnostics.copying
    );
    setChanged(
      this.controls.get('copy-diagnostics'),
      'label',
      state.diagnostics.copying ? 'Copying...' : 'Copy diagnostics'
    );
    setChanged(
      this.controls.get('refresh-diagnostics'),
      'disabled',
      state.diagnostics.disabled
    );
    for (const section of ['people', 'settings', 'rooms', 'diagnostics']) {
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
      `Name: ${state.draft.name || '(empty)'}`
    );
    setChanged(
      this.controls.get('reset'),
      'disabled',
      !!state.controls.resetDisabled
    );
    setChanged(
      this.controls.get('settings'),
      'label',
      state.draftDirty ? 'Settings (edited)' : 'Settings'
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

    const participants = state.participants.filter(
      (participant) => !participant.local
    );
    const ids = new Set(participants.map((participant) => participant.id));
    for (const [id, entry] of this.participantRows) {
      if (ids.has(id)) continue;
      entry.toggle.onClick = undefined;
      entry.panel.removeFromParent();
      entry.panel.dispose();
      this.participantRows.delete(id);
      this.controls.delete(`peer:${id}`);
    }
    const pages = Math.max(1, Math.ceil(participants.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    participants.forEach((participant, index) => {
      const entry =
        this.participantRows.get(participant.id) ??
        this.createParticipant(participant);
      setChanged(
        entry.panel.style,
        'display',
        Math.floor(index / PAGE_SIZE) === this.page ? 'flex' : 'none'
      );
      setChanged(entry.title, 'text', participant.name);
      setChanged(entry.title.style, 'color', participant.color);
      setChanged(
        entry.detail,
        'text',
        `Mic ${participant.micOn ? 'on' : 'off'} - ${participant.selection || 'Nothing selected'}`
      );
      setChanged(
        entry.toggle,
        'label',
        participant.mutedForMe ? 'Unmute for me' : 'Mute for me'
      );
      setChanged(entry.toggle, 'disabled', !state.connected);
      setChanged(
        entry.toggle,
        'ariaLabel',
        `${participant.mutedForMe ? 'Unmute' : 'Mute'} ${participant.name} for me`
      );
    });
    setChanged(
      this.emptyText.style,
      'display',
      participants.length ? 'none' : 'flex'
    );
    setChanged(this.emptyText, 'text', state.peerHint);
    setChanged(
      this.pageText,
      'text',
      participants.length
        ? `${this.page + 1}/${pages} (${participants.length} peer${participants.length === 1 ? '' : 's'})`
        : 'Just you'
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
