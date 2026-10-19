import * as THREE from 'three';

import type {ImageModel} from 'ai';
import {Tool, type ToolResult} from 'xrblocks';

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export class GenerateSkyboxTool extends Tool {
  private texture?: THREE.Texture;
  private generation = 0;
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
    const generation = ++this.generation;
    const model = this.model;
    try {
      if (typeof args?.prompt !== 'string' || !args.prompt.trim()) {
        throw new Error('A skybox prompt is required.');
      }
      const {generateImage} = await import('ai');
      const {image} = await generateImage({
        model,
        prompt:
          'Generate a seamless 2:1 panoramic 360-degree equirectangular skybox image for: ' +
          args.prompt,
      });
      const texture = await new THREE.TextureLoader().loadAsync(
        `data:${image.mediaType};base64,${image.base64}`
      );
      if (generation !== this.generation) {
        texture.dispose();
        throw new Error('Skybox generation was superseded or disposed.');
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.texture?.dispose();
      this.texture = texture;
      this.scene.background = texture;
      return {
        success: true,
        data: 'Skybox generated successfully.',
        metadata: {prompt: args?.prompt, timestamp: Date.now()},
      };
    } catch (e) {
      console.error('error:', e);
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : 'Unknown error while creating skybox',
        metadata: {prompt: args?.prompt, timestamp: Date.now()},
      };
    }
  }

  dispose() {
    ++this.generation;
    if (this.texture && this.scene.background === this.texture) {
      this.scene.background = null;
    }
    this.texture?.dispose();
    this.texture = undefined;
  }
}
