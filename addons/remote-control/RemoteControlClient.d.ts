import { EmbodiedControlStep, XRCompoundControl } from "../embodied-control/EmbodiedControlTypes.js";
import "../embodied-control/index.js";
import { RemoteControlRequest, RemoteControlResponse } from "./RemoteControlProtocol.js";
import { RemoteControlTarget } from "./built-in-tools/Types.js";
import { RemoteControlClickToolArgs, RemoteControlLookAtTargetToolArgs, RemoteControlPointToToolArgs, RemoteControlReachToToolArgs, RemoteControlTeleportToToolArgs } from "./built-in-tools/ActionTools.js";
import { RemoteControlCameraToolArgs, RemoteControlScreenshotToolArgs } from "./built-in-tools/ObservationTools.js";
import "./built-in-tools/index.js";
//#region src/addons/remote-control/RemoteControlClient.d.ts
export type RemoteControlClientOptions = {
  url?: string;
  sessionId?: string;
  WebSocketConstructor?: typeof WebSocket;
};
export declare class RemoteControlClient {
  private ws?;
  private pending;
  private pageReady;
  private waiters;
  private readonly url;
  private readonly sessionId;
  private readonly WebSocketConstructor;
  constructor(options?: string | RemoteControlClientOptions);
  connect(): Promise<void>;
  close(): void;
  waitForPage(): Promise<void>;
  /** @deprecated Use waitForPage(). */
  waitForSimulator(): Promise<void>;
  step(step: EmbodiedControlStep): Promise<RemoteControlResponse>;
  apply(control: XRCompoundControl): Promise<RemoteControlResponse>;
  teleportTo(target: RemoteControlTarget, options?: RemoteControlTeleportToToolArgs['options']): Promise<RemoteControlResponse>;
  lookAtTarget(target: RemoteControlTarget, options?: RemoteControlLookAtTargetToolArgs['options']): Promise<RemoteControlResponse>;
  pointTo(handIndex: number, target: RemoteControlTarget, options?: RemoteControlPointToToolArgs['options']): Promise<RemoteControlResponse>;
  reachTo(handIndex: number, target: RemoteControlTarget, options?: RemoteControlReachToToolArgs['options']): Promise<RemoteControlResponse>;
  click(handIndex?: RemoteControlClickToolArgs['handIndex'], options?: RemoteControlClickToolArgs['options']): Promise<RemoteControlResponse>;
  getCamera(args?: RemoteControlCameraToolArgs): Promise<RemoteControlResponse>;
  getHands(): Promise<RemoteControlResponse>;
  getScreenshot(args?: RemoteControlScreenshotToolArgs): Promise<RemoteControlResponse>;
  getSimulatorState(): Promise<RemoteControlResponse>;
  callTool(name: string, args?: unknown): Promise<RemoteControlResponse>;
  ping(): Promise<RemoteControlResponse>;
  request(request: RemoteControlRequest): Promise<RemoteControlResponse>;
  private onOpen;
  private onMessage;
  private onClose;
}
//#endregion