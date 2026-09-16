const MODEL_ID = 'Xenova/slimsam-77-uniform';
const ATTENTION_ELEMENTS = 4096 * 4096 * 12;

export function supportsSamDevice(device, dtype) {
  const bytes = ATTENTION_ELEMENTS * (dtype === 'fp16' ? 2 : 4);
  return (
    !!device &&
    (dtype !== 'fp16' || device.features.has('shader-f16')) &&
    device.limits.maxStorageBufferBindingSize >= bytes &&
    device.limits.maxBufferSize >= bytes
  );
}

// One runtime per candidate. A failed ORT initialization poisons the module,
// so the caller must discard the entire worker, not just the model promise.
export function createSamRuntime({transformers, gpu}) {
  const {AutoProcessor, SamModel, RawImage, env} = transformers;
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/';
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
  // Pinned ORT throws per-kernel validation errors only in debug mode.
  env.backends.onnx.debug = true;
  let model = null;
  let proc = null;
  let state = null;
  let device = null;
  let deviceLoss = null;
  let configured = false;
  let useGpu = false;

  async function configure(candidate) {
    if (configured) return;
    if (candidate.device === 'webgpu') {
      useGpu = true;
      const adapter = await gpu?.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!supportsSamDevice(adapter, candidate.dtype)) {
        throw new Error(
          `SAM ${candidate.dtype} requires both GPU buffer limits >= ` +
            `${ATTENTION_ELEMENTS * (candidate.dtype === 'fp16' ? 2 : 4)} bytes` +
            (candidate.dtype === 'fp16' ? ' and shader-f16' : '')
        );
      }
      // ORT consumes this adapter and creates its own device. In this pin,
      // webgpu.device is readonly output, not an injection option.
      env.backends.onnx.webgpu.adapter = adapter;
    }
    configured = true;
  }

  function checkExecutionDevice(dtype) {
    if (!useGpu || device) return;
    device = env.backends.onnx.webgpu.device;
    if (!supportsSamDevice(device, dtype)) {
      throw new Error('SAM execution device does not meet buffer limits');
    }
    device.lost.then((info) => {
      deviceLoss = new Error(`SAM WebGPU device lost: ${info.message}`);
    });
  }

  async function checkedGpuCall(fn) {
    if (!device) return fn();
    if (deviceLoss) throw deviceLoss;
    const executionDevice = device;
    for (const filter of ['validation', 'out-of-memory', 'internal']) {
      executionDevice.pushErrorScope(filter);
    }
    let value;
    let failure;
    try {
      value = await fn();
      await executionDevice.queue.onSubmittedWorkDone();
      if (deviceLoss) throw deviceLoss;
    } catch (error) {
      failure = error;
    } finally {
      for (let i = 0; i < 3; i++) {
        try {
          const error = await executionDevice.popErrorScope();
          if (error) failure ??= new Error(`SAM WebGPU: ${error.message}`);
        } catch (error) {
          failure ??= error;
        }
      }
    }
    if (failure) throw failure;
    return value;
  }

  async function dispose() {
    state = null;
    proc = null;
    const abandoned = model;
    model = null;
    try {
      await abandoned?.dispose();
    } finally {
      (device ?? (useGpu ? env.backends.onnx.webgpu.device : null))?.destroy();
      device = null;
      useGpu = false;
    }
  }

  async function fail(error, abandoned = null) {
    try {
      await abandoned?.dispose();
    } catch (cleanupError) {
      console.warn('[objects_3d] SAM model disposal failed', cleanupError);
    }
    try {
      await dispose();
    } catch (cleanupError) {
      console.warn('[objects_3d] SAM runtime disposal failed', cleanupError);
    }
    throw error;
  }

  async function encode({snapshot, stateId, candidate}) {
    let initializing = null;
    try {
      await configure(candidate);
      proc ??= await AutoProcessor.from_pretrained(MODEL_ID);
      const image = new RawImage(
        snapshot.data,
        snapshot.width,
        snapshot.height,
        4
      );
      const image_inputs = await proc(image);
      if (!model) {
        initializing = await SamModel.from_pretrained(MODEL_ID, candidate);
      }
      checkExecutionDevice(candidate.dtype);
      const nextState = await checkedGpuCall(async () => {
        const image_embeddings = await (
          model ?? initializing
        ).get_image_embeddings(image_inputs);
        return {
          stateId,
          image,
          image_embeddings,
          width: snapshot.width,
          height: snapshot.height,
        };
      });
      // Only publish a model/processor pair after a real encoder run succeeds.
      model ??= initializing;
      initializing = null;
      state = nextState;
    } catch (error) {
      await fail(error, initializing);
    }
  }

  async function mask({stateId, box2d}) {
    try {
      if (!state || state.stateId !== stateId) {
        throw new Error('SAM snapshot embeddings are not current');
      }
      const {image, image_embeddings, width, height} = state;
      const x1 = box2d.min.x * width;
      const y1 = box2d.min.y * height;
      const x2 = box2d.max.x * width;
      const y2 = box2d.max.y * height;
      const cx = (x1 + x2) * 0.5;
      const cy = (y1 + y2) * 0.5;
      const prompt_inputs = await proc(image, {
        input_points: [
          [
            [
              [cx, cy],
              [x1, y1],
              [x2, y2],
            ],
          ],
        ],
        input_labels: [[[1, 2, 3]]],
      });
      const out = await checkedGpuCall(() =>
        model({...prompt_inputs, ...image_embeddings})
      );
      const masks = await proc.post_process_masks(
        out.pred_masks,
        prompt_inputs.original_sizes,
        prompt_inputs.reshaped_input_sizes
      );
      const t = masks[0];
      const dataBool = t.data;
      const H = t.dims[t.dims.length - 2];
      const W = t.dims[t.dims.length - 1];
      const planeStride = H * W;
      const numChannels = Math.max(
        1,
        Math.floor(dataBool.length / planeStride)
      );
      const ious = out.iou_scores?.data;
      const bx1 = Math.max(0, Math.floor(x1 * (W / width)));
      const by1 = Math.max(0, Math.floor(y1 * (H / height)));
      const bx2 = Math.min(W, Math.ceil(x2 * (W / width)));
      const by2 = Math.min(H, Math.ceil(y2 * (H / height)));
      let best = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < numChannels; c++) {
        const off = c * planeStride;
        let inside = 0;
        let total = 0;
        for (let y = 0; y < H; y++) {
          const row = off + y * W;
          const yIn = y >= by1 && y < by2;
          for (let x = 0; x < W; x++) {
            if (dataBool[row + x]) {
              total++;
              if (yIn && x >= bx1 && x < bx2) inside++;
            }
          }
        }
        if (total === 0) continue;
        const containment = inside / total;
        const iou = ious ? ious[c] : 0;
        const score = containment + 0.05 * iou;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      const offset = best * planeStride;
      const data = new Uint8Array(planeStride);
      for (let i = 0; i < planeStride; i++) {
        data[i] = dataBool[offset + i] ? 0 : 255;
      }
      return {width: W, height: H, data};
    } catch (error) {
      await fail(error);
    }
  }

  return {encode, mask, dispose};
}
