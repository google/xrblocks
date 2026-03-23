import * as uikit from '@pmndrs/uikit';
import { UICard, UICardOutProperties } from '../UICard';
/**
 * AdditiveUICard
 * An experimental wrapper facilitating correct Transparency Overlays (Screen/Additive blending).
 * Ideal for optical see-through AR form factors.
 * It renders all nested child contents inside a secondary offscreen RenderTarget layer, and projects the resulting texture inside its own Quad utilizing CustomBlending.
 */
export declare class AdditiveUICard extends UICard {
    private renderTarget;
    private renderCamera;
    targetContainer: uikit.Custom;
    private blendMode;
    /**
     * Constructs a new AdditiveUICard.
     * Spawns an offscreen standard camera mapping `ADDITIVE_LAYER` and renders dynamic composition graphs recursively inside an interval buffer.
     */
    constructor(config: UICardOutProperties & {
        blendMode?: 'screen' | 'additive';
    });
    /** Releases internal RenderTarget, materials, and attached textures safely. */
    dispose(): void;
    /**
     * Rescales RenderTarget dynamically against viewport sizes to maintain edge sharpness.
     */
    private updateTextureResolution;
    /**
     * Internal render loop callback overriding Standard container traversals.
     * Binds context onto an offscreen RenderTarget directly to compound translucency passes accurately without infinite loops.
     */
    private renderInternal;
}
