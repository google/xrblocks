/** Number of marker IDs in each dictionary; valid IDs are `0..size-1`. */
const ARUCO_DICTIONARY_SIZES = {
    ARUCO_MIP_36h12: 250,
    ARUCO: 1023,
};
/**
 * Default dictionary. `ARUCO_MIP_36h12` keeps 12 bits between any two codes,
 * so misread cells are corrected instead of turning into another marker's ID;
 * the original `ARUCO` dictionary only keeps 3 and cannot correct anything.
 */
const DEFAULT_ARUCO_DICTIONARY = 'ARUCO_MIP_36h12';
/** Default marker selected by the demo. */
const DEFAULT_ARUCO_MARKER_ID = 0;
/**
 * Physical width of the marker's black square (its outer border included,
 * the white paper margin excluded). Always measure the actual print.
 */
const DEFAULT_ARUCO_MARKER_SIZE_METERS = 0.15;
/**
 * Where the detector worker loads js-aruco2 from. The package is CommonJS;
 * jsDelivr's `+esm` endpoint serves it as an ES module a module worker can
 * `import()`. Override through {@link ArucoTrackerOptions.moduleUrls} to
 * self-host.
 */
const DEFAULT_ARUCO_MODULE_URLS = {
    aruco: 'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/aruco.js/+esm',
    posit: 'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/posit1.js/+esm',
};

export { ARUCO_DICTIONARY_SIZES, DEFAULT_ARUCO_DICTIONARY, DEFAULT_ARUCO_MARKER_ID, DEFAULT_ARUCO_MARKER_SIZE_METERS, DEFAULT_ARUCO_MODULE_URLS };
