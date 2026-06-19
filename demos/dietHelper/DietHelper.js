import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * Diet Helper scene: loads procedurally generated dish .glbs and presents
 * each inside an xb.ModelViewer the user can drag/rotate. Two ways to log a
 * meal:
 *   1. Pinch / click a dish model in the scene -> uses its pre-defined macros.
 *   2. Press "Capture & Analyze" (or `C`) -> screenshots the current view,
 *      sends it to Gemini, and logs whatever food it identifies.
 *
 * Assets:
 *   demos/dietHelper/3DAssets/burger.glb (built by scripts/generateBurger.mjs)
 */

const GEMINI_NUTRITION_PROMPT = `You are a nutrition analyst. Look at the
image and identify the food items visible. Return ONLY a valid JSON object,
no markdown fences, no commentary, matching this schema exactly:

{
  "items": [
    {
      "name": "string",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number
    }
  ],
  "total_calories": number,
  "total_protein_g": number,
  "notes": "string (\u22641 sentence)"
}

If there is no recognizable food in the image, return:
{"items": [], "total_calories": 0, "total_protein_g": 0, "notes": "no food detected"}
`;

const DISHES = [
  {
    id: 'burger',
    name: 'Classic Burger',
    file: 'https://raw.githack.com/xrblocks/assets-genai/main/burger.glb',
    // The .glb is authored at real-world size (~22 cm wide). No extra scale.
    scale: {x: 1, y: 1, z: 1},
    nutrition: {
      calories: 540,
      protein: 28,
      carbs: 42,
      fat: 28,
    },
  },
];

export class DietHelper extends xb.Script {
  constructor() {
    super();
    this.models = new Map(); // dish.id -> xb.ModelViewer
    this.placed = new Set();
    this.sessionReady = false;
    this.overlay = document.getElementById('dietHelperOverlay');
    this.mealLog = [];
    this.isCapturing = false;

    this.dom = {
      captureBtn: document.getElementById('dietHelperCaptureBtn'),
      photoPanel: document.getElementById('dietHelperPhoto'),
      photoImg: document.getElementById('dietHelperPhotoImg'),
      photoStatus: document.getElementById('dietHelperPhotoStatus'),
      photoStatusText: document.querySelector(
        '#dietHelperPhotoStatus .dh-status-text'
      ),
      photoSpinner: document.querySelector(
        '#dietHelperPhotoStatus .dh-spinner'
      ),
      photoResult: document.getElementById('dietHelperPhotoResult'),
      photoClose: document.getElementById('dietHelperPhotoClose'),
      bgToggle: document.getElementById('dietHelperBgToggle'),
      modelSelect: document.getElementById('dietHelperModelSelect'),
    };
    this.bindPhotoUI();
    this.bindModelSelector();
  }

  async init() {
    xb.core.input.addReticles();
    this.addLights();
    await this.loadDishes();
  }

