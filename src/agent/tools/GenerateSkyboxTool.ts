import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {Tool} from '../Tool';

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export class GenerateSkyboxTool extends Tool {
  constructor(private ai: AI, private scene: THREE.Scene) {
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
   * @returns A promise that resolves with the result of the skybox generation.
   */
  override async execute(args: {prompt: string}): Promise<string> {
    try {
      const image = await this.ai.generate(
          'Generate a 360 equirectangular skybox image for the prompt of:' +
              args.prompt,
          'image', 'Generate a 360 equirectangular skybox image for the prompt',
          'gemini-2.5-flash-image-preview');
      if (image) {
        console.log('Applying texture...');
        this.scene.background = new THREE.TextureLoader().load(image);
        this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
        return 'Skybox generated successfully.';
      } else {
        return 'Sorry, I had trouble creating that skybox.';
      }
    } catch (e) {
      console.error('error:', e);
      return 'Sorry, I encountered an error while creating the skybox.';
    }
  }
}
