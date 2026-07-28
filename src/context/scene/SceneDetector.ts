import * as THREE from 'three';

import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {ScreenshotSynthesizer} from '../../core/components/ScreenshotSynthesizer';
import {SimulationTimer} from '../../core/components/SimulationTimer';
import {Script} from '../../core/Script';
import {ContextOptions} from '../ContextOptions';
import {
  buildSemanticTree,
  SemanticTreeInternal,
} from './semantic-tree/SemanticTreeBuilder';
import {SemanticIdRegistry} from '../shared/SemanticIdRegistry';
import {
  SemanticTree,
  SetOfMarkContext,
  VisibleObjectsContext,
} from '../shared/SemanticTypes';
import {createSetOfMarkContext} from './som/SetOfMarkBuilder';
import {createVisibleObjectsContext} from './visible-objects/VisibleObjectsBuilder';

type ContextSnapshot = {
  semanticInternal?: SemanticTreeInternal;
  visibleObjects?: VisibleObjectsContext;
  som?: SetOfMarkContext;
};

export type SceneContextDetectionOptions = {
  semanticTree?: boolean;
  visibleObjects?: boolean;
  setOfMark?: boolean;
};

export type SceneContextDetectionResult = {
  semanticTree?: SemanticTree;
  visibleObjects?: VisibleObjectsContext;
  setOfMark?: SetOfMarkContext;
};

export class SceneDetector extends Script {
  static dependencies = {
    options: ContextOptions,
    scene: THREE.Scene,
    camera: THREE.Camera,
    screenshotSynthesizer: ScreenshotSynthesizer,
    simulationTimer: SimulationTimer,
  };

  private options!: ContextOptions;
  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private screenshotSynthesizer!: ScreenshotSynthesizer;
  private simulationTimer?: SimulationTimer;
  private deviceCamera?: XRDeviceCamera;
  private registry = new SemanticIdRegistry();
  private snapshot: ContextSnapshot | null = null;
  private snapshotPromise: Promise<ContextSnapshot> | null = null;
  private activeClients = new Set<object>();
  private currentDetectionPromise: Promise<SemanticTree> | null = null;
  private currentVisibleObjectsPromise: Promise<VisibleObjectsContext> | null =
    null;
  private currentSetOfMarkPromise: Promise<SetOfMarkContext> | null = null;
  private currentContextPromise: Promise<SceneContextDetectionResult> | null =
    null;
  private currentContextRequestKey = '';
  private lastContinuousDetectionStartedAtMs = -Infinity;
  private disposed = false;

  /**
   * The latest semantic tree produced by scene context detection.
   */
  public tree: SemanticTree | null = null;

  /**
   * The latest semantic tree annotated with user-view visibility.
   */
  public visibleObjects: VisibleObjectsContext | null = null;

  /**
   * The latest Set-of-Mark context image and label mapping.
   */
  public setOfMark: SetOfMarkContext | null = null;

  init({
    options,
    scene,
    camera,
    screenshotSynthesizer,
    simulationTimer,
    deviceCamera,
  }: {
    options: ContextOptions;
    scene: THREE.Scene;
    camera: THREE.Camera;
    screenshotSynthesizer: ScreenshotSynthesizer;
    simulationTimer?: SimulationTimer;
    deviceCamera?: XRDeviceCamera;
  }) {
    this.options = options;
    this.scene = scene;
    this.camera = camera;
    this.screenshotSynthesizer = screenshotSynthesizer;
    this.simulationTimer = simulationTimer;
    this.deviceCamera = deviceCamera ?? this.deviceCamera;
    this.snapshot = null;
    this.disposed = false;
  }

  setDeviceCamera(deviceCamera: XRDeviceCamera | undefined) {
    this.deviceCamera = deviceCamera;
  }

  resolveNodeObject(nodeId: string): THREE.Object3D | undefined {
    return this.snapshot?.semanticInternal?.nodeObjects.get(nodeId);
  }

