import * as THREE from 'three';

import type {ImageModel} from 'ai';
import {Tool, type ToolResult} from 'xrblocks';

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export class GenerateSkyboxTool extends Tool {
  constructor(
    public model: ImageModel,
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
      const {generateImage} = await import('ai');
      const {image} = await generateImage({
        model: this.model,
        prompt:
          'Generate a seamless 2:1 panoramic 360-degree equirectangular skybox image for: ' +
          args.prompt,
      });
      const texture = await new THREE.TextureLoader().loadAsync(
        `data:${image.mediaType};base64,${image.base64}`
      );
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = texture;
      return {
        success: true,
        data: 'Skybox generated successfully.',
        metadata: {prompt: args.prompt, timestamp: Date.now()},
      };
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
