import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

// Speak (or pinch) to summon a generated object into your space. The prompt is
// sent to Gemini image generation, the result is keyed onto a transparent
// cutout, and dropped in front of you as a draggable, depth-occluded object.
// Demonstrates the GenerativeObjects primitive (xb.core.generative.imagine).
//
// A Gemini API key is required, pass it in the URL as ?key=... or place a
// keys.json next to this file.

const PRESET_PROMPTS = [
  'a small friendly red dragon',
  'a potted succulent plant',
  'a vintage robot toy',
  'a slice of watermelon',
  'a rubber duck wearing sunglasses',
  'a paper airplane',
];

class GenerativeObjectDemo extends xb.Script {
  constructor() {
    super();
    this.presetIndex = 0;
    this.busy = false;
  }

  init() {
    // Voice trigger: imagine whatever you say.
    const recognizer = xb.core.sound?.speechRecognizer;
    if (recognizer) {
      recognizer.addEventListener('result', (event) => {
        if (event.isFinal && event.transcript.trim()) {
          this.imagine(event.transcript.trim());
        }
      });
      recognizer.start();
    }
    this.setStatus_('pinch to summon an object, or speak to describe one.');
  }

  // Pinch / click cycles through preset prompts so the demo works without a mic.
  onSelectEnd() {
    const prompt = PRESET_PROMPTS[this.presetIndex % PRESET_PROMPTS.length];
    this.presetIndex++;
    this.imagine(prompt);
  }

  async imagine(prompt) {
    if (this.busy) return;
    if (!xb.core.generative?.isSupported) {
      this.setStatus_('generation unavailable. add a Gemini ?key= and reload.');
      return;
    }
    this.busy = true;
    this.setStatus_(`summoning "${prompt}"...`);
    try {
      const object = await xb.core.generative.imagine(prompt);
      this.setStatus_(
        object
          ? `summoned "${prompt}". grab to move it. pinch or speak for more.`
          : `couldn't generate "${prompt}". try again.`
      );
    } catch (error) {
      console.error('[generative_object]', error);
      this.setStatus_(`error generating "${prompt}".`);
    } finally {
      this.busy = false;
    }
  }

  setStatus_(text) {
    console.log('[generative_object]', text);
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }
}

function start() {
  const options = new xb.Options();
  // The generative primitive (also enables AI).
  options.enableGenerativeObjects();

  // Real-world depth so generated objects are occluded by your environment.
  options.depth.enabled = true;
  options.depth.depthMesh.enabled = true;
  options.depth.occlusion.enabled = true;

  // Voice input to describe objects.
  options.sound.speechRecognizer.enabled = true;

  options.setAppTitle('Generative Object');
  options.setAppDescription(
    'Speak or pinch to summon AI-generated objects into your space, then grab ' +
      'them. Provide a Gemini key via ?key=...'
  );
  options.xrButton.showEnterSimulatorButton = true;

  xb.add(new GenerativeObjectDemo());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
