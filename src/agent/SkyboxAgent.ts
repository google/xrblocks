import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';

import {AI} from '../ai/AI';
import {CoreSound} from '../sound/CoreSound';

import {Agent} from './Agent';
import {GenerateSkyboxTool} from './tools/GenerateSkyboxTool';

export class SkyboxAgent extends Agent {
  constructor(ai: AI, private sound: CoreSound, scene: THREE.Scene) {
    super(
        ai, [new GenerateSkyboxTool(ai, scene)],
        `You are a friendly and helpful skybox designer. The response should be short. Your only capability
         is to generate a 360-degree equirectangular skybox image based on
         a user's description. You will generate a default skybox if the user
         does not provide any description. You will use the tool 'generateSkybox'
         with the summarized description as the 'prompt' argument to create the skybox.`);
  }

  async startLiveSession(callbacks: GoogleGenAITypes.LiveCallbacks) {
    this.ai.setLiveCallbacks(callbacks);
    const functionDeclarations: GoogleGenAITypes.FunctionDeclaration[] =
        this.tools.map(tool => tool.toJSON());
    const systemInstruction: GoogleGenAITypes.ContentUnion = {
      parts: [{text: this.contextBuilder.instruction}]
    };
    await this.ai.startLiveSession({
      tools: functionDeclarations,
      systemInstruction: systemInstruction,
    });

    this.sound.enableAudio();
  }

  async stopLiveSession() {
    await this.ai.stopLiveSession();
    this.sound.disableAudio();
  }

  async sendToolResponse(
      response: GoogleGenAITypes.LiveSendToolResponseParameters) {
    console.log('Sending tool response:', response);
    this.ai.sendToolResponse(response);
  }
}
