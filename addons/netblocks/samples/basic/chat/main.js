import * as xb from 'xrblocks';
import { Keyboard } from 'xrblocks/addons/virtualkeyboard/Keyboard.js';
import { BroadcastChannelTransport } from 'netblocks';
import { NetSample } from '../../Sample.js';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import '../../roomCode.js';

class ChatSample extends NetSample {
    constructor() {
        super(...arguments);
        this._displayName = `User-${Math.floor(Math.random() * 1000)}`;
        this._spatialLogLines = [];
    }
    getJoinOptions() {
        return {
            roomId: 'netblocks-sample-chat',
            options: {
                transport: new BroadcastChannelTransport(),
                displayName: this._displayName,
            },
        };
    }
    onSession(session) {
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
        });
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
            if (controls)
                controls.enabled = false;
        });
        input.addEventListener('blur', () => {
            if (controls)
                controls.enabled = true;
        });
        inputRow.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text)
                return;
            const payload = {
                from: this._displayName,
                text,
                ts: Date.now(),
            };
            session.events.emit('chat-message', payload);
            this._appendLine(payload, /* self */ true);
            input.value = '';
        });
        session.events.on('chat-message', (payload) => {
            this._appendLine(payload, false);
        });
        this._buildSpatialHud(session);
    }
    _appendLine(p, self) {
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
    _appendSpatialLine(text) {
        if (!this._spatialLog)
            return;
        this._spatialLogLines.push(text);
        if (this._spatialLogLines.length > 12)
            this._spatialLogLines.shift();
        this._spatialLog.setText(this._spatialLogLines.join('\n'));
    }
    _buildSpatialHud(session) {
        const panel = new xb.SpatialPanel({
            width: 1.4,
            height: 0.9,
            backgroundColor: '#1a1a2add',
        });
        const grid = panel.addGrid();
        grid.addRow({ weight: 0.12 }).addText({
            text: `💬 ${this._displayName}`,
            fontSize: 0.05,
            fontColor: '#bfa9ff',
            textAlign: 'center',
        });
        this._spatialLog = new xb.ScrollingTroikaTextView({
            text: '(start typing on the keyboard below to chat)',
            fontSize: 0.04,
            textAlign: 'left',
        });
        grid.addRow({ weight: 0.7 }).add(this._spatialLog);
        this._spatialDraft = grid.addRow({ weight: 0.18 }).addText({
            text: '› ',
            fontSize: 0.04,
            fontColor: '#7ac0ff',
            textAlign: 'left',
        });
        panel.position.set(-1.2, 1.5, -1.5);
        panel.rotation.y = Math.PI / 8;
        this.add(panel);
        this._buildKeyboard(session);
    }
    _buildKeyboard(session) {
        // Subclass to override init() (which would otherwise reset the
        // keyboard's transform to its default position above the user).
        class PositionedKeyboard extends Keyboard {
            init() {
                super.init();
                const sub = this.subspace;
                sub.position.set(-0.7, 0.7, -0.7);
                sub.scale.setScalar(0.6);
                sub.rotation.set(-Math.PI / 6, 0, 0);
            }
        }
        const keyboard = new PositionedKeyboard();
        this._keyboard = keyboard;
        xb.add(keyboard);
        keyboard.onTextChanged = (text) => {
            this._spatialDraft?.setText(`› ${text}`);
        };
        keyboard.onEnterPressed = (text) => {
            const trimmed = text.trim();
            if (!trimmed)
                return;
            const payload = {
                from: this._displayName,
                text: trimmed,
                ts: Date.now(),
            };
            session.events.emit('chat-message', payload);
            this._appendLine(payload, true);
            keyboard.setText('');
        };
    }
}
NetSample.run(ChatSample);
