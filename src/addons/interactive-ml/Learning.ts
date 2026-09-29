import type {ClassifierData, TrainingOptions} from './Types';

export function probabilities(features: number[], data: ClassifierData) {
  const x = features.map((v, i) => (v - data.mean[i]) / data.scale[i]);
  const logits = data.weights.map((row, k) =>
    row.reduce((sum, w, i) => sum + w * x[i], data.bias[k])
  );
  const max = Math.max(...logits);
  const values = logits.map((v) => Math.exp(v - max));
  const sum = values.reduce((a, b) => a + b, 0);
  return values.map((v) => v / sum);
}

/** Small balanced softmax head; feature extraction never runs here. */
export async function fitClassifier(
  samples: {label: string; features: number[]}[],
  options: TrainingOptions = {}
): Promise<ClassifierData> {
  const epochs = options.epochs ?? 100;
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 500)
    throw new Error('Use 1–500 training epochs.');
  const labels = [...new Set(samples.map((s) => s.label))];
  if (labels.length < 2 || labels.length > 32)
    throw new Error('Training requires 2–32 classes.');
  const dimensions = samples[0].features.length;
  const mean = Array(dimensions).fill(0) as number[];
  const scale = Array(dimensions).fill(0) as number[];
  for (const sample of samples)
    for (let i = 0; i < dimensions; i++)
      mean[i] += sample.features[i] / samples.length;
  for (const sample of samples)
    for (let i = 0; i < dimensions; i++)
      scale[i] += (sample.features[i] - mean[i]) ** 2 / samples.length;
  for (let i = 0; i < dimensions; i++)
    scale[i] = Math.max(Math.sqrt(scale[i]), 0.01);
  const rows = samples.map((s) => ({
    target: labels.indexOf(s.label),
    x: s.features.map((v, i) => (v - mean[i]) / scale[i]),
  }));
  const counts = labels.map(
    (_, k) => rows.filter((row) => row.target === k).length
  );
  const weights = labels.map(() => Array(dimensions).fill(0) as number[]);
  const bias = labels.map(() => 0);
  const centers = labels.map(() => Array(dimensions).fill(0) as number[]);
  for (const {x, target} of rows)
    for (let i = 0; i < dimensions; i++)
      centers[target][i] += x[i] / counts[target];
  const radii = labels.map(() => 1);
  for (const {x, target} of rows) {
    const distance = Math.sqrt(
      x.reduce((sum, v, i) => sum + (v - centers[target][i]) ** 2, 0) /
        dimensions
    );
    radii[target] = Math.max(radii[target], distance * 1.5);
  }
  for (let epoch = 0; epoch < epochs; epoch++) {
    options.signal?.throwIfAborted();
    const gradient = labels.map(() => Array(dimensions).fill(0) as number[]);
    const biasGradient = labels.map(() => 0);
    for (const {x, target} of rows) {
      const logits = weights.map((row, k) =>
        row.reduce((sum, w, i) => sum + w * x[i], bias[k])
      );
      const max = Math.max(...logits);
      const exp = logits.map((v) => Math.exp(v - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      for (let k = 0; k < labels.length; k++) {
        const error =
          (exp[k] / sum - Number(k === target)) /
          (counts[target] * labels.length);
        biasGradient[k] += error;
        for (let i = 0; i < dimensions; i++) gradient[k][i] += error * x[i];
      }
    }
    const rate = 0.5 / Math.sqrt(dimensions);
    for (let k = 0; k < labels.length; k++) {
      bias[k] -= rate * biasGradient[k];
      for (let i = 0; i < dimensions; i++)
        weights[k][i] -= rate * (gradient[k][i] + weights[k][i] * 0.001);
    }
    if (epoch % 5 === 0) {
      options.onProgress?.(epoch / epochs);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  options.signal?.throwIfAborted();
  options.onProgress?.(1);
  return {labels, mean, scale, weights, bias, centers, radii};
}

export function trainClassifier(
  samples: {label: string; features: number[]}[],
  options: TrainingOptions
): Promise<ClassifierData> {
  options.signal?.throwIfAborted();
  // Non-browser callers use the same bounded, yielding algorithm.
  if (typeof Worker === 'undefined') return fitClassifier(samples, options);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./training.worker.js', import.meta.url),
      {type: 'module'}
    );
    const finish = () => {
      worker.terminate();
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(
        options.signal?.reason ??
          new DOMException('Training cancelled', 'AbortError')
      );
    };
    options.signal?.addEventListener('abort', abort, {once: true});
    worker.onmessage = ({data}) => {
      try {
        if (data.progress !== undefined) options.onProgress?.(data.progress);
        else {
          finish();
          if (data.error) reject(new Error(data.error));
          else resolve(data.model);
        }
      } catch (error) {
        finish();
        reject(error);
      }
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error('Could not read the training worker result.'));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Training worker failed.'));
    };
    try {
      worker.postMessage({samples, epochs: options.epochs});
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
