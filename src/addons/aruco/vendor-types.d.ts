/**
 * Ambient stubs for `js-aruco2`.
 *
 * At runtime the detector worker loads the package from a URL (see
 * `DEFAULT_ARUCO_MODULE_URLS`); it is never bundled. It is installed as a
 * devDependency only so the unit tests can run the real detector, and these
 * stubs describe the small surface the addon touches.
 */
declare module 'js-aruco2' {
  const exports: {AR: import('./ArucoPose').ArucoNamespace};
  export default exports;
}

declare module 'js-aruco2/src/posit1.js' {
  const exports: {POS: import('./ArucoPose').PositNamespace};
  export default exports;
}
