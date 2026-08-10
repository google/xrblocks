import * as THREE from 'three';
import * as xb from 'xrblocks';

const PANEL_WIDTH = 0.82;
const PANEL_HEIGHT = 0.22;
const PANEL_POS_Y = 0.5;
const PANEL_POS_Z = -1.1;
const PANEL_ROT_X = -Math.PI / 8;

/** Manages the spatial controls for weapon and animal-rain modes. */
export class WeaponToolUI {
  public weaponsEnabled = true;
  public rainActive = true;
  public card: xb.UICard;
  public weaponBtn: xb.UIButton;
  public rainBtn: xb.UIButton;

  public constructor(
    scene: THREE.Object3D,
    private onToggleCallback: (enabled: boolean) => void,
    private onRainToggleCallback: (active: boolean) => void
  ) {
    this.card = new xb.UICard({
      size: {width: PANEL_WIDTH, height: PANEL_HEIGHT},
    });
    this.card.name = 'Animal Attack controls';
    this.card.position.set(0, PANEL_POS_Y, PANEL_POS_Z);
    this.card.rotation.x = PANEL_ROT_X;

    this.weaponBtn = new xb.UIButton({
      label: 'Weapons: on',
      icon: 'casino',
      onClick: () => this.toggleWeapons(),
      style: {flexGrow: 1, height: '100%'},
    });
    this.rainBtn = new xb.UIButton({
      label: 'Rain: on',
      icon: 'pets',
      onClick: () => this.toggleRain(),
      style: {flexGrow: 1, height: '100%'},
    });

    const controls = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 16,
      },
    });
    controls.add(this.weaponBtn, this.rainBtn);
    this.card.add(controls);

    scene.add(this.card);
    this.onToggleCallback(this.weaponsEnabled);
    this.onRainToggleCallback(this.rainActive);
  }

  private toggleRain() {
    this.rainActive = !this.rainActive;
    this.rainBtn.label = `Rain: ${this.rainActive ? 'on' : 'off'}`;
    this.onRainToggleCallback(this.rainActive);
  }

  /** Toggles weapon mode, or ensures that it starts enabled. */
  public toggleWeapons(forceEnable = false) {
    this.weaponsEnabled = forceEnable || !this.weaponsEnabled;
    this.weaponBtn.label = `Weapons: ${this.weaponsEnabled ? 'on' : 'off'}`;
    this.onToggleCallback(this.weaponsEnabled);
  }

  /** Returns whether a target belongs to one of this UI's buttons. */
  public isControlTarget(target: THREE.Object3D | undefined) {
    let current = target;
    while (current) {
      if (current === this.weaponBtn || current === this.rainBtn) return true;
      current = current.parent ?? undefined;
    }
    return false;
  }
}
