/**
 * GNMControls — DOM control panel for the GNM head demo.
 *
 * Provides the full parameter surface of the model: semantic sampling
 * (gender/ethnicity identities, 20 expression classes), grouped PCA sliders
 * for all 253 identity + 383 expression components, joint pose, animation
 * drivers, and view options. Styling lives in gnm.css.
 */

const MATERIAL_MODES = [
  ['studio', 'Studio'],
  ['clay', 'Clay'],
  ['normals', 'Normals'],
  ['regions', 'Regions'],
];

const INITIAL_SLIDERS_PER_GROUP = 10;
const PARAM_RANGE = 3;

function prettify(name) {
  return name
    .replace(/_region$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Splits ordered PCA names like head_000… into contiguous groups. */
function groupParams(names) {
  const groups = [];
  let current = null;
  names.forEach((name, index) => {
    const key = name.replace(/_?\d+$/, '').replace(/_mean$/, '');
    if (!current || current.key !== key) {
      current = {key, title: prettify(key), start: index, names: []};
      groups.push(current);
    }
    current.names.push(name);
  });
  return groups;
}

function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export class GNMControls {
  constructor(model, samplers, scene) {
    this.model = model;
    this.samplers = samplers;
    this.scene = scene;
    this._paramInputs = new Map(); // 'identity:12' -> {input, output}
    this._poseInputs = [];
    scene.onModelChanged = () => this.syncParams();
    scene.onStatus = (text) => this.setStatus(text);
  }

  attach() {
    const meta = this.model.meta;
    this.root = document.createElement('div');
    this.root.id = 'gnm-panel';
    // demo.css styles bare <header> as a fixed, full-width page banner, so the
    // panel chrome uses scoped divs instead of semantic header/footer tags.
    this.root.innerHTML = `
      <div class="gnm-header">
        <div>
          <h1>GNM Head Explorer</h1>
          <p>Generative aNthropometric Model v${meta.gnmVersion}</p>
        </div>
        <button id="gnm-collapse" title="Collapse panel">–</button>
      </div>
      <div id="gnm-status"></div>
      <nav id="gnm-tabs"></nav>
      <div id="gnm-pages"></div>
      <div class="gnm-footer">
        ${meta.numVertices.toLocaleString()} vertices ·
        ${(this.model.triangles.length / 3).toLocaleString()} triangles ·
        ${meta.identityDim + meta.expressionDim} parameters<br />
        <span id="gnm-stats"></span><br />
        <a href="https://github.com/google/gnm" target="_blank" rel="noopener">
          google/gnm</a> — research model; see its README for representation
        limitations.<br />
        <a href="https://github.com/google/xrblocks" target="_blank"
          rel="noopener">google/xrblocks</a> — the AI + XR SDK powering this
        demo.
      </div>`;
    document.body.appendChild(this.root);

    this.statusElement = this.root.querySelector('#gnm-status');
    this.statsElement = this.root.querySelector('#gnm-stats');
    this.tabsElement = this.root.querySelector('#gnm-tabs');
    this.pagesElement = this.root.querySelector('#gnm-pages');
    this.root.querySelector('#gnm-collapse').addEventListener('click', () => {
      this.root.classList.toggle('collapsed');
      this.root.querySelector('#gnm-collapse').textContent =
        this.root.classList.contains('collapsed') ? '+' : '–';
    });

    this._buildTabs([
      ['Sample', () => this._buildSampleTab()],
      ['Identity', () => this._buildParamTab('identity')],
      ['Expression', () => this._buildParamTab('expression')],
      ['Pose', () => this._buildPoseTab()],
      ['Animate', () => this._buildAnimateTab()],
      ['View', () => this._buildViewTab()],
    ]);
    this._bindKeyboard();
    this._startStatsLoop();
  }

  // ------------------------------------------------------------------ tabs --

  _buildTabs(tabs) {
    this._pages = [];
    tabs.forEach(([label, build], index) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => this._selectTab(index));
      this.tabsElement.appendChild(button);
      const page = document.createElement('div');
      page.className = 'gnm-page';
      this.pagesElement.appendChild(page);
      const entry = {button, page, built: false};
      entry.buildInto = () => {
        if (!entry.built) {
          entry.built = true;
          page.appendChild(build.call(this));
        }
      };
      this._pages.push(entry);
    });
    this._selectTab(0);
  }

  _selectTab(index) {
    this._pages.forEach((entry, i) => {
      const active = i === index;
      entry.button.classList.toggle('active', active);
      entry.page.classList.toggle('active', active);
      if (active) entry.buildInto();
    });
    this.syncParams();
  }

  _section(parent, title) {
    const section = document.createElement('section');
    if (title) {
      const heading = document.createElement('h2');
      heading.textContent = title;
      section.appendChild(heading);
    }
    parent.appendChild(section);
    return section;
  }

  _button(parent, label, onClick, className = '') {
    const button = document.createElement('button');
    button.className = `gnm-btn ${className}`;
    button.textContent = label;
    button.addEventListener('click', onClick);
    parent.appendChild(button);
    return button;
  }

  _toggle(parent, label, initial, onChange) {
    const row = document.createElement('label');
    row.className = 'gnm-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initial;
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);
    row.appendChild(document.createTextNode(label));
    parent.appendChild(row);
    return input;
  }

  _slider(parent, label, min, max, step, value, onInput, onReset) {
    const row = document.createElement('div');
    row.className = 'gnm-slider';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    const output = document.createElement('output');
    output.textContent = (+value).toFixed(2);
    input.addEventListener('input', () => {
      output.textContent = (+input.value).toFixed(2);
      onInput(+input.value);
    });
    if (onReset) {
      row.title = 'Double-click to reset';
      row.addEventListener('dblclick', () => {
        input.value = onReset();
        output.textContent = (+input.value).toFixed(2);
      });
    }
    row.append(name, input, output);
    parent.appendChild(row);
    return {row, input, output};
  }

  // ---------------------------------------------------------------- sample --

  _buildSampleTab() {
    const fragment = document.createDocumentFragment();
    const identity = this._section(fragment, 'Semantic identity');
    identity.insertAdjacentHTML(
      'beforeend',
      `<div class="gnm-selects">
        <label>Gender <select id="gnm-gender">
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="blend">50 / 50</option>
        </select></label>
        <label>Ethnicity <select id="gnm-ethnicity">
          ${this.samplers.ethnicities
            .map((e) => `<option value="${e}">${prettify(e)}</option>`)
            .join('')}
          <option value="blend">Even mix</option>
        </select></label>
      </div>`
    );
    this._sigma = 0.9;
    // Gender and ethnicity apply live (like the slider tabs); changing either
    // re-rolls a new face of that demographic.
    identity
      .querySelector('#gnm-gender')
      .addEventListener('change', () => this._sampleSemanticIdentity(true));
    identity
      .querySelector('#gnm-ethnicity')
      .addEventListener('change', () => this._sampleSemanticIdentity(true));

    // The Variation slider is live too: it reuses the current face's random
    // seed, so dragging exaggerates the same identity instead of re-rolling.
    const sigmaRow = this._slider(
      identity,
      'Variation',
      0,
      1.5,
      0.05,
      0.9,
      (v) => {
        this._sigma = v;
        this._sampleSemanticIdentity(false, false);
      }
    );
    sigmaRow.row.classList.add('wide');
    const identityButtons = document.createElement('div');
    identityButtons.className = 'gnm-btn-row';
    this._button(identityButtons, 'New face', () =>
      this._sampleSemanticIdentity(true)
    );
    this._button(identityButtons, 'Random mix', () => {
      this.scene.sampleRandomIdentity(this._sigma);
      this.setStatus('sampled a random identity mix');
    });
    this._button(identityButtons, 'Template', () => {
      this.model.resetIdentity();
      this.syncParams();
      this.setStatus('template (mean) face');
    });
    identity.appendChild(identityButtons);

    const expression = this._section(fragment, 'Semantic expression');
    const chips = document.createElement('div');
    chips.className = 'gnm-chips';
    this.samplers.expressionClasses.forEach((label, index) => {
      const chip = document.createElement('button');
      chip.className = 'gnm-chip';
      chip.textContent = prettify(label);
      chip.addEventListener('click', () => {
        this.scene.sampleExpression(index, this._sigma);
        this.setStatus(`expression: ${prettify(label).toLowerCase()}`);
      });
      chips.appendChild(chip);
    });
    expression.appendChild(chips);
    const expressionButtons = document.createElement('div');
    expressionButtons.className = 'gnm-btn-row';
    this._button(expressionButtons, 'Random blend', () => {
      this.scene.sampleRandomExpression(this._sigma);
      this.setStatus('random expression blend');
    });
    this._button(expressionButtons, 'Neutral', () => {
      this.model.resetExpression();
      this.syncParams();
      this.setStatus('neutral expression');
    });
    expression.appendChild(expressionButtons);
    return fragment;
  }

  /**
   * Samples an identity from the current gender/ethnicity selection.
   *
   * @param {boolean} reroll - When true, draws a fresh random seed (a new
   *   face). When false, reuses the last seed so only `sigma` changes, letting
   *   the Variation slider morph the same identity smoothly.
   * @param {boolean} [smooth=true] - Whether to blend toward the new shape.
   */
  _sampleSemanticIdentity(reroll, smooth = true) {
    if (reroll || this._identitySeed === undefined) {
      this._identitySeed = (Math.random() * 0x100000000) >>> 0;
    }
    const gender = this.root.querySelector('#gnm-gender').value;
    const ethnicity = this.root.querySelector('#gnm-ethnicity').value;
    const genderWeights =
      gender === 'blend'
        ? [1, 1]
        : this.samplers.genders.map((g) => (g === gender ? 1 : 0));
    const ethnicityWeights =
      ethnicity === 'blend'
        ? [1, 1, 1, 1]
        : this.samplers.ethnicities.map((e) => (e === ethnicity ? 1 : 0));
    // Reseed so the same selection + seed is reproducible; the Variation
    // slider then only changes the latent scale, not the face.
    this.samplers.seed(this._identitySeed);
    this.scene.sampleIdentity(
      genderWeights,
      ethnicityWeights,
      this._sigma,
      smooth
    );
    this.setStatus(
      `sampled ${gender === 'blend' ? 'mixed' : gender} · ` +
        `${ethnicity === 'blend' ? 'mixed' : prettify(ethnicity)}`
    );
  }

  // ---------------------------------------------------------------- params --

  _buildParamTab(kind) {
    const fragment = document.createDocumentFragment();
    const names =
      kind === 'identity'
        ? this.model.meta.identityNames
        : this.model.meta.expressionNames;
    for (const group of groupParams(names)) {
      const section = this._section(
        fragment,
        `${group.title} (${group.names.length})`
      );
      const buttons = document.createElement('div');
      buttons.className = 'gnm-btn-row';
      this._button(buttons, 'Randomize', () => {
        for (let i = 0; i < group.names.length; ++i) {
          this._setParam(kind, group.start + i, gaussian());
        }
        this.syncParams();
      });
      this._button(buttons, 'Zero', () => {
        for (let i = 0; i < group.names.length; ++i) {
          this._setParam(kind, group.start + i, 0);
        }
        this.syncParams();
      });
      section.appendChild(buttons);
      const list = document.createElement('div');
      section.appendChild(list);
      const buildRows = (from, to) => {
        for (let i = from; i < to; ++i) {
          const index = group.start + i;
          const suffix = group.names[i].match(/(\d+|mean)$/)?.[1] ?? `${i}`;
          const {input, output} = this._slider(
            list,
            suffix,
            -PARAM_RANGE,
            PARAM_RANGE,
            0.01,
            this._getParam(kind, index),
            (value) => {
              this._setParam(kind, index, value);
              this.scene.setPulse(kind, index);
            },
            () => {
              this._setParam(kind, index, 0);
              return 0;
            }
          );
          this._paramInputs.set(`${kind}:${index}`, {input, output});
        }
      };
      const initial = Math.min(INITIAL_SLIDERS_PER_GROUP, group.names.length);
      buildRows(0, initial);
      if (group.names.length > initial) {
        const more = this._button(
          section,
          `Show all ${group.names.length}`,
          () => {
            buildRows(initial, group.names.length);
            more.remove();
            this.syncParams();
          },
          'ghost'
        );
      }
    }
    return fragment;
  }

  _getParam(kind, index) {
    return kind === 'identity'
      ? this.model.identity[index]
      : this.model.expression[index];
  }

  _setParam(kind, index, value) {
    if (kind === 'identity') this.model.setIdentityParam(index, value);
    else this.model.setExpressionParam(index, value);
  }

  // ------------------------------------------------------------------ pose --

  _buildPoseTab() {
    const fragment = document.createDocumentFragment();
    const tracking = this._section(fragment, 'Tracking');
    this._eyesToggle = this._toggle(
      tracking,
      'Eyes follow camera',
      this.scene.eyesFollowCamera,
      (checked) => {
        this.scene.eyesFollowCamera = checked;
        this._updatePoseDisabled();
      }
    );
    this._headToggle = this._toggle(
      tracking,
      'Head follows camera',
      this.scene.headFollowsCamera,
      (checked) => {
        this.scene.headFollowsCamera = checked;
        this._updatePoseDisabled();
      }
    );

    const jointSpecs = [
      [0, 'Neck', 0.5],
      [1, 'Head', 0.6],
      [2, 'Left eye', 0.6],
      [3, 'Right eye', 0.6],
    ];
    const axes = ['pitch (x)', 'yaw (y)', 'roll (z)'];
    for (const [joint, label, range] of jointSpecs) {
      const section = this._section(fragment, label);
      for (let axis = 0; axis < 3; ++axis) {
        if (joint >= 2 && axis === 2) continue; // eye roll is not meaningful
        const {input, output} = this._slider(
          section,
          axes[axis],
          -range,
          range,
          0.01,
          this.model.rotations[joint * 3 + axis],
          (value) => {
            const o = joint * 3;
            const r = this.model.rotations;
            const next = [r[o], r[o + 1], r[o + 2]];
            next[axis] = value;
            this.model.setJointRotation(joint, ...next);
            this.scene._smoothedRotations.set(next, o);
          }
        );
        this._poseInputs.push({joint, axis, input, output});
      }
    }
    const translation = this._section(fragment, 'Translation (m)');
    ['x', 'y', 'z'].forEach((axis, index) => {
      const {input, output} = this._slider(
        translation,
        axis,
        -0.25,
        0.25,
        0.005,
        this.model.translation[index],
        (value) => {
          const t = this.model.translation;
          const next = [t[0], t[1], t[2]];
          next[index] = value;
          this.model.setTranslation(...next);
        }
      );
      this._poseInputs.push({translationAxis: index, input, output});
    });
    const buttons = document.createElement('div');
    buttons.className = 'gnm-btn-row';
    this._button(buttons, 'Reset pose', () => {
      this.model.resetPose();
      this.scene._smoothedRotations.fill(0);
      this.syncParams();
    });
    fragment.appendChild(buttons);
    this._updatePoseDisabled();
    return fragment;
  }

  _updatePoseDisabled() {
    for (const entry of this._poseInputs) {
      if (entry.translationAxis !== undefined) continue;
      const trackedEyes = this.scene.eyesFollowCamera && entry.joint >= 2;
      const trackedHead = this.scene.headFollowsCamera && entry.joint === 1;
      const sway = this.scene.idleSway && entry.joint === 0;
      entry.input.disabled = trackedEyes || trackedHead || sway;
    }
  }

  // --------------------------------------------------------------- animate --

  _buildAnimateTab() {
    const fragment = document.createDocumentFragment();
    const drivers = this._section(fragment, 'Drivers');
    this._animToggles = {
      tour: this._toggle(
        drivers,
        'Expression tour (20 classes)',
        false,
        (checked) => this.scene.setExpressionTour(checked)
      ),
      morph: this._toggle(
        drivers,
        'Identity morph (random walk)',
        false,
        (checked) => this.scene.setIdentityMorph(checked)
      ),
      pulse: this._toggle(
        drivers,
        'Pulse last-touched slider ±2.3',
        false,
        (checked) => this.scene.setPulseEnabled(checked)
      ),
      sway: this._toggle(drivers, 'Idle neck sway', false, (checked) => {
        this.scene.idleSway = checked;
        this._updatePoseDisabled();
      }),
      turntable: this._toggle(drivers, 'Turntable', false, (checked) => {
        this.scene.turntable = checked;
      }),
    };
    const speed = this._section(fragment, 'Speed');
    this._slider(speed, 'Rate', 0.25, 2.5, 0.05, 1, (value) => {
      this.scene.animationSpeed = value;
    });
    const hint = document.createElement('p');
    hint.className = 'gnm-hint';
    hint.textContent =
      'Tip: touch any Identity/Expression slider first, then enable Pulse ' +
      'to see what that PCA component does.';
    fragment.appendChild(hint);
    return fragment;
  }

  // ------------------------------------------------------------------ view --

  _buildViewTab() {
    const fragment = document.createDocumentFragment();
    const material = this._section(fragment, 'Material');
    const modes = document.createElement('div');
    modes.className = 'gnm-btn-row';
    this._materialButtons = MATERIAL_MODES.map(([mode, label]) => {
      const button = this._button(
        modes,
        label,
        () => this.setMaterialMode(mode),
        mode === this.scene.materialMode ? 'active' : ''
      );
      button.dataset.mode = mode;
      return button;
    });
    material.appendChild(modes);

    const overlays = this._section(fragment, 'Overlays');
    this._wireToggle = this._toggle(overlays, 'Quad wireframe', false, (c) =>
      this.scene.setWireframeVisible(c)
    );
    this._landmarkToggle = this._toggle(
      overlays,
      '68 facial landmarks',
      false,
      (c) => this.scene.setLandmarksVisible(c)
    );
    this._skeletonToggle = this._toggle(
      overlays,
      'Skeleton (neck → head → eyes)',
      false,
      (c) => this.scene.setSkeletonVisible(c)
    );

    const components = this._section(fragment, 'Mesh components');
    this._componentToggles = this.model.meta.componentNames.map((name, index) =>
      this._toggle(components, prettify(name), true, (checked) =>
        this.scene.setComponentVisible(index, checked)
      )
    );

    const exportSection = this._section(fragment, 'Export');
    const buttons = document.createElement('div');
    buttons.className = 'gnm-btn-row';
    this._button(buttons, 'Download OBJ', () => {
      const blob = new Blob([this.scene.exportOBJ()], {type: 'text/plain'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'gnm_head.obj';
      link.click();
      URL.revokeObjectURL(link.href);
      this.setStatus('exported gnm_head.obj');
    });
    exportSection.appendChild(buttons);
    return fragment;
  }

  setMaterialMode(mode) {
    this.scene.setMaterialMode(mode);
    this._materialButtons?.forEach((button) =>
      button.classList.toggle('active', button.dataset.mode === mode)
    );
  }

  // ------------------------------------------------------------------ sync --

  /** Reflects model parameter values into any built slider rows. */
  syncParams() {
    for (const [key, {input, output}] of this._paramInputs) {
      const [kind, index] = key.split(':');
      const value = this._getParam(kind, +index);
      input.value = value;
      output.textContent = value.toFixed(2);
    }
    for (const entry of this._poseInputs) {
      const value =
        entry.translationAxis !== undefined
          ? this.model.translation[entry.translationAxis]
          : this.model.rotations[entry.joint * 3 + entry.axis];
      entry.input.value = value;
      entry.output.textContent = value.toFixed(2);
    }
  }

  setStatus(text) {
    if (this.statusElement) this.statusElement.textContent = text;
  }

  _startStatsLoop() {
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        const fps = (frames * 1000) / (now - last);
        this.statsElement.textContent =
          `${fps.toFixed(0)} fps · mesh update ` +
          `${this.scene.lastComputeMs.toFixed(1)} ms`;
        frames = 0;
        last = now;
        // Keep sliders live while animation drivers run.
        if (
          this.scene.tour ||
          this.scene.morph ||
          this.scene.pulseEnabled ||
          this.scene._idFade ||
          this.scene._exprFade
        ) {
          this.syncParams();
        }
        // Reflect state changed from the spatial (XR) panels.
        this._syncViewFromScene();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Mirrors scene state into checkboxes/buttons built by this panel. */
  _syncViewFromScene() {
    const scene = this.scene;
    if (this._wireToggle) this._wireToggle.checked = scene.wireframe.visible;
    if (this._landmarkToggle) {
      this._landmarkToggle.checked = scene.landmarkMesh.visible;
    }
    if (this._skeletonToggle) {
      this._skeletonToggle.checked = scene.skeletonGroup.visible;
    }
    this._componentToggles?.forEach((toggle, index) => {
      toggle.checked = scene.visibleComponents[index];
    });
    this._materialButtons?.forEach((button) =>
      button.classList.toggle(
        'active',
        button.dataset.mode === scene.materialMode
      )
    );
    if (this._animToggles) {
      this._animToggles.tour.checked = !!scene.tour;
      this._animToggles.morph.checked = !!scene.morph;
      this._animToggles.pulse.checked = scene.pulseEnabled;
      this._animToggles.sway.checked = scene.idleSway;
      this._animToggles.turntable.checked = scene.turntable;
    }
    if (this._eyesToggle && this._headToggle) {
      const changed =
        this._eyesToggle.checked !== scene.eyesFollowCamera ||
        this._headToggle.checked !== scene.headFollowsCamera;
      this._eyesToggle.checked = scene.eyesFollowCamera;
      this._headToggle.checked = scene.headFollowsCamera;
      if (changed) this._updatePoseDisabled();
    }
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      switch (event.key.toLowerCase()) {
        case 'r':
          this.scene.sampleRandomIdentity(this._sigma ?? 0.9);
          this.setStatus('random identity (R)');
          break;
        case 'e':
          this.scene.sampleRandomExpression(this._sigma ?? 0.9);
          this.setStatus('random expression (E)');
          break;
        case 'n':
          this.scene.resetToNeutral();
          this.syncParams();
          this.setStatus('neutral (N)');
          break;
        case 't':
          this.scene.setExpressionTour(!this.scene.tour);
          break;
        case 'w':
          if (this._wireToggle) {
            this._wireToggle.checked = !this._wireToggle.checked;
          }
          this.scene.setWireframeVisible(
            this._wireToggle?.checked ?? !this.scene.wireframe.visible
          );
          break;
        case 'g':
          this.scene.turntable = !this.scene.turntable;
          break;
        default:
          return;
      }
    });
  }
}
