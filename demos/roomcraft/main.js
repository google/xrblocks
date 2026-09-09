import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createDefaultCatalog,
  createModelAsset,
  Roomcraft,
  SCENE_PLAN_SCHEMA,
} from 'xrblocks/addons/roomcraft/index.js';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/index.js';

import {STARTER_SCENES} from './scenes.js';

// One optional downloaded model, kept separate from the offline catalog.
// Boom Box by Microsoft, released under CC0 1.0 through the Khronos glTF
// sample models. See README.md for the attribution.
const EXHIBIT_ASSET_ID = 'boom-box';
const EXHIBIT_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/BoomBox/glTF-Binary/BoomBox.glb';

const SUGGESTIONS = [
  'Create a little robot standing on the floor',
  'Give it longer arms and a backpack',
  'Make it wave its right arm',
  'Make its arm swing faster',
  'Stop its motion',
  'Make the selected object deep blue',
  'Add a floor lamp beside the left chair',
];

/** How many part names the console lists before summarizing the remainder. */
const MAX_LISTED_PARTS = 24;
const STUDIO_SIZE = {width: 1.05, height: 1.02};
const KEYBOARD_SIZE = {width: 1.05, height: 0.49};
const KEYBOARD_GAP = 0.045;

const SPEECH_MESSAGES = {
  'not-allowed':
    'Microphone permission was denied. Allow the microphone in your browser, or type the edit instead.',
  'service-not-allowed':
    'The browser blocked speech recognition. Type the edit instead.',
  'audio-capture':
    'No microphone was found. Connect one, or type the edit instead.',
  network: 'The speech service could not be reached. Type the edit instead.',
  'no-speech': 'No speech was detected. Press Talk again, or type the edit.',
  aborted: 'Listening stopped.',
};

const PREVIEW_MESSAGE =
  'Preview only. Use Place on surface to fit the current scene to a scanned floor or table.';
const PLACED_MESSAGE =
  'The current footprint fits a detected horizontal surface. Moving or editing it needs a new fit.';
const NO_SURFACE_MESSAGE =
  'No detected surface fits this scene yet. Scan a floor or table and try again, or keep the preview arrangement.';

/** A stable signature of a layout, used to detect edits that changed nothing. */
function describeLayout(layout) {
  const objects = [...layout.objects]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((object) => ({
      ...object,
      position: object.position.map(round),
      rotation: round(object.rotation),
      scale: object.scale.map(round),
    }));
  return JSON.stringify({title: layout.title, objects});
}

function round(value) {
  return Math.round(value * 1e4) / 1e4;
}

/** A short, honest phrase for one authored part motion, or an empty string. */
function describeMotion(motion) {
  if (!motion) return '';
  if (motion.kind === 'swing') {
    return `swings ${Math.round(THREE.MathUtils.radToDeg(motion.amplitude))} degrees about ${motion.axis} every ${round(motion.period)}s`;
  }
  return `spins about ${motion.axis} at ${round(motion.speed)} rad/s`;
}

/**
 * The demo console: HTML controls on the desktop and a spatial panel in XR,
 * both driving the same Roomcraft add-on instance.
 */
export class RoomcraftConsole extends xb.Script {
  constructor(room) {
    super();
    this.name = 'RoomcraftConsole';
    this.room = room;
    this.dom = {};
    this.starterButtons = [];
    this.spatialStarters = [];
    this.cleanups = [];
    this.listening = false;
    this.connecting = false;
    this.xrActive = false;
    this.spatialPreview = false;
    this.keyboardOpen = false;
    this.spatialTab = 'author';
    this.needsSpatialPlacement = false;
    this.disposed = false;
    this.placed = false;
    this.exhibitCount = 0;
    this.statusMessage = '';
    this.errorMessage = '';
  }

  init() {
    this.collectDom();
    this.buildStarterButtons();
    this.buildSuggestionChips();
    this.bindDomActions();
    this.buildSpatialPanel();

    this.listen(this.room, 'change', () => {
      this.placed = false;
      this.refresh();
    });
    this.listen(this.room, 'selectionchange', () => this.refresh());
    this.listen(this.room, 'statuschange', () => this.refresh());
    this.listen(this.room, 'motionstatechange', () => this.refresh());
    const narrowScreen = window.matchMedia('(max-width: 980px)');
    this.listen(narrowScreen, 'change', (event) =>
      this.toggleConsole(!event.matches)
    );
    this.toggleConsole(!narrowScreen.matches);
    this.refresh();
  }

  /** Loads the first handcrafted scene once XR Blocks has finished starting. */
  async start() {
    this.bindSpeech();
    await this.applyStarter(STARTER_SCENES[0]);
    if (xb.getUrlParameter('key') || xb.getUrlParameter('geminiKey')) {
      await this.connectGemini(false);
    }
  }

  collectDom() {
    const id = (name) => document.getElementById(name);
    this.dom = {
      console: id('console'),
      toggle: id('toggleConsole'),
      spatialStudio: id('spatialStudio'),
      status: id('status'),
      error: id('error'),
      starters: id('starters'),
      newDesign: id('newDesign'),
      suggestions: id('suggestions'),
      prompt: id('prompt'),
      generate: id('generate'),
      mic: id('mic'),
      sceneSummary: id('sceneSummary'),
      placement: id('placement'),
      selection: id('selection'),
      design: id('design'),
      parts: id('parts'),
      motion: id('motion'),
      motionNote: id('motionNote'),
      place: id('place'),
      undo: id('undo'),
      redo: id('redo'),
      focusSelected: id('focusSelected'),
      frameScene: id('frameScene'),
      removeSelected: id('removeSelected'),
      exhibit: id('exhibit'),
      export: id('export'),
      connect: id('connect'),
      aiStatus: id('aiStatus'),
    };
  }

