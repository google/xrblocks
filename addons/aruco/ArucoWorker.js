import { refineCornersSubpixel, solveMarkerPose, meanSidePixels } from './ArucoPose.js';

// Addon declarations target the normal browser DOM library rather than the
// separate `webworker` library. Keep the worker surface explicit so this entry
// can be type-checked with the same configuration as the rest of XRBlocks.
const worker = self;
let libraryPromise = null;
let detector = null;
let cellsPerSide = 0;
let posit = null;
/**
 * js-aruco2 is CommonJS, so an ESM CDN serves its `exports` object as the
 * default export; a hand-converted copy may use named exports instead.
 */
function pickNamespace(module, name) {
    const candidate = module;
    const found = candidate.default?.[name] ?? candidate[name];
    if (!found) {
        throw new Error(`The js-aruco2 module does not export "${name}".`);
    }
    return found;
}
function loadLibrary(moduleUrls) {
    if (!libraryPromise) {
        // Import maps do not apply inside workers, so the library is imported by
        // absolute URL rather than by package name.
        libraryPromise = Promise.all([
            import(/* @vite-ignore */ moduleUrls.aruco),
            import(/* @vite-ignore */ moduleUrls.posit),
        ]).then(([arucoModule, positModule]) => ({
            AR: pickNamespace(arucoModule, 'AR'),
            POS: pickNamespace(positModule, 'POS'),
        }));
    }
    return libraryPromise;
}
function requireLibrary() {
    if (!libraryPromise) {
        return Promise.reject(new Error('The ArUco worker was not initialized.'));
    }
    return libraryPromise;
}
function configure(library, config) {
    detector = new library.AR.Detector({
        dictionaryName: config.dictionary,
        // js-aruco2 accepts matches strictly below this distance, and defaults to
        // the dictionary's own minimum distance, which admits wildly wrong IDs.
        maxHammingDistance: config.maxHamming + 1,
    });
    cellsPerSide =
        Math.sqrt(library.AR.DICTIONARIES[config.dictionary].nBits) + 2;
}
async function detect(message) {
    const library = await requireLibrary();
    if (!detector)
        throw new Error('The ArUco detector is not configured.');
    const markers = detector.detect({
        width: message.width,
        height: message.height,
        data: new Uint8ClampedArray(message.imageBuffer),
    });
    if (markers.length === 0)
        return [];
    const focal = message.intrinsics.fx;
    if (!posit ||
        posit.sizeMeters !== message.markerSizeMeters ||
        posit.focal !== focal) {
        posit = {
            solver: new library.POS.Posit(message.markerSizeMeters, focal),
            sizeMeters: message.markerSizeMeters,
            focal,
        };
    }
    const results = [];
    for (const marker of markers) {
        const corners = message.refineCorners
            ? refineCornersSubpixel(detector.grey, marker.corners, cellsPerSide)
            : marker.corners;
        const pose = solveMarkerPose(posit.solver, corners, message.intrinsics, message.markerSizeMeters);
        if (!pose)
            continue;
        results.push({
            id: marker.id,
            hamming: marker.hammingDistance,
            sidePixels: meanSidePixels(corners),
            reprojectionError: pose.reprojectionError,
            rotation: pose.rotation,
            translation: pose.translation,
        });
    }
    return results;
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
worker.onmessage = (event) => {
    const message = event.data;
    switch (message.type) {
        case 'dispose':
            worker.close();
            return;
        case 'initialize':
            void loadLibrary(message.moduleUrls)
                .then((library) => {
                configure(library, message);
                worker.postMessage({ type: 'ready' });
            })
                .catch((error) => worker.postMessage({
                type: 'error',
                message: `Could not load js-aruco2: ${describe(error)}`,
            }));
            return;
        case 'configure':
            void requireLibrary()
                .then((library) => configure(library, message))
                .catch((error) => worker.postMessage({ type: 'error', message: describe(error) }));
            return;
        case 'markerSvg':
            void requireLibrary()
                .then((library) => worker.postMessage({
                type: 'markerSvg',
                requestId: message.requestId,
                svg: new library.AR.Dictionary(message.dictionary).generateSVG(message.id),
            }))
                .catch((error) => worker.postMessage({
                type: 'markerSvgError',
                requestId: message.requestId,
                message: describe(error),
            }));
            return;
        case 'detect':
            void detect(message)
                .then((detections) => worker.postMessage({
                type: 'detections',
                requestId: message.requestId,
                detections,
            }))
                .catch((error) => worker.postMessage({
                type: 'error',
                requestId: message.requestId,
                message: describe(error),
            }));
            return;
    }
};
