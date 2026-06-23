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
    this.grabbingObject = false;
    this.listening = false;
    this.speakButton = null;
  }

  init() {
    // Voice trigger: imagine whatever you say, driven by a push-to-talk button.
    const recognizer = xb.core.sound?.speechRecognizer;
    if (recognizer) {
      recognizer.addEventListener('result', (event) => {
        if (event.isFinal && event.transcript.trim()) {
          this.imagine(event.transcript.trim());
          this.setListening_(false);
        }
      });
      recognizer.addEventListener('end', () => this.setListening_(false));
      recognizer.addEventListener('error', () => this.setListening_(false));
      this.addSpeakButton_(recognizer);
    }
    this.setStatus_(
      'pinch empty space (or press G, or hold 🎙️) to summon. grab an object to move it.'
    );
  }

  // A push-to-talk button styled like the netblocks voice sample.
  addSpeakButton_(recognizer) {
    const button = document.createElement('button');
    button.textContent = '🎙️ Speak';
    Object.assign(button.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      padding: '10px 18px',
      background: '#9177c7',
      color: '#fff',
      border: 'none',
      borderRadius: '24px',
      fontSize: '14px',
      cursor: 'pointer',
      zIndex: '999',
    });
    button.addEventListener('click', () => {
      if (this.listening) {
        recognizer.stop();
        this.setListening_(false);
      } else {
        recognizer.start();
        this.setListening_(true);
        this.setStatus_('listening… say what to summon.');
      }
    });
    this.speakButton = button;
    document.body.appendChild(button);
  }

  setListening_(listening) {
    this.listening = listening;
    if (this.speakButton) {
      this.speakButton.textContent = listening ? '🔴 Listening…' : '🎙️ Speak';
    }
  }

  // Track whether this select is grabbing an existing object, so releasing it
  // moves the object instead of summoning a new one.
  onSelectStart(event) {
    this.grabbingObject = false;
    const hits = xb.core.input?.intersectionsForController?.get(event.target);
    if (hits && hits.length) {
      for (let node = hits[0].object; node; node = node.parent) {
        if (xb.core.generative.objects.includes(node)) {
          this.grabbingObject = true;
          break;
        }
      }
    }
  }

  // Pinch / click on empty space summons; cycles presets so it works mouse-only.
  onSelectEnd() {
    if (this.grabbingObject) {
      this.grabbingObject = false;
      return;
    }
    this.summonPreset_();
  }

  // Press "G" to summon (handy on desktop where dragging uses the mouse).
  onKeyDown(event) {
    if (event.code === 'KeyG') {
      this.summonPreset_();
    }
  }

  summonPreset_() {
    const prompt = PRESET_PROMPTS[this.presetIndex % PRESET_PROMPTS.length];
    this.presetIndex++;
    this.imagine(prompt);
  }

  async imagine(prompt) {
    if (this.busy) return;
    if (!xb.core.generative?.isSupported) {
      this.setStatus_('generation unavailable. check your Gemini key.');
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
