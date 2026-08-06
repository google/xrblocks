const STORAGE_PREFIX = 'xrblocks.ai.';

export function getStoredApiKey(modelName: string): string | null {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${modelName}.apiKey`);
  } catch {
    return null;
  }
}

export function storeApiKey(modelName: string, apiKey: string) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${modelName}.apiKey`, apiKey);
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
}

export function clearStoredApiKey(modelName: string) {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${modelName}.apiKey`);
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
}

/** A dependency-free browser dialog for local AI prototypes. */
export function promptForApiKey(
  modelName: string,
  configuredKey: string | null
): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(configuredKey);

  return new Promise((resolve) => {
    let selectedConfiguredKey = configuredKey;
    const displayName = modelName === 'openai' ? 'OpenAI' : 'Gemini';
    const keyUrl =
      modelName === 'openai'
        ? 'https://platform.openai.com/api-keys'
        : 'https://aistudio.google.com/app/apikey';
    const dialog = document.createElement('dialog');
    dialog.className = 'xb-ai-key-dialog';
    dialog.setAttribute('aria-label', `${modelName} API key`);
    dialog.innerHTML = `
      <style>
        .xb-ai-key-dialog {
          width: min(430px, calc(100vw - 32px));
          max-width: none;
          padding: 0;
          border: 0;
          border-radius: 24px;
          overflow: hidden;
          color: #f7f8fc;
          background: transparent;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
        }
        .xb-ai-key-dialog::backdrop {
          background: rgba(3, 6, 12, 0.72);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
        }
        .xb-ai-key-card {
          display: grid;
          gap: 20px;
          box-sizing: border-box;
          padding: 28px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 24px;
          background:
            radial-gradient(circle at 90% 0%, rgba(150, 126, 255, 0.2), transparent 42%),
            linear-gradient(145deg, rgba(24, 30, 42, 0.98), rgba(12, 16, 24, 0.98));
          color: #f7f8fc;
          font: 14px/1.45 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        }
        .xb-ai-key-copy {
          margin: -4px 0 0;
          color: #bcc5d5;
        }
        .xb-ai-key-copy a {
          color: #d4e8ff;
          text-decoration: none;
        }
        .xb-ai-key-copy a:hover {
          text-decoration: underline;
        }
        .xb-ai-key-label {
          display: grid;
          gap: 8px;
          color: #eef1f7;
          font-size: 13px;
          font-weight: 550;
        }
        .xb-ai-key-input {
          width: 100%;
          box-sizing: border-box;
          padding: 13px 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          outline: none;
          background: rgba(2, 5, 10, 0.54);
          color: #fff;
          font: 14px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .xb-ai-key-input::placeholder {
          color: #697489;
        }
        .xb-ai-key-input:focus {
          border-color: #b9c9ff;
          box-shadow: 0 0 0 3px rgba(185, 201, 255, 0.14);
        }
        .xb-ai-key-note {
          margin: -10px 0 0;
          color: #8792a6;
          font-size: 12px;
        }
        .xb-ai-key-status {
          min-height: 20px;
          margin: -8px 0 0;
          color: #aeb9cd;
          font-size: 12px;
        }
        .xb-ai-key-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 0;
          padding: 0;
        }
        .xb-ai-key-button {
          min-height: 44px;
          padding: 10px 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: #eef1f7;
          font: 550 14px/1 'Google Sans', 'Segoe UI', system-ui, sans-serif;
          text-transform: none;
          cursor: pointer;
        }
        .xb-ai-key-button:hover {
          background: rgba(255, 255, 255, 0.11);
        }
        .xb-ai-key-button--primary {
          border-color: transparent;
          background: linear-gradient(135deg, #d4e8ff, #d0a8e3);
          color: #11141b;
        }
        .xb-ai-key-button--primary:hover {
          background: linear-gradient(135deg, #e2f0ff, #dbb9ea);
        }
        .xb-ai-key-button--wide {
          grid-column: 1 / -1;
        }
        .xb-ai-key-clear {
          justify-self: center;
          padding: 0;
          border: 0;
          background: none;
          color: #8792a6;
          font: 12px/1.4 'Google Sans', 'Segoe UI', system-ui, sans-serif;
          text-transform: none;
          cursor: pointer;
        }
        .xb-ai-key-clear:hover {
          color: #d6dce8;
          text-decoration: underline;
        }
        @media (max-width: 480px) {
          .xb-ai-key-card { padding: 22px; }
          .xb-ai-key-actions { grid-template-columns: 1fr; }
          .xb-ai-key-button--wide { grid-column: auto; }
        }
      </style>
      <form method="dialog" class="xb-ai-key-card">
        <p class="xb-ai-key-copy">
          Enter a ${displayName} key for this local prototype.
          <a href="${keyUrl}" target="_blank" rel="noopener">Get an API key</a>
        </p>
        <label class="xb-ai-key-label">
          API key
          <input class="xb-ai-key-input" name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" />
        </label>
        <p class="xb-ai-key-note">Saved only in this browser. Use a server-managed key in production.</p>
        <p class="xb-ai-key-status" data-status>${configuredKey ? 'A saved key is ready to use.' : ''}</p>
        <menu class="xb-ai-key-actions">
          <button class="xb-ai-key-button xb-ai-key-button--primary ${configuredKey ? '' : 'xb-ai-key-button--wide'}" value="save">Save and continue</button>
          ${configuredKey ? '<button class="xb-ai-key-button" value="configured">Use saved key</button>' : ''}
          <button class="xb-ai-key-button xb-ai-key-button--wide" value="skip">Continue without AI</button>
        </menu>
        ${configuredKey ? '<button class="xb-ai-key-clear" value="clear">Forget saved key</button>' : ''}
      </form>`;

    const finish = (key: string | null) => {
      dialog.remove();
      resolve(key);
    };
    const form = dialog.querySelector('form')!;
    const input = dialog.querySelector<HTMLInputElement>(
      'input[name="apiKey"]'
    )!;
    const status = dialog.querySelector<HTMLElement>('[data-status]')!;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const action = (event.submitter as HTMLButtonElement | null)?.value;
      if (action === 'save') {
        const apiKey = input.value.trim();
        if (!apiKey) {
          status.textContent = 'Enter an API key or continue without one.';
          input.focus();
          return;
        }
        storeApiKey(modelName, apiKey);
        finish(apiKey);
        return;
      }
      if (action === 'clear') {
        clearStoredApiKey(modelName);
        selectedConfiguredKey = null;
        input.value = '';
        status.textContent = 'The saved browser key was cleared.';
        dialog
          .querySelector<HTMLButtonElement>('button[value="configured"]')
          ?.remove();
        dialog
          .querySelector<HTMLButtonElement>('button[value="clear"]')
          ?.remove();
        dialog
          .querySelector<HTMLButtonElement>('button[value="save"]')
          ?.classList.add('xb-ai-key-button--wide');
        return;
      }
      finish(action === 'configured' ? selectedConfiguredKey : null);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.focus();
  });
}
