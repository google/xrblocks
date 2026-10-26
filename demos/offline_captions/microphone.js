export const PROCESSOR_NAME = 'offline-captions-capture';

/** Microphone capture through an AudioWorklet; chunks stay at the device rate. */
export class Microphone {
  /**
   * @param {{
   *   mediaDevices?: MediaDevices,
   *   createContext?: () => AudioContext,
   *   processorUrl?: URL | string,
   * }} [options]
   */
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    createContext = () => new AudioContext({latencyHint: 'interactive'}),
    processorUrl = new URL('./captureProcessor.js', import.meta.url),
  } = {}) {
    this.mediaDevices = mediaDevices;
    this.createContext = createContext;
    this.processorUrl = processorUrl;
    this.session = null;
    this.generation = 0;
  }

  get active() {
    return this.session !== null;
  }

  /**
   * @param {(samples: Float32Array, sampleRate: number) => void} onAudio
   * @returns {Promise<{sampleRate: number}>}
   */
  async start(onAudio) {
    if (this.session) throw new Error('The microphone is already on.');
    if (!this.mediaDevices?.getUserMedia) {
      throw new Error('This browser has no microphone access here.');
    }
    const generation = ++this.generation;
    const session = {stream: null, context: null, source: null, node: null};
    try {
      session.stream = await this.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.assertCurrent(generation);
      session.context = this.createContext();
      await session.context.audioWorklet.addModule(this.processorUrl);
      this.assertCurrent(generation);
      session.source = session.context.createMediaStreamSource(session.stream);
      session.node = new AudioWorkletNode(session.context, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const {sampleRate} = session.context;
      session.node.port.onmessage = ({data}) => {
        if (this.session === session && data instanceof Float32Array) {
          onAudio(data, sampleRate);
        }
      };
      session.source.connect(session.node);
      // The worklet writes silence; the connection keeps it scheduled.
      session.node.connect(session.context.destination);
      await session.context.resume();
      this.assertCurrent(generation);
      this.session = session;
      return {sampleRate};
    } catch (error) {
      await release(session);
      throw error;
    }
  }

  async stop() {
    this.generation++;
    const session = this.session;
    this.session = null;
    if (session) await release(session);
  }

  assertCurrent(generation) {
    if (generation !== this.generation) {
      throw new Error('Microphone start canceled.');
    }
  }
}

async function release(session) {
  if (session.node) session.node.port.onmessage = null;
  session.source?.disconnect();
  session.node?.disconnect();
  for (const track of session.stream?.getTracks() ?? []) track.stop();
  if (session.context && session.context.state !== 'closed') {
    await session.context.close().catch(() => {});
  }
}
