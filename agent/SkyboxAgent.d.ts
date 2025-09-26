import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';
import { AI } from '../ai/AI';
import { CoreSound } from '../sound/CoreSound';
import { Agent } from './Agent';
export declare class SkyboxAgent extends Agent {
    private sound;
    constructor(ai: AI, sound: CoreSound, scene: THREE.Scene);
    startLiveSession(callbacks: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    stopLiveSession(): Promise<void>;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): Promise<void>;
}
