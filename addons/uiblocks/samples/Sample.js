import { reversePainterSortStable } from '@pmndrs/uikit';
import { UICore, raycastSortFunction, UIPanel, UIText } from 'uiblocks';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';

/**
 * Base class for all samples.
 * Handles common setup like renderer configuration and description panel creation.
 */
class Sample extends xb.Script {
    constructor() {
        super();
        this.uiCore = new UICore(this);
    }
    async init() {
        const renderer = xb.core.renderer;
        renderer.localClippingEnabled = true;
        renderer.setTransparentSort(reversePainterSortStable);
        xb.core.input.raycaster.sortFunction =
            raycastSortFunction;
        this.createUI();
    }
    /**
     * Helper utility used by all children samples to create a standard, consistently-styled root section.
     * Gives a full-width container with a bold white text title at the top left,
     * inside which it hosts and returns a flexible content panel using the specified flex direction.
     */
    createSectionWithTitle(parent, title, wrapperWidth = '100%', wrapperHeight = 'auto', containerFlexDirection = 'row') {
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
    /** Override to customize XRBlocks options */
    setupOptions(_options) { }
    static run(SampleClass) {
        async function start() {
            const options = new xb.Options();
            options.enableUI();
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

export { Sample };
