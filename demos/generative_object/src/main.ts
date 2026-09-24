import * as THREE from 'three';
import * as xb from 'xrblocks';

import {GenerativeObjects} from './GenerativeObjects.js';
import {runCleanupSteps} from './cleanup.js';
import {resolveApiKey} from './ApiKey.js';

// Demo for a prompt-to-object generative helper. Buttons or voice summon an
// AI-generated cutout onto the surface you're looking at; grab to move it.
//
// The generative helper lives in this demo (demos/generative_object/src/), not
// the SDK. Enter a prototype Gemini key in the page or put keys.json next to
// index.html (or at the served repo root), using {gemini: {apiKey: "..."}}.

declare global {
  interface Window {
    generativeObjectUrlKey?: string | null;
  }
}

const PRESET_PROMPTS = [
  'a small friendly red dragon',
  'a potted succulent plant',
  'a vintage robot toy',
  'a slice of watermelon',
  'a rubber duck wearing sunglasses',
  'a paper airplane',
];

export class GenerativeObjectDemo extends xb.Script {
  private presetIndex = 0;
  private busy = false;
  private listening = false;
  private recognizer: xb.SpeechRecognizer | null = null;
  private domSpeakButton: HTMLButtonElement | null = null;
  private xrStatusText: xb.UIText | null = null;
  private card: xb.UICard | null = null;
  private controls: HTMLDivElement | null = null;
  private domEvents: AbortController | null = null;
  private lights: THREE.Light[] = [];
  private disposed = true;
  private request = 0;
  private onSpeechResult = (event: {isFinal: boolean; transcript: string}) => {
    if (this.disposed || !this.listening) return;
    if (event.isFinal && event.transcript.trim()) {
      void this.imagine(event.transcript.trim());
      this.setListening_(false);
    }
  };
  private onSpeechEnd = () => {
    if (!this.disposed) this.setListening_(false);
  };

  /**
   * @param generative - The demo-owned generative helper, added to the engine
   *     separately so its dependencies (AI, camera, scene, depth) are injected.
   */
  constructor(private generative: GenerativeObjects) {
    super();
  }

  override init() {
    this.disposed = false;
    this.request++;
    // Lights so the relief (lit standard material) shows surface shading.
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    this.lights = [ambient, key];
    key.position.set(0.5, 1, 1);
    xb.core.scene.add(ambient, key);

    // Voice trigger: imagine whatever you say.
    this.recognizer = xb.core.sound?.speechRecognizer ?? null;
    if (this.recognizer) {
      this.recognizer.addEventListener('result', this.onSpeechResult);
      this.recognizer.addEventListener('end', this.onSpeechEnd);
      this.recognizer.addEventListener('error', this.onSpeechEnd);
    }

    this.buildDomControls_();
    this.buildSpatialPanel_();
    this.setStatus_('summon an object with the buttons or your voice.');
  }

  // ---- actions (shared by DOM buttons, spatial buttons, and keys) ----

  private summonPreset_() {
    if (this.disposed) return;
    const prompt = PRESET_PROMPTS[this.presetIndex % PRESET_PROMPTS.length];
    this.presetIndex++;
    this.imagine(prompt);
  }

  private toggleSpeak_() {
    if (this.disposed || !this.recognizer) return;
    if (this.listening) {
      this.recognizer.stop();
      this.setListening_(false);
    } else {
      this.recognizer.start();
      this.setListening_(true);
      this.setStatus_('listening... say what to summon.');
    }
  }

  private toggleRelief_() {
    if (this.disposed) return;
    const opts = this.generative.options;
    opts.relief = !opts.relief;
    // Relief reads best when you can move around it, so pause billboarding.
    opts.billboard = !opts.relief;
    this.setStatus_(
      opts.relief
        ? 'relief ON (2.5D). summon something; billboarding paused to orbit it.'
        : 'relief OFF (flat cutout). billboarding back on.'
    );
  }

  private clearObjects_() {
    if (this.disposed) return;
    this.request++;
    this.busy = false;
    try {
      this.generative.clearObjects();
      this.setStatus_('cleared. summon something new.');
    } catch (error) {
      console.error('[generative_object]', error);
      this.setStatus_('could not release every object. check the console.');
    }
  }

