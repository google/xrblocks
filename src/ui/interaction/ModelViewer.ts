import type {SplatMesh} from '@sparkjsdev/spark';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

import {OCCLUDABLE_ITEMS_LAYER} from '../../constants';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {OcclusionUtils} from '../../depth/occlusion/OcclusionUtils';
import {BACK, LEFT} from '../../utils/HelperConstants';
import {ModelLoader} from '../../utils/ModelLoader';
import {getGroupBoundingBox} from '../../utils/ModelUtils';
import type {Shader} from '../../utils/Types';
import {Draggable, DragManager, DragMode, HasDraggingMode} from '../../ux/DragManager';

import {ModelViewerPlatform} from './ModelViewerPlatform';

const defaultPlatformMargin = new THREE.Vector2(0.2, 0.2);
const vector3 = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const quaternion2 = new THREE.Quaternion();

export interface GLTFData {
  model: string;
  path: string;
  scale?: THREE.Vector3Like;
  rotation?: THREE.Vector3Like;
  position?: THREE.Vector3Like;
  verticallyAlignObject?: boolean;
  horizontallyAlignObject?: boolean;
}

export interface SplatData {
  model: string;
  scale?: THREE.Vector3Like;
  rotation?: THREE.Vector3Like;
  position?: THREE.Vector3Like;
  verticallyAlignObject?: boolean;
  horizontallyAlignObject?: boolean;
}

export class SplatAnchor extends THREE.Object3D implements HasDraggingMode {
  draggingMode = DragMode.ROTATING;
}

export class RotationRaycastMesh extends
    THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    super(geometry, material);
  }
  draggingMode = DragMode.ROTATING;
}

/**
 * A comprehensive UI component for loading, displaying, and
 * interacting with 3D models (GLTF and Splats) in an XR scene. It
 * automatically creates an interactive platform for translation and provides
 * mechanisms for rotation and scaling in both desktop and XR.
 */
export class ModelViewer extends Script implements Draggable {
  static dependencies = {
    camera: THREE.Camera,
    depth: Depth,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  };

  draggable = true;
  rotatable = true;
  scalable = true;
  platformAnimationSpeed = 2;
  platformThickness = 0.02;
  isOneOneScale = false;
  initialScale = new THREE.Vector3().setScalar(1);
  startAnimationOnLoad = true;
  clipActions: THREE.AnimationAction[] = [];

  private data?: GLTFData|SplatData;
  private clock = new THREE.Clock();
  private animationMixer?: THREE.AnimationMixer;
  private gltfMesh?: GLTF;
  private splatMesh?: SplatMesh;
  // Anchor to act as a proxy for the splat mesh
  private splatAnchor?: SplatAnchor;
  private hoveringControllers = new Set();
  private raycastToChildren: boolean;
  private occludableShaders = new Set<Shader>();
  private camera?: THREE.Camera;
  private depth?: Depth;
  private scene?: THREE.Scene;
  private renderer?: THREE.WebGLRenderer;
  private bbox = new THREE.Box3();
  private platform?: ModelViewerPlatform;
  private controlBar?: THREE.Mesh;
  private rotationRaycastMesh?: RotationRaycastMesh;

  constructor({
    castShadow = true,
    receiveShadow = true,
    raycastToChildren = false,
  }) {
    super();
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.raycastToChildren = raycastToChildren;
  }

  async init({camera, depth, scene, renderer}: {
    camera: THREE.Camera,
    depth: Depth,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  }) {
    this.camera = camera;
    this.depth = depth;
    this.scene = scene;
    this.renderer = renderer;

    for (const shader of this.occludableShaders) {
      this.depth!.occludableShaders.add(shader);
    }

    if (this.splatMesh) {
      await this.createSparkRendererIfNeeded();
      this.scene!.add(this.splatMesh);
    }
  }

