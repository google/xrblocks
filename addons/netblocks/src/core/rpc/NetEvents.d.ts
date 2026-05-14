/**
 * NetEvents: a tiny typed pub/sub bus that routes RpcMessages between peers.
 *
 * Usage:
 *
 * ```ts
 * session.events.on('chat', (payload, from) => console.log(from, payload));
 * session.events.emit('chat', {text: 'hi'});           // broadcast
 * session.events.emitTo(peerId, 'chat', {text: 'hi'}); // unicast
 * ```
 *
 * Topics are arbitrary strings; payloads are anything that survives
 * `JSON.stringify`. This is the recommended primitive for chat, emoji,
 * cursor pings, button presses, etc.
 *
 * **Security note (cooperative-only).** The `fromPeerId` passed to
 * handlers is the transport-reported sender; netblocks does not sign
 * payloads, so a malicious peer on a peer-to-peer transport could
 * fabricate topics or impersonate another peer. Treat incoming events as
 * untrusted input — validate payload shape and never grant authority
 * solely on a claimed peer id. For adversarial environments, terminate
 * RPC at a trusted server.
 */
import { RpcMessage } from '../codec/MessageCodec';
import { SendFn } from '../presence/PresenceBroadcaster';
export type RpcHandler<T = unknown> = (payload: T, fromPeerId: string) => void;
export declare class NetEvents {
    private _handlers;
    private _send;
    constructor(send: SendFn);
    /** Subscribe to a topic. Returns an unsubscribe function. */
    on<T = unknown>(topic: string, handler: RpcHandler<T>): () => void;
    off(topic: string, handler: RpcHandler): void;
    /** Broadcast `payload` on `topic` to every other peer. */
    emit<T = unknown>(topic: string, payload: T): void;
    /** Send `payload` only to one peer. */
    emitTo<T = unknown>(targetPeerId: string, topic: string, payload: T): void;
    /** Internal: dispatch an inbound RPC message to local handlers. */
    _dispatch(msg: RpcMessage): void;
}
/**
 * Strongly-typed view over a NetEvents instance. Each topic in `TEventMap`
 * declares its payload shape; `on` / `emit` / `emitTo` then infer the
 * payload type from the topic name.
 *
 * The runtime is the same NetEvents — this is purely a TypeScript wrapper:
 *
 * ```ts
 * type Events = {
 *   chat: {text: string};
 *   ping: number;
 * };
 * const e = typedEvents<Events>(session.events);
 * e.on('chat', (p) => p.text);   // p is {text: string}
 * e.emit('ping', 42);            // payload must be number
 * ```
 */
export interface TypedNetEvents<TEventMap extends Record<string, unknown>> {
    on<K extends keyof TEventMap & string>(topic: K, handler: (payload: TEventMap[K], fromPeerId: string) => void): () => void;
    off<K extends keyof TEventMap & string>(topic: K, handler: (payload: TEventMap[K], fromPeerId: string) => void): void;
    emit<K extends keyof TEventMap & string>(topic: K, payload: TEventMap[K]): void;
    emitTo<K extends keyof TEventMap & string>(targetPeerId: string, topic: K, payload: TEventMap[K]): void;
}
export declare function typedEvents<TEventMap extends Record<string, unknown>>(events: NetEvents): TypedNetEvents<TEventMap>;
