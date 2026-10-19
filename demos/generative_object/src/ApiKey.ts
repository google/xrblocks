const STORAGE_KEY = 'gemini-api-key';

function readKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rememberKey(key: string): string {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    console.warn('[generative_object] Could not save the key in this browser.');
  }
  return key;
}

/** Resolves prototype credentials before XR Blocks initializes, without navigation. */
export async function resolveApiKey(urlKey?: string | null): Promise<string> {
  const key = readKey(urlKey);
  if (key) return rememberKey(key);
  try {
    const stored = readKey(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    console.warn('[generative_object] Could not read browser key storage.');
  }

  for (const path of ['./keys.json', '../../keys.json']) {
    try {
      const response = await fetch(path, {cache: 'no-store'});
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || !('gemini' in data)) {
        throw new Error('Expected gemini.apiKey');
      }
      const gemini = data.gemini;
      if (
        typeof gemini !== 'object' ||
        gemini === null ||
        !('apiKey' in gemini)
      ) {
        throw new Error('Expected gemini.apiKey');
      }
      const fileKey = readKey(gemini.apiKey);
      if (!fileKey) throw new Error('Expected a nonempty gemini.apiKey');
      return rememberKey(fileKey);
    } catch {
      // Never log a response body or a parsing error that might contain a key.
      console.warn(
        `[generative_object] Could not read gemini.apiKey from ${path}.`
      );
    }
  }

  const overlay = document.getElementById('keyOverlay');
  const input = document.getElementById('keyInput');
  const save = document.getElementById('keySave');
  if (
    !overlay ||
    !(input instanceof HTMLInputElement) ||
    !(save instanceof HTMLButtonElement)
  ) {
    throw new Error('Gemini key controls are missing.');
  }
  overlay.style.display = 'flex';
  input.focus();

  return new Promise((resolve) => {
    const submit = () => {
      const entered = readKey(input.value);
      input.setCustomValidity(entered ? '' : 'Enter a Gemini API key.');
      if (!input.reportValidity()) return;
      save.removeEventListener('click', submit);
      input.removeEventListener('keydown', onKeyDown);
      input.value = '';
      overlay.style.display = 'none';
      resolve(rememberKey(entered));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    };
    save.addEventListener('click', submit);
    input.addEventListener('keydown', onKeyDown);
  });
}