  async loadSplatModel({
    data,
    onSceneLoaded = (_) => {},
    platformMargin = defaultPlatformMargin,
    setupRaycastCylinder = true,
    setupRaycastBox = false,
    setupPlatform = true,
  }: {
    data: SplatData,
    onSceneLoaded?: (scene: THREE.Object3D) => void,
    platformMargin?: THREE.Vector2,
    setupRaycastCylinder?: boolean,
    setupRaycastBox?: boolean,
    setupPlatform?: boolean
  }) {
    this.data = data;
    if (data.scale) {
      this.initialScale.copy(data.scale);
    }

    const splatMesh = await new ModelLoader().loadSplat({url: data.model});
    this.splatMesh = splatMesh;
    splatMesh.raycast = () => {};
    this.splatAnchor = new SplatAnchor;

    if (data.scale) {
      this.splatAnchor.scale.copy(data.scale);
    }
    if (data.rotation) {
      this.splatAnchor.rotation.set(
          THREE.MathUtils.degToRad(data.rotation.x),
          THREE.MathUtils.degToRad(data.rotation.y),
          THREE.MathUtils.degToRad(data.rotation.z));
    }
    if (data.position) {
      this.splatAnchor.position.copy(data.position);
    }

    this.add(this.splatAnchor);

    if (this.scene) {
      await this.createSparkRendererIfNeeded();
      this.scene.add(this.splatMesh);
    }

    await this.setupBoundingBox(
        data.verticallyAlignObject !== false,
        data.horizontallyAlignObject !== false);

    if (setupRaycastCylinder) {
      this.setupRaycastCylinder();
    } else if (setupRaycastBox) {
      this.setupRaycastBox();
    }
    if (setupPlatform) {
      this.setupPlatform(platformMargin);
    }

    this.setCastShadow(this.castShadow);
    this.setReceiveShadow(this.receiveShadow);

    // Return the anchor, as it's the interactive object in the scene graph
    return onSceneLoaded ? onSceneLoaded(this.splatAnchor) : this.splatAnchor;
  }

  async loadGLTFModel({
    data,
    onSceneLoaded = () => {},
    platformMargin = defaultPlatformMargin,
    setupRaycastCylinder = true,
    setupRaycastBox = false,
    setupPlatform = true,
    renderer = undefined,
    addOcclusionToShader = false
  }: {
    data: GLTFData,
    onSceneLoaded?: (scene: THREE.Object3D) => void,
    platformMargin?: THREE.Vector2,
    setupRaycastCylinder?: boolean,
    setupRaycastBox?: boolean,
    setupPlatform?: boolean,
    renderer?: THREE.WebGLRenderer,
    addOcclusionToShader?: boolean,
  }) {
    this.data = data;
    if (data.scale) {
      this.initialScale.copy(data.scale);
    }
    const gltf = await new ModelLoader().loadGLTF(
        {path: data.path, url: data.model, renderer: renderer});
    const animationMixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach((clip) => {
      if (this.startAnimationOnLoad) {
        animationMixer.clipAction(clip).play();
      } else {
        this.clipActions.push(animationMixer.clipAction(clip));
      }
    });
    (gltf.scene as unknown as HasDraggingMode).draggingMode =
        DragManager.ROTATING;
    this.gltfMesh = gltf;
    this.animationMixer = animationMixer;
    // Set the initial scale
    if (data.scale) {
      this.gltfMesh.scene.scale.copy(data.scale);
    }
    if (data.rotation) {
      gltf.scene.rotation.set(
          THREE.MathUtils.degToRad(data.rotation.x),
          THREE.MathUtils.degToRad(data.rotation.y),
          THREE.MathUtils.degToRad(data.rotation.z));
    }
    if (data.position) {
      gltf.scene.position.copy(data.position);
    }
    (gltf.scene as unknown as HasDraggingMode).draggingMode =
        DragManager.ROTATING;
    this.add(gltf.scene);
    await this.setupBoundingBox(
        data.verticallyAlignObject !== false,
        data.horizontallyAlignObject !== false);
    if (setupRaycastCylinder) {
      this.setupRaycastCylinder();
    } else if (setupRaycastBox) {
      this.setupRaycastBox();
    }
    if (setupPlatform) {
      this.setupPlatform(platformMargin);
    }
    this.setCastShadow(this.castShadow);
    this.setReceiveShadow(this.receiveShadow);
    if (addOcclusionToShader) {
      for (const material of this.platform?.material || []) {
        material.onBeforeCompile = (shader: Shader) => {
          OcclusionUtils.addOcclusionToShader(shader);
          shader.uniforms.occlusionEnabled.value = true;
          material.userData.shader = shader;
          this.occludableShaders.add(shader);
          this.depth?.occludableShaders.add(shader);
        }
      }
      this.platform?.layers.enable(OCCLUDABLE_ITEMS_LAYER);
      gltf.scene.traverse((child) => {
        if ((child as Partial<THREE.Mesh>).isMesh) {
          const mesh = child as THREE.Mesh;
          (mesh.material instanceof Array ? mesh.material : [
            mesh.material
          ]).forEach((material) => {
            material.transparent = true;
            material.onBeforeCompile = (shader) => {
              OcclusionUtils.addOcclusionToShader(shader);
              shader.uniforms.occlusionEnabled.value = true;
              this.occludableShaders.add(shader);
              this.depth?.occludableShaders.add(shader);
            };
          });
          child.layers.enable(OCCLUDABLE_ITEMS_LAYER);
        }
      });
    }
    return onSceneLoaded ? onSceneLoaded(gltf.scene) : gltf.scene;
  }

