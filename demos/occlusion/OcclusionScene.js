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
    user: xb.User,
  };

  constructor() {
    super();
    this.camera = null;
    this.depth = null;
    this.user = null;

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
        width: '100%',
        fontSize: 24,
        color: '#ffffff',
        textAlign: 'center',
      },
    });
    this.add(this.createInstructions());
  }

  async init({camera, depth, user}) {
    this.camera = camera;
    this.depth = depth;
    this.user = user;
    this.addLights();
    await this.cat.load(CAT_SOURCE);
  }

  onSelectStart(event) {
    const depthMesh = this.depth?.depthMesh;
    const controllerIndex = this.user?.controllers.indexOf(
      event.source.controller
    );
    if (!depthMesh || controllerIndex === undefined || controllerIndex < 0) {
      return;
    }

    const intersection = this.user.getIntersectionAt(
      depthMesh,
      controllerIndex
    );
    if (!intersection) return;

    this.cat.position.copy(intersection.point);
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
    const panel = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: 680,
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: {translateX: '-50%'},
        flexDirection: 'column',
        gap: 8,
        padding: 18,
        backgroundColor: 'rgba(28, 28, 32, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.22)',
        borderWidth: 1.5,
        borderRadius: 24,
      },
      children: [
        new xb.UIText({
          text: 'OCCLUSION',
          pointerEvents: 'none',
          style: {
            width: '100%',
            fontSize: 24,
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
          },
        }),
        this.instructionText,
      ],
    });
    const overlay = new xb.UIOverlay({
      pointerEvents: 'none',
      children: [panel],
    });
    overlay.name = 'Occlusion instructions';
    return overlay;
  }
}
