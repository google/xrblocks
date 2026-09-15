import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ANIMAL_MODELS} from './animal_models.js';
import {AnimalSlider, type AnimalModel} from './animal_slider.js';
import {WeaponToolUI} from './weapon_tool_ui.js';
import {InteractionUtils} from './interaction_utils.js';
import {AudioManager} from './audio_manager.js';
import {ParticleSystem} from './particle_system.js';
import {WeaponEffects} from './weapon_effects.js';
import {AnimalBehavior} from './animal_behavior.js';
import {randInt} from './math_utils.js';

const HIDDEN_Y_POSITION = -100;
const ACTIVE_Y_THRESHOLD = -50;
const DEFAULT_DRAG_DISTANCE = 1.0;

const LIGHT_HEMISPHERE_SKY = 0xbbbbbb;
const LIGHT_HEMISPHERE_GROUND = 0x888888;
const LIGHT_HEMISPHERE_INTENSITY = 3;
const LIGHT_DIR_COLOR = 0xffffff;
const LIGHT_DIR_INTENSITY = 2;
const LIGHT_DIR_POS_Y = 500;
const LIGHT_DIR_POS_Z = -10;
const SHADOW_MAP_SIZE = 2048;

const RAIN_DROP_INTERVAL_INITIAL = 0.05;
const RAIN_DROP_INTERVAL_NORMAL = 1.5;

const SPAWN_OFFSET_FORWARD = 7.0;
const SPAWN_OFFSET_RIGHT_SPREAD = 10.0;
const SPAWN_OFFSET_FORWARD_SPREAD = 3.0;
const SPAWN_HEIGHT_BASE = 4.0;
const SPAWN_HEIGHT_SPREAD = 3.0;

const MS_TO_SEC_MULTIPLIER = 0.001;

/**
 * Reusable vectors for intermediate math calculations during frame updates.
 * Multiple vectors are required to avoid overwriting values during chained operations
 * (e.g., cross products or interpolations) without allocating new memory and causing GC stutter.
 */
const sharedVectorA = new THREE.Vector3();
const sharedVectorB = new THREE.Vector3();
const sharedVectorC = new THREE.Vector3();
const sharedVectorD = new THREE.Vector3();

/** Main scene controller for the Animal Attack interactive application. */
export class AnimalOcclusionScene extends xb.Script {
  public static dependencies = {camera: THREE.Camera, depth: xb.Depth};

  public raycaster = new THREE.Raycaster();
  public spawnedAnimals: Map<number, THREE.Object3D> = new Map();
  public draggedAnimal: THREE.Object3D | null = null;
  public isDragging = false;
  public dragSource: THREE.Object3D | null = null;
  public dragDistance = DEFAULT_DRAG_DISTANCE;
  public weaponsEnabled = false;
  public rainActive = true;
  public rainTimer = 0;
  public firstRainDropPending = true;
  public particleSystem = new ParticleSystem(this);
  public sliderUI!: AnimalSlider;
  public weaponUI!: WeaponToolUI;
  private camera!: THREE.Camera;
  private depth!: xb.Depth;

  public async init({camera, depth}: {camera: THREE.Camera; depth: xb.Depth}) {
    this.camera = camera;
    this.depth = depth;
    this.addLights();

    this.sliderUI = new AnimalSlider(this, ANIMAL_MODELS);
    this.weaponUI = new WeaponToolUI(
      this,
      (enabled: boolean) => {
        this.weaponsEnabled = enabled;
      },
      (rainActive: boolean) => {
        this.rainActive = rainActive;
        if (this.rainActive) {
          this.firstRainDropPending = true;
        } else {
          this.explodeAllAnimals();
        }
      }
    );

    this.preloadAllAnimals();
  }

  /** Initializes and loads all animal 3D models hidden from view. */
  public preloadAllAnimals() {
    let globalId = 0;
    for (const [typeIndex, animalData] of ANIMAL_MODELS.entries()) {
      const modelViewer = new xb.ModelViewer({
        manipulation: false,
        occlusion: true,
        castShadow: true,
        receiveShadow: true,
      });
      modelViewer.userData = {animalIndex: globalId, typeIndex};
      modelViewer.position.set(0, HIDDEN_Y_POSITION, 0);

      this.add(modelViewer);
      this.spawnedAnimals.set(globalId, modelViewer);
      void this.loadAnimalModel(modelViewer, animalData);
      globalId++;
    }
  }

  /** Adds directional and hemisphere lighting to the scene. */
  public addLights() {
    this.add(
      new THREE.HemisphereLight(
        LIGHT_HEMISPHERE_SKY,
        LIGHT_HEMISPHERE_GROUND,
        LIGHT_HEMISPHERE_INTENSITY
      )
    );
    const light = new THREE.DirectionalLight(
      LIGHT_DIR_COLOR,
      LIGHT_DIR_INTENSITY
    );
    light.position.set(0, LIGHT_DIR_POS_Y, LIGHT_DIR_POS_Z);
    light.castShadow = true;
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.add(light);
  }

