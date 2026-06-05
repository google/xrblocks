import { Script, VisemeWeights } from 'xrblocks';
/**
 * Minimal duck-typed target that {@link LipsyncMouth} drives every
 * frame. Anything with a `setVisemes` method satisfies the contract —
 * the canonical implementation is xrblocks core's {@link StylizedFace},
 * which sits on every netblocks `RemoteUserAvatar` out of the box.
 */
export interface VisemeTarget {
    setVisemes(visemes: VisemeWeights): void;
}
export interface LipsyncMouthOptions {
    /**
     * The face this lipsync driver animates. Required. Caller owns the
     * target — `LipsyncMouth.dispose()` will never dispose it. Pass the
     * `face` field on a netblocks avatar (`user.avatar.face`), or build
     * a standalone `StylizedFace` for a non-multiplayer puppet.
     */
    target: VisemeTarget;
    /**
     * Reuse an existing `AudioContext` instead of creating a new one.
     * Browsers cap the number of contexts per page (typically 6-8), so
     * when driving multiple peer streams (one driver per peer) pass the
     * shared context from `xb.core.sound.listener.context` or
     * `THREE.AudioContext.getContext()`. When provided, this class will
     * not close the context on `dispose()`.
     */
    audioContext?: AudioContext;
    /** AnalyserNode FFT size; must be a power of two. Defaults to 1024. */
    fftSize?: number;
    /**
     * Below this RMS the mouth enters its "silence" path. Default 0.01.
     */
    silenceThreshold?: number;
    /**
     * Minimum continuous silence duration (ms) before the mouth starts
     * closing. Brief sub-threshold gaps shorter than this (plosive
     * stops, breaths, syllable boundaries) leave the mouth held in place
     * so it doesn't jitter. Once exceeded, the mapper's natural
     * smoothing decays the mouth to rest. Default 150.
     */
    silenceHoldMs?: number;
}
/**
 * `LipsyncMouth` reads audio from a `MediaStream`, runs an FFT +
 * formant-based viseme mapper on it every frame, and writes the
 * resulting viseme weights to a {@link VisemeTarget} (typically a
 * {@link StylizedFace}). It owns no visual of its own — the face you
 * pass via `target` is the only thing on screen.
 *
 * Extends `Script` so the xrblocks scripts manager calls `init()` once
 * the instance is part of the active scene and `update(time)` every
 * frame. `dispose()` is called automatically by the scripts manager on
 * the next sync after the instance is removed from the scene graph; it
 * disconnects audio nodes and releases internal state. It
 * deliberately never stops the input `MediaStream` tracks (the caller
 * owns those), never closes a caller-supplied `AudioContext`, and
 * never disposes the target face (the avatar / host owns that too).
 *
 * Instances are one-shot: after `dispose()` runs (i.e. once the script
 * has been removed from the scene), do NOT re-add the same instance.
 * Construct a new `LipsyncMouth` for the next attachment.
 *
 * Standalone (e.g. puppet sample):
 *
 * ```ts
 * const face = new StylizedFace({showEyes: false});
 * puppetHead.add(face);
 * const driver = new LipsyncMouth(micStream, {target: face});
 * puppetHead.add(driver);
 * ```
 *
 * Multiplayer netblocks avatar:
 *
 * ```ts
 * session.voice.onTrack((peerId, stream) => {
 *   const user = session.users.get(peerId)!;
 *   const driver = new LipsyncMouth(stream, {
 *     target: user.avatar.face,
 *     audioContext: THREE.AudioContext.getContext(),
 *   });
 *   user.avatar.add(driver);
 * });
 * ```
 */
export declare class LipsyncMouth extends Script {
    /** The face this driver animates. Caller-owned. */
    readonly target: VisemeTarget;
    private readonly stream;
    private readonly fftSize;
    private readonly silenceThreshold;
    private readonly silenceHoldMs;
    private readonly externalContext;
    private ctx?;
    private source?;
    private analyser?;
    private freqData?;
    private timeData?;
    private primer?;
    private readonly mapper;
    private lastTime;
    /** Wall-clock ms when the most recent silence run started, or null. */
    private silenceSinceMs;
    constructor(stream: MediaStream, opts: LipsyncMouthOptions);
    init(): Promise<void>;
    update(time?: number): void;
    dispose(): void;
}
