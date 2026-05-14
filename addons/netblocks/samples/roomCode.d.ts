/**
 * Room-code helpers for the netblocks samples.
 *
 * The samples default to `BroadcastChannelTransport` (two tabs, same
 * browser, no signaling). When the URL has `?room=ABCD` we suffix the
 * sample's roomId with the code and use `WebRTCTransport` so friends
 * with the same code land in the same mesh. The DOM HUD lets a visitor
 * spin up a fresh code, type one a friend sent them, copy the share
 * link, or leave back to local mode. All transitions are done via a
 * page reload — the URL is the source of truth, so we never have to
 * tear a live session down in-place.
 */
export declare function getRoomCodeFromUrl(): string | null;
export declare function generateRoomCode(): string;
export declare function buildRoomCodeHud(currentCode: string | null): void;
