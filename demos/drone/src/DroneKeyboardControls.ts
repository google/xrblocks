import * as xb from 'xrblocks';

export class DroneKeyboardControls extends xb.Script {
  _onKeyDown = this.onKeyDown.bind(this);
  _onKeyUp = this.onKeyUp.bind(this);
  downKeys = new Set<xb.Keycodes|string>();

  init() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  override onKeyDown(event: xb.KeyEvent) {
    this.downKeys.add(event.code);
  }

  override onKeyUp(event: xb.KeyEvent) {
    this.downKeys.delete(event.code);
  }

  getDroneForwardForce() {
    return Number(this.downKeys.has(xb.Keycodes.DOWN)) -
        Number(this.downKeys.has(xb.Keycodes.UP));
  }

  getDroneRightForce() {
    return Number(this.downKeys.has(xb.Keycodes.RIGHT)) -
        Number(this.downKeys.has(xb.Keycodes.LEFT));
  }

  getDroneUpForce() {
    return Number(this.downKeys.has(xb.Keycodes.PAGE_UP)) -
        Number(this.downKeys.has(xb.Keycodes.PAGE_DOWN));
  }
}