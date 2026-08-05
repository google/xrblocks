/**
 * MediaPipe InteractiveSegmenter mask backend.
 *
 * Looser than SAM but requires no model download. Used when
 * `maskBackend === 'mediapipe'`. All heavy dependencies are loaded at runtime
 * with dynamic `import()`.
 */
let _segmenter = null;
let _segmenterPromise = null;
/**
 * Lazily initialise the MediaPipe `InteractiveSegmenter`. The segmenter is
 * shared across all calls to avoid repeated initialisation cost.
 *
 * @returns Initialised `InteractiveSegmenter` instance.
 */
function getSegmenter() {
    if (_segmenter)
        return Promise.resolve(_segmenter);
    if (_segmenterPromise)
        return _segmenterPromise;
    _segmenterPromise = (async () => {
        const { FilesetResolver, InteractiveSegmenter: ISCls } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm');
        _segmenter = await ISCls.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite',
                delegate: 'GPU',
            },
            outputCategoryMask: true,
            outputConfidenceMasks: false,
        });
        return _segmenter;
    })();
    return _segmenterPromise;
}
/**
 * Obtain a segmentation mask for one detected object using the MediaPipe
 * `InteractiveSegmenter`. The bbox centre is used as the keypoint prompt.
 *
 * @param snapshot - Raw camera snapshot at detection time.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @returns Mask with foreground pixels at value `< 128`, or `null` on failure.
 */
async function segmenterMaskFromSnapshot(snapshot, box2d) {
    const seg = await getSegmenter();
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    canvas.getContext('2d').putImageData(snapshot, 0, 0);
    const cx = (box2d.min.x + box2d.max.x) * 0.5;
    const cy = (box2d.min.y + box2d.max.y) * 0.5;
    return new Promise((resolve, reject) => {
        try {
            seg.segment(canvas, { keypoint: { x: cx, y: cy } }, (result) => {
                const mask = result.categoryMask;
                if (!mask) {
                    resolve(null);
                    return;
                }
                // The MediaPipe mask's backing buffer is only valid for the duration of
                // this callback, so copy it out before close() frees it; the consumer
                // reads the mask in a later microtask (after this callback returns).
                const data = new Uint8Array(mask.getAsUint8Array());
                const { width, height } = mask;
                mask.close();
                resolve({
                    width,
                    height,
                    getAsUint8Array: () => data,
                    close: () => { },
                });
            });
        }
        catch (e) {
            reject(e);
        }
    });
}

export { getSegmenter, segmenterMaskFromSnapshot };
