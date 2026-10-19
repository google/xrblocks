import {describe, expect, it} from 'vitest';
// @ts-expect-error The launch alias is an executable JavaScript consumer.
import {roomcraftCollaborationUrl} from '../../../demos/roomcraft-collab/Entry.js';

describe('collaborative Roomcraft entry', () => {
  it('opens the shared lobby without keys, credentials or automatic microphone capture', () => {
    const target = new URL(
      roomcraftCollaborationUrl(
        'https://user:password@example.test/demos/roomcraft-collab/?room=BCDF&name=Alice&environment=1&key=not-a-secret&voice=1#private'
      )
    );
    expect(target.pathname).toBe('/demos/roomcraft/');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      collab: '1',
      lobby: '1',
      transport: 'webrtc',
      room: 'BCDF',
      name: 'Alice',
      environment: '1',
    });
    expect(target.hash).toBe('');
    expect(target.username).toBe('');
    expect(target.password).toBe('');
  });

  it('supports directory and explicit index links without choosing a room', () => {
    for (const path of ['roomcraft-collab/', 'roomcraft-collab/index.html']) {
      const target = new URL(
        roomcraftCollaborationUrl(`https://example.test/demos/${path}`)
      );
      expect(target.pathname).toBe('/demos/roomcraft/');
      expect(target.searchParams.has('room')).toBe(false);
    }
  });
});
