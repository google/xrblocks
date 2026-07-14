import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {
  HeadLeashBehavior,
  ManipulationBehavior,
  UICore,
  UIIcon,
  UIPanel,
  UIText,
} from 'uiblocks';
import {
  AgentGestureAnimator,
  AgentHands,
  AgentHead,
  AgentSpeechConductor,
  AgentWorld,
  buildGestureSteps,
  estimateSpeechDuration,
  parseAgentGestures,
} from 'xrblocks/addons/agenthands/index.js';
import * as xb from 'xrblocks';

// AgentHands demo: a free-standing pair of agent hands that gesture as the
// agent speaks.
//
// Without a Gemini key it plays a scripted monologue. Provide a key (?key=...)
// to talk to the agent: it replies with [gesture:...] markup, which is parsed
// into hand gestures played in sync with spoken (TTS) text.

// Scratch vector reused when updating the pointer-ray visualization.
const scratchTip_ = new THREE.Vector3();

// Resting orientation of the hand pair: level, no tilt. The hands rest in front
// of the user in a neutral, relaxed pose rather than the old palms-up "offering"
// tilt.
const REST_TILT_X = 0;
const REST_ROLL_Z = 0;

// Silence (ms) after the user stops talking before we send their speech, so a
// pause mid-sentence doesn't cut them off.
const SPEECH_SILENCE_MS = 1000;

// localStorage key the World Understanding module persists grounded objects to,
// so the agent has something to point at immediately on reload (a fresh scan
// replaces it).
const STORAGE_KEY = 'agent_hands.objects';

// Head-anchor tuning: where the hands and orb sit relative to the user, and how
// quickly they follow as the user walks and turns.
const HANDS_FORWARD_M = 0.7; // distance in front of the user
const HANDS_HEIGHT_M = -0.35; // below eye level
const HEAD_FORWARD_M = 0.75; // orb sits a touch further out
const HEAD_HEIGHT_M = 0.02; // orb near eye level
const ANCHOR_LERP = 0.08; // per-frame follow smoothing
const BOB_FREQ = 1.4; // idle breathing bob
const BOB_AMP_M = 0.012;
const SWAY_FREQ = 0.8; // idle side-to-side sway
const SWAY_AMP = 0.02;
const LEAN_CLAMP = 0.5; // max yaw lean toward a pointing target (rad)
const LEAN_X_GAIN = 0.25; // pitch lean per unit target height
const LEAN_X_CLAMP = 0.25; // max pitch lean (rad)

// Scripted (no-key) pacing, in seconds: the gap before the first pose, between
// poses, before the closing rest, and before advancing to the next line.
const SCRIPT_START_S = 0.4;
const SCRIPT_STEP_S = 1.2;
const SCRIPT_REST_S = 0.4;
const SCRIPT_ADVANCE_S = 2.2;

const META_INSTRUCTION = `You are a friendly assistant with a visible pair of hands you gesture with. Reply in one or two short sentences. Embed gesture markup inline right before the word it emphasizes. Use a few gestures per reply.

Static gestures: [gesture:NAME] where NAME is thumbs_up, thumbs_down, fist, victory, rock, or open.
Motion gestures: [wave] to greet, [beat] for rhythmic emphasis on a stressed word, [size:small|big] to show how big something is, [count:N] to enumerate (1 or 2).

You can physically point at real things in the room. When the user asks where something is, or you refer to a real object, point at it with [point:LABEL] where LABEL is one of the visible objects listed below. Only point at objects from that list. If the user asks about something that is not in the list, say you cannot see it from here and do not point. Do not mention the markup.`;

const SCRIPT = [
  'Hi there! [wave] great to see you.',
  'Look at that [gesture:point] over on the shelf.',
  'It was about [size:big] this big!',
  'Two options [gesture:victory] to choose from.',
  'Got it [beat] done, let me handle that.',
];

class AgentHandsDemo extends xb.Script {
  constructor() {
    super();
    this.hands = new AgentHands();
    this.head = new AgentHead();
    // Modules (World Understanding / Gesture Animator / TTS conductor) are wired
    // in init() once core subsystems exist.
    this.world = null;
    this.animator = null;
    this.conductor = null;
    this.busy = false;
    this.interactive = false;
    // Accumulated speech + silence timer so a pause doesn't cut the user off.
    this._speech = '';
    this._speechTimer = null;
    // Push-to-talk: only accept mic input between a talk press and the reply.
    this._listening = false;
    // Head-anchor + idle-life + pointer-viz state.
    this._camPos = new THREE.Vector3();
    this._camQuat = new THREE.Quaternion();
    this._anchored = false;
    this._anchorQuat = new THREE.Quaternion();
    this._anchorPos = new THREE.Vector3();
    this._headPos = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._forward = new THREE.Vector3();
    this._clock = 0;
    this.pointerViz = null;
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 1);
    xb.core.scene.add(key);

