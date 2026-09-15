import * as THREE from 'three';
import * as xb from 'xrblocks';

const CAT_SOURCE = {
  url: 'models/Cat/cat.gltf',
  path: xb.XR_BLOCKS_ASSETS_PATH,
};

export class OcclusionScene extends xb.Script {
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
    this.cat.name = 'Occlusion cat';
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
    this.addLights();
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
      'Move around and hide the cat behind furniture to see occlusion.';
  }

  addLights() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0, 500, -10);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    this.add(light);
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
          text: 'OCCLUSION',
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
    overlay.name = 'Occlusion instructions';
    return overlay;
  }
}
