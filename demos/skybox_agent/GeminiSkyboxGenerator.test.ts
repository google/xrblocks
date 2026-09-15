import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UIButton, UICard, UIText} from 'xrblocks';

import {AudioListener} from '../../src/sound/AudioListener';
import {GeminiSkyboxGenerator} from './GeminiSkyboxGenerator.js';
import {TranscriptionManager} from './TranscriptionManager.js';

const {sound} = vi.hoisted(() => ({
  sound: {
    enableAudio: vi.fn<() => Promise<void>>(),
    isAudioEnabled: vi.fn<() => boolean>(),
    disableAudio: vi.fn<() => void>(),
    stopAIAudio: vi.fn<() => void>(),
  },
}));

vi.mock('xrblocks', async () => {
  const {Script} = await import('../../src/core/Script');
  const ui = await import('../../src/ui/index');
  return {Script, ...ui, core: {sound}};
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function microphoneStream() {
  const tracks = [
    {stop: vi.fn(), getSettings: () => ({sampleRate: 48000})},
    {stop: vi.fn(), getSettings: () => ({sampleRate: 48000})},
  ];
  return {
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  };
}

describe('GeminiSkyboxGenerator startup', () => {
  let listener: AudioListener;

  beforeEach(() => {
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        audioWorklet = {addModule: vi.fn().mockResolvedValue(undefined)};
        createMediaStreamSource() {
          return {connect: vi.fn(), disconnect: vi.fn()};
        }
        close = vi.fn().mockResolvedValue(undefined);
      }
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = {};
        disconnect = vi.fn();
      }
    );
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:test-audio-processor');
        static revokeObjectURL = vi.fn();
      }
    );
    listener = new AudioListener();
    sound.enableAudio
      .mockReset()
      .mockImplementation(() => listener.startCapture());
    sound.disableAudio
      .mockReset()
      .mockImplementation(() => listener.stopCapture());
    sound.isAudioEnabled
      .mockReset()
      .mockImplementation(() => listener.getIsCapturing());
    sound.stopAIAudio.mockReset();
  });

  afterEach(() => listener.stopCapture());

  function scene() {
    const generator = new GeminiSkyboxGenerator();
    generator.createTextDisplay();
    const state = {isActive: false};
    const agent = {
      getSessionState: () => state,
      startLiveSession: vi.fn(async () => {
        state.isActive = true;
      }),
      stopLiveSession: vi.fn(async () => {
        state.isActive = false;
      }),
    };
    generator.liveAgent = agent;
    return {generator, agent};
  }

  it('serializes two Start clicks and stops every acquired microphone track', async () => {
    const requests: Array<{
      stream: ReturnType<typeof microphoneStream>;
      resolve: (stream: ReturnType<typeof microphoneStream>) => void;
    }> = [];
    const getUserMedia = vi.fn(() => {
      const pending =
        Promise.withResolvers<ReturnType<typeof microphoneStream>>();
      requests.push({stream: microphoneStream(), resolve: pending.resolve});
      return pending.promise;
    });
    vi.stubGlobal('navigator', {mediaDevices: {getUserMedia}});
    const {generator, agent} = scene();
    const connection = Promise.withResolvers<void>();
    agent.startLiveSession.mockImplementation(async () => {
      await connection.promise;
      agent.getSessionState().isActive = true;
    });
    const starts = vi.spyOn(generator, 'startGeminiLive');

    generator.toggleButton.onClick();
    generator.toggleButton.onClick();
    expect.soft(getUserMedia).toHaveBeenCalledTimes(1);
    expect.soft(generator.toggleButton.disabled).toBe(true);

    for (const request of requests) request.resolve(request.stream);
    await vi.waitFor(() => expect(agent.startLiveSession).toHaveBeenCalled());
    expect.soft(agent.startLiveSession).toHaveBeenCalledTimes(1);
    expect.soft(generator.toggleButton.disabled).toBe(true);
    generator.toggleButton.onClick();

    connection.resolve();
    await Promise.all(starts.mock.results.map(({value}) => value));
    expect.soft(sound.enableAudio).toHaveBeenCalledTimes(1);
    expect.soft(agent.startLiveSession).toHaveBeenCalledTimes(1);
    expect(generator.toggleButton.disabled).toBe(false);
    await generator.cleanup();
    expect(agent.stopLiveSession).toHaveBeenCalledOnce();
    for (const {stream} of requests) {
      for (const track of stream.tracks) {
        expect.soft(track.stop).toHaveBeenCalledOnce();
      }
    }
  });

  it('restores Start after permission denial without opening a session', async () => {
    const permission =
      Promise.withResolvers<ReturnType<typeof microphoneStream>>();
    const stream = microphoneStream();
    const getUserMedia = vi
      .fn()
      .mockReturnValueOnce(permission.promise)
      .mockResolvedValueOnce(stream);
    vi.stubGlobal('navigator', {mediaDevices: {getUserMedia}});
    const error = new DOMException('Permission denied', 'NotAllowedError');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {generator, agent} = scene();

    const start = generator.startGeminiLive();
    expect.soft(generator.toggleButton.disabled).toBe(true);
    permission.reject(error);
    await start;
    expect(logError).toHaveBeenCalledWith(
      'Failed to start audio capture:',
      error
    );
    expect.soft(agent.startLiveSession).not.toHaveBeenCalled();
    expect
      .soft(generator.statusText.text)
      .toBe('Failed to start: Microphone capture did not start.');
    expect(generator.toggleButton.disabled).toBe(false);

    await generator.startGeminiLive();
    expect.soft(getUserMedia).toHaveBeenCalledTimes(2);
    expect(agent.startLiveSession).toHaveBeenCalledOnce();
    await generator.cleanup();
    for (const track of stream.tracks) {
      expect.soft(track.stop).toHaveBeenCalledOnce();
    }
  });

  it('stops capture and allows retry after a connection failure', async () => {
    const first = microphoneStream();
    const second = microphoneStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    vi.stubGlobal('navigator', {mediaDevices: {getUserMedia}});
    const {generator, agent} = scene();
    const connection = Promise.withResolvers<void>();
    agent.startLiveSession.mockReturnValueOnce(connection.promise);

    const start = generator.startGeminiLive();
    await vi.waitFor(() =>
      expect(agent.startLiveSession).toHaveBeenCalledOnce()
    );
    expect.soft(generator.toggleButton.disabled).toBe(true);
    connection.reject(new Error('Connection failed'));
    await start;
    expect(generator.toggleButton.disabled).toBe(false);
    expect(generator.statusText.text).toBe(
      'Failed to start: Connection failed'
    );
    for (const track of first.tracks) {
      expect(track.stop).toHaveBeenCalledOnce();
    }

    await generator.startGeminiLive();
    expect(agent.startLiveSession).toHaveBeenCalledTimes(2);
    expect(generator.toggleButton.disabled).toBe(false);
    await generator.cleanup();
    for (const track of second.tracks) {
      expect(track.stop).toHaveBeenCalledOnce();
    }
  });
});

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
