import * as xb from 'xrblocks';

import {LiveAssistant} from './LiveAssistant.js';

class LiveAssistantScene extends xb.Script {
  init() {
    this.status = new xb.UIText({
      text: 'Ready. Start when you want to talk.',
      style: {fontSize: 16, opacity: 0.72, textAlign: 'center'},
    });
    this.transcript = new xb.UIText({
      text: 'Your conversation will appear here.',
      style: {
        flexGrow: 1,
        padding: 16,
        backgroundColor: '#111722',
        borderRadius: 14,
        fontSize: 16,
        lineHeight: 1.35,
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });
    this.toggleButton = new xb.UIButton({
      label: 'Start',
      icon: 'mic',
      style: {width: '100%'},
      onClick: () => void this.toggleSession(),
    });
    this.assistant = new LiveAssistant(
      (message) => (this.status.text = message),
      (text) =>
        (this.transcript.text = text || 'Your conversation will appear here.'),
      () => this.setRunning(false)
    );

    const card = new xb.UICard({
      size: {width: 0.68, height: 0.5},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 16, padding: 20},
      children: [
        new xb.UIText({
          text: 'AI Live Assistant',
          style: {fontSize: 32, fontWeight: 'bold', textAlign: 'center'},
        }),
        this.status,
        this.transcript,
        this.toggleButton,
      ],
    });
    card.position.set(0, 1.4, -1.1);
    this.add(card);
  }

  async toggleSession() {
    if (this.toggleButton.disabled) return;
    this.toggleButton.disabled = true;
    try {
      if (this.assistant.running) await this.assistant.stop();
      else await this.assistant.start();
    } catch (error) {
      this.status.text = error instanceof Error ? error.message : String(error);
    } finally {
      this.setRunning(this.assistant.running);
      this.toggleButton.disabled = false;
    }
  }

  setRunning(running) {
    this.toggleButton.label = running ? 'Stop' : 'Start';
    this.toggleButton.icon = running ? 'stop' : 'mic';
  }
}

const options = new xb.Options();
options.enableAI();
options.enableCamera('environment');
options.ai.promptForApiKey = true;

xb.add(new LiveAssistantScene());
await xb.init(options);
