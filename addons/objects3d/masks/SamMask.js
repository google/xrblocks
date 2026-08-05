import { samDeviceCandidates } from './SamDevice.js';
export { SAM_ATTENTION_ELEMENTS } from './SamDevice.js';

/**
 * SlimSAM-77-uniform mask backend via `@huggingface/transformers`.
 *
 * All heavy dependencies are loaded at runtime with dynamic `import()` so the
 * addon bundle stays external-free at build time.
 */
/** Hugging Face model ID for SlimSAM-77-uniform. Apache-2 licensed, ~14 MB. */
const SAM_MODEL_ID = 'Xenova/slimsam-77-uniform';
// ---------------------------------------------------------------------------
// SAM singleton + serialisation queue
// ---------------------------------------------------------------------------
let _sam = null;
let _samProc = null;
let _samPromise = null;
// SAM's ONNX session is not re-entrant: a second call before the previous one
// resolves trips "Session already started". Serialise every SAM invocation
// behind a chained promise so ORT only ever sees one in-flight call.
let _samQueue = Promise.resolve();
/**
 * Enqueue `fn` behind the SAM serialisation queue. Ensures that at most one
 * SAM call is in flight at a time (the ONNX runtime is not re-entrant).
 *
 * @param fn - Async factory that performs one SAM operation.
 * @returns Promise resolving to `fn`'s return value.
 */
function samSerialize(fn) {
    const next = _samQueue.then(fn, fn);
    _samQueue = next.catch(() => { });
    return next;
}
/**
 * Lazily load SlimSAM-77-uniform model and processor, preferring WebGPU when
 * the adapter can actually run it and falling back through lower-precision and
 * CPU configurations of the same model.
 *
 * @returns Model and processor instances.
 */
function getSam() {
    if (_sam && _samProc)
        return Promise.resolve({ sam: _sam, proc: _samProc });
    if (_samPromise)
        return _samPromise;
    const pending = (async () => {
        const { SamModel: SamModelCls, AutoProcessor: AutoProcessorCls, env, } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        let adapter = null;
        try {
            adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        }
        catch (error) {
            console.warn('[objects3d] WebGPU adapter probe failed', error);
        }
        let lastError = null;
        for (const opts of samDeviceCandidates(adapter)) {
            try {
                _sam = (await SamModelCls.from_pretrained(SAM_MODEL_ID, opts));
                _samProc = (await AutoProcessorCls.from_pretrained(SAM_MODEL_ID));
                return { sam: _sam, proc: _samProc };
            }
            catch (error) {
                lastError = error;
                console.warn(`[objects3d] SAM load failed on ${opts.device}/${opts.dtype}`, error);
            }
        }
        throw lastError ?? new Error('SAM could not be loaded');
    })();
    _samPromise = pending;
    // Never leave a rejected promise cached: getSam() hands back the cached
    // promise, so a single failed load would otherwise keep failing for the rest
    // of the session instead of retrying.
    pending.catch(() => {
        if (_samPromise === pending)
            _samPromise = null;
    });
    return pending;
}
/**
 * Run the SAM encoder on a snapshot `ImageData` (once per detect press).
 * Subsequent per-detection mask requests reuse the returned `SamState`.
 *
 * @param snapshot - Raw camera snapshot to encode.
 * @returns Encoder state containing the image embedding and dimensions.
 */
async function samEncodeSnapshot(snapshot) {
    return samSerialize(async () => {
        const { sam, proc } = await getSam();
        const { RawImage: RawImageCls } = await import('@huggingface/transformers');
        const canvas = document.createElement('canvas');
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;
        canvas.getContext('2d').putImageData(snapshot, 0, 0);
        const image = (await RawImageCls.fromCanvas(canvas));
        const image_inputs = await proc(image);
        const image_embeddings = await sam.get_image_embeddings(image_inputs);
        return {
            image,
            image_inputs,
            image_embeddings,
            width: snapshot.width,
            height: snapshot.height,
        };
    });
}
/**
 * Decode a single object mask from the SAM encoder state using a 2D bbox
 * prompt. Returns a mask in the same shape that
 * {@link sampleDepthInMask} already accepts from the MediaPipe segmenter.
 *
 * @param samState - Encoder state from {@link samEncodeSnapshot}.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @returns Mask with foreground pixels at value `< 128`.
 */
async function samMaskFromBbox(samState, box2d) {
    return samSerialize(async () => {
        const { sam, proc } = await getSam();
        const { image, image_embeddings, width, height } = samState;
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
        const out = await sam({
            ...prompt_inputs,
            image_embeddings,
        });
        const masks = await proc.post_process_masks(out.pred_masks, prompt_inputs.original_sizes, prompt_inputs.reshaped_input_sizes);
        const t = masks[0];
        const dataBool = t.data;
        const H = t.dims[t.dims.length - 2];
        const W = t.dims[t.dims.length - 1];
        const planeStride = H * W;
        const numChannels = Math.max(1, Math.floor(dataBool.length / planeStride));
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
                        if (yIn && x >= bx1 && x < bx2)
                            inside++;
                    }
                }
            }
            if (total === 0)
                continue;
            const containment = inside / total;
            const iou = ious ? ious[c] : 0;
            const score = containment + 0.05 * iou;
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        }
        const offset = best * planeStride;
        const buf = new Uint8Array(planeStride);
        for (let i = 0; i < planeStride; i++) {
            buf[i] = dataBool[offset + i] ? 0 : 255;
        }
        return {
            width: W,
            height: H,
            getAsUint8Array: () => buf,
            close: () => { },
        };
    });
}

export { SAM_MODEL_ID, getSam, samDeviceCandidates, samEncodeSnapshot, samMaskFromBbox, samSerialize };
