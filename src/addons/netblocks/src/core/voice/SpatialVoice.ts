/**
 * SpatialVoice: maps each remote peer to a `THREE.PositionalAudio` node
 * parented to that peer's RemoteUserAvatar head pivot, so their voice
 * spatializes with their position. The local microphone capture and the
 * RTCPeerConnection wiring lives in VoiceChat — SpatialVoice is the
 * "render layer" that places remote audio in 3D.
 *
 * This class is mostly a thin three.js wrapper, kept separate so apps can
 * swap in custom HRTF panners or attach a UI volume slider without
 * monkey-patching VoiceChat.
 */
import * as THREE from 'three';

export interface SpatialVoiceOptions {
  /** Reference distance (m) at which volume is 1.0. */
  refDistance?: number;
  /** Distance model rolloff factor. */
  rolloffFactor?: number;
  /** Maximum distance after which audio attenuation stops decreasing. */
  maxDistance?: number;
}

export class SpatialVoice {
  readonly listener: THREE.AudioListener;
  private _byPeer = new Map<string, THREE.PositionalAudio>();
  private _primersByPeer = new Map<string, HTMLAudioElement>();
  private _opts: Required<SpatialVoiceOptions>;

  /**
   * @param listener - The shared `THREE.AudioListener` to spatialize against —
   *   typically `xb.core.sound.listener`, which CoreSound has already attached
   *   to the camera. SpatialVoice does NOT take ownership: it never adds or
   *   removes the listener from the scene, so disposing SpatialVoice leaves
   *   CoreSound's audio path untouched.
   */
  constructor(listener: THREE.AudioListener, opts: SpatialVoiceOptions = {}) {
    this.listener = listener;
    this._opts = {
      refDistance: opts.refDistance ?? 0.5,
      rolloffFactor: opts.rolloffFactor ?? 4,
      maxDistance: opts.maxDistance ?? 20,
    };
  }

  /**
   * Attach a MediaStream to a peer; (re-)creates the PositionalAudio node and
   * parents it to `parent` (typically the remote user's headPivot).
   */
  attach(peerId: string, parent: THREE.Object3D, stream: MediaStream): void {
    this.detach(peerId);
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setRefDistance(this._opts.refDistance);
    audio.setRolloffFactor(this._opts.rolloffFactor);
    audio.setMaxDistance(this._opts.maxDistance);
    audio.setDistanceModel('inverse');
    // HRTF panning gives proper left/right/front/back localization. This
    // is three.js's default but make it explicit so spatial cues survive
    // any future default change.
    audio.panner.panningModel = 'HRTF';

    // three.js doesn't have a first-class "use a MediaStream" path that works
    // across all browsers; the safest cross-browser route is to build a
    // MediaStreamAudioSourceNode and assign it via setNodeSource.
    // three.js's typings for setNodeSource want an AudioScheduledSourceNode,
    // but at runtime any AudioNode works for our purposes. Cast through any
    // to avoid pulling in a different code path on every browser.
    const ctx = THREE.AudioContext.getContext() as AudioContext;
    // Browsers create the shared AudioContext suspended until a user gesture.
    // If a remote voice arrives before any local interaction, the
    // PositionalAudio graph stays silent forever. resume() is a no-op when
    // the context is already running.
    void ctx.resume?.().catch(() => undefined);
    const src = ctx.createMediaStreamSource(stream);
    (audio as unknown as {setNodeSource: (n: AudioNode) => void}).setNodeSource(
      src
    );

    // Chromium quirk: a MediaStreamAudioSourceNode built from a remote WebRTC
    // stream stays silent unless the stream is also attached to an
    // HTMLMediaElement that is actually playing. Attach a muted, off-DOM
    // <audio> element to pump the stream's audio thread so the WebAudio
    // graph above receives samples. See crbug.com/933677.
    if (typeof document !== 'undefined') {
      const primer = document.createElement('audio');
      primer.muted = true;
      primer.autoplay = true;
      primer.srcObject = stream;
      primer.play().catch(() => {
        // ignore; user-gesture restrictions can defer playback, the stream
        // will still pump once playback starts.
      });
      this._primersByPeer.set(peerId, primer);
    }

    parent.add(audio);
    this._byPeer.set(peerId, audio);
  }

  detach(peerId: string): void {
    const audio = this._byPeer.get(peerId);
    if (audio) {
      audio.parent?.remove(audio);
      audio.disconnect();
      this._byPeer.delete(peerId);
    }
    const primer = this._primersByPeer.get(peerId);
    if (primer) {
      try {
        primer.pause();
      } catch {
        // ignore
      }
      primer.srcObject = null;
      this._primersByPeer.delete(peerId);
    }
  }

  dispose(): void {
    for (const id of [...this._byPeer.keys()]) this.detach(id);
    // Listener is owned by CoreSound (or whoever passed it in); don't detach.
  }
}