  start(client: object): void {
    if (!this.options.enabled || !this.options.scene.enabled) {
      console.warn(
        'Cannot start scene context detection: scene context is not enabled.'
      );
      return;
    }
    if (this.activeClients.has(client)) {
      return;
    }
    this.activeClients.add(client);
    if (this.activeClients.size === 1) {
      this.runContinuousDetection();
    }
  }

  stop(client: object): void {
    this.activeClients.delete(client);
  }

  override update() {
    if (!this.shouldRunContinuous()) {
      return;
    }
    this.runContinuousDetection();
  }

  shouldRunContinuous(now = performance.now()) {
    if (this.activeClients.size === 0 || this.currentDetectionPromise) {
      return;
    }

    const pollingIntervalMs = this.options.scene.pollingIntervalMs;
    if (
      pollingIntervalMs > 0 &&
      now - this.lastContinuousDetectionStartedAtMs < pollingIntervalMs
    ) {
      return;
    }

    return true;
  }

  runDetection(): Promise<SemanticTree> {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise;
    }
    if (this.activeClients.size > 0) {
      this.runContinuousDetection();
      return this.currentDetectionPromise!;
    }
    this.currentDetectionPromise = this.runContextDetection({
      semanticTree: true,
    })
      .then((result) => result.semanticTree!)
      .finally(() => {
        this.currentDetectionPromise = null;
      });
    return this.currentDetectionPromise;
  }

  runVisibleObjectsDetection(): Promise<VisibleObjectsContext> {
    if (this.currentVisibleObjectsPromise) {
      return this.currentVisibleObjectsPromise;
    }
    this.currentVisibleObjectsPromise = this.runContextDetection({
      semanticTree: false,
      visibleObjects: true,
    })
      .then((result) => result.visibleObjects!)
      .finally(() => {
        this.currentVisibleObjectsPromise = null;
      });
    return this.currentVisibleObjectsPromise;
  }

  runSetOfMarkDetection(): Promise<SetOfMarkContext> {
    if (this.currentSetOfMarkPromise) {
      return this.currentSetOfMarkPromise;
    }
    this.currentSetOfMarkPromise = this.runContextDetection(
      {
        semanticTree: false,
        visibleObjects: true,
        setOfMark: true,
      },
      {preserveVisibleObjects: true}
    )
      .then((result) => result.setOfMark!)
      .finally(() => {
        this.currentSetOfMarkPromise = null;
      });
    return this.currentSetOfMarkPromise;
  }

  runContextDetection(
    options: SceneContextDetectionOptions = {
      semanticTree: true,
      visibleObjects: true,
      setOfMark: true,
    },
    snapshotOptions: {preserveVisibleObjects?: boolean} = {}
  ): Promise<SceneContextDetectionResult> {
    const request = {
      semanticTree: options.semanticTree !== false,
      visibleObjects: options.visibleObjects === true,
      setOfMark: options.setOfMark === true,
    };
    const requestKey = JSON.stringify({
      ...request,
      preserveVisibleObjects: snapshotOptions.preserveVisibleObjects === true,
    });
    if (
      this.currentContextPromise &&
      this.currentContextRequestKey === requestKey
    ) {
      return this.currentContextPromise;
    }
    this.beginSnapshot(snapshotOptions);
    this.currentContextRequestKey = requestKey;
    this.currentContextPromise = this.detectSceneContext(request).finally(
      () => {
        this.currentContextPromise = null;
        this.currentContextRequestKey = '';
      }
    );
    return this.currentContextPromise;
  }

  private runContinuousDetection(): Promise<SemanticTree> | null {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise;
    }

    this.lastContinuousDetectionStartedAtMs = performance.now();
    this.currentDetectionPromise = this.runContextDetection({
      semanticTree: true,
      visibleObjects: this.options.scene.visibleObjects.enabled,
      setOfMark: this.options.scene.som.enabled,
    })
      .then((result) => result.semanticTree!)
      .then((result) => {
        this.tree = result;
        return result;
      })
      .finally(() => {
        this.currentDetectionPromise = null;
      });
    return this.currentDetectionPromise;
  }

  private async detectSceneContext(
    options: Required<SceneContextDetectionOptions>
  ): Promise<SceneContextDetectionResult> {
    if (this.disposed) {
      return {};
    }
    const result: SceneContextDetectionResult = {};
    if (options.semanticTree) {
      result.semanticTree = await this.getSemanticTree();
      if (this.disposed) {
        return {};
      }
      this.tree = result.semanticTree;
    }
    if (options.visibleObjects || options.setOfMark) {
      result.visibleObjects = await this.getVisibleObjectsContext();
      if (this.disposed) {
        return {};
      }
    }
    if (options.setOfMark) {
      result.setOfMark = await this.getSetOfMarkContext();
      if (this.disposed) {
        return {};
      }
    }
    return this.disposed ? {} : result;
  }

  private beginSnapshot(options: {preserveVisibleObjects?: boolean} = {}) {
    if (options.preserveVisibleObjects && this.snapshot?.visibleObjects) {
      this.snapshot.som = undefined;
      return;
    }
    this.snapshot = {};
  }

  private async getSemanticTree(): Promise<SemanticTree> {
    const snapshot = await this.getSnapshot();
    return snapshot.semanticInternal!.tree;
  }

  private async getVisibleObjectsContext(
    camera = this.camera
  ): Promise<VisibleObjectsContext> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.visibleObjects) {
      snapshot.visibleObjects = createVisibleObjectsContext({
        scene: this.scene,
        camera,
        semanticTree: snapshot.semanticInternal!,
        occlusionOpacityThreshold:
          this.options.scene.visibleObjects.occlusionOpacityThreshold,
      });
    }
    if (!this.disposed) {
      this.visibleObjects = snapshot.visibleObjects;
    }
    return snapshot.visibleObjects;
  }

  private async getSetOfMarkContext(): Promise<SetOfMarkContext> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.som) {
      const camera = this.camera;
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const projectionMatrix = camera.projectionMatrix.clone();
      const matrixWorldInverse = camera.matrixWorldInverse.clone();
      const visibleObjects = await this.getVisibleObjectsContext(camera);
      const overlayOnCamera = this.deviceCamera?.loaded === true;
      const screenshot =
        await this.screenshotSynthesizer.getScreenshot(overlayOnCamera);
      snapshot.som = await createSetOfMarkContext({
        tree: visibleObjects,
        image: screenshot,
        nodeObjects: snapshot.semanticInternal!.nodeObjects,
        registry: this.registry,
        projectionMatrix,
        matrixWorldInverse,
      });
    }
    if (!this.disposed) {
      this.setOfMark = snapshot.som;
    }
    return snapshot.som;
  }

  private async getSnapshot(): Promise<ContextSnapshot> {
    if (this.snapshot?.semanticInternal) {
      return this.snapshot;
    }
    if (this.snapshotPromise) {
      return this.snapshotPromise;
    }
    this.snapshotPromise = Promise.resolve()
      .then(() => {
        const snapshot = this.snapshot ?? {};
        snapshot.semanticInternal = buildSemanticTree({
          scene: this.scene,
          registry: this.registry,
          capturedAt: this.getCaptureTimeMs(),
        });
        this.snapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.snapshotPromise = null;
      });
    return this.snapshotPromise;
  }

  override dispose() {
    this.disposed = true;
    this.activeClients.clear();
    this.snapshot = null;
    this.snapshotPromise = null;
    this.currentDetectionPromise = null;
    this.currentVisibleObjectsPromise = null;
    this.currentSetOfMarkPromise = null;
    this.currentContextPromise = null;
    this.currentContextRequestKey = '';
    this.tree = null;
    this.visibleObjects = null;
    this.setOfMark = null;
  }

  private getCaptureTimeMs() {
    return this.simulationTimer?.getElapsedMs() ?? performance.now();
  }
}