  private async imagine(prompt: string) {
    if (this.disposed || this.busy) return;
    if (!this.generative.isSupported) {
      this.setStatus_('generation unavailable. check your Gemini key.');
      return;
    }
    this.busy = true;
    const request = this.request;
    this.setStatus_(`summoning "${prompt}"...`);
    try {
      const object = await this.generative.imagine(prompt);
      if (this.disposed || request !== this.request) return;
      this.setStatus_(
        object
          ? `summoned "${prompt}". grab to move it. summon more anytime.`
          : `couldn't generate "${prompt}". try again.`
      );
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      console.error('[generative_object]', error);
      this.setStatus_(`error generating "${prompt}".`);
    } finally {
      if (request === this.request) this.busy = false;
    }
  }

  // ---- input: keyboard shortcuts (summoning is via the buttons / voice) ----

  override onKeyDown(event: KeyboardEvent) {
    if (event.code === 'KeyG') {
      this.summonPreset_();
    } else if (event.code === 'KeyR') {
      this.toggleRelief_();
    }
  }

  // ---- DOM controls (desktop) ----

  private buildDomControls_() {
    const bar = document.createElement('div');
    this.controls = bar;
    this.domEvents = new AbortController();
    Object.assign(bar.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '999',
    });
    bar.appendChild(
      this.makeDomButton_('✨ Summon', () => this.summonPreset_())
    );
    this.domSpeakButton = this.makeDomButton_('🎙️ Speak', () =>
      this.toggleSpeak_()
    );
    bar.appendChild(this.domSpeakButton);
    bar.appendChild(
      this.makeDomButton_('🌀 Relief', () => this.toggleRelief_())
    );
    bar.appendChild(
      this.makeDomButton_('🗑️ Clear', () => this.clearObjects_())
    );
    document.body.appendChild(bar);
  }

  private makeDomButton_(
    label: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    Object.assign(button.style, {
      padding: '10px 18px',
      background: '#9177c7',
      color: '#fff',
      border: 'none',
      borderRadius: '24px',
      fontSize: '14px',
      cursor: 'pointer',
    });
    button.addEventListener('click', onClick, {
      signal: this.domEvents!.signal,
    });
    return button;
  }

  private setListening_(listening: boolean) {
    this.listening = listening;
    if (this.domSpeakButton) {
      this.domSpeakButton.textContent = listening
        ? '🔴 Listening...'
        : '🎙️ Speak';
    }
  }

  // ---- spatial control panel (XR) ----

  private buildSpatialPanel_() {
    const card = new xb.UICard({
      size: {width: 0.62, height: 0.24},
      manipulation: {
        actions: {translate: {faceCamera: false}},
        handle: {action: 'translate'},
      },
      edge: true,
      style: {
        backgroundColor: 'rgba(16, 14, 26, 0.94)',
        borderWidth: 2,
        borderColor: 'rgba(145, 119, 199, 0.55)',
        borderRadius: 18,
        padding: 14,
        flexDirection: 'column',
        gap: 8,
        alignItems: 'stretch',
        justifyContent: 'center',
      },
    });
    this.card = card;
    card.name = 'GenerativeObjectControlCard';
    card.position.set(0, 1.3, -0.8);
    this.add(card);
    card.add(
      new xb.UIText({
        text: 'GENERATIVE OBJECTS',
        style: {
          fontSize: 18,
          fontWeight: 'bold',
          color: '#c4b5ff',
          textAlign: 'center',
          width: '100%',
        },
      })
    );
    this.xrStatusText = new xb.UIText({
      text: 'idle',
      style: {
        fontSize: 12,
        color: '#8b97a7',
        textAlign: 'center',
        width: '100%',
      },
    });
    card.add(this.xrStatusText);
    card.add(
      new xb.UIPanel({
        style: {
          width: '100%',
          height: 1,
          backgroundColor: 'rgba(255, 255, 255, 0.10)',
        },
      })
    );
    const row = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        alignItems: 'center',
      },
    });
    row.add(this.makeXrButton_('flare', 'summon', () => this.summonPreset_()));
    row.add(this.makeXrButton_('mic', 'speak', () => this.toggleSpeak_()));
    row.add(
      this.makeXrButton_('deployed_code', 'relief', () => this.toggleRelief_())
    );
    row.add(
      this.makeXrButton_('delete_sweep', 'clear', () => this.clearObjects_())
    );
    card.add(
      row,
      new xb.FollowHead({
        offset: new THREE.Vector3(0, 0.3, -1.0),
        smoothing: 0.08,
      }),
      new xb.FaceCamera({mode: 'spherical', smoothing: 0.1})
    );
  }

  // Icon + caption button mirroring a DOM control (matches world_companion).
  private makeXrButton_(
    iconName: string,
    label: string,
    onClick: () => void
  ): xb.UIButton {
    return new xb.UIButton({
      label,
      icon: iconName,
      onClick,
      style: {
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
        borderRadius: 12,
        backgroundColor: '#3a3550',
        borderWidth: 1,
        borderColor: '#6b5fa0',
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        ':hover': {backgroundColor: '#7a5fc7'},
        ':active': {backgroundColor: '#b49aff'},
      },
    });
  }

  private setStatus_(text: string) {
    if (this.disposed) return;
    console.log('[generative_object]', text);
    const el = document.getElementById('status');
    if (el) el.textContent = text;
    // The spatial font lacks some glyphs (e.g. the ellipsis), so normalize.
    if (this.xrStatusText) this.xrStatusText.text = text.replace(/…/g, '...');
  }

  override dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.request++;
    const recognizer = this.recognizer;
    const listening = this.listening;
    const controls = this.controls;
    const domEvents = this.domEvents;
    const card = this.card;
    const lights = this.lights;
    this.recognizer = null;
    this.listening = false;
    this.busy = false;
    this.controls = null;
    this.domEvents = null;
    this.card = null;
    this.domSpeakButton = null;
    this.xrStatusText = null;
    this.lights = [];

    runCleanupSteps([
      () => recognizer?.removeEventListener('result', this.onSpeechResult),
      () => recognizer?.removeEventListener('end', this.onSpeechEnd),
      () => recognizer?.removeEventListener('error', this.onSpeechEnd),
      () => {
        if (listening) recognizer?.stop();
      },
      () => domEvents?.abort(),
      () => controls?.remove(),
      () => this.generative.clearObjects(),
      // Removing the UI tree lets Core's lifecycle release its renderer.
      () => card?.removeFromParent(),
      ...lights.flatMap((light) => [
        () => light.removeFromParent(),
        () => light.dispose(),
      ]),
    ]);
  }
}

