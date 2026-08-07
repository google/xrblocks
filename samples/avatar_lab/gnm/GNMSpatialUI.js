import * as THREE from 'three';
import * as xb from 'xrblocks';

const CHIPS_PER_PAGE = 8;
const SELECTED_BLUE = '#4f8ce0';
const SELECTED_HOVER_BLUE = '#6ba3ed';

function prettify(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

/** A direct modern-UI recreation of the original three GNM XR cards. */
export class GNMSpatialUI {
  constructor(scene) {
    this.scene = scene;
    this.model = scene.model;
    this.samplers = scene.samplers;
    this.genderWeights = [1, 1];
    this.ethnicityWeights = [1, 1, 1, 1];
    this.chipPage = 0;
    this.chips = [];
    this.toggles = [];
    this.modeButtons = [];
    this.recipeButtons = {gender: [], ethnicity: []};
    this.lastStates = new Map();
  }

  build() {
    this.buildSampleCard();
    this.buildMotionCard();
    this.buildViewCard();
    this.highlightRecipe();
    this.renderChipPage();
  }

  setStatus(text) {
    if (this.statusText) this.statusText.text = text || ' ';
  }

  card(name, sizeX, sizeY, x, y, z, rotationY) {
    const card = new xb.UICard({
      size: {width: sizeX, height: sizeY},
      manipulation: {
        actions: {translate: {faceCamera: true}},
        handle: {action: 'translate'},
      },
      edge: true,
    });
    card.name = name;
    card.position.set(x, y, z);
    card.quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));
    this.scene.add(card);
    return card;
  }

  header(parent, icon, title) {
    const row = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      children: [
        new xb.UIIcon({
          icon,
          style: {width: 26, height: 26, color: '#ffffff'},
        }),
        new xb.UIText({
          text: title,
          style: {fontSize: 30, fontWeight: 'bold'},
        }),
      ],
    });
    parent.add(row);
  }

  sectionLabel(parent, label) {
    parent.add(
      new xb.UIText({
        text: label,
      })
    );
  }

  row(parent, {gap = 10} = {}) {
    const row = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap,
        alignItems: 'center',
      },
    });
    parent.add(row);
    return row;
  }

  button(parent, label, {onClick}) {
    const button = new xb.UIButton({
      label,
      onClick,
      style: {
        flexGrow: 1,
        ':hover': {color: xb.ui.theme.colors.text},
      },
    });
    parent.add(button);
    return {
      button,
      setToggled(toggled) {
        button.style.backgroundColor = toggled ? SELECTED_BLUE : undefined;
        button.style.color = toggled ? '#ffffff' : undefined;
        button.style[':hover'] = toggled
          ? {backgroundColor: SELECTED_HOVER_BLUE, color: '#ffffff'}
          : {color: xb.ui.theme.colors.text};
      },
      setLabel(value) {
        button.label = value;
      },
    };
  }

  buildSampleCard() {
    const card = this.card('GNMSample', 0.6, 0.8, -0.62, 1.32, -0.46, 0.6);
    this.header(card, 'face', 'GNM Sample');
    this.sectionLabel(card, 'IDENTITY');

    const genderRow = this.row(card);
    this.recipeButtons.gender = [
      ['Female', 0],
      ['Male', 1],
      ['Mix', -1],
    ].map(([label, index]) =>
      this.button(genderRow, label, {
        onClick: () => this.pickGender(index),
      })
    );

    const ethnicityRow = this.row(card, {gap: 8});
    this.recipeButtons.ethnicity = [
      ['Mid-East', 0],
      ['Asian', 1],
      ['White', 2],
      ['Black', 3],
      ['Mix', -1],
    ].map(([label, index]) =>
      this.button(ethnicityRow, label, {
        onClick: () => this.pickEthnicity(index),
      })
    );

    const identityActions = this.row(card);
    this.button(identityActions, 'New face', {
      onClick: () => this.sampleIdentity(),
    });
    this.button(identityActions, 'Template', {
      onClick: () => {
        this.model.resetIdentity();
        this.scene.onModelChanged?.();
        this.scene._emitStatus('template (mean) face');
      },
    });

    this.sectionLabel(card, 'EXPRESSION');
    const classes = this.samplers.expressionClasses;
    for (let rowIndex = 0; rowIndex < CHIPS_PER_PAGE / 4; rowIndex++) {
      const chipRow = this.row(card, {gap: 8});
      for (let column = 0; column < 4; column++) {
        const chip = this.button(chipRow, ' ', {
          onClick: () => {
            if (chip.classIndex === undefined || chip.classIndex < 0) return;
            this.scene.sampleExpression(chip.classIndex, 0.9);
            this.scene._emitStatus(
              `expression: ${classes[chip.classIndex].replace(/_/g, ' ')}`
            );
          },
        });
        this.chips.push(chip);
      }
    }

    const pageCount = Math.ceil(classes.length / CHIPS_PER_PAGE);
    const pager = this.row(card);
    this.button(pager, '<', {
      onClick: () => {
        this.chipPage = (this.chipPage + pageCount - 1) % pageCount;
        this.renderChipPage();
      },
    });
    this.pageText = new xb.UIText({
      text: ' ',
      style: {
        textAlign: 'center',
        flexGrow: 1,
      },
    });
    pager.add(this.pageText);
    this.button(pager, '>', {
      onClick: () => {
        this.chipPage = (this.chipPage + 1) % pageCount;
        this.renderChipPage();
      },
    });

    const expressionActions = this.row(card);
    this.button(expressionActions, 'Random blend', {
      onClick: () => {
        this.scene.sampleRandomExpression(0.9);
        this.scene._emitStatus('random expression blend');
      },
    });
    this.button(expressionActions, 'Neutral', {
      onClick: () => {
        this.model.resetExpression();
        this.scene.onModelChanged?.();
        this.scene._emitStatus('neutral expression');
      },
    });

    this.statusText = new xb.UIText({
      text: ' ',
      style: {
        textAlign: 'center',
      },
    });
    card.add(this.statusText);
  }

  buildMotionCard() {
    const card = this.card('GNMMotion', 0.52, 0.46, 0.62, 1.52, -0.46, -0.6);
    this.header(card, 'animation', 'Motion');

    const scene = this.scene;
    const specifications = [
      [
        'Eyes follow',
        () => scene.eyesFollowCamera,
        (value) => (scene.eyesFollowCamera = value),
      ],
      [
        'Head follow',
        () => scene.headFollowsCamera,
        (value) => (scene.headFollowsCamera = value),
      ],
      ['Tour', () => !!scene.tour, (value) => scene.setExpressionTour(value)],
      ['Morph', () => !!scene.morph, (value) => scene.setIdentityMorph(value)],
      ['Sway', () => scene.idleSway, (value) => (scene.idleSway = value)],
      [
        'Turntable',
        () => scene.turntable,
        (value) => (scene.turntable = value),
      ],
    ];
    for (let index = 0; index < specifications.length; index += 2) {
      const controls = this.row(card);
      for (const [label, getValue, setValue] of specifications.slice(
        index,
        index + 2
      )) {
        const button = this.button(controls, label, {
          onClick: () => {
            setValue(!getValue());
            this.update();
          },
        });
        this.toggles.push({button, getValue});
      }
    }

    const actions = this.row(card);
    this.button(actions, 'Reset pose', {
      onClick: () => {
        this.model.resetPose();
        scene._smoothedRotations.fill(0);
        scene.onModelChanged?.();
      },
    });
    this.button(actions, 'Neutral all', {
      onClick: () => {
        scene.resetToNeutral();
        this.update();
      },
    });
  }

  buildViewCard() {
    const card = this.card('GNMView', 0.52, 0.4, 0.64, 1.08, -0.46, -0.6);
    this.header(card, 'visibility', 'View');

    const scene = this.scene;
    const modeRow = this.row(card, {gap: 8});
    for (const [mode, label] of [
      ['studio', 'Studio'],
      ['clay', 'Clay'],
      ['normals', 'Normals'],
      ['regions', 'Regions'],
    ]) {
      const button = this.button(modeRow, label, {
        onClick: () => {
          scene.setMaterialMode(mode);
          this.update();
        },
      });
      this.modeButtons.push({button, mode});
    }

    const specifications = [
      [
        'Wireframe',
        () => scene.wireframe.visible,
        (value) => scene.setWireframeVisible(value),
      ],
      [
        'Landmarks',
        () => scene.landmarkMesh.visible,
        (value) => scene.setLandmarksVisible(value),
      ],
      [
        'Skeleton',
        () => scene.skeletonGroup.visible,
        (value) => scene.setSkeletonVisible(value),
      ],
      [
        'Anatomy',
        () => !scene.visibleComponents[0],
        (value) => scene.setComponentVisible(0, !value),
      ],
    ];
    for (let index = 0; index < specifications.length; index += 2) {
      const controls = this.row(card);
      for (const [label, getValue, setValue] of specifications.slice(
        index,
        index + 2
      )) {
        const button = this.button(controls, label, {
          onClick: () => {
            setValue(!getValue());
            this.update();
          },
        });
        this.toggles.push({button, getValue});
      }
    }
  }

  pickGender(index) {
    this.genderWeights =
      index < 0 ? [1, 1] : [index === 0 ? 1 : 0, index === 1 ? 1 : 0];
    this.highlightRecipe();
    this.sampleIdentity();
  }

  pickEthnicity(index) {
    this.ethnicityWeights =
      index < 0 ? [1, 1, 1, 1] : [0, 1, 2, 3].map((i) => (i === index ? 1 : 0));
    this.highlightRecipe();
    this.sampleIdentity();
  }

  sampleIdentity() {
    this.scene.sampleIdentity(this.genderWeights, this.ethnicityWeights, 0.9);
    this.scene._emitStatus('sampled identity');
  }

  highlightRecipe() {
    const [female, male] = this.genderWeights;
    const genderActive = [
      female === 1 && male === 0,
      male === 1 && female === 0,
      female === male,
    ];
    this.recipeButtons.gender.forEach((button, index) =>
      button.setToggled(genderActive[index])
    );

    const mixed = this.ethnicityWeights.every((weight) => weight === 1);
    this.recipeButtons.ethnicity.forEach((button, index) => {
      const active =
        index === 4 ? mixed : !mixed && this.ethnicityWeights[index] === 1;
      button.setToggled(active);
    });
  }

  renderChipPage() {
    const classes = this.samplers.expressionClasses;
    const pageCount = Math.ceil(classes.length / CHIPS_PER_PAGE);
    this.chips.forEach((chip, index) => {
      const classIndex = this.chipPage * CHIPS_PER_PAGE + index;
      chip.classIndex = classIndex < classes.length ? classIndex : -1;
      chip.setLabel(
        chip.classIndex >= 0 ? prettify(classes[chip.classIndex]) : ' '
      );
      chip.button.disabled = chip.classIndex < 0;
    });
    if (this.pageText) {
      this.pageText.text = `${this.chipPage + 1} / ${pageCount}`;
    }
  }

  update() {
    for (const toggle of this.toggles) {
      const enabled = !!toggle.getValue();
      if (this.lastStates.get(toggle) === enabled) continue;
      this.lastStates.set(toggle, enabled);
      toggle.button.setToggled(enabled);
    }

    const mode = this.scene.materialMode;
    if (this.lastStates.get('mode') === mode) return;
    this.lastStates.set('mode', mode);
    for (const entry of this.modeButtons) {
      entry.button.setToggled(entry.mode === mode);
    }
  }
}
