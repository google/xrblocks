import { UICard, UICore, UIPanel } from 'uiblocks';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
/**
 * Base class for all samples.
 * Handles common setup like renderer configuration and description panel creation.
 */
export declare abstract class Sample extends xb.Script {
    uiCore: UICore;
    protected constructor();
    init(): Promise<void>;
    /**
     * Helper utility used by all children samples to create a standard, consistently-styled root section.
     * Gives a full-width container with a bold white text title at the top left,
     * inside which it hosts and returns a flexible content panel using the specified flex direction.
     */
    protected createSectionWithTitle(parent: UICard, title: string, wrapperWidth?: number | 'auto' | `${number}%`, wrapperHeight?: number | 'auto' | `${number}%`, containerFlexDirection?: 'column' | 'row'): UIPanel;
    /**
     * Abstract method to be implemented by subclasses to create their specific UI.
     */
    abstract createUI(): void;
    /** Override to customize XRBlocks options */
    setupOptions(_options: xb.Options): void;
    static run(SampleClass: new () => Sample): void;
}
