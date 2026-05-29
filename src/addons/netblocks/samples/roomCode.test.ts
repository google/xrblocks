import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  buildRoomCodeHud,
  generateRoomCode,
  getRoomCodeFromUrl,
} from './roomCode';

describe('roomCode helpers', () => {
  const originalSearch = window.location.search;

  function setSearch(search: string) {
    history.replaceState(null, '', `${location.pathname}${search}`);
  }

  beforeEach(() => setSearch(''));
  afterEach(() => setSearch(originalSearch));

  describe('getRoomCodeFromUrl', () => {
    it('returns null when ?room is missing', () => {
      expect(getRoomCodeFromUrl()).toBeNull();
    });

    it('returns the code uppercased when length matches', () => {
      setSearch('?room=abcd');
      expect(getRoomCodeFromUrl()).toBe('ABCD');
    });

    it('strips non-letters before length-checking', () => {
      setSearch('?room=AB-CD');
      expect(getRoomCodeFromUrl()).toBe('ABCD');
    });

    it('returns null for codes that are the wrong length', () => {
      setSearch('?room=ABC');
      expect(getRoomCodeFromUrl()).toBeNull();
      setSearch('?room=ABCDE');
      expect(getRoomCodeFromUrl()).toBeNull();
    });

    it('returns null when the cleaned code is empty', () => {
      setSearch('?room=1234');
      expect(getRoomCodeFromUrl()).toBeNull();
    });
  });

  describe('generateRoomCode', () => {
    it('produces a 4-character code from the consonant alphabet', () => {
      const allowed = /^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/;
      for (let i = 0; i < 50; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(allowed);
      }
    });
  });

  describe('buildRoomCodeHud', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('renders the disconnected HUD with Start + Join controls when code is null', () => {
      buildRoomCodeHud(null);
      const text = document.body.textContent ?? '';
      expect(text).toContain('Local mode');
      expect(text).toContain('Start new room');
      expect(text).toContain('Join');
      expect(document.querySelector('input[placeholder="CODE"]')).toBeTruthy();
    });

    it('renders the connected HUD with the code, Copy code, and Leave', () => {
      buildRoomCodeHud('ABCD');
      const text = document.body.textContent ?? '';
      expect(text).toContain('ABCD');
      expect(text).toContain('Copy code');
      expect(text).toContain('Leave');
    });

    it('anchors the HUD top-left below the sample HUD so they do not overlap', () => {
      buildRoomCodeHud('ABCD');
      const root = document.body.firstElementChild as HTMLElement;
      expect(root.style.position).toBe('fixed');
      expect(root.style.top).toBe('90px');
      expect(root.style.left).toBe('12px');
      expect(root.style.bottom).toBe('');
    });

    it('Copy code button writes the code (not the URL) to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText},
      });

      buildRoomCodeHud('WXYZ');
      const buttons = Array.from(
        document.querySelectorAll('button')
      ) as HTMLButtonElement[];
      const copyBtn = buttons.find((b) => b.textContent?.includes('Copy code'));
      expect(copyBtn).toBeTruthy();
      copyBtn!.click();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('WXYZ');
    });
  });
});