    await this.hands.load();
    // Resting in front of the user in a neutral, level pose; the head-anchor
    // keeps this each frame.
    this.hands.position.set(0, 1.25, -0.7);
    // Half-turn about vertical so the hands face the user (the model's neutral
    // orientation faces away).
    this.hands.rotation.set(REST_TILT_X, Math.PI, REST_ROLL_Z);
    this.hands.left.root.position.set(-0.16, 0, 0);
    this.hands.right.root.position.set(0.16, 0, 0);
    // We drive this.hands.update() manually from our own update() (after
    // anchoring, and before reading the animated fingertip for the pointer viz),
    // so opt it out of the framework's Script update to avoid animating twice.
    this.hands.isXRScript = false;
    xb.core.scene.add(this.hands);

    // The agent's abstract "presence": a glowing orb that floats above and
    // between the hands, breathing while idle and pulsing while it speaks.
    xb.core.scene.add(this.head.root);

    this.buildPointerViz_();

    // Gesture Animator: turns timed gesture steps into hand movement, and
    // tracks which hand is pointing (and at what) for the pointer viz + gaze.
    this.animator = new AgentGestureAnimator(this.hands);

    // World Understanding: detects objects, grounds them to 3D points against
    // the depth mesh, caches + persists them, and re-scans as the user moves.
    this.world = new AgentWorld({
      getDetector: () => xb.core.world?.objects,
      getCamera: () => xb.core.camera,
      getDepthMesh: () => xb.core.depth?.depthMesh,
      getSnapshotAspect: async () => {
        const probe = await xb.core.deviceCamera?.getSnapshot({
          outputFormat: 'imageData',
        });
        return probe?.width ? probe.width / probe.height : undefined;
      },
      storageKey: STORAGE_KEY,
    });

    // TTS conductor: syncs the gesture timeline with spoken words.
    this.conductor = new AgentSpeechConductor({
      synthesizer: xb.core.sound?.speechSynthesizer,
      onStep: (step) => this.animator.fireStep(step),
      onRest: () => this.animator.rest(),
      onNext: (index) => this.playLine_(index),
    });

    this.interactive = !!xb.core.ai?.model?.options?.apiKey;
    this.buildSpatialPanel_();

