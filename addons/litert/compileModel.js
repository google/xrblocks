import { describeError } from './LiteRtRuntime.js';

/**
 * Compile-and-run helpers around `@litertjs/core`, imported dynamically so
 * the addon bundle carries no static dependency on it.
 */
/**
 * Compiles `.tflite` bytes. Requires {@link loadLiteRtRuntime} to have
 * resolved first.
 */
async function compileModel(bytes, { accelerator, fallbackToWasm = true, cpuOptions }) {
    const core = await import('@litertjs/core');
    const compile = (target) => core.loadAndCompile(bytes, {
        accelerator: target,
        ...(target === 'wasm' && cpuOptions ? { cpuOptions } : {}),
    });
    try {
        return { model: await compile(accelerator), accelerator };
    }
    catch (error) {
        if (accelerator === 'wasm' || !fallbackToWasm)
            throw error;
        console.warn(`LiteRT: ${accelerator} compile failed (${describeError(error)}); ` +
            'falling back to wasm.');
        return {
            model: await compile('wasm'),
            accelerator: 'wasm',
            fallbackError: error,
        };
    }
}
/**
 * Runs one inference: wraps the inputs in tensors, reads every output back
 * to host memory, and deletes all tensors (also on failure).
 */
async function runModel(model, inputs) {
    const { Tensor } = await import('@litertjs/core');
    const inputTensors = [];
    const outputTensors = [];
    try {
        for (const input of inputs) {
            inputTensors.push(Tensor.fromTypedArray(input.data, input.shape));
        }
        const outputs = await model.run(inputTensors);
        outputTensors.push(...outputs);
        const buffers = [];
        for (const output of outputs) {
            buffers.push(await output.data());
        }
        return buffers;
    }
    finally {
        for (const tensor of [...inputTensors, ...outputTensors]) {
            try {
                tensor.delete();
            }
            catch {
                // Already deleted or never allocated.
            }
        }
    }
}

export { compileModel, runModel };
