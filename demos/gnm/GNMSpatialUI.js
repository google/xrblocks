import * as THREE from 'three';
import {ManipulationBehavior, UICore, UIIcon, UIPanel, UIText} from 'uiblocks';

/**
 * GNMSpatialUI — in-headset control surface built with the uiblocks addon
 * (flexbox-laid-out spatial cards; see src/addons/uiblocks/SKILL.md).
 *
 * Three draggable UICards arranged around the head mirror the desktop panel:
 *   SAMPLE (left)          semantic identity recipe + all 20 expression
 *                          classes (paged chips), random blend, neutral.
 *   MOTION (right, top)    gaze tracking and animation driver toggles.
 *   VIEW   (right, bottom) material modes and inspection overlays.
 *
 * Buttons are composed UIPanel + UIText (uiblocks has no button class) and
 * reflect live scene state — also when changed from the DOM panel — via
 * update(), called from GNMScene.update().
 */

// Design tokens (§6.1 of the uiblocks skill): one density, a small type
// scale, spacing rhythm, two radii, and a restrained hex palette.
const PIXEL_SIZE = 0.0015;
const SURFACE = '#12161f';
const CONTROL = '#232a38';
const CONTROL_HOVER = '#31394c';
const CONTROL_ACTIVE = '#1d4238';
const ACCENT = '#4fe0ae';
const TEXT = '#f0f3f8';
const MUTED = '#93a0b8';
const STROKE = '#333a4c';
const RADIUS_CARD = 24;
const RADIUS_CONTROL = 12;

const CHIPS_PER_PAGE = 8;