  buildStarterButtons() {
    for (const starter of STARTER_SCENES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rc-button';
      button.textContent = starter.label;
      button.title = starter.summary;
      this.listen(button, 'click', () => void this.applyStarter(starter));
      this.dom.starters.appendChild(button);
      this.starterButtons.push(button);
    }
  }

  buildSuggestionChips() {
    for (const suggestion of SUGGESTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rc-button';
      chip.textContent = suggestion;
      this.listen(chip, 'click', () => {
        this.setPrompt(suggestion);
        this.dom.prompt.focus();
      });
      this.dom.suggestions.appendChild(chip);
    }
  }

  bindDomActions() {
    this.listen(this.dom.toggle, 'click', () =>
      this.toggleConsole(this.dom.console.classList.contains('rc-collapsed'))
    );
    this.listen(this.dom.spatialStudio, 'click', () =>
      this.toggleSpatialStudio()
    );
    this.listen(this.dom.generate, 'click', () => void this.generate());
    this.listen(this.dom.newDesign, 'click', () => void this.newDesign());
    this.listen(this.dom.prompt, 'keydown', (event) => {
      if (event.key === 'Enter') void this.generate();
    });
    this.listen(this.dom.prompt, 'input', () =>
      this.setPrompt(this.dom.prompt.value)
    );
    this.listen(this.dom.mic, 'click', () => this.toggleListening());
    this.listen(this.dom.place, 'click', () => void this.placeOnSurface());
    this.listen(this.dom.undo, 'click', () => void this.undo());
    this.listen(this.dom.redo, 'click', () => void this.redo());
    this.listen(this.dom.focusSelected, 'click', () => void this.frame(true));
    this.listen(this.dom.frameScene, 'click', () => void this.frame());
    this.listen(
      this.dom.removeSelected,
      'click',
      () => void this.removeSelected()
    );
    this.listen(this.dom.exhibit, 'click', () => void this.addExhibit());
    this.listen(this.dom.motion, 'click', () => this.toggleMotion());
    this.listen(this.dom.export, 'click', () => this.exportLayout());
    this.listen(this.dom.connect, 'click', () => void this.connectGemini());
    this.listen(this.dom.selection, 'change', (event) => {
      const value = event.target.value;
      try {
        this.room.select(value || null);
      } catch (error) {
        this.showError(error);
      }
    });
  }

  bindSpeech() {
    const recognizer = xb.core.sound?.speechRecognizer;
    if (!recognizer) {
      this.dom.mic.disabled = true;
      this.dom.mic.title =
        'Speech recognition is not available in this browser.';
      return;
    }
    if (this.boundSpeechRecognizer === recognizer) return;
    this.boundSpeechRecognizer = recognizer;
    this.listen(recognizer, 'result', (event) => {
      if (!this.listening) return;
      if (!event.isFinal) {
        this.setStatus(`Listening: ${event.transcript}`);
        return;
      }
      this.stopListening();
      const transcript = event.transcript.trim();
      if (!transcript) {
        this.setStatus('No speech was recognized.');
        return;
      }
      this.setPrompt(transcript);
      void this.generate();
    });
    this.listen(recognizer, 'error', (event) => {
      this.stopListening();
      this.setError(
        SPEECH_MESSAGES[event.error] ??
          `Speech recognition failed: ${event.error}.`
      );
    });
    this.listen(recognizer, 'end', () => this.stopListening());
  }

  update() {
    if (this.disposed) return;
    if (this.needsSpatialPlacement) {
      this.positionSpatialStudio();
      this.needsSpatialPlacement = false;
    }
    if (!this.boundSpeechRecognizer) this.bindSpeech();
    const available = !!xb.core.sound?.speechRecognizer?.recognition;
    if (available !== this.speechAvailable) {
      this.speechAvailable = available;
      this.refresh();
    }
  }

