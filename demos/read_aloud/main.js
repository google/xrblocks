import * as xb from 'xrblocks';

import {ReadAloud} from './ReadAloud.js';

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;
options.enableCamera('environment');
options.permissions.microphone = true;
options.sound.speechRecognizer.enabled = true;
options.sound.speechRecognizer.continuous = true;
options.sound.speechRecognizer.interimResults = false;
options.sound.speechRecognizer.commands = ['read', 'stop'];
options.sound.speechSynthesizer.enabled = true;
options.sound.speechSynthesizer.allowInterruptions = true;
options.setAppTitle('Read Aloud');
options.setAppDescription(
  'Say "read" to photograph a page with the headset camera; Gemini (or a ' +
    'local Ollama model) extracts the text and Matcha-TTS on the tethered ' +
    'laptop speaks it.'
);

xb.add(new ReadAloud());
xb.init(options);