  /** Initiates the drag interaction for a specific animal. */
  public startDraggingAnimal(index: number, startPosition: THREE.Vector3) {
    this.draggedAnimal = this.spawnedAnimals.get(index) ?? null;
    this.isDragging = true;

    if (this.draggedAnimal) {
      this.draggedAnimal.userData.hasTarget = false;
      this.draggedAnimal.userData.spawnSource = 'manual';
      if (startPosition) this.draggedAnimal.position.copy(startPosition);
    }
  }

  /** Asynchronously loads a GLTF model and configures its animations and materials. */
  public async loadAnimalModel(
    modelViewer: xb.ModelViewer,
    animalData: AnimalModel
  ) {
    try {
      const {scale, rotY, path, file, tint} = animalData;
      await modelViewer.load({
        url: file,
        path,
        scale,
        rotation: {x: 0, y: THREE.MathUtils.degToRad(rotY), z: 0},
      });

      modelViewer.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          if (tint !== undefined) {
            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((mat) => {
                const newMat = mat.clone() as THREE.MeshBasicMaterial;
                newMat.color.setHex(tint);
                return newMat;
              });
            } else if (mesh.material) {
              mesh.material = mesh.material.clone();
              (mesh.material as THREE.MeshBasicMaterial).color.setHex(tint);
            }
          }
        }
      });
    } catch (e) {
      console.error('Failed to load animal:', e);
    }
  }

  /** Releases the currently dragged animal, establishing its new anchor position. */
  public dropAnimal(raycaster: THREE.Raycaster) {
    if (!this.draggedAnimal) return;

    const paletteHit = InteractionUtils.checkIntersection(
      raycaster,
      this.sliderUI.getPaletteItems(),
      this.spawnedAnimals
    );
    if (
      (paletteHit?.object.userData as Record<string, unknown>)?.isPaletteItem
    ) {
      this.destroyAnimal(this.draggedAnimal.userData.animalIndex as number);
      return;
    }

    const target = this.camera.position.clone();
    target.y = this.draggedAnimal.position.y;
    this.draggedAnimal.lookAt(target);

    this.draggedAnimal.userData.anchorPosition ??= new THREE.Vector3();
    this.draggedAnimal.userData.anchorPosition.copy(
      this.draggedAnimal.position
    );
    this.draggedAnimal.userData.homeAnchor =
      this.draggedAnimal.position.clone();

    this.isDragging = false;
    this.draggedAnimal = null;
    this.dragSource = null;
  }

  /** Executes a weapon attack from the given source point along the raycaster path. */
  public fireWeapon(
    aimingRaycaster: THREE.Raycaster,
    visualSourcePoint: THREE.Vector3
  ) {
    const types = ['laser', 'ball', 'fire', 'tornado'];
    const actualWeaponType = types[randInt(types.length)];

    const {hitAnimalId, isEnvHit, point} = InteractionUtils.getWeaponEndPoint(
      aimingRaycaster,
      this.spawnedAnimals,
      this.depth.depthMesh
    );
    if (hitAnimalId !== undefined) {
      this.destroyAnimal(hitAnimalId);
    } else if (isEnvHit && point) {
      this.particleSystem.spawnSparks(point);
    }

    if (point) {
      WeaponEffects.show(visualSourcePoint, point, this, actualWeaponType);
    }
  }

  /** Triggers the explosion effect and hides the specified animal. */
  public destroyAnimal(index: number) {
    const modelViewer = this.spawnedAnimals.get(index);
    if (modelViewer && modelViewer.position.y > ACTIVE_Y_THRESHOLD) {
      this.particleSystem.spawnExplosion(modelViewer.position.clone());
      AudioManager.playExplosionSound();

      modelViewer.position.set(0, HIDDEN_Y_POSITION, 0);
      modelViewer.userData.hasTarget = false;

      if (this.draggedAnimal === modelViewer) {
        this.isDragging = false;
        this.draggedAnimal = null;
        this.dragSource = null;
      }
    }
  }

  /** Explodes all currently active animals in the scene. */
  public explodeAllAnimals() {
    for (const [index, animal] of this.spawnedAnimals.entries()) {
      if (animal.position.y > ACTIVE_Y_THRESHOLD) this.destroyAnimal(index);
    }
  }

  /** Processes the start of a user interaction, handling UI clicks, weapons, or dragging. */
  public handleInteractionStart(
    raycaster: THREE.Raycaster,
    sourceObject: THREE.Object3D
  ) {
    const isPaletteHit =
      raycaster.intersectObjects(this.sliderUI.getPaletteItems(), false)
        .length > 0;

    if (this.weaponsEnabled && !isPaletteHit) {
      const visualOrigin = sharedVectorA.setFromMatrixPosition(
        sourceObject.matrixWorld
      );
      this.fireWeapon(raycaster, visualOrigin);
      return;
    }

    if (this.isDragging) return;

    const hit = InteractionUtils.checkIntersection(
      raycaster,
      this.sliderUI.getPaletteItems(),
      this.spawnedAnimals
    );
    if (!hit) return;

    this.dragSource = sourceObject;
    const origin = sharedVectorB.setFromMatrixPosition(
      sourceObject.matrixWorld
    );

    this.dragDistance = hit.point.distanceTo(origin);

    const targetId = (hit.object.userData as Record<string, unknown>)
      ?.isPaletteItem
      ? this.getAvailableAnimalFromPalette(
          hit.object.userData.animalIndex as number
        )
      : (hit.object.userData.animalIndex as number);

    if (targetId !== undefined) this.startDraggingAnimal(targetId, hit.point);
  }

  /** Finds a hidden, available animal instance matching the requested type index. */
  private getAvailableAnimalFromPalette(typeIndex: number) {
    const pool = [...this.spawnedAnimals.entries()].filter(
      ([, a]) => a.userData.typeIndex === typeIndex
    );
    for (const [, a] of pool) {
      a.position.set(0, HIDDEN_Y_POSITION, 0);
      a.userData.hasTarget = false;
    }
    return pool[0]?.[0];
  }

  /** Handles mouse, hand-ray, and controller selection through the shared input API. */
  public onSelectStart(event: xb.SelectEvent) {
    if (
      this.sliderUI.isControlTarget(event.target) ||
      this.weaponUI.isControlTarget(event.target)
    ) {
      return;
    }
    const controller = event.source.controller;
    controller.updateMatrixWorld(true);
    InteractionUtils.setRaycasterFromXRController(this.raycaster, controller);
    this.handleInteractionStart(this.raycaster, controller);
  }

  /** Releases a dragged animal when the selecting source is released. */
  public onSelectEnd(event: xb.SelectEndEvent) {
    const controller = event.source.controller;
    if (this.dragSource === controller) {
      controller.updateMatrixWorld(true);
      InteractionUtils.setRaycasterFromXRController(this.raycaster, controller);
      this.dropAnimal(this.raycaster);
    }
  }

  /** Drops a new animal from the sky near the user's location. */
  public spawnRainAnimal() {
    const available = [...this.spawnedAnimals.entries()]
      .filter(([, a]) => a.position.y <= ACTIVE_Y_THRESHOLD)
      .map(([index]) => index);

    if (available.length > 0) {
      const index = available[randInt(available.length)];
      const animal = this.spawnedAnimals.get(index);

      if (animal) {
        sharedVectorA.set(0, SPAWN_HEIGHT_BASE, -2);
        sharedVectorB
          .set(0, 0, -1)
          .applyQuaternion(this.camera.quaternion)
          .setY(0)
          .normalize();
        sharedVectorC.set(0, 1, 0);
        sharedVectorD.crossVectors(sharedVectorB, sharedVectorC).normalize();

        sharedVectorA
          .copy(this.camera.position)
          .addScaledVector(sharedVectorB, SPAWN_OFFSET_FORWARD)
          .addScaledVector(
            sharedVectorD,
            (Math.random() - 0.5) * SPAWN_OFFSET_RIGHT_SPREAD
          )
          .addScaledVector(
            sharedVectorB,
            (Math.random() - 0.5) * SPAWN_OFFSET_FORWARD_SPREAD
          );
        sharedVectorA.y +=
          SPAWN_HEIGHT_BASE + Math.random() * SPAWN_HEIGHT_SPREAD;

        animal.position.copy(sharedVectorA);
        Object.assign(animal.userData, {
          isFalling: true,
          hasTarget: false,
          spawnSource: 'rain',
        });

        if (!animal.userData.homeAnchor) {
          animal.userData.homeAnchor = new THREE.Vector3();
        }
        animal.userData.homeAnchor.copy(this.camera.position).setY(0);
      }
    }
  }

  /** Main frame loop for ticking logic, animations, and particle systems. */
  public update() {
    const deltaTime = xb.getDeltaTime();
    const time = performance.now() * MS_TO_SEC_MULTIPLIER;

    if (this.rainActive) {
      this.rainTimer += deltaTime;
      const dropInterval = this.firstRainDropPending
        ? RAIN_DROP_INTERVAL_INITIAL
        : RAIN_DROP_INTERVAL_NORMAL;
      if (this.rainTimer > dropInterval) {
        this.rainTimer = 0;
        this.firstRainDropPending = false;
        this.spawnRainAnimal();
      }
    } else {
      this.firstRainDropPending = true;
    }

    this.particleSystem.update(deltaTime);

    AnimalBehavior.updateFalling(
      this.spawnedAnimals,
      this.depth.depthMesh,
      this.particleSystem,
      this.camera,
      deltaTime,
      this.draggedAnimal
    );
    AnimalBehavior.updateDragTransform(
      this.isDragging,
      this.draggedAnimal,
      this.dragSource,
      this.raycaster,
      this.camera,
      this.depth.depthMesh,
      this.dragDistance
    );
    AnimalBehavior.updateWandering(
      this.spawnedAnimals,
      this.depth.depthMesh,
      deltaTime,
      time,
      this.draggedAnimal,
      this.camera
    );
    AnimalBehavior.updateBreathing(
      this.spawnedAnimals,
      time,
      ANIMAL_MODELS,
      this.isDragging
    );
  }
}
