import * as xb from 'xrblocks';

class HoldToAskButton extends xb.UIButton {
  constructor(label, onActivate, onDeactivate) {
    super({
      label,
      icon: 'mic',
      ariaLabel: `Hold to ask a question about ${label}`,
      style: {
        width: '100%',
        height: '100%',
        borderRadius: 18,
        fontSize: 24,
        fontWeight: 'bold',
        ':active': {
          backgroundColor: '#4970ff',
          color: '#ffffff',
        },
      },
    });
    this.objectLabel = label;
    this.onActivate = onActivate;
    this.onDeactivate = onDeactivate;
    this.pressed = false;
  }

  onObjectSelectStart(event) {
    this.activate(event);
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    this.deactivate(event);
    event.stopPropagation();
  }

  onObjectTouchStart(event) {
    this.activate(event);
    event.stopPropagation();
  }

  onObjectTouchEnd(event) {
    this.deactivate(event);
    event.stopPropagation();
  }

  activate(event) {
    if (this.pressed) return;
    this.setActive(true);
    this.onActivate?.(event);
  }

  deactivate(event) {
    if (!this.pressed) return;
    this.setActive(false);
    this.onDeactivate?.(event);
  }

  setActive(active) {
    this.pressed = active;
    this.label = active ? 'Listening' : this.objectLabel;
  }
}

/** A detected object label that acts as a press-and-hold voice button. */
export class ObjectQuestionCard extends xb.UICard {
  constructor(detectedObject, onActivate, onDeactivate) {
    const button = new HoldToAskButton(
      detectedObject.label,
      onActivate,
      onDeactivate
    );
    super({
      size: {width: 0.28, height: 0.09},
      style: {padding: 0, borderRadius: 18},
      children: [button],
    });

    this.object = detectedObject;
    this.button = button;
    this.position.copy(detectedObject.position);
    this.position.y += 0.08;
    this.add(new xb.FaceCamera({mode: 'spherical', smoothing: 1}));
    this.name = `${detectedObject.label} question button`;
  }

  owns(target) {
    return target === this || target === this.button;
  }

  setActive(active) {
    this.button.setActive(active);
  }
}
