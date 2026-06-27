import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {
  HeadLeashBehavior,
  ManipulationBehavior,
  UICore,
  UIIcon,
  UIPanel,
  UIText,
} from 'xrblocks/addons/uiblocks/src/index.js';
import * as xb from 'xrblocks';

import {GenerativeObjects} from './GenerativeObjects.js';

// Demo for a prompt-to-object generative helper. Buttons or voice summon an
// AI-generated cutout onto the surface you're looking at; grab to move it.
//
// The generative helper lives in this demo (demos/generative_object/src/), not
// the SDK: a Gemini API key is required, pass it in the URL as ?key=... or place
// a keys.json next to this file (or at the served repo root).

const PRESET_PROMPTS = [
  'a small friendly red dragon',
  'a potted succulent plant',
  'a vintage robot toy',
  'a slice of watermelon',
  'a rubber duck wearing sunglasses',
  'a paper airplane',
];

class GenerativeObjectDemo extends xb.Script {
  private presetIndex = 0;
  private busy = false;
  private listening = false;
  private recognizer: xb.SpeechRecognizer | null = null;
  private domSpeakButton: HTMLButtonElement | null = null;
  private xrStatusText: UIText | null = null;
  private uiCore?: UICore;

  /**
   * @param generative - The demo-owned generative helper, added to the engine
   *     separately so its dependencies (AI, camera, scene, depth) are injected.
   */
  constructor(private generative: GenerativeObjects) {
    super();
  }

  override init() {
    // Lights so the relief (lit standard material) shows surface shading.
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.5, 1, 1);
    xb.core.scene.add(ambient, key);

    // Voice trigger: imagine whatever you say.
    this.recognizer = xb.core.sound?.speechRecognizer ?? null;
    if (this.recognizer) {
      this.recognizer.addEventListener('result', (event) => {
        if (event.isFinal && event.transcript.trim()) {
          this.imagine(event.transcript.trim());
          this.setListening_(false);
        }
      });
      this.recognizer.addEventListener('end', () => this.setListening_(false));
      this.recognizer.addEventListener('error', () =>
        this.setListening_(false)
      );
    }