function prettify(name) {
  return name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export class GNMSpatialUI {
  /** @param scene The owning GNMScene (an xb.Script). */
  constructor(scene) {
    this.scene = scene;
    this.model = scene.model;
    this.samplers = scene.samplers;
    this.uiCore = new UICore(scene);

    this._genderWeights = [1, 1];
    this._ethnicityWeights = [1, 1, 1, 1];
    this._chipPage = 0;
    this._chips = [];
    this._toggles = []; // {button, get}
    this._modeButtons = []; // {button, mode}
    this._recipeButtons = {gender: [], ethnicity: []};
    this._lastStates = new Map();
  }

  build() {
    this._buildSampleCard();
    this._buildMotionCard();
    this._buildViewCard();
    this._highlightRecipe();
    this._renderChipPage();
  }

  setStatus(text) {
    this._statusText?.setText(text || ' ');
  }

  // ------------------------------------------------------------ primitives --

  _card(name, sizeX, sizeY, x, y, z, rotationY) {
    return this.uiCore.createCard({
      name,
      sizeX,
      sizeY,
      pixelSize: PIXEL_SIZE,
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, rotationY, 0)
      ),
      behaviors: [
        new ManipulationBehavior({
          draggable: true,
          faceCamera: true,
          manipulationMargin: 24,
          manipulationCornerRadius: RADIUS_CARD,
        }),
      ],
    });
  }

  _surface(card, {padding = 20, gap = 12} = {}) {
    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      fillColor: SURFACE,
      cornerRadius: RADIUS_CARD,
      padding,
      gap,
      strokeWidth: 1,
      strokeColor: STROKE,
      strokeAlign: 'inside',
      dropShadowColor: '#000000',
      dropShadowBlur: 20,
      dropShadowSpread: 2,
    });
    card.add(panel);
    return panel;
  }

  _header(parent, icon, title) {
    const row = new UIPanel({
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    });
    row.add(new UIIcon(icon, {width: 26, height: 26, color: ACCENT}));
    row.add(new UIText(title, {fontSize: 24, fontWeight: 'bold', color: TEXT}));
    parent.add(row);
    return row;
  }

  _sectionLabel(parent, label) {
    parent.add(
      new UIText(label, {fontSize: 14, fontWeight: 'bold', color: MUTED})
    );
  }

  _row(parent, {gap = 10, height} = {}) {
    const row = new UIPanel({
      width: '100%',
      flexDirection: 'row',
      gap,
      ...(height ? {height} : {}),
      alignItems: 'center',
    });
    parent.add(row);
    return row;
  }

  /** Composes a button from UIPanel + UIText (uiblocks skill §5.3). */
  _button(
    parent,
    label,
    {fontSize = 16, height = 40, accent = false, onClick}
  ) {
    const state = {
      hovered: false,
      base: CONTROL,
      textColor: accent ? ACCENT : TEXT,
    };
    const panel = new UIPanel({
      flexGrow: 1,
      height,
      cornerRadius: RADIUS_CONTROL,
      fillColor: state.base,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 4,
      onHoverEnter: () => {
        state.hovered = true;
        panel.setFillColor(CONTROL_HOVER);
      },
      onHoverExit: () => {
        state.hovered = false;
        panel.setFillColor(state.base);
      },
      onClick: () => {
        onClick?.();
        return true;
      },
    });
    const text = new UIText(label, {
      fontSize,
      color: state.textColor,
      textAlign: 'center',
    });
    panel.add(text);
    parent.add(panel);
    const button = {
      panel,
      text,
      setActive(active) {
        state.base = active ? CONTROL_ACTIVE : CONTROL;
        text.setColor(active ? ACCENT : state.textColor);
        if (!state.hovered) panel.setFillColor(state.base);
      },
      setLabel(value) {
        text.setText(value);
      },
    };
    return button;
  }

  // ----------------------------------------------------------------- cards --

  _buildSampleCard() {
    const card = this._card('GNMSample', 0.6, 0.8, -0.62, 1.32, -0.46, 0.6);
    const root = this._surface(card);

    this._header(root, 'face', 'GNM Sample');
    this._sectionLabel(root, 'IDENTITY');

    const genderRow = this._row(root);
    this._recipeButtons.gender = [
      ['Female', 0],
      ['Male', 1],
      ['Mix', -1],
    ].map(([label, index]) =>
      this._button(genderRow, label, {
        fontSize: 15,
        height: 36,
        onClick: () => this._pickGender(index),
      })
    );

    const ethnicityRow = this._row(root, {gap: 8});
    this._recipeButtons.ethnicity = [
      ['Mid-East', 0],
      ['Asian', 1],
      ['White', 2],
      ['Black', 3],
      ['Mix', -1],
    ].map(([label, index]) =>
      this._button(ethnicityRow, label, {
        fontSize: 12,
        height: 36,
        onClick: () => this._pickEthnicity(index),
      })
    );

    const identityActions = this._row(root);
    this._button(identityActions, 'New face', {
      accent: true,
      onClick: () => this._sampleIdentity(),
    });
    this._button(identityActions, 'Template', {
      onClick: () => {
        this.model.resetIdentity();
        this.scene.onModelChanged?.();
        this.scene._emitStatus('template (mean) face');
      },
    });

    this._sectionLabel(root, 'EXPRESSION');

    const classes = this.samplers.expressionClasses;
    for (let r = 0; r < CHIPS_PER_PAGE / 4; ++r) {
      const chipRow = this._row(root, {gap: 8});
      for (let c = 0; c < 4; ++c) {
        const chip = this._button(chipRow, '', {
          fontSize: 12,
          height: 40,
          onClick: () => {
            if (chip.classIndex === undefined || chip.classIndex < 0) return;
            this.scene.sampleExpression(chip.classIndex, 0.9);
            this.scene._emitStatus(
              `expression: ${classes[chip.classIndex].replace(/_/g, ' ')}`
            );
          },
        });
        this._chips.push(chip);
      }
    }

    const pageCount = Math.ceil(classes.length / CHIPS_PER_PAGE);
    const pager = this._row(root);
    this._button(pager, '<', {
      fontSize: 15,
      height: 30,
      onClick: () => {
        this._chipPage = (this._chipPage + pageCount - 1) % pageCount;
        this._renderChipPage();
      },
    });
    this._pageText = new UIText('', {
      fontSize: 14,
      color: MUTED,
      textAlign: 'center',
      flexGrow: 1,
    });
    pager.add(this._pageText);
    this._button(pager, '>', {
      fontSize: 15,
      height: 30,
      onClick: () => {
        this._chipPage = (this._chipPage + 1) % pageCount;
        this._renderChipPage();
      },
    });

    const expressionActions = this._row(root);
    this._button(expressionActions, 'Random blend', {
      accent: true,
      onClick: () => {
        this.scene.sampleRandomExpression(0.9);
        this.scene._emitStatus('random expression blend');
      },
    });
    this._button(expressionActions, 'Neutral', {
      onClick: () => {
        this.model.resetExpression();
        this.scene.onModelChanged?.();
        this.scene._emitStatus('neutral expression');
      },
    });

    this._statusText = new UIText(' ', {
      fontSize: 14,
      color: ACCENT,
      textAlign: 'center',
      width: '100%',
    });
    root.add(this._statusText);
  }

  _buildMotionCard() {
    const card = this._card('GNMMotion', 0.52, 0.46, 0.62, 1.52, -0.46, -0.6);
    const root = this._surface(card);
    this._header(root, 'animation', 'Motion');

    const scene = this.scene;
    const specs = [
      [
        'Eyes follow',
        () => scene.eyesFollowCamera,
        (v) => (scene.eyesFollowCamera = v),
      ],
      [
        'Head follow',
        () => scene.headFollowsCamera,
        (v) => (scene.headFollowsCamera = v),
      ],
      ['Tour', () => !!scene.tour, (v) => scene.setExpressionTour(v)],
      ['Morph', () => !!scene.morph, (v) => scene.setIdentityMorph(v)],
      ['Sway', () => scene.idleSway, (v) => (scene.idleSway = v)],
      ['Turntable', () => scene.turntable, (v) => (scene.turntable = v)],
    ];
    for (let r = 0; r < specs.length; r += 2) {
      const row = this._row(root);
      for (const [label, get, set] of specs.slice(r, r + 2)) {
        const button = this._button(row, label, {
          fontSize: 15,
          onClick: () => set(!get()),
        });
        this._toggles.push({button, get});
      }
    }

    const actions = this._row(root);
    this._button(actions, 'Reset pose', {
      onClick: () => {
        this.model.resetPose();
        scene._smoothedRotations.fill(0);
        scene.onModelChanged?.();
      },
    });
    this._button(actions, 'Neutral all', {
      onClick: () => scene.resetToNeutral(),
    });
  }

  _buildViewCard() {
    const card = this._card('GNMView', 0.52, 0.4, 0.64, 1.08, -0.46, -0.6);
    const root = this._surface(card);
    this._header(root, 'visibility', 'View');

    const scene = this.scene;
    const modeRow = this._row(root, {gap: 8});
    for (const [mode, label] of [
      ['studio', 'Studio'],
      ['clay', 'Clay'],
      ['normals', 'Normals'],
      ['regions', 'Regions'],
    ]) {
      const button = this._button(modeRow, label, {
        fontSize: 13,
        height: 36,
        onClick: () => scene.setMaterialMode(mode),
      });
      this._modeButtons.push({button, mode});
    }

    const overlaySpecs = [
      [
        'Wireframe',
        () => scene.wireframe.visible,
        (v) => scene.setWireframeVisible(v),
      ],
      [
        'Landmarks',
        () => scene.landmarkMesh.visible,
        (v) => scene.setLandmarksVisible(v),
      ],
      [
        'Skeleton',
        () => scene.skeletonGroup.visible,
        (v) => scene.setSkeletonVisible(v),
      ],
      [
        'Anatomy',
        () => !scene.visibleComponents[0],
        (v) => scene.setComponentVisible(0, !v),
      ],
    ];
    for (let r = 0; r < overlaySpecs.length; r += 2) {
      const row = this._row(root);
      for (const [label, get, set] of overlaySpecs.slice(r, r + 2)) {
        const button = this._button(row, label, {
          fontSize: 15,
          onClick: () => set(!get()),
        });
        this._toggles.push({button, get});
      }
    }
  }

  // -------------------------------------------------------------- behavior --

  _pickGender(index) {
    this._genderWeights =
      index < 0 ? [1, 1] : [index === 0 ? 1 : 0, index === 1 ? 1 : 0];
    this._highlightRecipe();
    this._sampleIdentity();
  }

  _pickEthnicity(index) {
    this._ethnicityWeights =
      index < 0 ? [1, 1, 1, 1] : [0, 1, 2, 3].map((i) => (i === index ? 1 : 0));
    this._highlightRecipe();
    this._sampleIdentity();
  }

  _sampleIdentity() {
    this.scene.sampleIdentity(this._genderWeights, this._ethnicityWeights, 0.9);
    this.scene._emitStatus('sampled identity');
  }

  _highlightRecipe() {
    const [female, male] = this._genderWeights;
    const genderActive = [
      female === 1 && male === 0,
      male === 1 && female === 0,
      female === male,
    ];
    this._recipeButtons.gender.forEach((button, i) =>
      button.setActive(genderActive[i])
    );
    const mix = this._ethnicityWeights.every((w) => w === 1);
    this._recipeButtons.ethnicity.forEach((button, i) => {
      const active = i === 4 ? mix : !mix && this._ethnicityWeights[i] === 1;
      button.setActive(active);
    });
  }

  _renderChipPage() {
    const classes = this.samplers.expressionClasses;
    const pageCount = Math.ceil(classes.length / CHIPS_PER_PAGE);
    this._chips.forEach((chip, i) => {
      const classIndex = this._chipPage * CHIPS_PER_PAGE + i;
      chip.classIndex = classIndex < classes.length ? classIndex : -1;
      chip.setLabel(
        chip.classIndex >= 0 ? prettify(classes[chip.classIndex]) : ''
      );
    });
    this._pageText?.setText(`${this._chipPage + 1} / ${pageCount}`);
  }

  /** Reflects scene state into toggle fills and mode highlights. */
  update() {
    for (const toggle of this._toggles) {
      const on = !!toggle.get();
      if (this._lastStates.get(toggle) !== on) {
        this._lastStates.set(toggle, on);
        toggle.button.setActive(on);
      }
    }
    const mode = this.scene.materialMode;
    if (this._lastStates.get('mode') !== mode) {
      this._lastStates.set('mode', mode);
      for (const entry of this._modeButtons) {
        entry.button.setActive(entry.mode === mode);
      }
    }
  }
}