export async function start() {
  const urlKey = window.generativeObjectUrlKey;
  delete window.generativeObjectUrlKey;
  const apiKey = await resolveApiKey(urlKey);
  const options = new xb.Options();
  // AI for image generation (the generative helper lives in the demo now).
  options.enableAI();
  options.ai.gemini.apiKey = apiKey;

  // Spatial UI (the control panel) + reticle for pointing at it.
  options.reticles.enabled = true;

  // Real-world depth so generated objects are occluded by your environment, and
  // so placement raycasts hit the current depth surface.
  options.depth.enabled = true;
  options.depth.depthMesh.enabled = true;
  options.depth.depthTexture.enabled = true;
  options.depth.occlusion.enabled = true;

  // Voice input to describe objects.
  options.sound.speechRecognizer.enabled = true;

  options.setAppTitle('Generative Object');
  options.setAppDescription(
    'Summon AI-generated objects onto the surfaces around you with buttons or ' +
      'voice, then grab them. Enter a prototype Gemini key to start.'
  );
  options.xrButton.showEnterSimulatorButton = true;

  // The generative helper is its own Script so dependency injection resolves
  // AI/camera/scene/depth for it, just like a core subsystem would.
  const generative = new GenerativeObjects();
  xb.add(generative);
  xb.add(new GenerativeObjectDemo(generative));
  await xb.init(options);
}