    if (this.interactive) {
      this.startInteractive_();
      // Scan the room once up front (in the background) so questions never
      // wait on detection. The user can re-scan from the panel.
      this.scan_();
    } else {
      this.setStatus_('no key, playing a scripted demo. add ?key= to talk.');
      this.playLine_(0);
    }
  }

  // ---- embodiment: head-anchor, idle life, pointer viz ----

  // A faint pointer ray (fingertip -> target) plus a pulsing ring at the
  // target, shown only while the agent is pointing.
  buildPointerViz_() {
    const group = new THREE.Group();
    group.visible = false;
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const line = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({
        color: 0x9177c7,
        transparent: true,
        opacity: 0.5,
      })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.07, 28),
      new THREE.MeshBasicMaterial({
        color: 0x9177c7,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      })
    );
    group.add(line, ring);
    // Decorative only; never let the pointer ray/ring intercept the reticle.
    line.raycast = () => {};
    ring.raycast = () => {};
    this.pointerViz = {group, line, ring};
    xb.core.scene.add(group);
  }

  // Keeps the hands floating in front of the user (position + yaw) so they stay
  // in view as the user walks/turns. Adds a gentle idle bob, and a subtle lean
  // toward whatever the agent is pointing at.
  anchorToHead_() {
    const cam = xb.core.camera;
    if (!cam) return;
    cam.getWorldPosition(this._camPos);
    cam.getWorldQuaternion(this._camQuat);
    this._euler.setFromQuaternion(this._camQuat, 'YXZ');
    const yaw = this._euler.y;

    // Position: 0.7 m in front of the user at the yaw heading, a touch below
    // eye level, with a slow breathing bob.
    const bob = Math.sin(this._clock * BOB_FREQ) * BOB_AMP_M;
    this._forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._anchorPos
      .copy(this._camPos)
      .addScaledVector(this._forward, -HANDS_FORWARD_M)
      .add(new THREE.Vector3(0, HANDS_HEIGHT_M + bob, 0));
    if (!this._anchored) {
      this.hands.position.copy(this._anchorPos);
      this._anchored = true;
    } else {
      this.hands.position.lerp(this._anchorPos, ANCHOR_LERP);
    }

    // The orb sits above and between the hands, near eye level.
    this._forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._headPos
      .copy(this._camPos)
      .addScaledVector(this._forward, -HEAD_FORWARD_M)
      .add(new THREE.Vector3(0, HEAD_HEIGHT_M + bob, 0));
    this.head.root.position.lerp(this._headPos, ANCHOR_LERP);

    // Orientation: face the user (yaw) + the fingers-up tilt, plus a small
    // lean toward the pointing target and a gentle idle sway.
    let lean = 0;
    let leanX = 0;
    if (this.animator.pointing && this.animator.target) {
      this._forward.copy(this.animator.target).sub(this.hands.position);
      lean = THREE.MathUtils.clamp(
        Math.atan2(this._forward.x, -this._forward.z) - yaw,
        -LEAN_CLAMP,
        LEAN_CLAMP
      );
      leanX = THREE.MathUtils.clamp(
        -this._forward.y * LEAN_X_GAIN,
        -LEAN_X_CLAMP,
        LEAN_X_CLAMP
      );
    }
    const sway = Math.sin(this._clock * SWAY_FREQ) * SWAY_AMP;
    // Level rest orientation (REST_TILT_X / REST_ROLL_Z are 0), plus a half-turn
    // about vertical (Math.PI) so the hands face the user. Lean adds a gentle
    // tilt toward the pointing target and an idle sway.
    this._euler.set(
      REST_TILT_X + leanX,
      yaw + lean + sway + Math.PI,
      REST_ROLL_Z,
      'YXZ'
    );
    this._anchorQuat.setFromEuler(this._euler);
    this.hands.quaternion.slerp(this._anchorQuat, ANCHOR_LERP);
  }

  // Updates the pointer ray + ring while pointing; hides it otherwise.
  updatePointerViz_() {
    const viz = this.pointerViz;
    if (!viz) return;
    const target = this.animator.target;
    const activeHand = this.animator.activeHand;
    const show = this.animator.pointing && target && activeHand;
    viz.group.visible = !!show;
    if (!show) return;
    const tip = activeHand.getIndexTipWorld(scratchTip_);
    const positions = viz.line.geometry.attributes.position;
    positions.setXYZ(0, tip.x, tip.y, tip.z);
    positions.setXYZ(1, target.x, target.y, target.z);
    positions.needsUpdate = true;
    viz.ring.position.copy(target);
    const cam = xb.core.camera;
    if (cam) viz.ring.lookAt(cam.position);
    const pulse = 1 + Math.sin(this._clock * 4) * 0.15;
    viz.ring.scale.setScalar(pulse);
  }

  // ---- spatial control panel (works in XR + simulator) ----

  buildSpatialPanel_() {
    this.uiCore = new UICore(this);
    const card = this.uiCore.createCard({
      name: 'AgentHandsControlCard',
      position: new THREE.Vector3(0, 0.7, -0.8),
      sizeX: 0.62,
      sizeY: 0.22,
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
      new UIText('AGENT HANDS', {
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
    if (this.interactive) {
      row.add(this.makeXrButton_('mic', 'talk', () => this.onTalk_()));
      row.add(this.makeXrButton_('search', 'scan', () => this.scan_()));
    } else {
      row.add(this.makeXrButton_('replay', 'replay', () => this.replay_()));
    }
    panel.add(row);
    card.add(panel);
    card.addBehavior(
      new ManipulationBehavior({draggable: true, faceCamera: false})
    );
    // Gently follow the user so the controls stay in reach as they move.
    card.addBehavior(
      new HeadLeashBehavior({
        offset: new THREE.Vector3(0, -0.55, -0.85),
        posLerp: 0.08,
        rotLerp: 0.1,
      })
    );
  }

  // Icon + caption button mirroring a DOM control (matches world_companion).
  makeXrButton_(iconName, label, onClick) {
    // Idle is a dark chip; hover is a clear purple so the highlight is
    // unmistakable (the old near-black hover was invisible against idle).
    const idle = '#3a3550';
    const hover = '#7a5fc7';
    const btn = new UIPanel({
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 16,
      paddingRight: 16,
      cornerRadius: 12,
      fillColor: idle,
      strokeWidth: 1,
      strokeColor: '#6b5fa0',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      renderOrder: 10,
      onHoverEnter: () => btn.setFillColor(hover),
      onHoverExit: () => btn.setFillColor(idle),
      onClick: () => {
        btn.setFillColor('#b49aff');
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

  // Triggered by either the DOM Talk button or the spatial mic button.
  onTalk_() {
    if (this.interactive) {
      this._listening = true;
      xb.core.sound?.speechRecognizer?.start();
    } else {
      this.replay_();
    }
  }

  replay_() {
    if (this.interactive) return;
    this.playLine_(0);
  }

  // ---- interactive (Gemini) mode ----

  startInteractive_() {
    const button = document.getElementById('talk');
    const recognizer = xb.core.sound?.speechRecognizer;
    if (button) {
      button.style.display = 'block';
      button.addEventListener('click', () => {
        this._listening = true;
        recognizer?.start();
      });
    }
    recognizer?.addEventListener('result', (event) => {
      // Push-to-talk: only listen between a talk press and the reply. Continuous
      // mode keeps the mic open, so without this it hears its own TTS / ambient
      // sound and replies to itself.
      if (!this._listening || this.busy || this.conductor.speaking) {
        this._speech = '';
        clearTimeout(this._speechTimer);
        return;
      }
      const text = event.transcript.trim();
      if (!text) return;
      // Accumulate finalized speech and wait for a real silence before replying,
      // so a pause mid-sentence doesn't cut you off. Any result (interim or
      // final) restarts the timer, so it only fires once you actually stop.
      if (event.isFinal) {
        this._speech = `${this._speech} ${text}`.trim();
      }
      clearTimeout(this._speechTimer);
      this._speechTimer = setTimeout(() => {
        const said = (this._speech || text).trim();
        this._speech = '';
        this._listening = false;
        recognizer.stop?.();
        if (said) this.respond_(said);
      }, SPEECH_SILENCE_MS);
    });
    this.setStatus_('press talk and say something to the agent.');
  }

  async respond_(userText) {
    if (this.busy) return;
    this.busy = true;
    try {
      // Detection swaps the shared Gemini config to a JSON schema while it
      // runs, so a scan and a chat turn must not overlap or the reply comes
      // back as detection JSON. Wait for any in-flight scan to finish first.
      if (this.world.scanning && this.world.scanPromise) {
        this.setStatus_('one sec...');
        await this.world.scanPromise.catch(() => {});
      }
      this.setStatus_(`you: "${userText}"  ·  thinking...`);
      // Only offer objects from a scan completed this session; a cache restored
      // from local storage may be from another room, so we do not point at it
      // until a fresh scan confirms what is actually here.
      const labels = this.world.scanned
        ? this.world.objects.map((o) => o.label)
        : [];
      const seen = labels.length
        ? `Visible objects you can point at: ${labels.join(', ')}.`
        : 'You have not scanned the room yet, so avoid pointing.';
      const result = await xb.core.ai.query({
        prompt: `${META_INSTRUCTION}\n\n${seen}\n\nUser: ${userText}\nAssistant:`,
      });
      const reply = typeof result === 'string' ? result : (result?.text ?? '');
      // Safety net: drop a detection-JSON reply that slips through ("[{...}]" or
      // "{...}"), but not a normal reply that opens with a gesture tag ("[wave]").
      const clean = /^\s*(\[\s*\{|\{)/.test(reply.trim()) ? '' : reply;
      const {text, gestures} = parseAgentGestures(clean);
      this.speak_(text || 'Sorry, could you say that again?', gestures);
    } catch (error) {
      console.error('[agent_hands]', error);
      this.setStatus_('error talking to Gemini (see console).');
    } finally {
      this.busy = false;
    }
  }

  // Scans the room for objects (via the World Understanding module), updating
  // the status so the user knows what happened. Detection is a Gemini vision
  // call, so it runs off the conversation's critical path.
  scan_() {
    // Never scan during a chat turn: detection mutates the shared Gemini
    // config, which would corrupt an in-flight reply.
    if (this.busy || this.world.scanning) return;
    this.setStatus_('scanning the room for objects...');
    this.world.scan().then(() => {
      const n = this.world.objects.length;
      this.setStatus_(
        n
          ? `found ${n} things i can point at. press talk.`
          : 'press talk and say something to the agent.'
      );
    });
  }

  // Speaks `text` and plays its gestures. Point gestures are grounded to real
  // objects via the World Understanding module, then the TTS conductor drives
  // the timeline and syncs it to the spoken words.
  speak_(text, gestures) {
    this.setStatus_(`agent: "${text}"`);
    const duration = estimateSpeechDuration(text);
    const steps = buildGestureSteps(text, gestures, duration, (label) =>
      this.world.pointFor(label)
    );
    this.conductor.speak(text, steps, duration);
  }

  // ---- scripted (no-key) mode ----

  playLine_(index) {
    const {text, gestures} = parseAgentGestures(SCRIPT[index % SCRIPT.length]);
    this.setStatus_(`agent: "${text}"`);
    const entries = [];
    let t = SCRIPT_START_S;
    for (const gesture of gestures) {
      entries.push({at: t, step: {at: t, charIndex: 0, pose: gesture.pose}});
      t += SCRIPT_STEP_S;
    }
    entries.push({
      at: t + SCRIPT_REST_S,
      step: {
        at: t + SCRIPT_REST_S,
        charIndex: 0,
        pose: xb.SimulatorHandPose.RELAXED,
      },
    });
    entries.push({at: t + SCRIPT_ADVANCE_S, next: (index + 1) % SCRIPT.length});
    this.conductor.playTimeline(entries);
  }

  update() {
    const dt = xb.getDeltaTime?.() ?? 0.016;
    this._clock += dt;
    this.conductor.tick(dt);
    this.anchorToHead_();
    // Re-aim every frame while pointing so the finger stays locked on the
    // world target even as the head-anchored rig follows and sways.
    this.animator.reaim();
    this.hands.update();
    // Drive the orb: it gazes at the pointing target (or forward), pulses while
    // the agent is speaking, and breathes when idle.
    this.head.lookAt(this.animator.pointing ? this.animator.target : null);
    this.head.setSpeaking(this.conductor.speaking ? 1 : 0);
    this.head.update(dt);
    this.updatePointerViz_();
    if (this.interactive && !this.busy) this.world.maybeAutoScan();
    this.ensureDepthMeshNonInteractive_();
  }

  // The depth mesh (scanned walls/floor) is in the scene for occlusion, so both
  // the SDK reticle and the spatial-UI hover raycast hit it; standing close to a
  // wall it steals hover from the control panel. No-op its raycast so every
  // raycaster skips it (ignoreReticleRaycast only covers the reticle, not the UI
  // hover). AgentWorld restores it briefly for object grounding.
  ensureDepthMeshNonInteractive_() {
    const mesh = xb.core.depth?.depthMesh;
    if (!mesh || mesh.__reticleNooped) return;
    mesh.__origRaycast = mesh.raycast;
    mesh.raycast = () => {};
    mesh.__reticleNooped = true;
  }

  setStatus_(text) {
    console.log('[agent_hands]', text);
    const el = document.getElementById('status');
    if (el) el.textContent = text;
    // The spatial font lacks some glyphs (ellipsis, middle dot), so normalize.
    if (this.xrStatusText) {
      this.xrStatusText.setText(text.replace(/…/g, '...').replace(/·/g, '-'));
    }
  }
}

function start() {
  const options = new xb.Options();
  options.enableAI();
  // Spatial UI (the control panel) + reticle for pointing at it.
  options.enableUI();
  options.reticles.enabled = true;
  options.sound.speechSynthesizer.enabled = true;
  options.sound.speechSynthesizer.allowInterruptions = true;
  options.sound.speechRecognizer.enabled = true;
  // Push-to-talk: a talk press starts one recognition; don't keep the mic
  // continuously open (it auto-restarts and chimes when we aren't listening).
  options.sound.speechRecognizer.continuous = false;
  options.sound.speechRecognizer.interimResults = true;
  // Object detection so the hands can point at real things in the room.
  options.deviceCamera.enabled = true;
  options.permissions.camera = true;
  options.world.enableObjectDetection();
  options.world.objects.backendConfig.activeBackend = 'gemini';
  options.world.objects.showDebugVisualizations = false;
  // Ask Gemini for an exhaustive object list so there is more to point at.
  options.world.objects.backendConfig.gemini.systemInstruction =
    'List every distinct object visible in the image, including small items ' +
    '(cups, books, remotes), wall-mounted things (pictures, switches, TVs), ' +
    'and ceiling fixtures (lamps, lights). For each, return ymin, xmin, ymax, ' +
    'xmax as integers from 0 to 1000 (top-left origin) and a short lowercase ' +
    'objectName. List up to 20 objects. Skip walls, floor, ceiling, and any ' +
    'human body parts or UI elements attached to them.';
  // Depth mesh: grounds each detected object to a 3D point via raycast.
  options.depth.enabled = true;
  options.depth.depthMesh.enabled = true;
  options.setAppTitle('Agent Hands');
  options.setAppDescription(
    'A pair of agent hands that gesture as the agent speaks. Add ?key=... to ' +
      'talk to it.'
  );
  options.xrButton.showEnterSimulatorButton = true;

  const demo = new AgentHandsDemo();
  window.agentHandsDemo = demo;
  xb.add(demo);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