  async setupBoundingBox(
      verticallyAlignObject = true, horizontallyAlignObject = true) {
    if (this.splatMesh) {
      const localBbox = await this.splatMesh.getBoundingBox(false);
      if (localBbox.isEmpty()) {
        this.bbox = localBbox;
        return;
      }
      this.splatAnchor!.updateMatrix();
      const localBboxOfTransformedMesh =
          localBbox.clone().applyMatrix4(this.splatAnchor!.matrix);

      const translationAmount = new THREE.Vector3();
      localBboxOfTransformedMesh.getCenter(translationAmount)
          .multiplyScalar(-1);
      if (verticallyAlignObject) {
        translationAmount.y = -localBboxOfTransformedMesh.min.y;
      } else {
        translationAmount.y = 0;
      }
      if (!horizontallyAlignObject) {
        translationAmount.x = 0;
        translationAmount.z = 0;
      }
      this.splatAnchor!.position.add(translationAmount);
      this.bbox = localBboxOfTransformedMesh.translate(translationAmount);
    } else {
      const contentChildren = this.children.filter(
          (c) => c !== this.platform && c !== this.rotationRaycastMesh &&
              c !== this.controlBar);
      this.bbox = getGroupBoundingBox(contentChildren);
      if (this.bbox.isEmpty()) {
        return;
      }

      const translationAmount = new THREE.Vector3();
      this.bbox.getCenter(translationAmount).multiplyScalar(-1);
      if (verticallyAlignObject) {
        translationAmount.y = -this.bbox.min.y;
      } else {
        translationAmount.y = 0;
      }
      if (!horizontallyAlignObject) {
        translationAmount.x = 0;
        translationAmount.z = 0;
      }
      for (const child of contentChildren) {
        child.position.add(translationAmount);
      }
      this.bbox.translate(translationAmount);
    }
  }

  setupRaycastCylinder() {
    const bboxSize = new THREE.Vector3();
    this.bbox.getSize(bboxSize);

    const radius = 0.05 + 0.5 * Math.min(bboxSize.x, bboxSize.z);
    const rotationRaycastMesh = new RotationRaycastMesh(
        new THREE.CylinderGeometry(radius, radius, bboxSize.y),
        new THREE.MeshBasicMaterial({color: 0x990000, wireframe: true}));
    this.bbox.getCenter(rotationRaycastMesh.position);
    this.rotationRaycastMesh = rotationRaycastMesh;
    this.rotationRaycastMesh.visible = false;
    this.add(this.rotationRaycastMesh);
  }

  setupRaycastBox() {
    if (this.rotationRaycastMesh) {
      this.rotationRaycastMesh.removeFromParent();
      this.rotationRaycastMesh.geometry.dispose();
      this.rotationRaycastMesh.material.dispose();
    }
    const bboxSize = new THREE.Vector3();
    this.bbox.getSize(bboxSize);

    const rotationRaycastMesh = new RotationRaycastMesh(
        new THREE.BoxGeometry(bboxSize.x, bboxSize.y, bboxSize.z),
        new THREE.MeshBasicMaterial({color: 0x990000, wireframe: true}));
    this.bbox.getCenter(rotationRaycastMesh.position);
    this.rotationRaycastMesh = rotationRaycastMesh;
    this.rotationRaycastMesh.visible = false;
    this.add(this.rotationRaycastMesh);
  }

  setupPlatform(platformMargin = defaultPlatformMargin) {
    const bboxSize = new THREE.Vector3();
    this.bbox.getSize(bboxSize);
    const width = bboxSize.x + platformMargin.x;
    const depth = bboxSize.z + platformMargin.y;
    this.platform =
        new ModelViewerPlatform(width, depth, this.platformThickness);
    const center = new THREE.Vector3();
    this.bbox.getCenter(center);
    this.platform.position.set(center.x, -this.platformThickness / 2, center.z);
    this.add(this.platform);
  }

  update() {
    if (this.splatMesh && this.splatAnchor) {
      // Synchronize the splat mesh's transform with its anchor
      this.updateMatrixWorld(true);
      this.splatAnchor.matrixWorld.decompose(
          this.splatMesh.position, this.splatMesh.quaternion,
          this.splatMesh.scale);
    }
    const delta = this.clock.getDelta();
    if (this.animationMixer) {
      this.animationMixer.update(delta);
    }
    if (this.platform) {
      this.platform.update(delta);
    }
    const camera = this.camera;
    if (this.controlBar != null && this.controlBar.parent == this &&
        camera != null) {
      const directionToCamera =
          vector3.copy(camera.position).sub(this.position);
      const distanceToCamera = directionToCamera.length();
      const pitchAngleRadians = Math.asin(directionToCamera.normalize().y);
      directionToCamera.y = 0;
      directionToCamera.normalize();
      // Make the button face the camera.
      quaternion.copy(this.quaternion).invert();
      this.controlBar.quaternion.setFromAxisAngle(LEFT, pitchAngleRadians)
          .premultiply(quaternion2.setFromUnitVectors(BACK, directionToCamera))
          .premultiply(quaternion);
      this.controlBar.position.setScalar(0)
          .addScaledVector(directionToCamera, 0.5)
          .applyQuaternion(quaternion);
      this.controlBar.position.y = 0.0;
      this.controlBar.scale.set(
          distanceToCamera / this.scale.x, distanceToCamera / this.scale.y,
          distanceToCamera / this.scale.z);
    }
  }

