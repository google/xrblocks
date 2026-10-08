// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Microphone, PROCESSOR_NAME} from './microphone.js';

class FakeNode {
  port = {onmessage: null as null | ((event: {data: unknown}) => void)};
  connections: unknown[] = [];
  options: unknown;
  name = '';
  constructor(_context?: unknown, name = '', options?: unknown) {
    this.name = name;
    this.options = options;
  }
  connect(target: unknown) {
    this.connections.push(target);
  }
  disconnect = vi.fn();
}

function setup() {
  const track = {stop: vi.fn()};
  const stream = {getTracks: () => [track]};
  const context = {
    sampleRate: 48000,
    state: 'running',
    destination: {},
    audioWorklet: {addModule: vi.fn(async () => {})},
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
  };
  const source = new FakeNode();
  const mediaDevices = {getUserMedia: vi.fn(async () => stream)};
  const microphone = new Microphone({
    mediaDevices: mediaDevices as unknown as MediaDevices,
    createContext: () => context as unknown as AudioContext,
    processorUrl: 'captureProcessor.js',
  });
  return {microphone, mediaDevices, context, track, source};
}

let nodes: FakeNode[] = [];
beforeEach(() => {
  nodes = [];
  vi.stubGlobal(
    'AudioWorkletNode',
    class extends FakeNode {
      constructor(...args: [unknown, string, unknown]) {
        super(...args);
        nodes.push(this);
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Microphone', () => {
  it('routes worklet chunks with the device sample rate and cleans up', async () => {
    const {microphone, mediaDevices, context, track, source} = setup();
    const onAudio = vi.fn();
    await expect(microphone.start(onAudio)).resolves.toEqual({
      sampleRate: 48000,
    });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({channelCount: 1, echoCancellation: true}),
    });
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith(
      'captureProcessor.js'
    );
    const [node] = nodes;
    expect(node.name).toBe(PROCESSOR_NAME);
    expect(source.connections).toEqual([node]);
    expect(node.connections).toEqual([context.destination]);
    const chunk = new Float32Array(4);
    node.port.onmessage!({data: chunk});
    node.port.onmessage!({data: 'noise'});
    expect(onAudio).toHaveBeenCalledTimes(1);
    expect(onAudio).toHaveBeenCalledWith(chunk, 48000);
    await expect(microphone.start(onAudio)).rejects.toThrow(/already/);

    await microphone.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
    expect(node.port.onmessage).toBeNull();
    expect(microphone.active).toBe(false);
  });

  it('releases the stream when permission or setup fails', async () => {
    const denied = setup();
    denied.mediaDevices.getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('denied'), {name: 'NotAllowedError'})
    );
    await expect(denied.microphone.start(vi.fn())).rejects.toThrow('denied');

    const broken = setup();
    broken.context.audioWorklet.addModule.mockRejectedValueOnce(
      new Error('no worklet')
    );
    await expect(broken.microphone.start(vi.fn())).rejects.toThrow(
      'no worklet'
    );
    expect(broken.track.stop).toHaveBeenCalled();
    expect(broken.context.close).toHaveBeenCalled();
    expect(broken.microphone.active).toBe(false);
  });

  it('cancels a start that is stopped while waiting for permission', async () => {
    const {microphone, mediaDevices, track} = setup();
    let grant!: (stream: unknown) => void;
    mediaDevices.getUserMedia.mockImplementationOnce(
      () => new Promise((resolve) => (grant = resolve))
    );
    const starting = microphone.start(vi.fn());
    await microphone.stop();
    grant({getTracks: () => [track]});
    await expect(starting).rejects.toThrow(/canceled/);
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports missing microphone support', async () => {
    const microphone = new Microphone({mediaDevices: undefined});
    await expect(microphone.start(vi.fn())).rejects.toThrow(/microphone/);
  });
});
