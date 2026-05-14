import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import { JoinRoomOptions, NetCore } from 'netblocks';
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
export declare abstract class NetSample extends xb.Script {
    net: NetCore;
    /** Return the room name + transport. Called once during `init`. */
    protected abstract getJoinOptions(): {
        roomId: string;
        options: JoinRoomOptions;
    };
    /** Called after `joinRoom` resolves. Override to attach handlers. */
    protected onSession(_session: NonNullable<NetCore['session']>): void;
    init(): Promise<void>;
    private _buildXrRoomCodePanel;
    static run<T extends NetSample>(ctor: new () => T): void;
}
