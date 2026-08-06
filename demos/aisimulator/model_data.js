const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

export const DATA = [
  {
    model: {
      scale: {x: 4.0, y: 4.0, z: 4.0},
      path: PROPRIETARY_ASSETS_BASE_URL + 'monalisa/',
      model: 'mona_lisa_picture_frame_compressed.glb',
      verticallyAlignObject: false,
    },
    position: {x: -2.1, y: 1.75, z: -1.92},
    rotation: {x: 0, y: Math.PI / 2, z: 0},
    prompt: '“What is she smiling about?”',
  },
  {
    model: {
      scale: {x: 0.01, y: 0.01, z: 0.01},
      rotation: {x: 0, y: 0, z: 0},
      position: {x: 0, y: -0.2, z: -3.0},
      path: PROPRIETARY_ASSETS_BASE_URL + 'chess/',
      model: 'chess_compressed.glb',
      verticallyAlignObject: false,
    },
    position: {x: 0, y: 1.0, z: -1.2},
    rotation: {x: 0, y: 0, z: 0},
    prompt: "“What's a good strategy for this game?”",
  },
  {
    model: {
      path: ASSETS_BASE_URL + 'models/',
      model: 'Parasaurolophus.glb',
      scale: {x: 0.3, y: 0.3, z: 0.3},
      position: {x: 0, y: -0.6, z: 0},
      verticallyAlignObject: false,
      horizontallyAlignObject: false,
    },
    position: {x: 2.0, y: 1.0, z: -3.0},
    rotation: {x: 0, y: 0, z: 0},
    prompt: '“If this dinosaur could talk, what would it say?”',
  },
];
