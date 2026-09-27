import { NetMessage } from "../codec/MessageCodec.js";
//#region src/addons/netblocks/src/core/presence/PresenceBroadcaster.d.ts
export type SendFn = (msg: NetMessage) => void;
export declare class PresenceBroadcaster {
  hz: number;
  private _sendFn;
  private _lastSendMs;
  private _enabled;
  private _scratch;
  constructor(sendFn: SendFn, hz?: number);
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  /** Call once per frame from the NetSession's update loop. */
  update(nowMs: number): void;
  /** Build a snapshot from the current xb.core state. Returns false if no head pose. */
  private _fillSnapshot;
}
//#endregion