  // Spatial controls, so the demo keeps working after the HTML overlay is gone.
  buildSpatialPanel() {
    this.xrProviderText = new xb.UIText({
      text: 'Connect Gemini in desktop controls to generate.',
      style: {width: '100%', fontSize: 26, color: '#c2b6a8'},
    });
    this.xrStatusText = new xb.UIText({
      text: 'Loading the starter scene.',
      style: {
        width: '100%',
        fontSize: 32,
        maxHeight: 130,
        textOverflow: 'ellipsis',
        lineHeight: 1.3,
        color: '#c2b6a8',
        textAlign: 'center',
      },
    });

    this.xrSelectionText = new xb.UIText({
      text: 'Nothing selected',
      style: {
        width: '100%',
        fontSize: 30,
        color: '#9db8a6',
        textAlign: 'center',
      },
    });

    const buttonStyle = (background) => ({
      flexGrow: 1,
      height: '100%',
      fontSize: 36,
      borderRadius: 18,
      backgroundColor: background,
      color: '#f6ece0',
    });
    const row = (children, height = 70) =>
      new xb.UIPanel({
        style: {
          width: '100%',
          height,
          flexShrink: 0,
          flexDirection: 'row',
          gap: 12,
        },
        children,
      });

    this.spatialStarters = STARTER_SCENES.map(
      (starter) =>
        new xb.UIButton({
          label: starter.label,
          onClick: () => void this.applyStarter(starter),
          style: buttonStyle('#30292d'),
        })
    );
    this.xrTalk = new xb.UIButton({
      label: 'Talk',
      onClick: () => this.toggleListening(),
      style: buttonStyle('#4a5f52'),
    });
    this.xrNew = new xb.UIButton({
      label: 'New',
      onClick: () => void this.newDesign(),
      style: buttonStyle('#30292d'),
    });
    this.xrPlace = new xb.UIButton({
      label: 'Place',
      onClick: () => void this.placeOnSurface(),
      style: buttonStyle('#8a4a33'),
    });
    this.xrUndo = new xb.UIButton({
      label: 'Undo',
      onClick: () => void this.undo(),
      style: buttonStyle('#30292d'),
    });
    this.xrRedo = new xb.UIButton({
      label: 'Redo',
      onClick: () => void this.redo(),
      style: buttonStyle('#30292d'),
    });
    this.xrType = new xb.UIButton({
      label: 'Keyboard',
      onClick: () => this.toggleKeyboard(),
      style: buttonStyle('#30292d'),
    });
    this.xrGenerate = new xb.UIButton({
      label: 'Generate',
      onClick: () => void this.generate(),
      style: buttonStyle('#8a4a33'),
    });
    this.xrPrevious = new xb.UIButton({
      label: 'Previous',
      onClick: () => this.cycleSelection(-1),
      style: buttonStyle('#30292d'),
    });
    this.xrNext = new xb.UIButton({
      label: 'Next',
      onClick: () => this.cycleSelection(1),
      style: buttonStyle('#30292d'),
    });
    this.xrRemove = new xb.UIButton({
      label: 'Remove',
      onClick: () => void this.removeSelected(),
      style: buttonStyle('#30292d'),
    });
    this.xrMotion = new xb.UIButton({
      label: 'Pause',
      onClick: () => this.toggleMotion(),
      style: buttonStyle('#30292d'),
    });
    this.xrAuthorTab = new xb.UIButton({
      label: 'Create / edit',
      onClick: () => this.setSpatialTab('author'),
      style: buttonStyle('#8a4a33'),
    });
    this.xrExamplesTab = new xb.UIButton({
      label: 'Examples',
      onClick: () => this.setSpatialTab('examples'),
      style: buttonStyle('#30292d'),
    });
    this.xrPromptText = new xb.UIText({
      text: 'Describe a new object or an edit. Use Keyboard or Talk.',
      style: {
        width: '100%',
        minHeight: 80,
        maxHeight: 120,
        padding: 14,
        fontSize: 32,
        lineHeight: 1.25,
        color: '#f6ece0',
        backgroundColor: '#30292d',
        borderRadius: 14,
        textOverflow: 'ellipsis',
      },
    });
    this.xrAuthorPanel = new xb.UIPanel({
      style: {width: '100%', flexGrow: 1, flexDirection: 'column', gap: 12},
      children: [
        this.xrPromptText,
        row([this.xrTalk, this.xrType, this.xrGenerate]),
      ],
    });

    const starterRows = [
      new xb.UIText({
        text: 'Handcrafted examples. Each replaces the current scene; Undo restores it.',
        style: {width: '100%', fontSize: 30, color: '#c2b6a8'},
      }),
    ];
    for (let index = 0; index < this.spatialStarters.length; index += 2) {
      starterRows.push(row(this.spatialStarters.slice(index, index + 2)));
    }
    this.xrExamplesPanel = new xb.UIPanel({
      style: {width: '100%', flexGrow: 1, flexDirection: 'column', gap: 12},
      children: starterRows,
    });

    const card = new xb.UICard({
      size: STUDIO_SIZE,
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 14,
        padding: 26,
        backgroundColor: '#181418',
        borderRadius: 28,
      },
      children: [
        row(
          [
            new xb.UIText({
              text: 'Roomcraft',
              style: {
                flexGrow: 1,
                fontSize: 44,
                fontWeight: 'bold',
                color: '#e8714a',
              },
            }),
            new xb.UIButton({
              label: 'Recenter',
              onClick: () => this.positionSpatialStudio(),
              style: {
                ...buttonStyle('#30292d'),
                flexGrow: 0,
                padding: 12,
                fontSize: 28,
              },
            }),
          ],
          56
        ),
        this.xrProviderText,
        this.xrStatusText,
        this.xrSelectionText,
        row([this.xrPrevious, this.xrNext, this.xrRemove, this.xrMotion], 64),
        row([this.xrAuthorTab, this.xrExamplesTab], 64),
        this.xrAuthorPanel,
        this.xrExamplesPanel,
        row([this.xrNew, this.xrPlace, this.xrUndo, this.xrRedo]),
      ],
    });
    card.name = 'RoomcraftControlCard';
    // Off to the side, so the composition itself stays unobstructed.
    card.position.set(1.05, xb.user.height - 0.15, -1.1);
    card.rotation.y = -0.5;
    card.visible = false;
    this.add(card);
    this.card = card;

