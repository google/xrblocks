import {afterEach, describe, expect, it, vi} from 'vitest';
import {UIButton, UICard, UIText} from 'xrblocks';

import {GeminiSkyboxGenerator} from './GeminiSkyboxGenerator.js';
import {TranscriptionManager} from './TranscriptionManager.js';

vi.mock('xrblocks', async () => {
  const {Script} = await import('../../src/core/Script');
  const ui = await import('../../src/ui/index');
  return {Script, ...ui};
});

afterEach(() => vi.restoreAllMocks());

describe('GeminiSkyboxGenerator UI', () => {
  it('builds public UI components and wires the session button', () => {
    const generator = new GeminiSkyboxGenerator();
    generator.createTextDisplay();
    expect(generator.textPanel).toBeInstanceOf(UICard);
    expect(generator.statusText).toBeInstanceOf(UIText);
    expect(generator.toggleButton).toBeInstanceOf(UIButton);
    expect(generator.transcription.responseDisplay.text).toBe(
      generator.defaultText
    );

    const toggle = vi
      .spyOn(generator, 'toggleGeminiLive')
      .mockResolvedValue(undefined);
    generator.toggleButton.onClick();
    expect(toggle).toHaveBeenCalledOnce();
    generator.updateStatus('Ready to listen');
    expect(generator.statusText.text).toBe('Ready to listen');

    generator.liveAgent = {
      getSessionState: () => ({isActive: true}),
    };
    generator.updateButtonState();
    expect(generator.toggleButton.label).toBe('Stop');
    expect(generator.toggleButton.icon).toBe('stop');
    generator.liveAgent = null;
    generator.updateButtonState();
    expect(generator.toggleButton.label).toBe('Start');
    expect(generator.toggleButton.icon).toBe('mic');
  });
});

describe('TranscriptionManager with UIText', () => {
  it('streams and finalizes transcription through the text property', () => {
    const display = new UIText({text: ''});
    const transcription = new TranscriptionManager(display);
    transcription.handleInputTranscription('A beach');
    transcription.handleOutputTranscription('Rendering');
    transcription.handleOutputTranscription(' now');
    expect(display.text).toBe('You: A beach\n\nAI: Rendering now');
    transcription.finalizeTurn();
    expect(display.text).toBe('You: A beach\n\nAI: Rendering now\n\n');
    expect(transcription.currentInputText).toBe('');
    expect(transcription.currentOutputText).toBe('');
  });

  it('appends status messages and resets the display after a session', () => {
    const display = new UIText({text: ''});
    const transcription = new TranscriptionManager(display);
    transcription.setText('Ready\n');
    transcription.addText('Skybox generated');
    expect(display.text).toBe('Ready\nSkybox generated\n\n');
    transcription.handleInputTranscription('Mountains');
    transcription.finalizeTurn();
    transcription.clear();
    transcription.setText('Describe a background');
    expect(transcription.conversationHistory).toEqual([]);
    expect(display.text).toBe('Describe a background');
  });
});
