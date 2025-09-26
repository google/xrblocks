import * as THREE from 'three';
import { AI } from '../../ai/AI';
import { Tool } from '../Tool';
/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export declare class GenerateSkyboxTool extends Tool {
    private ai;
    private scene;
    constructor(ai: AI, scene: THREE.Scene);
    /**
     * Executes the tool's action.
     * @param args - The prompt to use to generate the skybox.
     * @returns A promise that resolves with the result of the skybox generation.
     */
    execute(args: {
        prompt: string;
    }): Promise<string>;
}