    this.buildDomControls_();
    this.buildSpatialPanel_();
    this.setStatus_('summon an object with the buttons or your voice.');
  }

  // ---- actions (shared by DOM buttons, spatial buttons, and keys) ----

  private summonPreset_() {
    const prompt = PRESET_PROMPTS[this.presetIndex % PRESET_PROMPTS.length];
    this.presetIndex++;
    this.imagine(prompt);
  }

  private toggleSpeak_() {
    if (!this.recognizer) return;
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
    this.generative.clearObjects();
    this.setStatus_('cleared. summon something new.');
  }

  private async imagine(prompt: string) {
    if (this.busy) return;
    if (!this.generative.isSupported) {
      this.setStatus_('generation unavailable. check your Gemini key.');
      return;
    }
    this.busy = true;
    this.setStatus_(`summoning "${prompt}"...`);
    try {
      const object = await this.generative.imagine(prompt);
      this.setStatus_(
        object
          ? `summoned "${prompt}". grab to move it. summon more anytime.`
          : `couldn't generate "${prompt}". try again.`
      );
    } catch (error) {
      console.error('[generative_object]', error);
      this.setStatus_(`error generating "${prompt}".`);
    } finally {
      this.busy = false;
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
    button.addEventListener('click', onClick);
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
    this.uiCore = new UICore(this);
    const card = this.uiCore.createCard({
      name: 'GenerativeObjectControlCard',
      position: new THREE.Vector3(0, 1.3, -0.8),
      sizeX: 0.62,
      sizeY: 0.24,
    });
    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: 'rgba(16, 14, 26, 0.94)',
      strokeWidth: 2,
      strokeColor: 'rgba(145, 119, 199, 0.55)',
      cornerRadius: 18,
      padding: 14,
      flexDirection: 'column',
      gap: 8,
      alignItems: 'stretch',
      justifyContent: 'center',
    });
    panel.add(
      new UIText('GENERATIVE OBJECTS', {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#c4b5ff',
        textAlign: 'center',
        width: '100%',
      })
    );
    this.xrStatusText = new UIText('idle', {
      fontSize: 12,
      color: '#8b97a7',
      textAlign: 'center',
      width: '100%',
    });
    panel.add(this.xrStatusText);
    panel.add(
      new UIPanel({
        width: '100%',
        height: 1,
        fillColor: 'rgba(255, 255, 255, 0.10)',
      })
    );
    const row = new UIPanel({
      width: '100%',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      alignItems: 'center',
    });
    row.add(this.makeXrButton_('flare', 'summon', () => this.summonPreset_()));
    row.add(this.makeXrButton_('mic', 'speak', () => this.toggleSpeak_()));
    row.add(
      this.makeXrButton_('deployed_code', 'relief', () => this.toggleRelief_())
    );
    row.add(
      this.makeXrButton_('delete_sweep', 'clear', () => this.clearObjects_())
    );
    panel.add(row);
    card.add(panel);
    card.addBehavior(
      new ManipulationBehavior({draggable: true, faceCamera: false})
    );
    // Gently follow the user so the controls stay in reach as they move.
    card.addBehavior(
      new HeadLeashBehavior({
        offset: new THREE.Vector3(0, 0.3, -1.0),
        posLerp: 0.08,
        rotLerp: 0.1,
      })
    );
  }

  // Icon + caption button mirroring a DOM control (matches world_companion).
  private makeXrButton_(
    iconName: string,
    label: string,
    onClick: () => void
  ): UIPanel {
    const idle = '#2a2a2a';
    const hover = '#3a3a3a';
    const btn = new UIPanel({
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 16,
      paddingRight: 16,
      cornerRadius: 12,
      fillColor: idle,
      strokeWidth: 1,
      strokeColor: '#444444',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      renderOrder: 10,
      onHoverEnter: () => btn.setFillColor(hover),
      onHoverExit: () => btn.setFillColor(idle),
      onClick: () => {
        btn.setFillColor('#9177c7');
        setTimeout(() => btn.setFillColor(idle), 180);
        onClick();
      },
    });
    btn.add(
      new UIIcon(iconName, {
        color: 'white',
        width: 22,
        height: 22,
        renderOrder: 12,
      })
    );
    btn.add(
      new UIText(label, {
        fontSize: 14,
        color: '#ffffff',
        fontWeight: 'bold',
        depthTest: false,
        renderOrder: 100,
      })
    );
    return btn;
  }

  private setStatus_(text: string) {
    console.log('[generative_object]', text);
    const el = document.getElementById('status');
    if (el) el.textContent = text;
    // The spatial font lacks some glyphs (e.g. the ellipsis), so normalize.
    if (this.xrStatusText) this.xrStatusText.setText(text.replace(/…/g, '...'));
  }
}

function start() {
  const options = new xb.Options();
  // AI for image generation (the generative helper lives in the demo now).
  options.enableAI();

  // Spatial UI (the control panel) + reticle for pointing at it.
  options.enableUI();
  options.reticles.enabled = true;

  // Real-world depth so generated objects are occluded by your environment, and
  // so placement raycasts hit the current full-resolution surface.
  options.depth.enabled = true;
  options.depth.depthMesh.enabled = true;
  options.depth.depthMesh.updateFullResolutionGeometry = true;
  options.depth.depthTexture.enabled = true;
  options.depth.occlusion.enabled = true;

  // Voice input to describe objects.
  options.sound.speechRecognizer.enabled = true;

  options.setAppTitle('Generative Object');
  options.setAppDescription(
    'Summon AI-generated objects onto the surfaces around you with buttons or ' +
      'voice, then grab them. Provide a Gemini key via ?key=...'
  );
  options.xrButton.showEnterSimulatorButton = true;

  // The generative helper is its own Script so dependency injection resolves
  // AI/camera/scene/depth for it, just like a core subsystem would.
  const generative = new GenerativeObjects();
  xb.add(generative);
  xb.add(new GenerativeObjectDemo(generative));
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