  onObjectSelectStart() {
    return this.draggable || this.rotatable || this.scalable;
  }

  onObjectSelectEnd() {
    return this.draggable || this.rotatable || this.scalable;
  }

  onHoverEnter(controller: THREE.Object3D) {
    this.hoveringControllers.add(controller);
    if (this.platform) {
      this.platform.opacity.speed = this.platformAnimationSpeed;
    }
  }

  onHoverExit(controller: THREE.Object3D) {
    this.hoveringControllers.delete(controller);
    if (this.platform && this.hoveringControllers.size == 0) {
      this.platform.opacity.speed = -this.platformAnimationSpeed;
    }
  }

  /**
   * {@inheritDoc}
   */
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const content = this.gltfMesh?.scene ?? this.splatMesh;
    if (this.raycastToChildren && content) {
      const childRaycasts: THREE.Intersection[] = [];
      for (const child of this.children) {
        if (child != this.rotationRaycastMesh && child != this.platform &&
            child != this.controlBar) {
          raycaster.intersectObject(child, true, childRaycasts);
        }
      }
      intersects.push(...childRaycasts);
    }

    if (this.rotationRaycastMesh) {
      const rotationIntersects: THREE.Intersection[] = [];
      this.rotationRaycastMesh.raycast(raycaster, rotationIntersects);
      for (const intersect of rotationIntersects) {
        intersects.push(intersect);
      }
    }

    if (this.platform) {
      const platformIntersects: THREE.Intersection[] = [];
      this.platform.raycast(raycaster, platformIntersects);
      for (const intersect of platformIntersects) {
        intersects.push(intersect);
      }
    }

    if (this.controlBar != null && this.controlBar.parent == this) {
      const controlButtonIntersects: THREE.Intersection[] = [];
      this.controlBar.raycast(raycaster, controlButtonIntersects);
      for (const intersect of controlButtonIntersects) {
        intersects.push(intersect);
      }
    }
    return false;
  }

  onScaleButtonClick() {
    this.scale.setScalar(1.0);
  }

  setCastShadow(castShadow: boolean) {
    this.castShadow = castShadow;
    if (this.gltfMesh) {
      this.gltfMesh.scene.traverse(function(child) {
        child.castShadow = castShadow;
      });
    }
    if (this.platform) {
      this.platform.castShadow = false;
    }
  }

  setReceiveShadow(receiveShadow: boolean) {
    this.receiveShadow = receiveShadow;
    if (this.gltfMesh) {
      this.gltfMesh.scene.traverse(function(child) {
        child.receiveShadow = receiveShadow;
      });
    }
    if (this.platform) {
      this.platform.receiveShadow = receiveShadow;
    }
  }

  getOcclusionEnabled() {
    for (const shader of this.occludableShaders) {
      return shader.uniforms.occlusionEnabled.value;
    }
    return false;
  }

  setOcclusionEnabled(enabled: boolean) {
    for (const shader of this.occludableShaders) {
      shader.uniforms.occlusionEnabled.value = enabled;
    }
  }

  playClipAnimationOnce() {
    if (this.startAnimationOnLoad || this.clipActions.length === 0) {
      return;
    }

    this.clipActions.forEach((clip) => {
      clip.reset();
      clip.clampWhenFinished = true;
      clip.loop = THREE.LoopOnce;
      clip.play();
    });
  }

  async createSparkRendererIfNeeded() {
    // We insert our own SparkRenderer configured to show Gaussians up to
    // Math.sqrt(5) standard deviations from the center, recommended for XR.
    const {SparkRenderer} = await import('@sparkjsdev/spark');
    let sparkRendererExists = false;
    this.scene!.traverse((child) => {
      sparkRendererExists ||= (child instanceof SparkRenderer);
    });
    if (!sparkRendererExists) {
      this.scene!.add(new SparkRenderer(
          {renderer: this.renderer!, maxStdDev: Math.sqrt(5)}));
    }
  }
}