  bindPhotoUI() {
    // Expose entry points globally so the HTML's inline `onclick` attributes
    // can reach this instance regardless of when the constructor runs.
    window.dietHelperCaptureAndAnalyze = () => this.captureAndAnalyze();
    window.dietHelperHidePanel = () => this.hidePhotoPanel();
    // Also wire programmatic listeners as a fallback in case the inline
    // handlers are blocked by a stricter CSP.
    if (this.dom.captureBtn) {
      this.dom.captureBtn.addEventListener('click', () =>
        this.captureAndAnalyze()
      );
    }
    if (this.dom.photoClose) {
      this.dom.photoClose.addEventListener('click', () =>
        this.hidePhotoPanel()
      );
    }
    if (this.dom.bgToggle) {
      const saved = localStorage.getItem('dietHelper.includeBackground');
      if (saved !== null) this.dom.bgToggle.checked = saved === '1';
      this.dom.bgToggle.addEventListener('change', () => {
        localStorage.setItem(
          'dietHelper.includeBackground',
          this.dom.bgToggle.checked ? '1' : '0'
        );
      });
    }
    // Keyboard shortcut: 'C' to capture (avoids conflicting with simulator
    // navigation keys like WASD / arrows).
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        this.captureAndAnalyze();
      }
    });
  }

  /**
   * Lets the user pick which multimodal Gemini model analyzes the photo. The
   * choice is persisted and applied to xb's shared GeminiOptions, which the
   * query path reads live (see Gemini.queryOnce -> this.options.model).
   */
  bindModelSelector() {
    if (!this.dom.modelSelect) return;
    const saved = localStorage.getItem('dietHelper.geminiModel');
    if (saved) this.dom.modelSelect.value = saved;
    this.applySelectedModel();
    this.dom.modelSelect.addEventListener('change', () => {
      localStorage.setItem(
        'dietHelper.geminiModel',
        this.dom.modelSelect.value
      );
      this.applySelectedModel();
    });
  }

  /** Pushes the dropdown's value into xb's live Gemini options, if ready. */
  applySelectedModel() {
    const model = this.dom.modelSelect?.value;
    const gemini = xb.core?.ai?.options?.gemini;
    if (model && gemini) {
      gemini.model = model;
      console.log('[diet-helper] using Gemini model:', model);
    }
  }

  addLights() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.6, 1.2, 0.4);
    this.add(key);
    const fill = new THREE.DirectionalLight(0xffe8c2, 0.4);
    fill.position.set(-0.8, 0.6, -0.3);
    this.add(fill);
  }

  async loadDishes() {
    await Promise.all(DISHES.map((dish) => this.loadDish(dish)));
  }

  async loadDish(dish) {
    const viewer = new xb.ModelViewer({});
    this.add(viewer);

    // Spawn the dish slightly below eye level, one "object distance" forward.
    viewer.position.set(
      0,
      Math.max(0.6, (xb.user?.height ?? 1.6) - 0.5),
      -(xb.user?.objectDistance ?? 1.0)
    );

    await viewer.loadGLTFModel({
      data: {
        path: '',
        model: dish.file,
        scale: dish.scale,
      },
      renderer: xb.core.renderer,
    });

    viewer.userData.dish = dish;
    this.models.set(dish.id, viewer);
    this.placeOnSurface(viewer);
  }

  onSimulatorStarted() {
    this.sessionReady = true;
    this.placeAll();
  }

  onXRSessionStarted() {
    this.sessionReady = true;
    this.placeAll();
  }

  placeAll() {
    for (const viewer of this.models.values()) {
      this.placeOnSurface(viewer);
    }
  }

  placeOnSurface(viewer) {
    if (!this.sessionReady || this.placed.has(viewer)) return;
    this.placed.add(viewer);
    return xb.world
      ?.placeOnHorizontalSurface?.(viewer, {seconds: 30})
      ?.catch?.(() => {
        // Leave the dish at its fallback position if surface detection fails.
      });
  }

  /**
   * Called by xb on every pinch / mouse-click completion. We re-cast the
   * controller's ray against each registered dish viewer; the first one hit
   * is treated as the meal the user is logging.
   */
  onSelectEnd(event) {
    if (!event?.target) return;
    for (const viewer of this.models.values()) {
      const hits = xb.core.input.intersectObjectByEvent(event, viewer);
      if (hits.length > 0) {
        this.logMeal(viewer.userData.dish);
        return;
      }
    }
  }

  logMeal(dish) {
    const entry = {
      dish: dish.id,
      name: dish.name,
      calories: dish.nutrition.calories,
      protein: dish.nutrition.protein,
      carbs: dish.nutrition.carbs,
      fat: dish.nutrition.fat,
      at: Date.now(),
    };
    this.mealLog.push(entry);
    this.renderMealLog();
  }

  /**
   * Push an arbitrary nutrition entry (e.g. from a Gemini photo analysis) into
   * the running meal log.
   */
  logCustomMeal({name, calories, protein, carbs, fat, source}) {
    this.mealLog.push({
      dish: `custom:${name}`,
      name,
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      source: source || 'manual',
      at: Date.now(),
    });
    this.renderMealLog();
  }

  /**
   * Renders the running totals into the top-left HUD.
   */
  renderMealLog() {
    if (!this.overlay) return;
    const totals = this.mealLog.reduce(
      (acc, e) => {
        acc.calories += e.calories;
        acc.protein += e.protein;
        acc.carbs += e.carbs;
        acc.fat += e.fat;
        return acc;
      },
      {calories: 0, protein: 0, carbs: 0, fat: 0}
    );
    const lastFew = this.mealLog
      .slice(-3)
      .reverse()
      .map((e) => {
        const src = e.source === 'gemini' ? ' (photo)' : '';
        return `${e.name}${src} — ${Math.round(e.calories)} kcal, ${Math.round(
          e.protein
        )}g P`;
      });
    this.overlay.innerHTML =
      `<h1>Today: ${Math.round(totals.calories)} kcal &middot; ${Math.round(
        totals.protein
      )}g protein</h1>` +
      `<p>${this.mealLog.length} item(s) logged. ` +
      `${Math.round(totals.carbs)}g C &middot; ${Math.round(
        totals.fat
      )}g F</p>` +
      (lastFew.length
        ? `<p style="margin-top:6px;opacity:0.7">${lastFew.join('<br/>')}</p>`
        : '');
  }

  // ===========================================================================
  // Photo capture + Gemini analysis
  // ===========================================================================

  /**
   * Snapshots the current XR / simulator view and asks Gemini to estimate
   * calories + protein of any food it sees.
   */
  async captureAndAnalyze() {
    if (this.isCapturing) return;
    this.isCapturing = true;
    this.setCaptureButton('Capturing…', /*disabled*/ true);
    try {
      const dataUrl = await this.takePhoto();
      this.showPhotoPanel(dataUrl, 'Analyzing with Gemini…');

      if (!xb.core?.ai?.isAvailable?.()) {
        this.setPhotoStatus(
          'Gemini is not available. Add ?key=YOUR_GEMINI_API_KEY to the URL ' +
            'or create demos/dietHelper/keys.json.',
          'error'
        );
        return;
      }
      this.setCaptureButton('Analyzing…', true);

      const analysis = await this.analyzeWithGemini(dataUrl);
      this.renderAnalysis(analysis);

      // Log it as a meal entry if Gemini found food.
      if (analysis?.items?.length) {
        const name = analysis.items.map((it) => it.name).join(' + ');
        this.logCustomMeal({
          name,
          calories: analysis.total_calories,
          protein: analysis.total_protein_g,
          carbs: analysis.items.reduce(
            (a, i) => a + (Number(i.carbs_g) || 0),
            0
          ),
          fat: analysis.items.reduce((a, i) => a + (Number(i.fat_g) || 0), 0),
          source: 'gemini',
        });
      }
    } catch (err) {
      console.error('[diet-helper] capture failed:', err);
      this.setPhotoStatus(`Failed: ${err?.message || err}`, 'error');
    } finally {
      this.isCapturing = false;
      this.setCaptureButton('Capture & Analyze', false);
    }
  }

  /**
   * Produces the image we send to Gemini.
   *
   *   - "Include scene" OFF  -> virtual-only screenshot (transparent bg).
   *   - Real headset w/ passthrough -> synthesizer composites the virtual
   *     scene over the real camera feed natively.
   *   - Otherwise (desktop simulator) -> render the simulated environment +
   *     the dish from the current viewer pose (see renderSceneWithBackground).
   *
   * NOTE: ScreenshotSynthesizer throws *inside* the render loop when asked for
   * an overlay without a camera, leaving the returned Promise pending forever
   * — so we must gate the passthrough path on a loaded device camera here.
   */
  async takePhoto() {
    const synth = xb.core?.screenshotSynthesizer;
    const cameraReady = !!xb.core?.deviceCamera?.loaded;
    const wantsBackground = this.dom.bgToggle?.checked ?? true;

    if (!wantsBackground) {
      if (!synth) throw new Error('screenshot synthesizer is not initialized');
      return await synth.getScreenshot(false);
    }

    // Real headset with passthrough: native virtual-over-camera composite.
    if (cameraReady && synth) {
      return await synth.getScreenshot(true);
    }

    // Desktop simulator (or any setup without a passthrough camera): the
    // environment and the dish both live in front of the viewer, so we just
    // render them from the viewer's pose into an offscreen target.
    return await this.renderSceneWithBackground();
  }

  /**
   * Renders the scene from the current viewer pose so the captured image
   * contains both the surrounding environment and the dish — no 2D
   * compositing needed.
   *
   * The environment (e.g. the simulator's living room) and the virtual
   * objects live in two separate scene graphs that xrblocks normally
   * composites at draw time:
   *   - `xb.core.simulator.simulatorScene` — the simulated environment.
   *   - `xb.core.scene`                    — the virtual objects (the dish).
   * Both are observed through `xb.core.camera`. We draw the environment
   * first, clear depth, then draw the virtual scene on top — mirroring the
   * on-screen result. Inspired by samples/panorama/PanoramaCapture.js.
   */
  async renderSceneWithBackground() {
    const renderer = xb.core?.renderer;
    const camera = xb.core?.camera;
    const mainScene = xb.core?.scene;
    if (!renderer || !camera || !mainScene) {
      throw new Error('renderer/camera/scene not ready for capture');
    }
    // Only use the simulated environment as the backdrop while the simulator
    // is actually running; otherwise we fall back to a plain clear color.
    const bgScene = xb.core?.simulatorRunning
      ? xb.core?.simulator?.simulatorScene
      : null;

    // Match the on-screen aspect ratio, capped to a Gemini-friendly width.
    const srcW = renderer.domElement.width || window.innerWidth;
    const srcH = renderer.domElement.height || window.innerHeight;
    const width = Math.min(1024, srcW);
    const height = Math.max(1, Math.round(srcH * (width / srcW)));

    if (
      !this.captureRT ||
      this.captureRT.width !== width ||
      this.captureRT.height !== height
    ) {
      this.captureRT?.dispose();
      this.captureRT = new THREE.WebGLRenderTarget(width, height, {
        colorSpace: THREE.SRGBColorSpace,
      });
    }
    const rt = this.captureRT;

    // Save renderer state. The simulator runs with autoClearColor=false and
    // composites manually; for an isolated offscreen pass we want a normal
    // clear-then-draw, with XR presentation temporarily disabled so the
    // custom camera is honored.
    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevAutoClearColor = renderer.autoClearColor;
    const xrWasPresenting = renderer.xr.isPresenting;

    renderer.xr.isPresenting = false;
    renderer.autoClear = true;
    renderer.autoClearColor = true;
    camera.updateMatrixWorld(true);

    renderer.setRenderTarget(rt);
    renderer.clear();

    if (bgScene) {
      renderer.render(bgScene, camera);
      renderer.clearDepth();
    }

    renderer.autoClear = false; // keep the background we just drew
    renderer.render(mainScene, camera);

    renderer.autoClear = prevAutoClear;
    renderer.autoClearColor = prevAutoClearColor;
    renderer.xr.isPresenting = xrWasPresenting;
    renderer.setRenderTarget(prevRT);

    // Read back pixels and flip vertically (WebGL is bottom-up).
    const buffer = new Uint8Array(width * height * 4);
    await renderer.readRenderTargetPixelsAsync(rt, 0, 0, width, height, buffer);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * row;
      imageData.data.set(buffer.subarray(src, src + row), y * row);
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }

  /**
   * Sends a base64 image data URL to Gemini and parses the JSON response.
   * @returns Parsed analysis object, or null if parsing fails.
   */
  async analyzeWithGemini(dataUrl) {
    // Ensure the chosen model is applied; xb.core.ai may not have existed when
    // the dropdown was first bound (constructor runs before xb.init()).
    this.applySelectedModel();
    const {mimeType, base64} = this.splitDataUrl(dataUrl);
    const response = await xb.core.ai.query({
      type: 'multiPart',
      parts: [
        {text: GEMINI_NUTRITION_PROMPT},
        {inlineData: {mimeType, data: base64}},
      ],
    });
    const text = response?.text ?? '';
    return this.parseJsonish(text);
  }

  splitDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) return {mimeType: 'image/png', base64: dataUrl || ''};
    return {mimeType: m[1], base64: m[2]};
  }

  /** Tolerant JSON parser — strips ```json fences Gemini sometimes returns. */
  parseJsonish(text) {
    if (!text) return null;
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn('[diet-helper] could not parse Gemini response:', text, e);
      return null;
    }
  }

  renderAnalysis(analysis) {
    if (!this.dom.photoResult) return;
    if (!analysis) {
      this.setPhotoStatus(
        'Gemini returned an unparseable response. See console.',
        'error'
      );
      return;
    }
    if (!analysis.items?.length) {
      this.setPhotoStatus(
        analysis.notes || 'No food detected in the image.',
        'idle'
      );
      return;
    }
    const itemsHtml = analysis.items
      .map(
        (it) => `<div class="dh-dish">${this.escapeHtml(it.name)}</div>
          <div class="dh-macros">
            <span><strong>${Math.round(it.calories)}</strong> kcal</span>
            <span><strong>${Math.round(it.protein_g)}</strong> g protein</span>
            <span>${Math.round(it.carbs_g)} g C</span>
            <span>${Math.round(it.fat_g)} g F</span>
          </div>`
      )
      .join(
        '<hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:8px 0">'
      );
    const totalsHtml = `<div class="dh-macros" style="margin-top:8px">
        <span><strong>Total:</strong></span>
        <span><strong>${Math.round(analysis.total_calories)}</strong> kcal</span>
        <span><strong>${Math.round(analysis.total_protein_g)}</strong> g protein</span>
      </div>`;
    const notesHtml = analysis.notes
      ? `<div class="dh-notes">${this.escapeHtml(analysis.notes)}</div>`
      : '';
    this.dom.photoResult.innerHTML = itemsHtml + totalsHtml + notesHtml;
    this.dom.photoResult.hidden = false;
    this.setPhotoStatus('Logged to your meal diary.', 'success');
  }

  escapeHtml(s) {
    return String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]
    );
  }

  // -- Photo panel DOM helpers ----------------------------------------------

  showPhotoPanel(dataUrl, statusText) {
    if (!this.dom.photoPanel) return;
    this.dom.photoPanel.removeAttribute('hidden');
    if (this.dom.photoImg) this.dom.photoImg.src = dataUrl;
    if (this.dom.photoResult) {
      this.dom.photoResult.hidden = true;
      this.dom.photoResult.innerHTML = '';
    }
    this.setPhotoStatus(statusText, 'loading');
  }

  hidePhotoPanel() {
    if (!this.dom.photoPanel) return;
    this.dom.photoPanel.setAttribute('hidden', '');
  }

  setPhotoStatus(text, state) {
    if (!this.dom.photoStatus) return;
    this.dom.photoStatus.dataset.state = state || 'idle';
    if (this.dom.photoStatusText) this.dom.photoStatusText.textContent = text;
    if (this.dom.photoSpinner) {
      this.dom.photoSpinner.style.display =
        state === 'loading' ? 'inline-block' : 'none';
    }
  }

  setCaptureButton(label, disabled) {
    if (!this.dom.captureBtn) return;
    this.dom.captureBtn.textContent = label;
    this.dom.captureBtn.disabled = !!disabled;
  }
}
