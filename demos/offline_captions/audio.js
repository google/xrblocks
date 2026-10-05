export const TARGET_SAMPLE_RATE = 16000;

/**
 * Stateful mono downsampler. Each output sample is the box-filtered average of
 * the input samples it covers, so chunked and one-shot processing agree.
 */
export class Resampler {
  /**
   * @param {number} inputRate
   * @param {number} [outputRate]
   */
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    if (
      !Number.isFinite(inputRate) ||
      !Number.isFinite(outputRate) ||
      outputRate <= 0 ||
      inputRate < outputRate
    ) {
      throw new Error(
        `Unsupported resampling from ${inputRate} Hz to ${outputRate} Hz.`
      );
    }
    this.ratio = inputRate / outputRate;
    this.position = 0;
    this.pending = new Float32Array(0);
  }

  /**
   * @param {Float32Array} input
   * @returns {Float32Array}
   */
  process(input) {
    const data = concatFloat32([this.pending, input]);
    const half = this.ratio / 2;
    const output = new Float32Array(
      Math.max(0, Math.ceil((data.length - this.position) / this.ratio) + 1)
    );
    let count = 0;
    let t = this.position;
    while (Math.floor(t + half) < data.length) {
      const start = Math.max(0, Math.ceil(t - half));
      const end = Math.min(data.length - 1, Math.floor(t + half));
      let sum = 0;
      for (let i = start; i <= end; i++) sum += data[i];
      output[count++] = sum / (end - start + 1);
      t += this.ratio;
    }
    const drop = Math.max(0, Math.min(data.length, Math.floor(t - half)));
    this.pending = data.slice(drop);
    this.position = t - drop;
    return output.subarray(0, count);
  }
}

/**
 * @param {Float32Array[]} parts
 * @returns {Float32Array}
 */
export function concatFloat32(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * @param {Float32Array} samples
 * @returns {number}
 */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/**
 * Decode a 16-bit PCM WAV file to mono floats, for the debug file feed.
 * @param {ArrayBuffer} buffer
 * @returns {{samples: Float32Array, sampleRate: number}}
 */
export function decodeWav(buffer) {
  const view = new DataView(buffer);
  const tag = (offset) =>
    String.fromCharCode(
      ...new Uint8Array(buffer, offset, Math.min(4, buffer.byteLength - offset))
    );
  if (buffer.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a WAV file.');
  }
  let format = null;
  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!format || format.code !== 1 || format.bits !== 16) {
        throw new Error('Only 16-bit PCM WAV files are supported.');
      }
      const frames = Math.floor(
        Math.min(size, buffer.byteLength - body) / (2 * format.channels)
      );
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < format.channels; c++) {
          sum += view.getInt16(body + (i * format.channels + c) * 2, true);
        }
        samples[i] = sum / format.channels / 32768;
      }
      return {samples, sampleRate: format.sampleRate};
    }
    offset = body + size + (size % 2);
  }
  throw new Error('The WAV file has no audio data.');
}
