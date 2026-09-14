import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

import {SpatialVoice} from './SpatialVoice';

function node() {
  return {connect: vi.fn(), disconnect: vi.fn()};
}

function gainNode() {
  const gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((value: number, _time: number) => {
      gain.value = value;
    }),
    // Unlike setValueAtTime, a target does not immediately change the value.
    setTargetAtTime: vi.fn(),
  };
  return {...node(), gain};
}

function setup() {
  const gains: ReturnType<typeof gainNode>[] = [];
  const outputs = new Map<object, ReturnType<typeof gainNode>>();
  const connections: Array<{stream: MediaStream; gain: number}> = [];
  const sources: ReturnType<typeof node>[] = [];
  const ctx = {
    currentTime: 12,
    destination: node(),
    resume: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      const gain = gainNode();
      gains.push(gain);
      return gain;
    }),
    createPanner: vi.fn(() => {
      const panner = node();
      panner.connect.mockImplementation((gain) => {
        outputs.set(panner, gain);
      });
      return panner;
    }),
    createMediaStreamSource: vi.fn((stream: MediaStream) => {
      const source = node();
      source.connect.mockImplementation((panner) => {
        connections.push({stream, gain: outputs.get(panner)!.gain.value});
      });
      sources.push(source);
      return source;
    }),
  };
  vi.spyOn(THREE.AudioContext, 'getContext').mockReturnValue(
    ctx as unknown as AudioContext
  );
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockResolvedValue(undefined);
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {});
  const camera = new THREE.PerspectiveCamera();
  const listener = new THREE.AudioListener();
  camera.add(listener);
  listener.gain.gain.value = 0.7;
  const sceneSound = new THREE.Audio(listener);
  sceneSound.gain.gain.value = 0.4;
  const voice = new SpatialVoice(listener);
  const parent = new THREE.Group();
  const track = {enabled: true, stop: vi.fn()};
  const stream = {
    getTracks: vi.fn(() => [track]),
    getAudioTracks: vi.fn(() => [track]),
  } as unknown as MediaStream;
  return {
    voice,
    parent,
    stream,
    track,
    camera,
    listener,
    sceneSound,
    ctx,
    connections,
    sources,
    gains,
    play,
    pause,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('SpatialVoice playback gain', () => {
  it('keeps default playback audible and uses the existing positional graph', () => {
    const {voice, parent, stream, connections, ctx} = setup();
    voice.attach('bob', parent, stream);

    expect(connections).toEqual([{stream, gain: 1}]);
    const audio = parent.children[0] as THREE.PositionalAudio;
    expect(audio).toBeInstanceOf(THREE.PositionalAudio);
    expect(audio.panner.panningModel).toBe('HRTF');
    expect(audio.getRefDistance()).toBe(0.5);
    expect(audio.getRolloffFactor()).toBe(4);
    expect(audio.getMaxDistance()).toBe(20);
    expect(audio.getDistanceModel()).toBe('inverse');
    expect(ctx.createPanner).toHaveBeenCalledOnce();
    expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(stream);
    voice.dispose();
  });

  it('hard-mutes new and replacement sources before they connect', () => {
    const {voice, parent, stream, connections, sources, gains, play, pause} =
      setup();
    voice.attach('bob', parent, stream, true);
    const oldAudio = parent.children[0] as THREE.PositionalAudio;
    const replacement = {} as MediaStream;
    voice.attach('bob', parent, replacement, true);

    expect(connections).toEqual([
      {stream, gain: 0},
      {stream: replacement, gain: 0},
    ]);
    expect(oldAudio.parent).toBeNull();
    expect(parent.children).toHaveLength(1);
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    expect(gains[2].disconnect).toHaveBeenCalledOnce();
    expect(gains[2].gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(gains[3].gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(gains[3].gain.cancelScheduledValues).toHaveBeenCalledWith(12);
    expect(gains[3].gain.setValueAtTime).toHaveBeenCalledWith(0, 12);
    expect(pause).toHaveBeenCalledOnce();
    expect(play.mock.contexts[0].srcObject).toBeNull();
    expect(play.mock.contexts[1].srcObject).toBe(replacement);
    expect(play.mock.contexts.every((primer) => primer.muted)).toBe(true);
    voice.dispose();
  });

  it('updates only the selected peer gain, without touching streams or shared audio', () => {
    const {
      voice,
      parent,
      stream,
      track,
      listener,
      camera,
      sceneSound,
      sources,
      gains,
      ctx,
    } = setup();
    voice.attach('bob', parent, stream);
    voice.attach('alice', parent, stream);
    const [bob, alice] = parent.children as THREE.PositionalAudio[];
    const resumeCalls = ctx.resume.mock.calls.length;
    voice.setPlaybackMuted('bob', true);
    expect(bob.getVolume()).toBe(0);
    expect(alice.getVolume()).toBe(1);
    voice.setPlaybackMuted('bob', false);
    expect(bob.getVolume()).toBe(1);
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(2);
    expect(
      sources.every((source) => source.connect.mock.calls.length === 1)
    ).toBe(true);
    expect(
      sources.every((source) => !source.disconnect.mock.calls.length)
    ).toBe(true);
    expect(ctx.resume).toHaveBeenCalledTimes(resumeCalls);
    expect(track.enabled).toBe(true);
    expect(track.stop).not.toHaveBeenCalled();
    expect(stream.getTracks).not.toHaveBeenCalled();
    expect(stream.getAudioTracks).not.toHaveBeenCalled();
    expect(listener.getMasterVolume()).toBe(0.7);
    expect(sceneSound.getVolume()).toBe(0.4);
    expect(listener.parent).toBe(camera);
    for (const gain of gains.slice(0, 2)) {
      expect(gain.gain.cancelScheduledValues).not.toHaveBeenCalled();
      expect(gain.gain.setValueAtTime).not.toHaveBeenCalled();
      expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
      expect(gain.disconnect).not.toHaveBeenCalled();
    }
    voice.dispose();
  });

  it('disconnects all owned nodes and primers, leaving shared audio intact', () => {
    const {
      voice,
      parent,
      stream,
      listener,
      camera,
      sceneSound,
      sources,
      gains,
      play,
      pause,
    } = setup();
    voice.attach('bob', parent, stream, true);
    voice.attach('alice', parent, stream);
    const audios = [...parent.children] as THREE.PositionalAudio[];
    voice.detach('bob');
    voice.dispose();
    voice.dispose();

    expect(parent.children).toHaveLength(0);
    for (const audio of audios) {
      expect(audio.panner.disconnect).toHaveBeenCalledWith(audio.gain);
    }
    for (const source of sources) {
      expect(source.disconnect).toHaveBeenCalledOnce();
    }
    for (const gain of gains.slice(2)) {
      expect(gain.disconnect).toHaveBeenCalledOnce();
    }
    for (const gain of gains.slice(0, 2)) {
      expect(gain.disconnect).not.toHaveBeenCalled();
    }
    expect(pause).toHaveBeenCalledTimes(2);
    expect(
      play.mock.contexts.every((primer) => primer.srcObject === null)
    ).toBe(true);
    expect(listener.parent).toBe(camera);
    expect(listener.getMasterVolume()).toBe(0.7);
    expect(sceneSound.getVolume()).toBe(0.4);
  });

  it('rejects invalid input before replacing an existing graph', () => {
    const {voice, parent, stream, connections} = setup();
    voice.attach('bob', parent, stream);
    const original = parent.children[0];
    for (const muted of [null, 0, 'true', {}]) {
      expect(() =>
        voice.attach('bob', parent, stream, muted as boolean)
      ).toThrow(TypeError);
      expect(() => voice.setPlaybackMuted('bob', muted as boolean)).toThrow(
        TypeError
      );
    }
    for (const peerId of ['', '  ', null, 12]) {
      expect(() =>
        voice.attach(peerId as string, parent, stream, true)
      ).toThrow(TypeError);
      expect(() => voice.setPlaybackMuted(peerId as string, true)).toThrow(
        TypeError
      );
    }
    expect(parent.children).toEqual([original]);
    expect(connections).toHaveLength(1);
    voice.dispose();
  });
});