    this.xrKeyboard = new Keyboard({
      value: this.dom.prompt.value,
      onValueChange: (value) => this.setPrompt(value),
      onSubmit: (value) => {
        this.setPrompt(value);
        void this.generate();
      },
    });
    this.keyboardCard = new xb.UICard({
      size: KEYBOARD_SIZE,
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        backgroundColor: '#181418',
        borderRadius: 24,
      },
      children: [
        row(
          [
            new xb.UIText({
              text: 'Type an instruction; Enter generates.',
              style: {flexGrow: 1, fontSize: 28, color: '#c2b6a8'},
            }),
            new xb.UIButton({
              label: 'Close',
              onClick: () => this.toggleKeyboard(),
              style: {...buttonStyle('#30292d'), flexGrow: 0, padding: 12},
            }),
          ],
          48
        ),
        this.xrKeyboard,
      ],
    });
    this.keyboardCard.name = 'RoomcraftKeyboardCard';
    this.keyboardCard.visible = false;
    this.add(this.keyboardCard);
  }

  onXRSessionStarted() {
    this.xrActive = true;
    this.needsSpatialPlacement = true;
    this.dom.console?.classList.add('rc-hidden');
    this.card.visible = true;
    if (!this.isGeminiReady()) {
      this.setStatus(
        'Example mode. Configure Gemini in the desktop panel before entering XR to use voice authoring.'
      );
    }
    this.refresh();
  }

  onXRSessionEnded() {
    this.xrActive = false;
    this.needsSpatialPlacement = this.spatialPreview;
    this.dom.console?.classList.remove('rc-hidden');
    this.card.visible = false;
    this.refresh();
  }

  isInXR() {
    return this.xrActive || !!xb.core.renderer?.xr.isPresenting;
  }

  toggleSpatialStudio() {
    this.spatialPreview = !this.spatialPreview;
    if (this.spatialPreview) {
      this.positionSpatialStudio();
      this.toggleConsole(false);
    }
    this.refresh();
  }

  positionSpatialStudio() {
    const camera = xb.core.camera;
    const position = camera.getWorldPosition(new THREE.Vector3());
    const rotation = camera.getWorldQuaternion(new THREE.Quaternion());
    const halfWidth =
      Math.max(
        STUDIO_SIZE.width * this.card.scale.x,
        KEYBOARD_SIZE.width * this.keyboardCard.scale.x
      ) / 2;
    const verticalExtent = Math.max(
      0.25 + (STUDIO_SIZE.height * this.card.scale.y) / 2,
      (STUDIO_SIZE.height * this.card.scale.y) / 2 +
        KEYBOARD_SIZE.height * this.keyboardCard.scale.y +
        KEYBOARD_GAP -
        0.25
    );
    const tangent = Math.tan(
      THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2
    );
    const distance = Math.max(
      1.1,
      (verticalExtent + 0.12) / tangent,
      (halfWidth + 0.12) / (tangent * camera.aspect)
    );
    const x = this.isInXR()
      ? 0
      : Math.max(0, distance * tangent * camera.aspect - halfWidth - 0.12);
    const target = new THREE.Vector3(x, 0.25, -distance)
      .applyQuaternion(rotation)
      .add(position);
    this.worldToLocal(target);
    this.card.position.copy(target);
    this.card.quaternion.copy(
      this.getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(rotation)
    );
    this.positionKeyboard();
  }

  positionKeyboard() {
    const y = -(
      (STUDIO_SIZE.height * this.card.scale.y) / 2 +
      (KEYBOARD_SIZE.height * this.keyboardCard.scale.y) / 2 +
      KEYBOARD_GAP
    );
    const offset = new THREE.Vector3(0, y, 0).applyQuaternion(
      this.card.quaternion
    );
    this.keyboardCard.position.copy(this.card.position).add(offset);
    this.keyboardCard.quaternion.copy(this.card.quaternion);
  }

  toggleKeyboard() {
    this.keyboardOpen = !this.keyboardOpen;
    if (this.keyboardOpen) this.positionKeyboard();
    this.refresh();
  }

  setSpatialTab(tab) {
    this.spatialTab = tab;
    this.refresh();
  }

  setPrompt(value) {
    const limit = this.dom.prompt.maxLength;
    if (value.length > limit) {
      this.setError(`Instructions are limited to ${limit} characters.`);
    }
    const draft = value.slice(0, limit);
    this.dom.prompt.value = draft;
    this.xrKeyboard.setValue(draft);
    this.xrPromptText.text = draft
      ? draft.length > 160
        ? `...${draft.slice(-160)}`
        : draft
      : 'Describe a new object or an edit. Use Keyboard or Talk.';
    this.refresh();
  }

  // ---- actions ----

  async applyStarter(starter) {
    await this.run(
      `Composing the ${starter.label.toLowerCase()}.`,
      async () => {
        await this.room.applyLayout(starter.layout);
        this.setStatus(
          `${starter.label} loaded. This is a handcrafted example, not AI output.`
        );
      }
    );
  }

  /** Clears the scene so a new design can be described from nothing. */
  async newDesign() {
    await this.run('Clearing the scene.', async () => {
      await this.room.applyLayout({title: 'Object workshop', objects: []});
      this.setStatus(
        'Empty workshop. Describe one object, for example "create a little robot", then refine it. Undo restores the previous scene.'
      );
    });
  }

  async generate() {
    const prompt = this.dom.prompt.value.trim();
    if (!prompt) {
      this.setError('Type an instruction, for example "add a floor lamp".');
      return;
    }
    if (!this.isGeminiReady()) {
      this.setError(
        'Gemini is not configured. Use Connect Gemini in the desktop panel first.'
      );
      return;
    }
    await this.run('Planning your edit.', async () => {
      const existing = new Set(
        this.room.layout.objects.map((object) => object.id)
      );
      const before = describeLayout(this.room.layout);
      const layout = await this.room.request(prompt);
      if (this.disposed) return;
      if (this.dom.prompt.value.trim() === prompt) this.setPrompt('');
      if (describeLayout(layout) === before) {
        // An accepted plan can still be a no-op; do not call that new content.
        this.setStatus(
          'No scene changes. The plan left every object exactly as it was, so try a more specific instruction.'
        );
        return;
      }
      const added = layout.objects.filter((object) => !existing.has(object.id));
      // Only an unambiguous single addition becomes the target of "this".
      let followUp = '';
      if (added.length === 1) {
        this.room.select(added[0].id);
        const parts = added[0].parts?.length ?? 0;
        followUp = parts
          ? ` Selected ${added[0].name}, a design made of ${parts} part${
              parts === 1 ? '' : 's'
            }, so you can refine it next.`
          : ` Selected ${added[0].name}, so you can refine it next.`;
      }
      this.setStatus(
        `Applied the edit. "${layout.title}" now has ${layout.objects.length} object${
          layout.objects.length === 1 ? '' : 's'
        }.${followUp}`
      );
    });
  }

  async placeOnSurface() {
    await this.run('Looking for a surface.', async () => {
      const placed = await this.room.placeOnSurface();
      if (placed) {
        this.placed = true;
        this.setStatus('Scene placed on a detected surface.');
      } else {
        this.setStatus(
          this.placed
            ? 'The scene stayed where it was last placed.'
            : 'Still showing the preview arrangement.'
        );
        this.setError(NO_SURFACE_MESSAGE);
      }
    });
  }

  async undo() {
    await this.run('Undoing the last change.', async () => {
      const layout = await this.room.undo();
      this.setStatus(`Restored "${layout.title}".`);
    });
  }

  async redo() {
    await this.run('Redoing the last undone change.', async () => {
      const layout = await this.room.redo();
      this.setStatus(`Reapplied "${layout.title}" without another AI request.`);
    });
  }

  cycleSelection(direction) {
    if (this.room.busy || this.connecting) {
      this.setError('Roomcraft is still working. Wait for it to finish.');
      return;
    }
    const objects = this.room.layout.objects;
    if (!objects.length) {
      this.setError('There are no objects to select yet.');
      return;
    }
    const current = objects.findIndex(
      (object) => object.id === this.room.selectedId
    );
    const next =
      current < 0
        ? direction > 0
          ? 0
          : objects.length - 1
        : (current + direction + objects.length) % objects.length;
    this.room.select(objects[next].id);
  }

  async removeSelected() {
    await this.run('Removing the selected object.', async () => {
      const id = this.room.selectedId;
      if (!id) throw new Error('Select an object to remove first.');
      await this.room.applyPlan({
        title: this.room.layout.title,
        edits: [{op: 'remove', id}],
      });
      this.setStatus('Removed the selected object. Undo brings it back.');
    });
  }

  /**
   * Pauses or resumes part playback. This is inspection state: it never edits
   * the scene, so it stays available while a request is running.
   */
  toggleMotion() {
    if (!this.room.hasMotion) {
      this.setError(
        'Nothing in this scene moves yet. Ask for motion, for example "make it wave".'
      );
      return;
    }
    const paused = !this.room.motionPaused;
    this.room.setMotionPaused(paused);
    this.setError('');
    this.setStatus(
      paused
        ? 'Motion paused for inspection. The authored motion, history, and placement are unchanged.'
        : 'Motion resumed from where each part paused.'
    );
  }

  /** Reframes the desktop camera without changing any scene transforms. */
  async frame(selectedOnly = false) {
    await this.run('Framing your view.', () => {
      if (this.isInXR()) {
        throw new Error(
          'Camera framing is desktop only; your XR view was kept.'
        );
      }
      const camera = xb.core.camera;
      if (!(camera instanceof THREE.PerspectiveCamera)) {
        throw new Error('Framing needs a perspective camera.');
      }
      const selectedId = this.room.selectedId;
      if (selectedOnly && !selectedId) {
        throw new Error('Select an object to focus first.');
      }
      // Reserve the full motion envelope, not the pose of this single frame,
      // so a moving design does not swing out of view after it is framed.
      const bounds = this.room.getWorldBounds(
        selectedOnly ? selectedId : undefined
      );
      if (bounds.isEmpty()) throw new Error('There is nothing to frame yet.');
      camera.updateWorldMatrix(true, false);
      if (camera.matrixWorld.determinant() === 0) {
        throw new Error('Framing needs an invertible camera transform.');
      }

      // Use the actual view matrix: three.js excludes camera scale from it.
      const cameraToWorld = camera.matrixWorldInverse.clone().invert();
      const sphere = bounds
        .applyMatrix4(camera.matrixWorldInverse)
        .getBoundingSphere(new THREE.Sphere());
      const vertical = THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      const halfFov = Math.min(vertical, horizontal);
      const radius = sphere.radius * 1.15;
      if (
        !(halfFov > 0 && halfFov < Math.PI / 2) ||
        !Number.isFinite(camera.aspect) ||
        !(radius > 0 && Number.isFinite(radius)) ||
        camera.view?.enabled ||
        camera.filmOffset !== 0
      ) {
        throw new Error(
          'Framing needs visible bounds and an unshifted perspective view.'
        );
      }
      const distance = Math.max(
        radius / Math.sin(halfFov),
        camera.near + radius
      );
      if (
        !(camera.near > 0 && Number.isFinite(camera.far)) ||
        !Number.isFinite(distance) ||
        distance + radius >= camera.far
      ) {
        throw new Error(
          'The scene needs more room within the camera clipping range.'
        );
      }
      const position = sphere.center.clone();
      position.z += distance;
      position.applyMatrix4(cameraToWorld);
      camera.parent?.worldToLocal(position);
      if (!position.toArray().every(Number.isFinite)) {
        throw new Error('The camera transform cannot frame this scene.');
      }
      camera.position.copy(position);
      camera.updateMatrixWorld();
      this.setStatus(
        selectedOnly
          ? 'Framed the selected object with room for its full motion. Its placement was not changed.'
          : 'Framed the scene with room for any authored motion. Object placements were not changed.'
      );
    });
  }

  async addExhibit() {
    const layout = this.room.layout;
    const used = new Set(layout.objects.map((object) => object.id));
    let index = this.exhibitCount + 1;
    while (
      used.has(`exhibit-plinth-${index}`) ||
      used.has(`exhibit-${index}`)
    ) {
      index++;
    }
    const x = -1.5 + ((index - 1) % 3) * 1.5;
    const z = 0.9 + Math.floor((index - 1) / 3) * 0.8;
    await this.run('Downloading the exhibit model.', async () => {
      await this.room.applyPlan({
        title: layout.title,
        edits: [
          {
            op: 'add',
            object: {
              id: `exhibit-plinth-${index}`,
              asset: 'plinth',
              name: `Exhibit plinth ${index}`,
              position: [x, 0, z],
              rotation: 0,
              scale: [1, 1, 1],
              color: '#efe6d8',
            },
          },
          {
            op: 'add',
            object: {
              id: `exhibit-${index}`,
              asset: EXHIBIT_ASSET_ID,
              name: `Boom box exhibit ${index}`,
              position: [x, 0.85, z],
              rotation: 0.6,
              scale: [1, 1, 1],
              color: '#ffffff',
            },
          },
        ],
      });
      this.exhibitCount = index;
      this.setStatus('Downloaded exhibit added to the scene.');
    });
  }

  exportLayout() {
    const layout = this.room.layout;
    if (layout.objects.length === 0) {
      this.setError('There is nothing to export yet.');
      return;
    }
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roomcraft-scene.json';
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(
      'Exported the scene layout. It contains no keys and no prompts.'
    );
  }

  async connectGemini(prompt = true) {
    if (this.room.busy || this.connecting) {
      this.setError(
        'Wait for the current operation before configuring Gemini.'
      );
      return;
    }
    const ai = xb.core.ai;
    if (!ai?.options) {
      this.setError('The AI subsystem is unavailable in this session.');
      return;
    }
    this.stopListening();
    this.connecting = true;
    this.setError('');
    this.dom.aiStatus.textContent = 'Configuring Gemini.';
    this.refresh();
    try {
      ai.options.promptForApiKey = prompt;
      ai.options.gemini.enabled = true;
      ai.options.gemini.config = {
        responseMimeType: 'application/json',
        responseJsonSchema: SCENE_PLAN_SCHEMA,
      };
      await ai.initializeModel(xb.Gemini, ai.options.gemini);
      if (this.disposed) return;
      if (ai.options.gemini.apiKey.trim() && ai.isAvailable()) {
        this.dom.aiStatus.textContent =
          'Key configured for this page. Authentication and quota are checked when you request an edit.';
        this.setStatus('Gemini is configured. Describe an edit to your scene.');
      } else {
        this.dom.aiStatus.textContent =
          'Not connected. No usable API key was provided.';
        this.setError(
          'Gemini could not be initialized. Provide a valid API key and try again.'
        );
      }
    } catch (error) {
      this.dom.aiStatus.textContent = 'Not connected.';
      this.showError(error);
    } finally {
      this.connecting = false;
      this.refresh();
    }
  }

  // ---- speech ----

  toggleListening() {
    const recognizer = xb.core.sound?.speechRecognizer;
    if (!recognizer?.recognition) {
      this.setError(
        'Speech recognition is not available in this browser. Type the edit instead.'
      );
      return;
    }
    if (this.listening) {
      this.stopListening();
      this.setStatus('Listening stopped.');
      return;
    }
    if (this.room.busy || this.connecting) {
      this.setError('Roomcraft is still working. Wait for it to finish.');
      return;
    }
    if (!this.isGeminiReady()) {
      this.setError(
        'Configure Gemini in the desktop panel before using voice. The starter scenes do not need a key.'
      );
      return;
    }
    this.setError('');
    this.listening = true;
    this.dom.mic.setAttribute('aria-pressed', 'true');
    this.setStatus('Listening. Speak one instruction.');
    recognizer.start();
    this.refresh();
  }

  stopListening() {
    if (!this.listening) return;
    this.listening = false;
    this.dom.mic.setAttribute('aria-pressed', 'false');
    xb.core.sound?.speechRecognizer?.stop();
    this.refresh();
  }

  // ---- shared plumbing ----

  async run(pendingMessage, action) {
    if (this.room.busy || this.connecting) {
      this.setError('Roomcraft is still working. Wait for it to finish.');
      return;
    }
    this.setError('');
    this.setStatus(pendingMessage);
    this.refresh();
    try {
      await action();
    } catch (error) {
      this.showError(error);
      this.setStatus('Your scene was kept unchanged.');
    } finally {
      this.refresh();
    }
  }

  showError(error) {
    console.error('[roomcraft]', error);
    this.setError(error?.message ?? String(error));
  }

  setError(message) {
    if (this.disposed) return;
    this.errorMessage = message ?? '';
    const element = this.dom.error;
    if (!element) return;
    element.textContent = this.errorMessage;
    element.hidden = !message;
    if (message && !this.card?.visible) this.toggleConsole(true);
    this.updateSpatialStatus();
  }

  setStatus(message) {
    if (this.disposed) return;
    this.statusMessage = message;
    if (this.dom.status) this.dom.status.textContent = message;
    this.updateSpatialStatus();
  }

  updateSpatialStatus() {
    if (this.xrStatusText) {
      this.xrStatusText.text = (this.errorMessage || this.statusMessage)
        .replace(/[…]/g, '...')
        .replace(/[·]/g, '-');
    }
  }

  isGeminiReady() {
    const ai = xb.core.ai;
    return !!(
      !this.connecting &&
      ai?.options?.gemini.apiKey.trim() &&
      ai.isAvailable()
    );
  }

  toggleConsole(expanded) {
    this.dom.console.classList.toggle('rc-collapsed', !expanded);
    this.dom.toggle.setAttribute('aria-expanded', String(expanded));
    this.dom.toggle.textContent = expanded ? 'Hide controls' : 'Open studio';
  }

  listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.cleanups.push(() => target.removeEventListener(type, listener));
  }

  refresh() {
    if (this.disposed) return;
    const layout = this.room.layout;
    const busy = this.room.busy || this.connecting;
    const selectedId = this.room.selectedId;
    const dom = this.dom;
    if (!dom.console) return;

    dom.console.classList.toggle('rc-busy', busy);
    const spatialVisible = this.isInXR() || this.spatialPreview;
    this.card.visible = spatialVisible;
    this.keyboardCard.visible =
      spatialVisible && this.keyboardOpen && this.spatialTab === 'author';
    dom.spatialStudio.disabled = this.isInXR();
    dom.spatialStudio.setAttribute('aria-pressed', String(this.spatialPreview));
    dom.spatialStudio.textContent = this.spatialPreview
      ? 'Hide spatial studio'
      : 'Spatial studio';
    this.xrType.label = this.keyboardOpen ? 'Hide keyboard' : 'Keyboard';
    this.xrAuthorPanel.style.display =
      this.spatialTab === 'author' ? 'flex' : 'none';
    this.xrExamplesPanel.style.display =
      this.spatialTab === 'examples' ? 'flex' : 'none';
    this.xrAuthorTab.style.backgroundColor =
      this.spatialTab === 'author' ? '#8a4a33' : '#30292d';
    this.xrExamplesTab.style.backgroundColor =
      this.spatialTab === 'examples' ? '#8a4a33' : '#30292d';
    dom.sceneSummary.textContent =
      layout.objects.length === 0
        ? 'The room is empty. Pick a starter scene or describe one.'
        : `"${layout.title}" with ${layout.objects.length} object${
            layout.objects.length === 1 ? '' : 's'
          }. Drag or pinch an object to move it.`;
    dom.placement.textContent = this.placed ? PLACED_MESSAGE : PREVIEW_MESSAGE;

    const selectedName =
      layout.objects.find((object) => object.id === selectedId)?.name ?? '';
    dom.selection.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Nothing selected';
    dom.selection.appendChild(empty);
    for (const object of layout.objects) {
      const option = document.createElement('option');
      option.value = object.id;
      option.textContent = `${object.name} (${object.id})`;
      dom.selection.appendChild(option);
    }
    dom.selection.value = selectedId ?? '';
    dom.selection.title = selectedId
      ? `Selected ${selectedName} (${selectedId})`
      : 'Nothing selected';
    const selected = layout.objects.find((object) => object.id === selectedId);
    const parts = selected?.parts ?? [];
    const movingParts = parts.filter((part) => part.motion);
    const motionSentence = movingParts.length
      ? ` ${movingParts.length} part${movingParts.length === 1 ? '' : 's'} move: ${movingParts
          .map((part) => `${part.name} ${describeMotion(part.motion)}`)
          .join('; ')}. Pausing motion does not change the design.`
      : ' No part of it moves yet.';
    dom.design.textContent = !selected
      ? 'Nothing selected.'
      : parts.length > 0
        ? `${selected.name} is one compound design made of ${parts.length} part${
            parts.length === 1 ? '' : 's'
          }. It moves, rotates, and scales as a single object, and an edit can change individual parts.${motionSentence}`
        : `${selected.name} is a catalog object, so it has no editable parts.`;
    dom.parts.replaceChildren();
    for (const part of parts.slice(0, MAX_LISTED_PARTS)) {
      const item = document.createElement('li');
      item.textContent = part.motion
        ? `${part.name} (${part.shape}, ${part.motion.kind}s)`
        : `${part.name} (${part.shape})`;
      if (part.motion) item.className = 'rc-moving';
      dom.parts.appendChild(item);
    }
    if (parts.length > MAX_LISTED_PARTS) {
      const item = document.createElement('li');
      item.textContent = `and ${parts.length - MAX_LISTED_PARTS} more`;
      dom.parts.appendChild(item);
    }
    dom.parts.hidden = parts.length === 0;
    if (this.xrSelectionText) {
      this.xrSelectionText.text = selectedId
        ? parts.length > 0
          ? `Selected: ${selectedName} - ${parts.length} parts${
              movingParts.length ? `, ${movingParts.length} moving` : ''
            }`
          : `Selected: ${selectedName} (${selectedId})`
        : 'Nothing selected';
    }

    // Playback control is inspection state, so it ignores the busy flag.
    const hasMotion = this.room.hasMotion;
    const motionPaused = this.room.motionPaused;
    dom.motion.disabled = !hasMotion;
    dom.motion.textContent = motionPaused ? 'Resume motion' : 'Pause motion';
    dom.motion.setAttribute('aria-pressed', String(motionPaused));
    dom.motionNote.textContent = !hasMotion
      ? 'Nothing in this scene moves. Authored motion is optional.'
      : motionPaused
        ? 'Motion paused. Parts hold their current pose for inspection; the layout, history, and placement are untouched.'
        : 'Motion playing. Exported parts always keep their authored rest transforms.';
    this.xrMotion.disabled = dom.motion.disabled;
    this.xrMotion.label = motionPaused ? 'Resume' : 'Pause';

    const aiReady = this.isGeminiReady();
    this.xrProviderText.text = aiReady
      ? 'Gemini configured for this page.'
      : 'Offline tools available. Connect Gemini in desktop controls to generate.';
    dom.generate.disabled = busy || !dom.prompt.value.trim();
    dom.newDesign.disabled = busy || layout.objects.length === 0;
    dom.mic.disabled = busy || !xb.core.sound?.speechRecognizer?.recognition;
    dom.place.disabled = busy || layout.objects.length === 0;
    dom.undo.disabled = busy || !this.room.canUndo;
    dom.redo.disabled = busy || !this.room.canRedo;
    dom.focusSelected.disabled = busy || this.isInXR() || !selectedId;
    dom.frameScene.disabled =
      busy || this.isInXR() || layout.objects.length === 0;
    dom.removeSelected.disabled = busy || !selectedId;
    dom.exhibit.disabled = busy;
    dom.export.disabled = layout.objects.length === 0;
    dom.connect.disabled = busy;
    dom.connect.textContent = aiReady ? 'Reconnect Gemini' : 'Connect Gemini';
    dom.mic.textContent = this.listening
      ? 'Stop'
      : xb.core.sound?.speechRecognizer?.recognition
        ? 'Talk'
        : 'No voice';
    this.xrTalk.disabled = dom.mic.disabled;
    this.xrTalk.label = dom.mic.textContent;
    this.xrNew.disabled = dom.newDesign.disabled;
    this.xrPlace.disabled = dom.place.disabled;
    this.xrUndo.disabled = dom.undo.disabled;
    this.xrRedo.disabled = dom.redo.disabled;
    this.xrGenerate.disabled = dom.generate.disabled;
    this.xrRemove.disabled = dom.removeSelected.disabled;
    this.xrPrevious.disabled = busy || layout.objects.length === 0;
    this.xrNext.disabled = this.xrPrevious.disabled;
    for (const button of this.starterButtons) {
      button.disabled = busy;
    }
    for (const button of this.spatialStarters) {
      button.disabled = busy;
    }
  }

  dispose() {
    this.stopListening();
    this.disposed = true;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.card?.dispose();
    this.card?.removeFromParent();
    if (this.xrKeyboard) {
      this.xrKeyboard.onValueChange = undefined;
      this.xrKeyboard.onSubmit = undefined;
    }
    this.keyboardCard?.dispose();
    this.keyboardCard?.removeFromParent();
    this.dom.starters?.replaceChildren();
    this.dom.suggestions?.replaceChildren();
    this.dom.parts?.replaceChildren();
  }
}

