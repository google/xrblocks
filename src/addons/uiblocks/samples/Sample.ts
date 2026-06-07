import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {UICard, UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';

type RaycasterWithSort = THREE.Raycaster & {
  sortFunction?: (a: THREE.Intersection, b: THREE.Intersection) => number;
};

/**
 * Base class for all samples.
 * Handles common setup like renderer configuration and description panel creation.
 */
export abstract class Sample extends xb.Script {
  uiCore: UICore;

  protected constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  async init() {
    (xb.core.input.raycaster as RaycasterWithSort).sortFunction =
      raycastSortFunction;

    this.createUI();
  }

  /**
   * Helper utility used by all children samples to create a standard, consistently-styled root section.
   * Gives a full-width container with a bold white text title at the top left,
   * inside which it hosts and returns a flexible content panel using the specified flex direction.
   */
  protected createSectionWithTitle(
    parent: UICard,
    title: string,
    wrapperWidth: number | 'auto' | `${number}%` = '100%',
    wrapperHeight: number | 'auto' | `${number}%` = 'auto',
    containerFlexDirection: 'column' | 'row' = 'row'
  ): UIPanel {
    const wrapper = new UIPanel({
      width: wrapperWidth,
      height: wrapperHeight,
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      fillColor: '#2a2a2a',
      strokeColor: 'white',
      strokeWidth: 2,
      cornerRadius: 20,
      padding: 20,
      gap: 20,
    });
    parent.add(wrapper);

    const titleText = new UIText(title, {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
    });
    wrapper.add(titleText);

    const container = new UIPanel({
      width: '100%',
      height: 'auto',
      flexDirection: containerFlexDirection,
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      gap: 20,
    });
    wrapper.add(container);

    return container;
  }

  /**
   * Abstract method to be implemented by subclasses to create their specific UI.
   */
  abstract createUI(): void;

  /** Override to customize XRBlocks options */
  setupOptions(_options: xb.Options) {}

  static run(SampleClass: new () => Sample) {
    async function start() {
      const options = new xb.Options();
      options.enableUI();
      options.uikit.enable(uikit);
      options.reticles.enabled = true;
      options.controllers.visualizeRays = false;
      options.simulator.instructions.enabled = false;

      const sample = new SampleClass();
      sample.setupOptions(options);
      xb.add(sample);
      await xb.init(options);
    }

    document.addEventListener('DOMContentLoaded', function () {
      start();
    });
  }
}
