import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {Tool, ToolResult} from '../Tool';

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export class GenerateSkyboxTool extends Tool {
  constructor(
    private ai: AI,
    private scene: THREE.Scene
  ) {
    super({
      name: 'generateSkybox',
      description:
        'Generate a 360 equirectangular skybox image for the given prompt.',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description:
              'A description of the skybox to generate, e.g. "a sunny beach with palm trees"',
          },
        },
        required: ['prompt'],
      },
    });
  }

  /**
   * Executes the tool's action.
   * @param args - The prompt to use to generate the skybox.
   * @returns A promise that resolves with a ToolResult containing success/error information.
   */
  override async execute(args: {prompt: string}): Promise<ToolResult<string>> {
    try {
      const image = await this.ai.generate(
        'Generate a 360 equirectangular skybox image for the prompt of:' +
          args.prompt,
        'image',
        'Generate a 360 equirectangular skybox image for the prompt'
      );
      if (image) {
        console.log('Applying texture...');
        this.scene.background = new THREE.TextureLoader().load(image);
        this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
        return {
          success: true,
          data: 'Skybox generated successfully.',
          metadata: {prompt: args.prompt, timestamp: Date.now()},
        };
      } else {
        return {
          success: false,
          error: 'Failed to generate skybox image',
          metadata: {prompt: args.prompt, timestamp: Date.now()},
        };
      }
    } catch (e) {
      console.error('error:', e);
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : 'Unknown error while creating skybox',
        metadata: {prompt: args.prompt, timestamp: Date.now()},
      };
    }
  }
}