function createLighting() {
  const lights = new THREE.Group();
  lights.name = 'RoomcraftLighting';
  lights.add(new THREE.HemisphereLight(0xfff3e4, 0x39323a, 2.4));
  const key = new THREE.DirectionalLight(0xffe9d2, 1.6);
  key.position.set(2.5, 4, 2);
  lights.add(key);
  const fill = new THREE.DirectionalLight(0x9db8a6, 0.6);
  fill.position.set(-3, 2.5, -1.5);
  lights.add(fill);
  return lights;
}

async function start() {
  const options = new xb.Options();
  options.enableAI();
  // No model request happens on load; the demo connects Gemini on demand.
  options.ai.gemini.enabled = false;
  options.ai.gemini.config = {
    responseMimeType: 'application/json',
    responseJsonSchema: SCENE_PLAN_SCHEMA,
  };
  options.enablePlaneDetection();
  options.enableHands();
  options.reticles.enabled = true;
  options.sound.speechRecognizer.enabled = true;
  options.sound.speechRecognizer.continuous = false;
  options.sound.speechRecognizer.interimResults = true;
  options.setAppTitle('Roomcraft');
  options.setAppDescription('Speak a scene into your room.');
  options.xrButton.showEnterSimulatorButton = true;

  const room = new Roomcraft({
    catalog: [
      ...createDefaultCatalog(),
      createModelAsset({
        id: EXHIBIT_ASSET_ID,
        description: 'A downloaded boom box model shown as a gallery exhibit',
        size: [0.42, 0.24, 0.16],
        url: EXHIBIT_MODEL_URL,
      }),
    ],
  });
  room.position.set(0, 0, -2.4);

  const consoleScript = new RoomcraftConsole(room);
  xb.add(room, consoleScript, createLighting());
  await xb.init(options);
  await consoleScript.start();
}

document.addEventListener(
  'DOMContentLoaded',
  () => {
    void start().catch((error) => {
      console.error('[roomcraft] Startup failed', error);
      document.getElementById('status').textContent =
        'Roomcraft could not start.';
      const message = document.getElementById('error');
      message.textContent =
        error instanceof Error ? error.message : String(error);
      message.hidden = false;
    });
  },
  {once: true}
);
