import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {enableNet, JoinRoomOptions, NetCore, WebRTCTransport} from 'netblocks';

import {buildRoomCodeHud, getRoomCodeFromUrl} from './roomCode';

/**
 * Base class for netblocks samples. Wires up an xrblocks app and joins a
 * room via `xb.enableNet()`. Subclasses implement `getJoinOptions()` to
 * choose a default transport (typically `BroadcastChannelTransport` for
 * a self-contained two-tab demo) and `onSession(session)` to attach
 * app-level listeners.
 *
 * If the page URL has `?room=ABCD`, this base class overrides the
 * default transport with `WebRTCTransport` and suffixes the room id
 * with the code, so anyone arriving with the same code lands
 * in the same mesh. A small DOM HUD exposes "Start new room" / "Join
 * code" controls — both navigate to a new URL and reload, so we never
 * have to tear a live session down in-place. The frame loop is driven
 * by xrblocks itself — there's no `update()` to override.
 */
export abstract class NetSample extends xb.Script {
  net!: NetCore;

  /** Return the room name + transport. Called once during `init`. */
  protected abstract getJoinOptions(): {
    roomId: string;
    options: JoinRoomOptions;
  };

  /** Called after `joinRoom` resolves. Override to attach handlers. */
  protected onSession(_session: NonNullable<NetCore['session']>): void {}

  async init() {
    this.net = enableNet();
    const code = getRoomCodeFromUrl();
    let {roomId, options} = this.getJoinOptions();
    // Push the presence rate up for the samples — they're either local
    // (BroadcastChannel, free) or small per-friend WebRTC meshes, so
    // smoother avatars are worth the extra messages. Library default
    // stays conservative for production WebRTC at-scale use.
    options = {presenceHz: 60, ...options};
    if (code) {
      roomId = `${roomId}-${code}`;
      options = {...options, transport: new WebRTCTransport()};
    }
    buildRoomCodeHud(code);
    if (code) this._buildXrRoomCodePanel(code);
    try {
      const session = await this.net.joinRoom(roomId, options);
      this.onSession(session);
    } catch (err) {
      console.error('[netblocks/sample] failed to join room:', err);
    }
  }

  private _buildXrRoomCodePanel(code: string) {
    // Tiny SpatialPanel that mirrors the DOM HUD's room code into
    // immersive XR, so a headset user can read the code back to a
    // friend without leaving VR. Positioned up-right of forward so
    // it doesn't fight per-sample HUDs (which typically anchor left
    // or below).
    const panel = new xb.SpatialPanel({
      width: 0.4,
      height: 0.12,
      backgroundColor: '#1a1a2add',
    });
    panel
      .addGrid()
      .addRow()
      .addText({
        text: `Room  ${code}`,
        fontSize: 0.05,
        fontColor: '#7be3a4',
        textAlign: 'center',
      });
    panel.position.set(0.8, 1.9, -1.5);
    panel.rotation.y = -Math.PI / 8;
    this.add(panel);
  }

  static run<T extends NetSample>(ctor: new () => T) {
    document.addEventListener('DOMContentLoaded', async () => {
      const options = new xb.Options();
      options.enableUI();
      options.reticles.enabled = true;
      options.controllers.visualizeRays = false;
      options.simulator.instructions.enabled = false;
      const app = new ctor();
      xb.add(app);
      await xb.init(options);
    });
  }
}
