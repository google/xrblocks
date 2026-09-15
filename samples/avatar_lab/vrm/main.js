import * as THREE from 'three';
import * as xb from 'xrblocks';

import {VRMAvatarScript} from '../../../demos/vrm-avatar/VRMAvatarScript.js';

const VRM_URL =
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.5.1/packages/three-vrm-animation/examples/models/VRM1_Constraint_Twist_Sample.vrm';
const ASSETS_BASE =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/avatars/';

class VRMLabUI extends xb.Script {
  constructor(avatar) {
    super();
    this.avatar = avatar;
    this.lastState = '';
  }

  init() {
    this.status = new xb.UIText({
      text: this.avatar.state,
      style: {fontSize: 20, textAlign: 'center'},
    });

    const card = new xb.UICard({
      size: {width: 0.54, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'VRM companion',
          style: {
            fontSize: 28,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Point at the floor and release Select to choose a walk target.',
          style: {
            fontSize: 16,
            lineHeight: 1.35,
            textAlign: 'center',
          },
        }),
        this.status,
        new xb.UIButton({
          label: 'Reset companion',
          icon: 'restart_alt',
          onClick: () => this.avatar.resetPosition(),
        }),
      ],
    });
    card.position.set(-0.68, 1.35, -1.0);
    card.rotation.y = Math.PI / 8;
    this.add(card);
  }

  update() {
    const state = this.avatar.state;
    if (state === this.lastState) return;
    this.lastState = state;
    this.status.text = state;
  }
}

class SceneSetup extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x586174, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(1, 3, 1);
    this.add(key);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const avatar = new VRMAvatarScript({
    vrmUrl: VRM_URL,
    tposeUrl: `${ASSETS_BASE}Tpose.glb`,
    idleUrl: `${ASSETS_BASE}IdleListening.glb`,
    walkUrl: `${ASSETS_BASE}Walking.glb`,
    rotateLerp: 0.08,
  });

  xb.add(new SceneSetup());
  xb.add(avatar);
  xb.add(new VRMLabUI(avatar));

  const options = new xb.Options();
  options.enableDepth();
  options.enableReticles();
  options.reticles.projectOnDepthMesh = true;
  options.setAppTitle('Avatar Lab · VRM Companion');
  options.setAppDescription(
    'Load a VRM avatar, then point at the floor to make it walk.'
  );
  await xb.init(options);
});
