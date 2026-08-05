import * as THREE from 'three';
import * as xb from 'xrblocks';

const CAT_SOURCE = {
  url: 'models/Cat/cat.gltf',
  path: xb.XR_BLOCKS_ASSETS_PATH,
};

export class LightingScene extends xb.Script {
  static dependencies = {
    camera: THREE.Camera,
    depth: xb.Depth,
  };

  constructor() {
    super();
    this.camera = null;
    this.depth = null;

    this.cat = new xb.ModelViewer({
      occlusion: true,
      manipulation: true,
      castShadow: true,
      receiveShadow: true,
    });
    this.cat.name = 'Lighting cat';
    this.cat.visible = false;
    this.add(this.cat);

    this.instructionText = new xb.UIText({
      text: 'Click or pinch the environment to place the cat.',
      pointerEvents: 'none',
      style: {
        fontSize: 24,
        textAlign: 'center',
      },
    });
    this.add(this.createInstructions());
  }

  async init({camera, depth}) {
    this.camera = camera;
    this.depth = depth;
    await this.cat.load(CAT_SOURCE);
  }

  onSelectStart(event) {
    if (event.surface !== this.depth.depthMesh || !event.intersection) return;

    this.cat.position.copy(event.intersection.point);
    this.cat.lookAt(
      this.camera.position.x,
      this.cat.position.y,
      this.camera.position.z
    );
    this.cat.visible = true;
    this.instructionText.text =
      'Move the cat and watch its light, color, and shadow match the room.';
  }

  createInstructions() {
    const overlay = new xb.UIOverlay({
      pointerEvents: 'none',
      style: {
        width: 680,
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: {translateX: '-50%'},
      },
      children: [
        new xb.UIText({
          text: 'LIGHTING ESTIMATION',
          pointerEvents: 'none',
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        this.instructionText,
      ],
    });
    overlay.name = 'Lighting instructions';
    return overlay;
  }
}
